import test from "node:test";
import assert from "node:assert/strict";
import { createMockApi } from "./services";
import { applyJourneyPatch } from "./journey-state";
import {
  initialState,
  sampleProfile,
  slots,
  followupSlots,
  formatDate,
  formatTime,
  formatPhone,
  validateBirth,
  normalizeConditions,
  toggleCondition,
} from "./fixtures";
import type { JourneyState } from "./types";

function harness(patch: Partial<JourneyState> = {}) {
  const insuranceDetails =
    patch.coverage === "insurance"
      ? { payer: "Aetna", memberId: "1", profile: { ...sampleProfile } }
      : {};
  let state = { ...initialState(), ...insuranceDetails, ...patch };
  const update = (next: Partial<JourneyState>) => {
    state = applyJourneyPatch(state, next);
  };
  return {
    get state() {
      return state;
    },
    update,
    api: createMockApi({
      getState: () => state,
      update,
      delayMs: 0,
      eligibilityDelayMs: 0,
    }),
  };
}

async function book(h: ReturnType<typeof harness>) {
  h.update({ profile: { ...sampleProfile }, agreements: true });
  await h.api.createAccount();
  await h.api.reserve("maya", slots[0].id);
  await h.api.setupPayment();
  return h.api.confirm();
}

test("multiple conditions survive save failure, resume, and booking without entering the service log", async () => {
  const selected = toggleCondition(toggleCondition([], "ADHD"), "Anxiety");
  const h = harness({ conditions: selected, scenario: "save-retry" });
  await assert.rejects(h.api.saveDraft("conditions"), /try again/);
  assert.deepEqual(h.state.conditions, ["ADHD", "Anxiety"]);
  await h.api.saveDraft("conditions");

  const resumed = harness(JSON.parse(JSON.stringify(h.state)));
  resumed.update({
    conditions: toggleCondition(resumed.state.conditions, "Depression"),
  });
  await resumed.api.saveDraft("conditions");
  await book(resumed);
  assert.deepEqual(resumed.state.conditions, ["ADHD", "Depression", "Anxiety"]);
  assert.equal(resumed.state.appointment?.status, "confirmed");
  const events = JSON.stringify(resumed.state.events);
  for (const condition of resumed.state.conditions) {
    assert.equal(events.includes(condition), false);
  }
});

test("condition restoration accepts only explicit selections and does not diagnose legacy symptom topics", () => {
  assert.deepEqual(normalizeConditions(undefined), []);
  assert.deepEqual(normalizeConditions("Focus & attention"), []);
  assert.deepEqual(
    normalizeConditions(["ADHD", "ADHD", "Unknown label", "PTSD"]),
    ["ADHD", "PTSD"],
  );
  assert.deepEqual(toggleCondition(["ADHD", "Anxiety"], "ADHD"), ["Anxiety"]);
  assert.deepEqual(toggleCondition(["I'm not sure"], "Other"), [
    "I'm not sure",
    "Other",
  ]);
});

test("reservation is not confirmation, repeat requests reuse the hold, concurrent confirmation creates one appointment", async () => {
  const h = harness({ profile: { ...sampleProfile }, agreements: true });
  await h.api.createAccount();
  await h.api.createAccount();
  const first = await h.api.reserve("maya", slots[0].id);
  const second = await h.api.reserve("maya", slots[0].id);
  assert.deepEqual(first, second);
  assert.equal(h.state.appointment, null);
  await assert.rejects(h.api.confirm(), /payment method/);
  await h.api.setupPayment();
  const [a, b] = await Promise.all([h.api.confirm(), h.api.confirm()]);
  assert.deepEqual(a, b);
  assert.equal(a.status, "confirmed");
  assert.equal(h.state.reservation, null);
  assert.deepEqual(await h.api.confirm(), a);
  assert.equal(
    h.state.events.filter(
      (e) => e.operation === "account.created" && e.outcome === "success",
    ).length,
    1,
  );
  assert.equal(
    h.state.events.filter(
      (e) => e.operation === "appointment.confirmed" && e.outcome === "success",
    ).length,
    1,
  );
});

