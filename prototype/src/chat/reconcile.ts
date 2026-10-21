import type { ChatJourney } from "./state";
import { medicationPath } from "./script";

/** What the visit brief is built from. A change after approval means approving it again. */
function briefInputs(s: ChatJourney): string {
  const { note, medication, medicationNote, allergy, allergyNote, pharmacy, baseline, pcp } = s.chat;
  return JSON.stringify([note, medication, medicationNote, allergy, allergyNote, pharmacy, baseline, pcp, s.briefNote, s.briefGoal]);
}

/** Rules that keep the conversation honest when something it depends on changes. */
export function reconcile(previous: ChatJourney, next: ChatJourney): ChatJourney {
  let chat = next.chat;
  // Benefits belong to the inputs that produced them (the reducer already resets eligibility).
  if (
    !next.appointment &&
    chat.benefits &&
    previous.eligibility.status !== "unverified" &&
    next.eligibility.status === "unverified"
  ) {
    const jobs = { ...chat.jobs };
    delete jobs.benefits;
    chat = { ...chat, benefits: null, benefitsAccepted: false, jobs };
  }
  // A hold that lapses before booking means the time has to be chosen again.
  if (!next.appointment && previous.reservation && !next.reservation && chat.slotChosen && !next.slotId) {
    chat = { ...chat, slotChosen: false };
  }
  // Moving onto the ADHD medication path adds an agreement, so the agreements are asked again.
  if (!next.appointment && next.agreements && medicationPath(next) && !medicationPath(previous)) {
    next = { ...next, agreements: false };
    chat = { ...chat, controlledAck: false };
  }
  // An agreed estimate belongs to the coverage and plan it was agreed under; new ones are new terms.
  if (
    !next.appointment &&
    chat.agreedEstimate !== null &&
    (previous.coverage !== next.coverage || previous.payer !== next.payer)
  ) {
    chat = { ...chat, agreedEstimate: null };
  }
  // A new time resets eligibility for a moment, and the reducer revokes payment consent with it.
  // A re-check that comes back with the estimate the patient agreed to restores their consent.
  if (
    !next.appointment &&
    next.agreements &&
    !next.financialConsent &&
    previous.eligibility.status !== "verified" &&
    next.eligibility.status === "verified" &&
    next.eligibility.estimate !== null &&
    next.eligibility.estimate === chat.agreedEstimate
  ) {
    next = { ...next, financialConsent: true };
  }
  // Agreeing records the estimate agreed to. Self-pay has none.
  if (!previous.financialConsent && next.financialConsent) {
    chat = { ...chat, agreedEstimate: next.coverage === "selfpay" ? null : next.eligibility.estimate };
  }
  // An approved brief was approved as it was. If what it's built from changes, the draft is
  // redone and the patient approves it again before it's shared.
  if ((previous.chat.briefApproved || previous.briefApproved) && briefInputs(previous) !== briefInputs({ ...next, chat })) {
    const jobs = { ...chat.jobs };
    delete jobs.brief;
    next = { ...next, briefApproved: false };
    chat = { ...chat, briefApproved: false, jobs };
  }
  return chat === next.chat ? next : { ...next, chat };
}
