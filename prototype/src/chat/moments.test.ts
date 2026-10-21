import test from "node:test";
import assert from "node:assert/strict";
import { deriveTranscript } from "./engine";
import { SCRIPT } from "./script";
import { momentState, type Moment } from "./moments";

const EXPECTED: Record<Moment, string> = {
  start: "hello",
  clinician: "choose",
  booking: "phone",
  booked: "prep",
  "visit-day": "reminder",
  complete: "followup",
};

test("every preview moment lands on the right question with history already seen", () => {
  for (const [moment, node] of Object.entries(EXPECTED) as [Moment, string][]) {
    const state = momentState(moment);
    const transcript = deriveTranscript(SCRIPT, state);
    assert.equal(transcript.active?.node.id, node, `${moment} should ask ${node}`);
    assert.equal(transcript.halted, false, `${moment} should not be stopped`);
    const keys = new Set(state.chat.seen);
    assert.ok(transcript.items.every((item) => keys.has(item.key)), `${moment} history renders in place`);
  }
});

test("booked moments are internally consistent with the scheduling rules", () => {
  const booked = momentState("booked");
  assert.equal(booked.appointment?.status, "confirmed");
  assert.equal(booked.paymentSetup.status, "succeeded");
  assert.equal(booked.eligibility.status, "verified");
  assert.ok(new Date(booked.appointment!.start).getTime() > Date.now(), "the visit is in the future");
  const complete = momentState("complete");
  assert.equal(complete.appointment?.status, "completed");
  assert.equal(complete.carePlan.status, "published");
});
