import test from "node:test";
import assert from "node:assert/strict";
import { applyJourneyPatch } from "../model/journey-state";
import type { JourneyState } from "../model/types";
import { track, type ChatContext, type ChatPatch } from "./agent";
import { ALLOWED_PROPS, answerEvent, milestoneEvents, streamFor } from "./analytics";
import { inventory } from "./inventory";
import { momentState } from "./moments";
import { SCRIPT } from "./script";
import type { ChatJourney } from "./state";

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

const names = (events: [string, unknown][]) => events.map(([event]) => event);

test("the funnel runs through the first completed visit, from the journey itself", () => {
  const booking = names(milestoneEvents(momentState("booking"), momentState("booked")));
  assert.ok(booking.includes("portal.appointment.booked"), booking.join(", "));
  const visit = names(milestoneEvents(momentState("visit-day"), momentState("complete")));
  assert.ok(visit.includes("portal.onboarding.first_visit_completed"), visit.join(", "));
  assert.ok(visit.includes("portal.care_plan.published"));
  const done = momentState("complete");
  assert.deepEqual(milestoneEvents(done, { ...done }), [], "nothing fires again for an unchanged state");
});

test("each prescription the plan sends is one event, with its status and never the medication", () => {
  const done = momentState("complete");
  const at = new Date().toISOString();
  const rx = (id: string, medication: string, status: "sent" | "failed") => ({ id, medication, supply: "30-day supply", pharmacy: "CVS Pharmacy, 2508 S Congress Ave", status, at });
  const sent = { ...done, prescriptions: [rx("rx-1-0", "Adderall 20 mg once every morning", "failed"), rx("rx-1-1", "Escitalopram (Lexapro) 10 mg once a day", "sent")] };
  const events = milestoneEvents(done, sent).filter(([event]) => event === "portal.prescription.sent");
  assert.deepEqual(events.map(([, props]) => props), [{ status: "failed" }, { status: "sent" }]);
  // The resend replaces the copy the pharmacy didn't confirm.
  const resent = { ...sent, prescriptions: [sent.prescriptions[1], rx("rx-2-1", "Adderall 20 mg once every morning", "sent")] };
  assert.deepEqual(milestoneEvents(sent, resent).filter(([event]) => event === "portal.prescription.sent").map(([, props]) => props), [{ status: "sent" }]);
});

test("events are in PostHog's format, and creating the account identifies the patient", () => {
  const ctx = context(momentState("booking"));
  track(ctx, "portal.onboarding.phone_verified", { step: "code" });
  const [first] = ctx.state().chat.analytics;
  assert.match(first.distinct_id, /^anon_/);
  assert.ok(first.uuid && first.timestamp && first.properties.$session_id);
  assert.equal(first.properties.experience, "chat");

  track(ctx, "portal.onboarding.userCreated");
  const identify = ctx.state().chat.analytics.find((event) => event.event === "$identify")!;
  assert.equal(identify.properties.$anon_distinct_id, first.distinct_id);
  assert.match(identify.distinct_id, /^patient_/);
  track(ctx, "portal.appointment.booked");
  assert.equal(ctx.state().chat.analytics.at(-1)!.distinct_id, identify.distinct_id, "later events use the patient ID");
});

test("no event carries answers to health questions, free text, or contact details", () => {
  const s = momentState("complete");
  const node = (id: string) => SCRIPT.find((item) => item.id === id)!;
  const sample: Record<string, string | string[]> = {
    story: ["Anxiety", "ADHD"],
    note: "I keep worrying about work and can't sleep",
    phone: "5125550148",
    email: "alex@example.com",
    dob: "08/14/1993",
    "screen-now": "unsafe",
    hospital: "yes",
    medication: "taking",
    benefits: "W2N48217",
    "pcp-name": "Dr. Lee at Austin Family Medicine",
  };
  const props = Object.entries(sample).map(([id, value]) => answerEvent(node(id), node(id).input?.(s), value, s, false)[1]);
  const milestones = milestoneEvents(momentState("start"), s).map(([, p]) => p);
  const everything = JSON.stringify([...props, ...milestones]);
  for (const phi of ["Anxiety", "ADHD", "worrying", "5125550148", "alex@", "1993", "unsafe", "W2N48217", "Lee", "Alex", "Rivera", "Adderall", "Lexapro", "scitalopram"])
    assert.ok(!everything.includes(phi), `"${phi}" reached an event`);

  const pay = answerEvent(node("pay"), node("pay").input?.(momentState("start")), "insurance", momentState("start"), false);
  assert.deepEqual(pay, ["portal.onboarding.insurance_selected", { step: "pay", choice: "insurance" }], "plain choices still come through");
});

test("only allowlisted properties reach an event, and crisis events go to the restricted stream", () => {
  const s = momentState("complete");
  const keys = new Set<string>();
  for (const node of SCRIPT) {
    const [, props] = answerEvent(node, node.input?.(s), "x", s, false);
    Object.keys(props).forEach((key) => keys.add(key));
  }
  for (const [, props] of milestoneEvents(momentState("start"), s)) Object.keys(props).forEach((key) => keys.add(key));
  for (const key of keys) assert.ok(ALLOWED_PROPS.has(key), `"${key}" isn't on the allowlist`);

  const ctx = context(momentState("booked"));
  track(ctx, "portal.onboarding.email_added", { step: "email", email: "alex@example.com" } as never);
  const added = ctx.state().chat.analytics.at(-1)!;
  assert.equal("email" in added.properties, false, "an unlisted property is dropped");
  assert.equal(added.properties.analytics_stream, "product");
  track(ctx, "portal.support.crisis_resources_shown", { source: "help" });
  assert.equal(ctx.state().chat.analytics.at(-1)!.properties.analytics_stream, "restricted");
  assert.equal(streamFor("portal.onboarding.fit_exited", { reason: "immediate_support" }), "restricted");
  assert.equal(streamFor("portal.onboarding.fit_exited", { reason: "age" }), "product");
});
