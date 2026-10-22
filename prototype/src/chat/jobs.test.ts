/**
 * Background jobs against the simulated services, through a harness that mirrors ChatApp:
 * every update runs the journey reducer, then the chat merge, then reconcile, and the effects
 * that re-run matching and benefits after an upstream change run between steps.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMockApi } from "../model/services";
import { applyJourneyPatch } from "../model/journey-state";
import type { Appointment, JourneyState, Profile, Slot } from "../model/types";
import {
  appointmentLabel,
  followupOptions,
  matchInputs,
  runBenefits,
  runBooking,
  runHold,
  runIdentity,
  runMatch,
  runRecords,
  sendCode,
  sendPlanPrescriptions,
  slotLabel,
  verifyCode,
  type ChatContext,
  type ChatPatch,
} from "./agent";
import { fitsPreference, inventory } from "./inventory";
import { momentState } from "./moments";
import { reconcile } from "./reconcile";
import { SCRIPT } from "./script";
import { DISCOVERED_PLAN, isControlled, medsInSentence, prescriptionFor, regimenFor, regimenLine } from "../model/fixtures";
import { modelContext, waitingForId } from "./model";
import { PREVIEW_CODE, initialChatJourney, type ChatJourney, type ChatState } from "./state";

inventory();

type Seed = Partial<Omit<ChatJourney, "chat" | "profile">> & { profile?: Partial<Profile>; chat?: Partial<ChatState> };

function patient(seed: Seed = {}) {
  const { chat, profile, ...journey } = seed;
  const base = initialChatJourney();
  let state: ChatJourney = { ...base, ...journey, profile: { ...base.profile, ...profile }, chat: { ...base.chat, ...chat } };
  // Mirrors ChatApp.update: the journey reducer, then the chat merge, then reconcile.
  const update = (patch: ChatPatch) => {
    const { chat: chatPatch, ...rest } = patch;
    const previous = state;
    const next = applyJourneyPatch(previous, rest as Partial<JourneyState>) as ChatJourney;
    state = reconcile(previous, { ...next, chat: chatPatch ? { ...previous.chat, ...chatPatch } : previous.chat });
  };
  const api = createMockApi({ getState: () => state, update: (p) => update(p), delayMs: 0, eligibilityDelayMs: 0 });
  const ctx: ChatContext = {
    get: () => state,
    update,
    api,
    act: async (fn) => {
      try {
        return await fn();
      } catch {
        return undefined;
      }
    },
    openSheet: () => undefined,
    closeSheet: () => undefined,
    answer: () => undefined,
    edit: () => undefined,
    setVisitOpen: () => undefined,
    preview: { restart: () => undefined, jump: () => undefined, setScenario: () => undefined },
  };
  // ChatApp's effects: an upstream change re-runs matching, and confirmed insured details start benefits.
  const effects = () => {
    if (state.appointment) return;
    const job = state.chat.jobs.match;
    if (state.chat.match && job?.status === "done" && job.inputs !== matchInputs(state)) void runMatch(ctx);
    if (
      state.coverage === "insurance" &&
      state.chat.identity === "confirmed" &&
      state.chat.benefitsChoice !== "selfpay" &&
      !state.chat.benefits &&
      !state.chat.jobs.benefits
    )
      void runBenefits(ctx);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
  /** Lets background work, and the work it sets off, come to rest. */
  const flush = async () => {
    for (let round = 0; round < 8; round++) {
      effects();
      await settle();
    }
  };
  return {
    get state() {
      return state;
    },
    ctx,
    update,
    flush,
    settle,
    /** Preview restart: the conversation is replaced while work may still be running. */
    reset: () => {
      state = initialChatJourney();
    },
    receipts: (text: string) => state.chat.receipts.filter((item) => item.action.includes(text)),
    // Read through a function so an assertion earlier in a test doesn't narrow later reads.
    appointment: (): Appointment | null => state.appointment,
  };
}

const DETAILS: Profile = {
  firstName: "Alex",
  lastName: "Rivera",
  month: "8",
  day: "14",
  year: "1993",
  address: "418 Maple Hollow Dr",
  city: "Austin",
  zip: "78745",
  email: "alex@example.com",
  phone: "5125550148",
  sms: true,
};

const CARD = { token: "pm_mock_test", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030, billingZip: "78745" };

/** Through confirming their details, paying with insurance; "unsure" is "Find it for me". */
function insured(payerChoice: string, seed: Seed = {}): Seed {
  return {
    conditions: ["ADHD", "Anxiety"],
    goal: "Understand what’s going on",
    coverage: "insurance",
    payer: payerChoice === "unsure" ? "" : payerChoice,
    profile: DETAILS,
    ...seed,
    chat: {
      payMethod: "insurance",
      payerChoice,
      availability: ["evenings"],
      codeVerified: true,
      dobEntered: true,
      identity: "confirmed",
      ...seed.chat,
    },
  };
}

