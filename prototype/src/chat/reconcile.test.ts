import test from "node:test";
import assert from "node:assert/strict";
import { applyJourneyPatch } from "../model/journey-state";
import type { Eligibility, JourneyState } from "../model/types";
import { reconcile } from "./reconcile";
import { momentState } from "./moments";
import type { ChatJourney, ChatState } from "./state";

/** One update as ChatApp applies it: the journey reducer, then the chat merge, then reconcile. */
function apply(previous: ChatJourney, patch: Partial<JourneyState>, chat?: Partial<ChatState>): ChatJourney {
  const next = applyJourneyPatch(previous, patch) as ChatJourney;
  return reconcile(previous, { ...next, chat: chat ? { ...previous.chat, ...chat } : previous.chat });
}

const VERIFIED: Eligibility = { status: "verified", estimate: 25, networkStatus: "in-network" };
const CHECKING: Eligibility = { status: "checking", estimate: null };

/** An insured patient holding a time, benefits verified at $25, who has just agreed. */
function agreed(): ChatJourney {
  return apply({ ...momentState("booking"), eligibility: VERIFIED }, { agreements: true, financialConsent: true });
}

test("changing a time after benefits were verified asks the plan again", () => {
  const verified: ChatJourney = {
    ...momentState("booking"),
    eligibility: { status: "verified", estimate: 25, networkStatus: "in-network" },
  };
  const withBenefits: ChatJourney = {
    ...verified,
    chat: {
      ...verified.chat,
      benefits: { payer: "Aetna", plan: "PPO", memberLast4: "8217", network: "in-network", copay: 25, deductibleRemaining: null, via: "chosen" },
      benefitsAccepted: true,
      jobs: { ...verified.chat.jobs, benefits: { status: "done" } },
    },
  };
  // The slot is part of the eligibility inputs, so the reducer resets eligibility.
  const moved = apply(withBenefits, { slotId: "another-slot" });
  assert.equal(moved.eligibility.status, "unverified");
  assert.equal(moved.chat.benefits, null);
  assert.equal(moved.chat.benefitsAccepted, false);
  assert.equal(moved.chat.jobs.benefits, undefined);
});

test("benefits survive changes that don't affect coverage", () => {
  const state = momentState("booked");
  const next = apply(state, { profile: { ...state.profile, email: "new@example.com" } });
  assert.ok(next.chat.benefits, "a booked visit keeps its verified benefits");
});

test("a lapsed hold means the time is chosen again", () => {
  const holding = momentState("booking");
  const lapsed = apply(holding, { reservation: null, slotId: "" });
  assert.equal(lapsed.chat.slotChosen, false);
});

test("moving onto the ADHD medication path asks for the agreements again", () => {
  const agreed: ChatJourney = { ...momentState("booking"), conditions: ["Anxiety"], agreements: true };
  const moved = apply(agreed, { conditions: ["Anxiety", "ADHD"], goal: "Talk about medication" });
  assert.equal(moved.agreements, false);
  assert.equal(moved.chat.controlledAck, false);
  const unrelated = apply(agreed, { goal: "Talk about medication" });
  assert.equal(unrelated.agreements, true, "the medication goal alone doesn't add an agreement");
});

test("agreeing records the estimate the patient agreed to", () => {
  assert.equal(agreed().chat.agreedEstimate, 25);
  const selfPay: ChatJourney = { ...momentState("booking"), coverage: "selfpay", payer: "" };
  const consented = apply(selfPay, { agreements: true, financialConsent: true });
  assert.equal(consented.financialConsent, true);
  assert.equal(consented.chat.agreedEstimate, null, "self-pay has no estimate to hold to");
});

test("a new time keeps consent when the re-check returns the estimate agreed to", () => {
  const moved = apply(agreed(), { slotId: "another-slot" });
  assert.equal(moved.eligibility.status, "unverified");
  assert.equal(moved.financialConsent, false, "consent pauses while the estimate is unknown");
  assert.equal(moved.chat.agreedEstimate, 25, "a new time doesn't change what was agreed");
  const checking = apply(moved, { eligibility: CHECKING });
  assert.equal(apply(checking, { eligibility: VERIFIED }).financialConsent, true);
  const higher = apply(checking, { eligibility: { ...VERIFIED, estimate: 40 } });
  assert.equal(higher.financialConsent, false, "a different estimate needs the patient to agree again");
});

test("a different plan is new terms, even at the same estimate", () => {
  const switched = apply(agreed(), { payer: "Cigna", memberId: "U604918217" });
  assert.equal(switched.financialConsent, false);
  assert.equal(switched.chat.agreedEstimate, null);
  const checked = apply(apply(switched, { eligibility: CHECKING }), { eligibility: VERIFIED });
  assert.equal(checked.financialConsent, false, "the patient agrees to the new plan's terms");
  const selfPay = apply(agreed(), { coverage: "selfpay", payer: "" });
  assert.equal(selfPay.chat.agreedEstimate, null);
});

test("changing what an approved brief is built from asks for approval again", () => {
  const approved = momentState("visit-day");
  assert.equal(approved.chat.briefApproved, true);
  const noted = apply(approved, { briefNote: "Mornings are the hardest" }, { note: "Mornings are the hardest" });
  assert.equal(noted.chat.briefApproved, false);
  assert.equal(noted.briefApproved, false);
  assert.equal(noted.chat.jobs.brief, undefined, "the brief is drafted again from the new answer");
  for (const chat of [
    { medication: "stopped" },
    { allergyNote: "Sulfa" },
    { pharmacy: "other" },
    { pcp: "keep" },
    { baseline: { ...approved.chat.baseline, phq2: 3 } },
  ] as Partial<ChatState>[])
    assert.equal(apply(approved, {}, chat).chat.briefApproved, false, `${Object.keys(chat)[0]} changes the brief`);
  const reason = apply(approved, { briefGoal: "Sleep and focus" }, { briefApproved: false });
  assert.equal(reason.briefApproved, false);
  assert.equal(reason.chat.jobs.brief, undefined, "an edit in the brief sheet redrafts it too");
});

test("an approved brief stays approved when nothing it's built from changes", () => {
  const approved = momentState("visit-day");
  const same = apply(approved, {}, { medication: approved.chat.medication, baseline: { ...approved.chat.baseline } });
  assert.equal(same.chat.briefApproved, true, "the same answer again changes nothing");
  const unrelated = apply(approved, { profile: { ...approved.profile, email: "new@example.com" } });
  assert.equal(unrelated.chat.briefApproved, true);
  assert.ok(unrelated.chat.jobs.brief);
  // Before approval there's nothing to undo: the brief card shows the edit as it's made.
  const drafted: ChatJourney = { ...approved, briefApproved: false, chat: { ...approved.chat, briefApproved: false } };
  assert.ok(apply(drafted, { briefNote: "x" }, { note: "x" }).chat.jobs.brief);
});
