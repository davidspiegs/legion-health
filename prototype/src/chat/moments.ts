import type { Scenario } from "../model/types";
import { deriveTranscript } from "./engine";
import { fitsPreference, inventory, match } from "./inventory";
import { SCRIPT } from "./script";
import { RECORDS_FIXTURE, matchInputs } from "./agent";
import { initialChatJourney, type ChatJourney } from "./state";

/**
 * Preview jumps for reviewers. Each moment is a coherent fictional state that the
 * patient could have reached, never a shortcut the patient can take. Everything
 * before the moment renders as already seen.
 */
export type Moment = "start" | "clinician" | "booking" | "booked" | "visit-day" | "complete";

const now = () => Date.now();

function storyDone(s: ChatJourney): ChatJourney {
  return {
    ...s,
    conditions: ["ADHD", "Anxiety"],
    goal: "Talk about medication",
    fit: { "fit-age": "yes", "fit-state": "yes", "fit-virtual": "yes", "fit-safety": "no", "fit-history": "no", "fit-coverage": "no" },
    coverage: "insurance",
    payer: "Aetna",
    chat: {
      ...s.chat,
      intro: "start",
      begun: true,
      storyMode: "chips",
      quickCheck: "all",
      screen: { now: "no" },
      payMethod: "insurance",
      payerChoice: "Aetna",
      availability: ["evenings"],
    },
  };
}

function withMatch(s: ChatJourney): ChatJourney {
  const result = match(s.conditions, s.payer, s.chat.availability);
  return {
    ...s,
    chat: {
      ...s.chat,
      match: {
        offerIds: result.offers.map((offer) => offer.clinician.id),
        rankedIds: result.ranked.map((offer) => offer.clinician.id),
        funnel: result.funnel,
        reasons: Object.fromEntries(result.ranked.map((offer) => [offer.clinician.id, offer.reasons])),
      },
      jobs: {
        ...s.chat.jobs,
        match: { status: "done", startedAt: now(), finishedAt: now(), inputs: matchInputs(s) },
      },
    },
  };
}

function firstEveningSlot() {
  const soon = Date.now() + 2 * 3_600_000;
  const future = inventory().slots.filter((slot) => new Date(slot.start).getTime() > soon);
  return (
    future.find((slot) => slot.providerId === "maya" && fitsPreference(slot, ["evenings"])) ??
    future.find((slot) => slot.providerId === "maya")!
  );
}

function held(s: ChatJourney): ChatJourney {
  const slot = firstEveningSlot();
  return {
    ...s,
    providerId: slot.providerId,
    slotId: slot.id,
    reservation: { id: `hold-${slot.id}`, providerId: slot.providerId, slotId: slot.id, expiresAt: now() + 15 * 60_000 },
    chat: {
      ...s.chat,
      slotChosen: true,
      jobs: { ...s.chat.jobs, hold: { status: "done", startedAt: now(), finishedAt: now(), inputs: slot.id } },
    },
  };
}