function selfPay(seed: Seed = {}): Seed {
  return {
    conditions: ["ADHD", "Anxiety"],
    goal: "Understand what’s going on",
    coverage: "selfpay",
    profile: DETAILS,
    ...seed,
    chat: { payMethod: "selfpay", availability: ["evenings"], codeVerified: true, dobEntered: true, identity: "confirmed", ...seed.chat },
  };
}

/** The first open time with a clinician in the given hours, a few hours out or later. */
function firstTime(clinician: string, prefs: string[], except: string[] = []): Slot {
  const after = Date.now() + 3 * 3_600_000;
  const slot = inventory().slots.find(
    (item) =>
      item.providerId === clinician &&
      new Date(item.start).getTime() > after &&
      fitsPreference(item, prefs) &&
      !except.includes(item.id),
  );
  assert.ok(slot, `expected an open ${prefs.join(" or ")} time with ${clinician}`);
  return slot;
}

test("an insured patient whose lapsed hold was taken picks a new time and books", async () => {
  const p = patient(insured("Aetna"));
  await runMatch(p.ctx);
  const first = firstTime(p.state.chat.match!.offerIds[0], ["evenings"]);
  assert.equal(await runHold(p.ctx, first.id), true);
  await p.flush();
  assert.equal(p.state.chat.benefits?.copay, 25, "benefits were checked for the held time");
  await p.ctx.api.createAccount();
  p.update({ chat: { benefitsAccepted: true } });
  p.update({ agreements: true, financialConsent: true });
  assert.equal(p.state.chat.agreedEstimate, 25, "the estimate agreed to is kept with the consent");
  await p.ctx.api.setupPayment(CARD);

  // The hold runs out during paperwork, and someone else books the time.
  p.update({
    reservation: { ...p.state.reservation!, expiresAt: Date.now() - 1000 },
    faultsUsed: [...p.state.faultsUsed, `unavailable-slot:${first.id}`],
  });
  await runBooking(p.ctx);
  assert.equal(p.appointment(), null, "nothing is booked");
  assert.equal(p.state.slotId, "", "back to choosing a time");
  assert.equal(p.state.chat.holdNotice, "taken");
  assert.equal(p.state.financialConsent, false, "consent pauses while the estimate is unknown");
  await p.flush();
  assert.equal(p.state.eligibility.status, "verified");
  assert.equal(p.state.financialConsent, true, "a re-check at the same estimate restores consent");

  const second = firstTime(first.providerId, ["evenings"], [first.id]);
  assert.equal(await runHold(p.ctx, second.id), true);
  await p.flush();
  assert.equal(p.state.chat.benefits?.copay, 25);
  assert.equal(p.state.financialConsent, true, "the new time has the same estimate");
  p.update({ chat: { benefitsAccepted: true } });
  await runBooking(p.ctx);
  assert.equal(p.appointment()?.status, "confirmed");
  assert.equal(p.appointment()?.slotId, second.id, "the new time is booked");
  assert.equal(p.state.chat.jobs.book?.status, "done");
});

test("booking without payment consent waits for the patient instead of asking the scheduler", async () => {
  const p = patient(selfPay());
  await runMatch(p.ctx);
  await runHold(p.ctx, firstTime(p.state.chat.match!.offerIds[0], ["evenings"]).id);
  await p.ctx.api.createAccount();
  p.update({ agreements: true, financialConsent: true });
  await p.ctx.api.setupPayment(CARD);
  p.update({ financialConsent: false });
  await runBooking(p.ctx);
  assert.equal(p.appointment(), null);
  assert.equal(p.state.chat.jobs.book?.status, "failed");
  assert.equal(p.state.chat.jobs.book?.note, "consent");
  assert.ok(
    !p.state.events.some((event) => event.operation === "appointment.confirmed"),
    "the scheduler was never asked",
  );
  // "Agree and book" sets consent and clears the job; booking then goes through.
  p.update({ financialConsent: true, chat: { jobs: { ...p.state.chat.jobs, book: undefined } } });
  await runBooking(p.ctx);
  assert.equal(p.appointment()?.status, "confirmed");
});

