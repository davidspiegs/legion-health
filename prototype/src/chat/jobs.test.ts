/**
 * Background jobs against the simulated services, through a harness that mirrors ChatApp:
 * every update runs the journey reducer, then the chat merge, then reconcile, and the effects
 * that re-run matching and benefits after an upstream change run between steps.
 */
import test from "node:test";
import assert from "node:assert/strict";
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
  slotLabel,
  verifyCode,
  type ChatContext,
  type ChatPatch,
} from "./agent";
import { fitsPreference, inventory } from "./inventory";
import { reconcile } from "./reconcile";
import { SCRIPT } from "./script";
import { DISCOVERED_PLAN } from "../model/fixtures";
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

test("DoseSpot saves the pharmacy and sends a refill, and a refill the pharmacy didn't confirm is resent", async () => {
  const p = patient({ scenario: "prescription-failed" });
  await assert.rejects(p.ctx.api.sendPrescription({ medication: "Sertraline 50 mg daily", supply: "30-day refill" }), /pharmacy/);
  const saved = await p.ctx.api.savePharmacy({ name: "CVS Pharmacy", address: "2508 S Congress Ave, Austin" });
  assert.ok(saved.ncpdpId);
  const failed = await p.ctx.api.sendPrescription({ medication: "Sertraline 50 mg daily", supply: "30-day refill" });
  assert.equal(failed.status, "failed");
  const resent = await p.ctx.api.sendPrescription({ medication: "Sertraline 50 mg daily", supply: "30-day refill" });
  assert.equal(resent.status, "sent");
  assert.equal(p.state.prescriptions?.length, 1, "a resend replaces the copy that didn't arrive");
  assert.equal(p.state.prescriptions?.[0].pharmacy, "CVS Pharmacy, 2508 S Congress Ave");
});

test("a MyChart import can fail once, then brings in the chart", async () => {
  const p = patient({ scenario: "mychart-unavailable" });
  await assert.rejects(p.ctx.api.importChart("Austin Family Medicine"), /didn’t connect/);
  const chart = await p.ctx.api.importChart("Austin Family Medicine");
  assert.equal(chart.organization, "Austin Family Medicine");
  assert.ok(chart.conditions.length && chart.medications.length);
  assert.equal(p.state.chartImport?.organization, "Austin Family Medicine");
});