test("expired holds cannot be confirmed and details survive recovery", async () => {
  const h = harness({ profile: { ...sampleProfile }, agreements: true });
  await h.api.createAccount();
  await h.api.setupPayment();
  const hold = await h.api.reserve("maya", slots[0].id);
  h.update({ reservation: { ...hold, expiresAt: Date.now() - 1 } });
  await assert.rejects(h.api.confirm(), /hold expired/);
  assert.equal(h.state.appointment, null);
  assert.equal(h.state.profile.email, sampleProfile.email);
  await h.api.reserve("maya", slots[1].id);
  assert.equal((await h.api.confirm()).slotId, slots[1].id);
});

test("a lost slot stays unavailable across retries while another slot and payment retry can succeed", async () => {
  const h = harness({ scenario: "slot-taken" });
  await assert.rejects(h.api.reserve("maya", slots[0].id), /just taken/);
  assert.equal(h.state.reservation, null);
  await assert.rejects(h.api.reserve("maya", slots[0].id), /just taken/);
  assert.equal(h.state.reservation, null);
  await h.api.reserve("maya", slots[1].id);
  assert.deepEqual(h.state.faultsUsed, [
    "slot-taken",
    `unavailable-slot:${slots[0].id}`,
  ]);
  h.update({ scenario: "payment-retry" });
  await assert.rejects(h.api.setupPayment(), /try again/);
  assert.equal(h.state.paymentReady, false);
  await h.api.setupPayment();
  assert.equal(h.state.paymentReady, true);
});

test("declining records never calls Metriport and unavailable records can be retried", async () => {
  const h = harness({ scenario: "records-unavailable" });
  assert.equal(await h.api.requestRecords(false), "declined");
  assert.equal(h.state.recordsPermission, false);
  assert.equal(
    h.state.events.some((e) => e.service === "Metriport"),
    false,
  );
  assert.equal(await h.api.requestRecords(true), "unavailable");
  assert.equal(h.state.recordsStatus, "unavailable");
  assert.equal(await h.api.requestRecords(true), "ready");
  assert.equal(h.state.recordsStatus, "ready");
});

test("an unresolved insurance response stays pending across retries", async () => {
  const h = harness({ scenario: "coverage-pending", coverage: "insurance" });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await h.api.checkEligibility();
    assert.equal(result.status, "pending");
    assert.equal(result.estimate, null);
    assert.equal(result.networkStatus, "unknown");
    assert.ok(result.checkedAt);
  }
});

test("unverified or pending insurance blocks confirmation until verified or explicitly changed to self-pay", async () => {
  const h = harness({
    scenario: "coverage-pending",
    coverage: "insurance",
    profile: { ...sampleProfile },
    agreements: true,
  });
  await h.api.createAccount();
  await h.api.reserve("maya", slots[0].id);
  await h.api.setupPayment();
  await assert.rejects(h.api.confirm(), /insurance is not verified/);
  assert.equal(h.state.appointment, null);
  await h.api.checkEligibility();
  assert.equal(h.state.eligibility.status, "pending");
  await assert.rejects(h.api.confirm(), /insurance is not verified/);
  assert.equal(h.state.appointment, null);
  assert.equal(h.state.reservation?.slotId, slots[0].id);
  h.update({ coverage: "selfpay" });
  const appointment = await h.api.confirm();
  assert.equal(appointment.status, "confirmed");
  assert.equal(h.state.eligibility.status, "unverified");
  assert.equal(h.state.coverage, "selfpay");
});

test("verified insurance can confirm without changing the selected payment path", async () => {
  const h = harness({ coverage: "insurance", slotId: slots[0].id });
  await h.api.checkEligibility();
  const appointment = await book(h);
  assert.equal(appointment.status, "confirmed");
  assert.equal(h.state.coverage, "insurance");
  assert.equal(h.state.eligibility.status, "verified");
});

test("self-pay never invokes the insurance integration", async () => {
  const h = harness({ coverage: "selfpay" });
  assert.deepEqual(await h.api.checkEligibility(), {
    status: "unverified",
    estimate: null,
  });
  assert.equal(
    h.state.events.some((e) => e.service === "Sohar"),
    false,
  );
});

