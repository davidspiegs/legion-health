import test from "node:test";
import assert from "node:assert/strict";
import { createMockApi } from "./services";
import {
  initialState,
  sampleProfile,
  slots,
  followupSlots,
  formatDate,
  formatTime,
  formatPhone,
  validateBirth,
} from "./fixtures";
import type { JourneyState } from "./types";

function harness(patch: Partial<JourneyState> = {}) {
  let state = { ...initialState(), ...patch };
  const update = (next: Partial<JourneyState>) => {
    state = { ...state, ...next };
  };
  return {
    get state() {
      return state;
    },
    update,
    api: createMockApi({ getState: () => state, update, delayMs: 0 }),
  };
}

async function book(h: ReturnType<typeof harness>) {
  h.update({ profile: { ...sampleProfile }, agreements: true });
  await h.api.createAccount();
  await h.api.reserve("maya", slots[0].id);
  await h.api.setupPayment();
  return h.api.confirm();
}

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
  assert.deepEqual(await h.api.checkEligibility(), {
    status: "pending",
    estimate: null,
  });
  assert.deepEqual(await h.api.checkEligibility(), {
    status: "pending",
    estimate: null,
  });
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
  assert.equal(h.state.eligibility.status, "pending");
  assert.equal(h.state.coverage, "selfpay");
});

test("verified insurance can confirm without changing the selected payment path", async () => {
  const h = harness({ coverage: "insurance" });
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
