import test from "node:test";
import assert from "node:assert/strict";
import { applyJourneyPatch } from "../model/journey-state";
import type { JourneyState } from "../model/types";
import type { ChatContext, ChatPatch } from "./agent";
import { clinicianFirst, reminderTimes } from "./agent";
import {
  addAsk,
  answerTyped,
  billingLine,
  checkInOpensLine,
  quickActions,
  recoverAsks,
  settleAsk,
  visitWhenLine,
} from "./assistant";
import { inventory } from "./inventory";
import { momentState } from "./moments";
import type { Ask, ChatJourney } from "./state";

inventory();

function context(start: ChatJourney): ChatContext & { state: () => ChatJourney } {
  let state = start;
  const update = (patch: ChatPatch) => {
    const { chat, ...journey } = patch;
    const next = applyJourneyPatch(state, journey as Partial<JourneyState>) as ChatJourney;
    state = { ...next, chat: chat ? { ...state.chat, ...chat } : state.chat };
  };
  return {
    state: () => state,
    get: () => state,
    update,
    api: {} as ChatContext["api"],
    act: async (fn) => fn(),
    openSheet: () => undefined,
    closeSheet: () => undefined,
    answer: () => undefined,
    edit: () => undefined,
    setVisitOpen: () => undefined,
    preview: { restart: () => undefined, jump: () => undefined, setScenario: () => undefined },
  };
}

test("quick actions follow the patient's stage", () => {
  assert.deepEqual(quickActions(momentState("booking")), [], "nothing before booking");
  const booked = quickActions(momentState("booked")).map((action) => action.id);
  assert.ok(booked.includes("when") && booked.includes("reschedule") && booked.includes("message"));
  const day = quickActions(momentState("visit-day")).map((action) => action.id);
  assert.ok(day.includes("join") && !day.includes("prep"), "on visit day: join, not prep");
  const after = quickActions(momentState("complete")).map((action) => action.id);
  assert.ok(after.includes("plan") && after.includes("rx") && !after.includes("reschedule"));
});

test("risk language typed to the assistant gets crisis lines first and reaches a person", async () => {
  const ctx = context(momentState("booked"));
  const reply = await answerTyped(ctx, "honestly I don’t want to be alive anymore");
  assert.match(reply.answer, /988/);
  assert.deepEqual(reply.actions, ["support"]);
  assert.ok(ctx.state().chat.flags.includes("risk-language-in-help"));
  assert.ok(ctx.state().chat.tasks.some((task) => task.kind === "risk-review" && task.due === "Today"));
});

test("without a model, typed questions get Legion's stated policies and a useful action", async () => {
  const ctx = context(momentState("booked"));
  const reply = await answerTyped(ctx, "Can I move my appointment to next week?");
  assert.ok(reply.answer.length > 20);
  assert.deepEqual(reply.actions, ["reschedule"]);
});

test("asks keep their place and settle in place", () => {
  const ctx = context(momentState("booked"));
  const id = addAsk(ctx, "prep", { question: "What will I pay?", status: "thinking" });
  settleAsk(ctx, id, { answer: billingLine(ctx.state()), status: "done" });
  const [ask] = ctx.state().chat.asks;
  assert.equal(ask.anchor, "prep");
  assert.equal(ask.status, "done");
  assert.match(ask.answer, /\$25 estimated copay/);
  assert.match(ask.answer, /\$100/);
});

test("typed questions about the booking are answered from the booking", async () => {
  const ctx = context(momentState("booked"));
  for (const question of ["When is my visit?", "what time is my appointment", "When’s my visit with Maya?"]) {
    const reply = await answerTyped(ctx, question);
    assert.equal(reply.answer, visitWhenLine(ctx.state()), question);
    assert.deepEqual(reply.actions, ["calendar"]);
  }
  const cost = await answerTyped(ctx, "How much will I pay for the visit?");
  assert.equal(cost.answer, billingLine(ctx.state()));
  const move = await answerTyped(ctx, "Can I change the time of my visit?");
  assert.deepEqual(move.actions, ["reschedule"], "asking to change the time is a reschedule");
  assert.notEqual(move.answer, visitWhenLine(ctx.state()));
});

test("after the first visit, a question about when points to the follow-up", async () => {
  const done = momentState("complete");
  const reply = await answerTyped(context({ ...done, followupAppointment: null }), "When is my next visit?");
  assert.match(reply.answer, /done/);
  assert.deepEqual(reply.actions, ["followup"]);
});