test("rescheduling changes the existing appointment, preserves status, and protects it when the new slot fails", async () => {
  const h = harness();
  const original = await book(h);
  h.update({ scenario: "slot-taken" });
  await assert.rejects(
    h.api.reschedule(slots[1].id),
    /original appointment is still booked/,
  );
  assert.deepEqual(h.state.appointment, original);
  await assert.rejects(
    h.api.reschedule(slots[1].id),
    /original appointment is still booked/,
  );
  assert.deepEqual(h.state.appointment, original);
  await h.api.reschedule(slots[2].id);
  assert.equal(h.state.appointment?.id, original.id);
  assert.equal(h.state.appointment?.status, "confirmed");
  assert.equal(h.state.appointment?.slotId, slots[2].id);
  assert.equal(h.state.followupAppointment, null);
});

test("joining and reconnecting do not complete care; only clinician completion unlocks follow-up", async () => {
  const h = harness({ scenario: "connection-lost" });
  await book(h);
  await assert.rejects(
    h.api.bookFollowup(followupSlots[0].id),
    /after your first visit/,
  );
  await assert.rejects(h.api.joinVisit(), /device check/);
  h.update({ deviceReady: true });
  await h.api.joinVisit();
  assert.equal(h.state.appointment?.status, "interrupted");
  await assert.rejects(h.api.completeVisit("clinician"), /Join and finish/);
  await h.api.reconnect();
  assert.equal(h.state.appointment?.status, "joined");
  // Test runtime authorization as well as the compile-time actor union.
  await assert.rejects(
    h.api.completeVisit("patient" as "clinician"),
    /Only the simulated clinician/,
  );
  await h.api.completeVisit("clinician");
  await h.api.completeVisit("clinician");
  assert.equal(h.state.appointment?.status, "completed");
  assert.equal(
    h.state.events.filter(
      (e) => e.operation === "visit.completed" && e.outcome === "success",
    ).length,
    1,
  );
  await h.api.bookFollowup(followupSlots[0].id);
  await h.api.bookFollowup(followupSlots[0].id);
  assert.equal(h.state.followupAppointment?.id, "visit-followup");
  assert.equal(h.state.followupAppointment?.status, "confirmed");
  assert.equal(h.state.appointment?.status, "completed");
});

test("reminder scheduling targets the upcoming follow-up and never the completed first visit", async () => {
  const h = harness();
  const first = await book(h);
  await h.api.scheduleReminders();
  assert.equal(h.state.reminderScheduled, true);
  assert.equal(h.state.followupReminderScheduled, false);
  h.update({ deviceReady: true });
  await h.api.joinVisit();
  await h.api.completeVisit("clinician");
  await assert.rejects(
    h.api.scheduleReminders(),
    /upcoming confirmed appointment/,
  );
  const followup = await h.api.bookFollowup(followupSlots[0].id);
  assert.equal(followup.id, h.state.followupAppointment?.id);
  assert.equal(h.state.followupReminderScheduled, false);
  await h.api.scheduleReminders(followup.id);
  assert.equal(h.state.followupReminderScheduled, true);
  assert.equal(h.state.appointment?.id, first.id);
  assert.equal(h.state.appointment?.status, "completed");
  assert.equal(
    h.state.events.at(-1)?.detail,
    "Follow-up demo reminder timeline saved; nothing sent",
  );
  await assert.rejects(
    h.api.scheduleReminders(first.id),
    /upcoming confirmed appointment/,
  );
  await assert.rejects(
    h.api.scheduleReminders("not-an-appointment"),
    /Choose an upcoming appointment/,
  );
  await h.api.bookFollowup(followupSlots[1].id);
  assert.equal(h.state.followupReminderScheduled, false);
  assert.equal(h.state.reminderScheduled, true);
});

test("events never contain patient fields, clinical content, payer details, or message text", async () => {
  const secret = "PRIVATE-CONTENT-7654321";
  const h = harness({
    conditions: ["ADHD", "Anxiety", secret],
    topic: secret,
    goal: secret,
    payer: secret,
    memberId: secret,
    briefNote: secret,
    careMessage: secret,
  });
  await book(h);
  await h.api.saveDraft(secret);
  await h.api.getProviders();
  await h.api.checkEligibility();
  await h.api.requestRecords(true);
  await h.api.generateBrief();
  await h.api.scheduleReminders();
  await h.api.sendCareMessage();
  const serialized = JSON.stringify(h.state.events);
  for (const value of [
    secret,
    "ADHD",
    "Anxiety",
    sampleProfile.firstName,
    sampleProfile.lastName,
    sampleProfile.email,
    sampleProfile.phone,
    sampleProfile.address,
  ]) {
    assert.equal(
      serialized.includes(value),
      false,
      `Event log must not contain ${value}`,
    );
  }
  assert.equal(h.state.careMessage, "");
  assert.equal(h.state.careMessages?.length, 1);
  assert.equal(h.state.careMessages?.[0].body, secret);
  assert.ok(h.state.careMessages?.[0].at);
});