test("“Find it for me” keeps the held time when the plan found isn’t one the clinician takes", async () => {
  const p = patient(insured("unsure", { conditions: ["Bipolar Disorder"], chat: { identity: "found" } }));
  await runMatch(p.ctx);
  assert.deepEqual(p.state.chat.match?.offerIds, ["daniel"], "only Daniel focuses on bipolar disorder");
  const slot = firstTime("daniel", ["evenings"]);
  await runHold(p.ctx, slot.id);
  const inputs = matchInputs(p.state);
  // "Yes, that’s me" starts coverage work.
  p.update({ chat: { identity: "confirmed" } });
  void runBenefits(p.ctx);
  await p.flush();
  assert.equal(p.state.payer, "Blue Cross Blue Shield of Texas", "discovery found the plan");
  assert.equal(matchInputs(p.state), inputs, "a plan that was found isn't a new choice, so matching stays");
  assert.equal(p.state.slotId, slot.id, "the time stays held");
  assert.equal(p.state.reservation?.slotId, slot.id);
  assert.equal(p.state.chat.slotChosen, true);
  assert.equal(p.state.chat.benefits?.network, "out-of-network");
  assert.equal(p.state.chat.benefits?.copay, null, "no in-network estimate is claimed");
  assert.equal(p.state.chat.benefits?.via, "discovery");
  assert.equal(p.state.chat.jobs.benefits?.status, "done");
  assert.equal(p.receipts("Compared").length, 1, "matching ran once");
  const sohar = p.state.chat.receipts.filter((item) => item.source.startsWith("Sohar"));
  assert.deepEqual(
    sohar.map((item) => item.action),
    [
      "Found your Blue Cross Blue Shield of Texas plan",
      "Confirmed active coverage, but Daniel Okafor isn’t in network with Blue Cross Blue Shield of Texas",
    ],
    "discovery and the check each ran once, and the receipt says what's true",
  );
});

test("changing hours to mornings lets go of an evening hold, and says why", async () => {
  const p = patient(selfPay());
  await runMatch(p.ctx);
  const evening = firstTime(p.state.chat.match!.offerIds[0], ["evenings"]);
  await runHold(p.ctx, evening.id);
  p.update({ chat: { availability: ["mornings"] } });
  await p.flush();
  assert.equal(p.state.chat.jobs.match?.inputs, matchInputs(p.state), "matching re-ran for mornings");
  assert.equal(p.state.chat.holdNotice, "released");
  assert.equal(p.state.chat.releasedSlot, evening.id, "the card can name the time it let go");
  assert.equal(p.state.slotId, "");
  assert.equal(p.state.reservation, null);
  assert.equal(p.state.chat.slotChosen, false);
  const [released] = p.receipts("Released your hold");
  assert.ok(released, "the release has a receipt");
  assert.ok(released.action.endsWith("since you said mornings work best"), released.action);
});

test("a held time survives a re-match while its clinician still fits", async () => {
  const p = patient(selfPay());
  await runMatch(p.ctx);
  // Picked with "Show times outside my preferences": a morning, though the patient said evenings.
  const morning = firstTime("maya", ["mornings"]);
  await runHold(p.ctx, morning.id);
  p.update({ conditions: ["ADHD"] });
  await p.flush();
  assert.equal(p.state.chat.jobs.match?.inputs, matchInputs(p.state), "matching re-ran");
  assert.equal(p.state.slotId, morning.id, "the hours didn't change, so the time stays");
  assert.equal(p.state.chat.holdNotice, "");
  p.update({ chat: { availability: ["evenings", "mornings"] } });
  await p.flush();
  assert.equal(p.state.slotId, morning.id, "new hours that include the time keep it");
  assert.equal(p.receipts("Released").length, 0);
});

test("a plan the held clinician doesn’t take lets the time go as not covered", async () => {
  const p = patient(insured("Aetna", { conditions: ["Bipolar Disorder"], chat: { identity: "" } }));
  await runMatch(p.ctx);
  const slot = firstTime("daniel", ["evenings"]);
  await runHold(p.ctx, slot.id);
  // "Use a different plan": the patient picks one Daniel doesn't take.
  p.update({
    payer: "Blue Cross Blue Shield of Texas",
    memberId: "W604918217",
    chat: { payerChoice: "Blue Cross Blue Shield of Texas" },
  });
  await p.flush();
  assert.equal(p.state.chat.holdNotice, "not-covered");
  assert.equal(p.state.chat.releasedSlot, slot.id);
  assert.equal(p.state.slotId, "");
  assert.equal(p.state.chat.slotChosen, false);
  const [released] = p.receipts("Released your hold");
  assert.ok(released?.action.endsWith("Daniel Okafor, who isn’t in network with Blue Cross Blue Shield of Texas"), released?.action);
});