function bookedState(s: ChatJourney): ChatJourney {
  const slot = firstEveningSlot();
  const at = new Date().toISOString();
  return {
    ...s,
    profile: {
      ...s.profile,
      firstName: "Alex",
      lastName: "Rivera",
      month: "8",
      day: "14",
      year: "1993",
      address: "418 Maple Hollow Dr",
      city: "Austin",
      zip: "78745",
      email: "alex.rivera@example.com",
      phone: "5125550148",
      sms: true,
    },
    memberId: "W2N48217",
    eligibility: { status: "verified", estimate: 25, checkedAt: at, activeCoverage: true, networkStatus: "in-network" },
    agreements: true,
    financialConsent: true,
    paymentReady: true,
    paymentSetup: {
      id: "seti_preview_moment",
      status: "succeeded",
      method: { id: "pm_mock_preview", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 },
    },
    portalAuth: { status: "signed_in", codeExpiresAt: null },
    reservation: null,
    appointment: { id: "visit-first-preview", providerId: slot.providerId, slotId: slot.id, start: slot.start, status: "confirmed" },
    clock: { virtualStart: now(), realStart: now(), rate: 1 },
    events: [
      ...s.events,
      { id: "preview-account", at, service: "Auth", operation: "account.created", outcome: "success", detail: "Fictional account loaded by preview tools" },
      { id: "preview-booking", at, service: "Scheduling", operation: "review.fixture", outcome: "success", detail: "Fictional booked visit loaded by preview tools" },
    ],
    chat: {
      ...s.chat,
      codeSentAt: now(),
      codeVerified: true,
      dobEntered: true,
      identity: "confirmed",
      sexAtBirth: "Female",
      emailEntered: true,
      benefits: { payer: "Aetna", plan: "PPO", memberLast4: "8217", network: "in-network", copay: 25, deductibleRemaining: null, via: "chosen" },
      benefitsAccepted: true,
      agreedEstimate: 25,
      controlledAck: true,
      jobs: {
        ...s.chat.jobs,
        identity: { status: "done", finishedAt: now() },
        benefits: { status: "done", finishedAt: now(), note: "verified" },
        book: { status: "done", finishedAt: now() },
      },
      receipts: [
        { id: "m1", at, actor: "Legion AI", action: "Compared Texas clinicians and found 3 with openings that fit", source: "Legion directory and calendars" },
        { id: "m2", at, actor: "Legion AI", action: "Found your name and address from your phone number", source: "Verified (simulated)" },
        { id: "m3", at, actor: "Legion AI", action: "Confirmed active coverage and a $25 estimate", source: "Sohar eligibility (simulated)" },
        { id: "m4", at, actor: "Legion AI", action: "Booked your visit", source: "Legion scheduling" },
      ],
    },
  };
}

function preparedState(s: ChatJourney): ChatJourney {
  return {
    ...s,
    healthReviewed: true,
    recordsPermission: true,
    recordsStatus: "ready",
    briefApproved: true,
    chat: {
      ...s.chat,
      prep: "yes",
      records: "yes",
      recordsFound: RECORDS_FIXTURE,
      medication: "taking",
      allergy: "yes",
      pharmacy: "suggested",
      pcp: "share",
      pcpName: "Dr. Lee at Austin Family Medicine",
      baselineIntro: "start",
      baseline: { gad1: 2, gad2: 2, phq1: 1, phq2: 1 },
      noteDone: true,
      briefApproved: true,
      idCheck: "later",
      readyAck: true,
      jobs: {
        ...s.chat.jobs,
        records: { status: "done", finishedAt: now() },
        brief: { status: "done", finishedAt: now() },
      },
    },
  };
}

function visitDayState(s: ChatJourney): ChatJourney {
  const start = new Date(s.appointment!.start).getTime();
  return {
    ...s,
    visitDay: true,
    clock: { virtualStart: start - 14 * 60_000, realStart: now(), rate: 1 },
  };
}

function completeState(s: ChatJourney): ChatJourney {
  const at = new Date().toISOString();
  return {
    ...s,
    currentLocation: "Austin, TX",
    callbackConfirmed: true,
    deviceReady: true,
    appointment: { ...s.appointment!, status: "completed" },
    encounter: { status: "completed", connection: "disconnected", clinicianStatus: "ready", checkedInAt: at, joinedAt: at, completedAt: at },
    carePlan: { status: "published", publishedAt: at, followupWeeks: 2 },
    events: [
      ...s.events,
      { id: "preview-encounter", at, service: "Encounter", operation: "review.fixture", outcome: "success", detail: "Fictional completed visit loaded by preview tools" },
    ],
    chat: { ...s.chat, reminderReply: "confirm", afterFeeling: "better" },
  };
}

export function momentState(moment: Moment, scenario: Scenario = "standard"): ChatJourney {
  let s: ChatJourney = { ...initialChatJourney(), scenario };
  if (moment !== "start") s = withMatch(storyDone(s));
  if (moment === "booking") s = held(s);
  if (moment === "booked" || moment === "visit-day" || moment === "complete") s = bookedState(held(s));
  if (moment === "visit-day" || moment === "complete") s = visitDayState(preparedState(s));
  if (moment === "complete") s = completeState(s);
  // Everything before the moment is already part of the conversation.
  const seen = deriveTranscript(SCRIPT, s).items.map((item) => item.key);
  return { ...s, chat: { ...s.chat, seen } };
}