test("care messages persist separately from analytics and duplicate sends save one message", async () => {
  const h = harness();
  await book(h);
  h.update({ careMessage: "  I have a question about my next visit.  " });
  await Promise.all([h.api.sendCareMessage(), h.api.sendCareMessage()]);
  assert.equal(h.state.careMessages?.length, 1);
  assert.equal(
    h.state.careMessages?.[0].body,
    "I have a question about my next visit.",
  );
  assert.equal(h.state.careMessage, "");
  assert.equal(
    JSON.stringify(h.state.events).includes("I have a question"),
    false,
  );
  await assert.rejects(h.api.sendCareMessage(), /Write a message/);
  assert.equal(h.state.careMessages?.length, 1);
  h.update({ careMessage: "A second local message." });
  await h.api.sendCareMessage();
  assert.equal(h.state.careMessages?.length, 2);
  assert.notEqual(h.state.careMessages?.[0].id, h.state.careMessages?.[1].id);
});

test("form helpers reject invalid dates and keep Central Time correct across daylight saving", () => {
  assert.equal(validateBirth(sampleProfile), "");
  assert.match(validateBirth({ month: "2", day: "30", year: "1993" }), /Check/);
  assert.match(validateBirth({ month: "8", day: "14", year: "2020" }), /18/);
  assert.equal(formatPhone("2025550147"), "(202) 555-0147");
  assert.equal(formatPhone("20255"), "(202) 55");
  assert.equal(formatTime(slots[0]), "9:00 AM");
  assert.equal(formatTime(followupSlots[0]), "9:00 AM");
  assert.match(formatDate(slots[0]), /Thursday, October 22/);
  assert.match(formatDate(followupSlots[0]), /Thursday, November 5/);
});

test("numeric and alphanumeric member IDs use the same asynchronous verification contract", async () => {
  for (const memberId of ["1", "123456", "ABC123", "test-id"]) {
    const h = harness({ coverage: "insurance", memberId });
    const request = h.api.checkEligibility();
    assert.equal(h.state.eligibility.status, "checking");
    assert.equal(h.state.eligibility.estimate, null);
    const result = await request;
    assert.equal(result.status, "verified");
    assert.equal(result.activeCoverage, true);
    assert.equal(result.estimate, 25);
    assert.equal(result.networkStatus, "in-network");
    assert.ok(result.checkedAt);
    assert.equal(
      h.state.events
        .map((event) => event.detail)
        .join(" ")
        .includes(memberId),
      false,
    );
  }
});

test("unmatched insurance remains unknown, accepts corrected details, and never invents a denial or price", async () => {
  const h = harness({
    coverage: "insurance",
    scenario: "coverage-unmatched",
    memberId: "1",
  });
  const result = await h.api.checkEligibility();
  assert.equal(result.status, "unmatched");
  assert.equal(result.estimate, null);
  assert.equal(result.activeCoverage, undefined);
  assert.equal(result.networkStatus, "unknown");
  assert.equal(h.state.coverage, "insurance");
  await assert.rejects(book(h), /insurance is not verified/);
  h.update({
    scenario: "standard",
    memberId: "ABC123",
    eligibility: { status: "unverified", estimate: null },
  });
  assert.equal((await h.api.checkEligibility()).status, "verified");
});

test("an insurance result for changed inputs cannot overwrite the current details", async () => {
  for (const change of [
    { memberId: "ABC123" },
    { payer: "Cigna" },
    { profile: { ...sampleProfile, day: "15" } },
    { coverage: "selfpay" as const },
  ]) {
    const h = harness({ coverage: "insurance", memberId: "1" });
    const request = h.api.checkEligibility();
    h.update({
      ...change,
      eligibility: { status: "unverified", estimate: null },
    });
    await assert.rejects(request, /details changed/);
    assert.equal(h.state.eligibility.status, "unverified");
    assert.equal(h.state.eligibility.estimate, null);
  }
});