test("a failed change of time keeps the hold the patient already had", async () => {
  const p = patient(selfPay());
  await runMatch(p.ctx);
  const held = firstTime("maya", ["evenings"]);
  await runHold(p.ctx, held.id);
  const reservation = p.state.reservation;
  const other = firstTime("maya", ["evenings"], [held.id]);
  p.update({ faultsUsed: [...p.state.faultsUsed, `unavailable-slot:${other.id}`] });
  assert.equal(await runHold(p.ctx, other.id), false, "the new time couldn't be held");
  assert.equal(p.state.slotId, held.id);
  assert.deepEqual(p.state.reservation, reservation);
  assert.equal(p.state.chat.slotChosen, true);
  assert.equal(p.state.chat.holdNotice, "taken");
  assert.equal(p.state.chat.jobs.hold?.status, "failed");
  assert.equal(p.state.chat.jobs.hold?.inputs, other.id, "the card marks the time that was tried");

  // With nothing held before, a failure leaves nothing held.
  const fresh = patient(selfPay({ faultsUsed: [`unavailable-slot:${other.id}`] }));
  await runMatch(fresh.ctx);
  assert.equal(await runHold(fresh.ctx, other.id), false);
  assert.equal(fresh.state.slotId, "");
  assert.equal(fresh.state.chat.slotChosen, false);
  assert.equal(fresh.state.chat.holdNotice, "taken");
});

test("time labels never throw for a time that has left the inventory", () => {
  const known = inventory().slots[0];
  const [, clinician] = known.id.split("-");
  // The same date and time under an id the inventory doesn't have reads exactly the same.
  assert.equal(slotLabel(known.id.replace(`-${clinician}-`, "-nobody-")), slotLabel(known.id));
  assert.match(slotLabel("chat-maya-20250102-1830"), /^Thu, Jan 2, 6:30\sPM$/);
  assert.match(slotLabel("chat-fu-maya-20250102-0900", false), /^9:00\sAM$/);
  assert.equal(slotLabel("not-a-slot"), "an earlier time");
  assert.match(appointmentLabel({ start: "2025-01-02T18:30:00-06:00" }), /^Thu, Jan 2, 6:30\sPM$/);
  const old: ChatJourney = {
    ...initialChatJourney(),
    appointment: {
      id: "visit-old",
      providerId: "maya",
      slotId: "chat-maya-20250102-1830",
      start: "2025-01-02T18:30:00-06:00",
      status: "completed",
    },
  };
  assert.deepEqual(followupOptions(old), [], "no follow-up times in the past");
});

test("a benefits check drops its result when the patient switches to self-pay", async () => {
  const toSelfPay = (p: ReturnType<typeof patient>) =>
    p.update({
      coverage: "selfpay",
      payer: "",
      chat: {
        payMethod: "selfpay",
        payerChoice: "",
        benefits: null,
        benefitsAccepted: false,
        benefitsChoice: "",
        jobs: { ...p.state.chat.jobs, benefits: undefined },
      },
    });

  // While discovery is still looking.
  const looking = patient(insured("unsure"));
  const run = runBenefits(looking.ctx);
  toSelfPay(looking);
  await run;
  await looking.settle();
  assert.equal(looking.state.coverage, "selfpay");
  assert.equal(looking.state.payer, "");
  assert.equal(looking.state.memberId, "", "no discovered member ID is written into a self-pay journey");
  assert.equal(looking.state.chat.benefits, null);
  assert.equal(looking.state.chat.jobs.benefits, undefined);
  assert.equal(looking.state.chat.receipts.length, 0);

  // While the plan is being asked.
  const checking = patient(insured("unsure"));
  const check = checking.ctx.api.checkEligibility;
  checking.ctx.api.checkEligibility = () => {
    const answer = check();
    toSelfPay(checking);
    return answer;
  };
  await runBenefits(checking.ctx);
  await checking.settle();
  assert.equal(checking.state.coverage, "selfpay");
  assert.equal(checking.state.chat.benefits, null);
  assert.equal(checking.state.chat.jobs.benefits, undefined, "no failed check is left behind");
  assert.equal(checking.receipts("couldn’t match").length, 0, "a stale check isn't reported as a plan problem");
  assert.equal(checking.receipts("Confirmed").length, 0);
});

test("an identity lookup that finishes after a restart writes nothing", async () => {
  const p = patient({ profile: { phone: "5125550148", month: "8", day: "14", year: "1993" }, chat: { dobEntered: true } });
  const lookup = runIdentity(p.ctx);
  p.reset();
  await lookup;
  assert.equal(p.state.chat.identity, "");
  assert.equal(p.state.profile.firstName, "");
  assert.equal(p.state.chat.jobs.identity, undefined);
  assert.equal(p.state.chat.receipts.length, 0);
});

