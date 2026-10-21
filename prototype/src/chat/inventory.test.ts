import test from "node:test";
import assert from "node:assert/strict";
import { centralHour, fitsPreference, generateSlots, match } from "./inventory";
import { getSlot } from "../model/fixtures";

const now = new Date("2026-10-21T15:00:00Z");

test("openings carry the right Central Time offset across DST and stable ids", () => {
  const slots = generateSlots(now, 1, 20, "t");
  assert.ok(slots.length > 20);
  assert.ok(slots.every((slot) => new Date(slot.start).getTime() > now.getTime()));
  // Rebuilding the inventory a week later keeps the same ids for the same dates.
  const later = generateSlots(new Date(now.getTime() + 7 * 86_400_000), -7, 20, "t");
  const shared = slots.filter((slot) => later.some((other) => other.start === slot.start && other.providerId === slot.providerId));
  assert.ok(shared.length > 10);
  assert.ok(shared.every((slot) => later.some((other) => other.id === slot.id)));
  const october = slots.find((slot) => slot.start.startsWith("2026-10-2"));
  const november = slots.find((slot) => slot.start.startsWith("2026-11-0"));
  assert.match(october!.start, /-05:00$/);
  assert.match(november!.start, /-06:00$/);
  // Wall-clock hours stay put when the offset changes.
  assert.ok(slots.every((slot) => centralHour(slot) >= 8 && centralHour(slot) <= 19));
});

test("matching narrows honestly and only offers clinicians with fitting times", () => {
  const result = match(["ADHD", "Anxiety"], "Aetna", ["evenings"], now);
  const counts = result.funnel.map((step) => step.count);
  assert.deepEqual([...counts].sort((a, b) => b - a), counts);
  assert.ok(result.offers.length > 0 && result.offers.length <= 3);
  for (const offer of result.offers) {
    assert.ok(offer.clinician.payers.includes("Aetna"));
    assert.ok(offer.times.every((slot) => fitsPreference(slot, ["evenings"])));
    assert.ok(offer.reasons.some((reason) => /In network with Aetna/.test(reason)));
  }
  assert.equal(result.offers[0].clinician.id, "maya");
});

test("self-pay matching skips the network step and offered times are bookable", () => {
  const result = match(["Depression"], "", ["soonest"], now);
  assert.ok(!result.funnel.some((step) => /network/.test(step.label)));
  const slot = result.offers[0].times[0];
  // Registered with the shared fixtures, so the scheduling adapter accepts it.
  assert.equal(getSlot(slot.id).providerId, result.offers[0].clinician.id);
});