test("identical verification requests share one operation while a newer input snapshot wins", async () => {
  const h = harness({ coverage: "insurance", memberId: "1" });
  const first = h.api.checkEligibility();
  assert.equal(h.api.checkEligibility(), first);
  h.update({ memberId: "ABC123" });
  const current = h.api.checkEligibility();
  await assert.rejects(first, /details changed/);
  assert.equal((await current).status, "verified");
  assert.equal(h.state.memberId, "ABC123");
  assert.equal(h.state.eligibility.status, "verified");
  assert.equal(
    h.state.events.filter(
      (event) =>
        event.operation === "eligibility.verification" &&
        event.outcome === "success",
    ).length,
    1,
  );
});

test("empty member IDs fail input validation rather than become a coverage response", async () => {
  const h = harness({ coverage: "insurance", memberId: "   " });
  await assert.rejects(h.api.checkEligibility(), /member ID/);
  assert.equal(h.state.eligibility.status, "unverified");
  assert.equal(
    h.state.events.some((event) => event.service === "Sohar"),
    false,
  );
});

test("successful benefits are invalidated by changed verification inputs and cannot confirm a booking", async () => {
  const changes: [string, Partial<JourneyState>][] = [
    ["first name", { profile: { ...sampleProfile, firstName: "Taylor" } }],
    ["last name", { profile: { ...sampleProfile, lastName: "Morgan" } }],
    ["birth month", { profile: { ...sampleProfile, month: "9" } }],
    ["birth day", { profile: { ...sampleProfile, day: "15" } }],
    ["birth year", { profile: { ...sampleProfile, year: "1992" } }],
    ["street address", { profile: { ...sampleProfile, address: "200 Example Lane" } }],
    ["city", { profile: { ...sampleProfile, city: "Dallas" } }],
    ["ZIP", { profile: { ...sampleProfile, zip: "75001" } }],
    ["provider", { providerId: "jordan" }],
    ["appointment date", { slotId: slots[3].id }],
    ["payer", { payer: "Cigna" }],
    ["member ID", { memberId: "ABC123" }],
    ["scenario", { scenario: "coverage-pending" }],
  ];
  for (const [label, patch] of changes) {
    const h = harness({ coverage: "insurance", agreements: true });
    await h.api.createAccount();
    await h.api.reserve("maya", slots[0].id);
    await h.api.setupPayment();
    await h.api.checkEligibility();
    assert.equal(h.state.eligibility.status, "verified", label);
    h.update(patch);
    assert.deepEqual(h.state.eligibility, { status: "unverified", estimate: null }, label);
    await assert.rejects(h.api.confirm(), /insurance is not verified/, label);
    assert.equal(h.state.appointment, null, label);
    if (label !== "scenario") {
      const refreshed = await h.api.checkEligibility();
      assert.equal(refreshed.status, "verified", `${label} requires a new result`);
    }
  }
});

test("unrelated contact and navigation changes preserve a current benefits result", async () => {
  const h = harness({ coverage: "insurance", slotId: slots[0].id });
  await h.api.checkEligibility();
  const result = h.state.eligibility;
  for (const patch of [
    { profile: { ...h.state.profile, email: "another@example.com" } },
    { profile: { ...h.state.profile, phone: "2025550181" } },
    { profile: { ...h.state.profile, sms: true } },
    { step: "email" as const },
    { step: "phone" as const, history: ["insurance" as const] },
    { agreements: true },
  ]) {
    h.update(patch);
    assert.equal(h.state.eligibility, result);
  }
  await h.api.createAccount();
  await h.api.reserve("maya", slots[0].id);
  await h.api.setupPayment();
  assert.equal((await h.api.confirm()).status, "confirmed");
});

test("a patch cannot carry an old verified result into a different member or payment path", async () => {
  const h = harness({ coverage: "insurance" });
  await h.api.checkEligibility();
  const before = h.state;
  const next = applyJourneyPatch(before, { memberId: "NEW123", eligibility: before.eligibility });
  assert.deepEqual(next.eligibility, { status: "unverified", estimate: null });
  assert.equal(before.eligibility.status, "verified");
  assert.equal(before.memberId, "1");
  h.update({ coverage: "selfpay" });
  assert.deepEqual(h.state.eligibility, { status: "unverified", estimate: null });
  h.update({ coverage: "insurance" });
  assert.deepEqual(h.state.eligibility, { status: "unverified", estimate: null });
});