test("the identity lookup runs once per number and birth date, and records a miss on the job", async () => {
  const p = patient({ profile: { phone: "5125550148", month: "8", day: "14", year: "1993" }, chat: { dobEntered: true } });
  // A reload's restart and the birth date answer can both ask for it.
  await Promise.all([runIdentity(p.ctx), runIdentity(p.ctx)]);
  assert.equal(p.state.chat.identity, "found");
  assert.equal(p.receipts("Found your name").length, 1);

  const miss = patient({
    scenario: "identity-not-found",
    profile: { phone: "5125550148", month: "8", day: "14", year: "1993" },
    chat: { dobEntered: true },
  });
  await runIdentity(miss.ctx);
  assert.equal(miss.state.chat.identity, "not-found");
  assert.equal(miss.state.chat.jobs.identity?.status, "failed");
  assert.equal(miss.state.chat.jobs.identity?.note, "not-found", "so details added later read as added by hand");
});

test("a records search that finishes after a restart writes nothing", async () => {
  const p = patient({ chat: { records: "yes" } });
  const search = runRecords(p.ctx);
  p.reset();
  await search;
  await p.settle();
  assert.equal(p.state.chat.recordsFound, null);
  assert.equal(p.state.chat.jobs.records, undefined);
  assert.equal(p.state.chat.receipts.length, 0);
});

test("the texted code is sent and checked through the mock API, and a text that doesn't arrive can be sent again", async () => {
  const p = patient({ scenario: "code-not-delivered", profile: { phone: "5125550148" } });
  await sendCode(p.ctx);
  assert.match(p.state.chat.codeError, /didn’t go through/);
  assert.equal(p.state.chat.codeSentAt, null, "a failed text isn't counted as sent");
  await sendCode(p.ctx);
  assert.equal(p.state.chat.codeError, "");
  assert.ok(p.state.chat.codeSentAt);
  assert.equal(await verifyCode(p.ctx, "000000"), false);
  assert.equal(p.state.chat.codeVerified, false);
  assert.equal(await verifyCode(p.ctx, PREVIEW_CODE), true);
});

test("insurance discovery and clinician matching answer through the mock API, and recover from a failure", async () => {
  const insured = patient({ scenario: "coverage-not-found", coverage: "insurance", payer: "Aetna", memberId: "" });
  await runBenefits(insured.ctx);
  assert.equal(insured.state.chat.jobs.benefits?.status, "failed");
  assert.equal(insured.state.chat.jobs.benefits?.note, "not-found");
  assert.equal(insured.state.memberId, "", "nothing is assumed when no plan is found");
  await runBenefits(insured.ctx);
  assert.equal(insured.state.memberId, DISCOVERED_PLAN.memberId, "trying again finds the member ID");

  const searching = patient({ scenario: "calendars-unavailable", coverage: "selfpay", conditions: ["Anxiety"], chat: { availability: ["evenings"] } });
  await runMatch(searching.ctx);
  assert.equal(searching.state.chat.jobs.match?.status, "failed");
  assert.equal(Boolean(searching.state.chat.match), false, "no clinicians are shown from a failed search");
  await runMatch(searching.ctx);
  assert.equal(searching.state.chat.jobs.match?.status, "done");
  assert.ok(searching.state.chat.match?.offerIds.length, "trying again finds clinicians");
});

test("the ID check and the summary share can fail once and then go through, and every call is logged", async () => {
  const id = patient({ scenario: "id-unreadable" });
  assert.deepEqual(await id.ctx.api.verifyPhotoId(), { status: "unreadable" });
  assert.deepEqual(await id.ctx.api.verifyPhotoId(), { status: "verified" }, "a retake goes through");
  assert.deepEqual(
    id.state.events.filter((event) => event.service === "Persona").map((event) => event.outcome),
    ["pending", "error", "pending", "success"],
  );

  const share = patient({ scenario: "share-failed" });
  await assert.rejects(share.ctx.api.shareVisitSummary(), /didn’t accept/);
  assert.ok((await share.ctx.api.shareVisitSummary()).sentAt);
});