test("MyChart is offered in the chat first, and among the actions only after Not now", () => {
  const s = momentState("booked");
  assert.ok(!quickActions(s).some((action) => action.id === "chart"));
  const later = { ...s, chat: { ...s.chat, chart: "later" as const } };
  assert.ok(quickActions(later).some((action) => action.id === "chart"));
  assert.ok(!quickActions({ ...later, chartImport: { organization: "Austin Family Medicine", importedAt: "", conditions: [], medications: [], allergies: [], labResults: 0, visitNotes: 0 } }).some((action) => action.id === "chart"));
});

test("Wren calls the clinician by title and surname", () => {
  const s = momentState("booked");
  assert.match(quickActions(s).find((action) => action.id === "message")!.label, /^Message Dr\.\s/);
});

test("patients are told only about the reminders actually scheduled", () => {
  const s = momentState("booked");
  const appointment = s.appointment!;
  const reminder = (minutes: number) => ({
    id: `${appointment.id}:${appointment.slotId}:sms:reminder-${minutes}`,
    appointmentId: appointment.id,
    channel: "sms" as const,
    kind: "reminder" as const,
    scheduledAt: appointment.start,
    status: "queued" as const,
  });
  assert.equal(reminderTimes({ ...s, notifications: [] }), "the day before and an hour before", "the policy, before any are scheduled");
  assert.equal(reminderTimes({ ...s, notifications: [reminder(1440), reminder(60), reminder(15)] }), "the day before and an hour before");
  assert.equal(reminderTimes({ ...s, notifications: [reminder(60), reminder(15)] }), "an hour before", "booked for later today");
  assert.equal(reminderTimes({ ...s, notifications: [reminder(15)] }), "15 minutes before", "booked at the last minute");
});

test("a crisis question cut off by a reload still gets the crisis lines", () => {
  const ask = (id: string, question: string, status: Ask["status"] = "thinking"): Ask => ({
    id,
    at: "",
    anchor: "ready",
    question,
    answer: status === "done" ? "Answered." : "",
    status,
  });
  const before = [
    ask("a", "I took too many of my pills"),
    ask("b", "honestly I don’t want to be alive anymore"),
    ask("c", "When is my visit?"),
    ask("d", "What will I pay?", "done"),
  ];
  const [overdose, crisis, plain, done] = recoverAsks(before);
  assert.match(overdose.answer, /911/);
  assert.match(crisis.answer, /988/);
  for (const reply of [overdose, crisis]) {
    assert.equal(reply.status, "done");
    assert.deepEqual(reply.actions, ["support"]);
  }
  assert.match(plain.answer, /didn’t finish/);
  assert.equal(done, before[3], "answered questions are left alone");
});

test("visit questions are understood however they're worded", async () => {
  const ctx = context(momentState("booked"));
  const first = clinicianFirst(ctx.state().appointment!.providerId);
  const when = visitWhenLine(ctx.state());
  for (const question of [
    `what day am I seeing ${first}`,
    `When do I see ${first}?`,
    "What time is my appt?",
    "Is my appointment today?",
    "What time is my visit later today?",
  ])
    assert.equal((await answerTyped(ctx, question)).answer, when, question);
  for (const question of ["How much is my visit?", "When do I pay for my visit?", "Is there a fee if I miss it?"])
    assert.equal((await answerTyped(ctx, question)).answer, billingLine(ctx.state()), question);
  assert.equal((await answerTyped(ctx, "How early can I check in?")).answer, checkInOpensLine(ctx.state()));
  for (const question of [
    "Can my visit time be changed?",
    "I'm thinking about rescheduling my appointment time",
    "I need a new time for my visit",
    "Could I swap my appointment time?",
    "Can I cancel my visit?",
  ]) {
    const reply = await answerTyped(ctx, question);
    assert.deepEqual(reply.actions, ["reschedule"], question);
    assert.notEqual(reply.answer, when, question);
  }
  assert.notDeepEqual((await answerTyped(ctx, "Can I switch clinicians?")).actions, ["reschedule"]);
});

test("cost answers include a late-change fee the patient agreed to", () => {
  const s = momentState("booked");
  const moved = {
    ...s,
    chat: {
      ...s.chat,
      receipts: [
        ...s.chat.receipts,
        {
          id: "moved",
          at: "",
          actor: "Legion AI" as const,
          action: "Moved your visit to Thu, Oct 22, 6:30 PM, with the $100 late-change fee you agreed to",
          source: "Legion scheduling",
        },
      ],
    },
  };
  assert.match(billingLine(moved), /plus the \$100 late-change fee you agreed to/);
  assert.doesNotMatch(billingLine(s), /fee you agreed to/);
});
