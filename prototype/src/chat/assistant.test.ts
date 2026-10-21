import test from "node:test";
import assert from "node:assert/strict";
import { applyJourneyPatch } from "../model/journey-state";
import type { JourneyState } from "../model/types";
import { setAgentPace, type ChatContext, type ChatPatch } from "./agent";
import { addAsk, answerTyped, billingLine, quickActions, settleAsk } from "./assistant";
import { inventory } from "./inventory";
import { momentState } from "./moments";
import type { ChatJourney } from "./state";

setAgentPace(0);
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