test("a missed plan asks for the member ID right away, and checking with it confirms the plan", async () => {
  const p = patient({ scenario: "coverage-not-found", coverage: "insurance", payer: "Aetna", memberId: "" });
  await runBenefits(p.ctx);
  const node = SCRIPT.find((item) => item.id === "benefits")!;
  assert.equal(node.input!(p.state)?.kind, "text", "the member ID is asked for, not a retry");
  await assert.rejects(async () => node.submit!("??", p.ctx), /member ID/);
  await node.submit!("w2n 482 17", p.ctx);
  assert.equal(p.state.memberId, "W2N48217");
  assert.equal(p.state.chat.jobs.benefits?.status, "done");

  const noCard = patient({ scenario: "coverage-not-found", coverage: "insurance", payer: "Aetna", memberId: "" });
  await runBenefits(noCard.ctx);
  await node.submit!("__nocard", noCard.ctx);
  const input = node.input!(noCard.state);
  assert.equal(input?.kind, "single");
  assert.deepEqual(
    input?.kind === "single" ? input.options.map((option) => option.value) : [],
    ["__memberid", "selfpay", "person"],
    "without the card: enter it after all, pay yourself, or get help",
  );
});

test("DoseSpot saves the pharmacy and sends a prescription, and one the pharmacy didn't confirm is resent", async () => {
  const p = patient({ scenario: "prescription-failed" });
  const rx = { medication: "Adderall 20 mg once every morning", supply: "30-day supply" };
  await assert.rejects(p.ctx.api.sendPrescription(rx), /pharmacy/);
  const saved = await p.ctx.api.savePharmacy({ name: "CVS Pharmacy", address: "2508 S Congress Ave, Austin" });
  assert.ok(saved.ncpdpId);
  const failed = await p.ctx.api.sendPrescription(rx);
  assert.equal(failed.status, "failed");
  const resent = await p.ctx.api.sendPrescription(rx);
  assert.equal(resent.status, "sent");
  assert.equal(p.state.prescriptions?.length, 1, "a resend replaces the copy that didn't arrive");
  assert.equal(p.state.prescriptions?.[0].pharmacy, "CVS Pharmacy, 2508 S Congress Ave");
});

const node = (id: string) => SCRIPT.find((item) => item.id === id)!;
const askOf = (id: string, s: ChatJourney) => {
  const block = node(id).say(s).find((item) => item.id === "ask");
  return block?.kind === "text" ? block.text : "";
};

/** A finished first visit with a signed plan, for these conditions, with prep done the way a patient does it or skipped. */
async function signedPlan(conditions: string[], prep: boolean) {
  const done = momentState("complete");
  if (!prep) {
    const booked = momentState("booked");
    return patient({
      ...done,
      conditions,
      pharmacy: null,
      healthReviewed: false,
      chat: { ...booked.chat, prep: "later", reminderReply: "confirm" },
    });
  }
  const { records: _records, ...jobs } = done.chat.jobs;
  const p = patient({
    ...done,
    conditions,
    pharmacy: null,
    chat: { ...done.chat, recordsFound: null, medication: "", pharmacy: "", jobs },
  });
  await runRecords(p.ctx);
  return p;
}

test("every reader names the same regimen: records, reconciliation, MyChart, the plan's prescriptions and the model", async () => {
  for (const conditions of [["ADHD"], ["Anxiety", "Depression"], ["Bipolar Disorder", "PTSD"], ["I'm not sure"]]) {
    const regimen = regimenFor(conditions);
    const label = conditions.join("+");

    const p = await signedPlan(conditions, true);
    const found = p.state.chat.recordsFound;
    assert.deepEqual(
      found?.medications.map((med) => `${med.name} ${med.dose} ${med.schedule}`),
      regimen.map(prescriptionFor),
      `${label}: the pharmacy's fill history`,
    );
    const them = regimen.length === 1 ? "it" : "them";
    assert.equal(
      askOf("medication", p.state),
      `Your pharmacy shows ${medsInSentence(regimen)}, last filled Sep 28. Are you still taking ${them}?`,
      label,
    );
    await node("medication").submit!("taking", p.ctx);
    await node("pharmacy").submit!("suggested", p.ctx);
    const chart = await p.ctx.api.importChart("Austin Family Medicine");
    assert.deepEqual(chart.medications, [...regimen.map(prescriptionFor), "Cetirizine 10 mg as needed"], `${label}: MyChart`);

    // A controlled medication waits for the photo ID; the rest go when the plan is signed.
    const now = regimen.filter((med) => !isControlled(med.name));
    const controlled = regimen.filter((med) => isControlled(med.name));
    await sendPlanPrescriptions(p.ctx);
    assert.deepEqual(p.state.prescriptions?.map((rx) => rx.medication) ?? [], now.map(prescriptionFor), `${label}: the plan`);
    const context = modelContext(p.state);
    assert.equal(context.medications, regimenLine(regimen), `${label}: the model`);
    for (const med of regimen) assert.ok(context.plan.includes(`continue ${prescriptionFor(med)} (`), `${label}: ${med.name} in the plan`);
    p.update({ chat: { idCheck: "done" } });
    await sendPlanPrescriptions(p.ctx);
    assert.deepEqual(p.state.prescriptions?.map((rx) => rx.medication), [...now, ...controlled].map(prescriptionFor), `${label}: verified`);
    assert.ok(p.state.prescriptions?.every((rx) => rx.status === "sent" && rx.supply === "30-day supply"));
    assert.equal(p.receipts("sent your").length, (now.length ? 1 : 0) + (controlled.length ? 1 : 0), "one receipt per prescriber");

    // Prep skipped: no records and no pharmacy, so the one on record is saved before the plan is sent.
    const q = await signedPlan(conditions, false);
    assert.equal(q.state.chat.recordsFound, null);
    q.update({ chat: { idCheck: "done" } });
    await sendPlanPrescriptions(q.ctx);
    assert.equal(q.state.pharmacy?.name, "CVS Pharmacy", `${label}: pharmacy saved`);
    assert.deepEqual(q.state.prescriptions?.map((rx) => rx.medication), regimen.map(prescriptionFor), `${label}: skipped prep`);
    assert.equal(modelContext(q.state).medications, regimenLine(regimen), `${label}: the model, skipped prep`);
  }
});

test("the plan continues nothing the patient stopped, and sends once however often it's asked", async () => {
  for (const medication of ["stopped", "none"] as const) {
    const p = await signedPlan(["ADHD", "Anxiety"], true);
    p.update({ chat: { medication } });
    await sendPlanPrescriptions(p.ctx);
    assert.equal(p.state.prescriptions, undefined, medication);
  }
  const typed = await signedPlan(["ADHD"], true);
  typed.update({ chat: { medication: "other", medicationNote: "Wellbutrin 150 mg" } });
  await sendPlanPrescriptions(typed.ctx);
  assert.equal(typed.state.prescriptions, undefined, "a list the patient typed is gone over in the visit");

  const twice = await signedPlan(["ADHD", "Anxiety"], false);
  twice.update({ chat: { idCheck: "done" } });
  await Promise.all([sendPlanPrescriptions(twice.ctx), sendPlanPrescriptions(twice.ctx)]);
  await sendPlanPrescriptions(twice.ctx);
  assert.equal(twice.state.prescriptions?.length, 2);
  assert.equal(twice.receipts("sent your").length, 2, "one from the clinician, one from the psychiatrist");
});

test("a restart while DoseSpot is sending doesn't stop the new conversation's plan from being sent", async () => {
  const p = await signedPlan(["Anxiety"], true);
  await node("medication").submit!("taking", p.ctx);
  await node("pharmacy").submit!("suggested", p.ctx);
  const first = sendPlanPrescriptions(p.ctx);
  // A jump makes a new context for the new conversation; the old one's writes go nowhere.
  const fresh = await signedPlan(["Anxiety"], true);
  await node("medication").submit!("taking", fresh.ctx);
  await node("pharmacy").submit!("suggested", fresh.ctx);
  const second = sendPlanPrescriptions(fresh.ctx);
  assert.notEqual(first, second, "the new conversation doesn't wait on the old one's send");
  await Promise.all([first, second]);
  assert.deepEqual(fresh.state.prescriptions?.map((rx) => rx.medication), ["Escitalopram (Lexapro) 10 mg once a day"]);
});

test("Adderall waits for the photo ID, then a Legion psychiatrist sends it, once", async () => {
  const p = await signedPlan(["ADHD", "Anxiety", "Bipolar Disorder"], true);
  await node("medication").submit!("taking", p.ctx);
  await node("pharmacy").submit!("suggested", p.ctx);
  assert.equal(p.state.chat.idCheck, "later");
  await sendPlanPrescriptions(p.ctx);
  await sendPlanPrescriptions(p.ctx);
  assert.deepEqual(p.state.prescriptions?.map((rx) => rx.medication), [
    "Lamotrigine (Lamictal) 200 mg once a day",
    "Hydroxyzine (Vistaril) 25 mg as needed, up to three times a day",
  ]);
  assert.equal(p.receipts("Chen sent your lamotrigine (Lamictal) and hydroxyzine (Vistaril) prescriptions").length, 1);
  assert.deepEqual(waitingForId(p.state).map((med) => med.name), ["Adderall"]);
  assert.match(modelContext(p.state).plan, /continue Adderall 20 mg once every morning \(not sent yet: a Legion psychiatrist sends it once the patient verifies their photo ID\)/);

  p.update({ chat: { idCheck: "done" } });
  await Promise.all([sendPlanPrescriptions(p.ctx), sendPlanPrescriptions(p.ctx)]);
  await sendPlanPrescriptions(p.ctx);
  assert.equal(p.state.prescriptions?.filter((rx) => rx.medication === "Adderall 20 mg once every morning").length, 1);
  assert.equal(p.state.prescriptions?.length, 3);
  const [sent] = p.receipts("A Legion psychiatrist sent your Adderall prescription to CVS Pharmacy");
  assert.equal(sent?.actor, "Care team");
  assert.equal(p.receipts("sent your Adderall").length, 1);
  assert.deepEqual(waitingForId(p.state), []);
  assert.match(modelContext(p.state).plan, /continue Adderall 20 mg once every morning \(30-day supply, written by a Legion psychiatrist, sent to/);
});

test("the plan card and the clinician view show Adderall waiting for the ID, then sent by the psychiatrist", async () => {
  // Stylesheets are the bundler's job; here they load as nothing.
  register(
    `data:text/javascript,${encodeURIComponent(
      'export async function load(url, context, next) { return url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : next(url, context); }',
    )}`,
  );
  const { VISIT_CARDS } = await import("./visit");
  const { ClinicianView } = await import("./sheets");
  const p = await signedPlan(["ADHD", "Anxiety"], true);
  await node("medication").submit!("taking", p.ctx);
  await node("pharmacy").submit!("suggested", p.ctx);
  await sendPlanPrescriptions(p.ctx);
  const card = () => renderToStaticMarkup(createElement(() => VISIT_CARDS.plan({ state: p.state, ctx: p.ctx, active: false })));
  const chart = () => renderToStaticMarkup(createElement(ClinicianView, { state: p.state, ctx: p.ctx }));
  assert.match(card(), /Continue escitalopram \(Lexapro\) 10 mg once a day/);
  assert.match(card(), /Dr\.\u00A0Chen sent a 30-day supply to CVS Pharmacy/);
  assert.match(card(), /Continue Adderall 20 mg once every morning/);
  assert.match(card(), /A Legion psychiatrist sends it after you verify your photo ID\./);
  assert.match(card(), />Verify my ID</);
  assert.match(chart(), /Adderall 20 mg once every morning, waiting for photo ID/);
  assert.match(chart(), /Photo ID not verified, so the Adderall prescription waits to be sent/);

  p.update({ chat: { idCheck: "done" } });
  await sendPlanPrescriptions(p.ctx);
  assert.match(card(), /A Legion psychiatrist sent your Adderall prescription there too\./);
  assert.doesNotMatch(card(), /Verify my ID|after you verify/);
  assert.match(chart(), /Adderall 20 mg once every morning, sent by a Legion psychiatrist/);
  assert.doesNotMatch(chart(), /waiting for photo ID|Photo ID not verified/);
});

test("a prescription the pharmacy didn't confirm goes to the care team to resend", async () => {
  const p = await signedPlan(["ADHD", "Anxiety"], true);
  // With the photo ID verified first, both go together.
  p.update({ scenario: "prescription-failed", chat: { idCheck: "done" } });
  await node("medication").submit!("taking", p.ctx);
  await node("pharmacy").submit!("suggested", p.ctx);
  await sendPlanPrescriptions(p.ctx);
  assert.deepEqual(p.state.prescriptions?.map((rx) => rx.status), ["failed", "sent"]);
  assert.match(p.state.chat.tasks.at(-1)?.title ?? "", /^Resend the Adderall prescription to CVS Pharmacy/);
  assert.equal(p.receipts("sent your escitalopram (Lexapro) prescription").length, 1);
});

test("a MyChart import can fail once, then brings in the chart", async () => {
  const p = patient({ scenario: "mychart-unavailable" });
  await assert.rejects(p.ctx.api.importChart("Austin Family Medicine"), /didn’t connect/);
  const chart = await p.ctx.api.importChart("Austin Family Medicine");
  assert.equal(chart.organization, "Austin Family Medicine");
  assert.ok(chart.conditions.length && chart.medications.length);
  assert.equal(p.state.chartImport?.organization, "Austin Family Medicine");
});

test("Wren asks about MyChart once after prep, and the card follows the import", async () => {
  const p = patient();
  const s = momentState("booked");
  p.update({ ...s, scenario: "mychart-unavailable", chat: { ...s.chat, prep: "later" } });
  const node = SCRIPT.find((item) => item.id === "mychart")!;
  assert.ok(node.applies!(p.state), "asked right after prep");
  await node.submit!("connect", p.ctx);
  assert.equal(p.state.chat.chart, "failed");
  await node.submit!("connect", p.ctx);
  assert.equal(p.state.chat.chart, "done");
  assert.ok(p.state.chartImport);
  assert.equal(node.answer(p.state)?.text, "Connect MyChart");
});
