import test from "node:test";
import assert from "node:assert/strict";
import { regimenFor, regimenLine } from "../model/fixtures";
import { inventory } from "./inventory";
import { callModel, modelContext } from "./model";
import { momentState } from "./moments";
import type { ChatJourney } from "./state";

inventory();

const withChat = (s: ChatJourney, chat: Partial<ChatJourney["chat"]>): ChatJourney => ({ ...s, chat: { ...s.chat, ...chat } });

test("without a window there's no model, so every caller gets null and answers locally", async () => {
  assert.equal(await callModel("question", { question: "When is my visit?" }, 1_000), null);
  assert.equal(await callModel("story", { text: "I can't focus" }, 1_000), null);
});

test("every task sends the same patient context: the booking, the conditions and the regimen", () => {
  const s = momentState("booked");
  const context = modelContext(s);
  assert.equal(context.stage, "booked");
  assert.equal(context.clinician, "Dr. Chen");
  assert.match(context.visit, / Central$/);
  assert.equal(context.cost, "Estimated copay $25, charged after the visit");
  assert.equal(context.coverage, "insurance: Aetna, in-network");
  assert.equal(context.conditions, "ADHD, Anxiety");
  assert.equal(context.medications, regimenLine(regimenFor(s.conditions)));
  assert.equal(context.medications, "Adderall 20 mg once every morning; Escitalopram (Lexapro) 10 mg once a day");
  assert.ok(!("plan" in context), "no plan before the visit");
  for (const key of ["story", "goal", "note"]) assert.ok(!(key in context), `${key} goes only to the brief`);
  for (const value of Object.values(context)) assert.ok(typeof value === "string" && value.trim());
});

test("before the patient says why they're here, there's no regimen to send", () => {
  const context = modelContext(momentState("start"));
  assert.equal(context.stage, "before booking");
  assert.ok(!("medications" in context) && !("conditions" in context));
});

test("conditions leave out the open choices but keep an Other concern in the patient's words", () => {
  const s = { ...momentState("booked"), conditions: ["Anxiety", "Other", "I'm not sure"] };
  assert.equal(modelContext(withChat(s, { otherText: "trouble sleeping" })).conditions, "Anxiety, trouble sleeping");
  assert.equal(modelContext({ ...s, conditions: ["I'm not sure"] }).medications, "Sertraline (Zoloft) 50 mg once every morning");
});

test("what the patient said about their medications travels with the regimen", () => {
  const s = momentState("booked");
  assert.match(modelContext(withChat(s, { medication: "stopped" })).medications, /^Adderall .*stopped taking it$/);
  assert.match(modelContext(withChat(s, { medication: "changed" })).medications, /different dose now$/);
  assert.equal(modelContext(withChat(s, { medication: "none" })).medications, "None, the patient says");
  assert.equal(
    modelContext(withChat(s, { medication: "other", medicationNote: "Wellbutrin 150 mg" })).medications,
    "In the patient's words: Wellbutrin 150 mg",
  );
});

test("after the visit the signed plan goes too, with each prescription and the follow-up", () => {
  const s = momentState("complete");
  assert.equal(modelContext(s).allergies, "Penicillin (rash)");
  assert.equal(modelContext(withChat(s, { allergy: "no" })).allergies, undefined, "a record the patient flagged isn't sent");
  const at = new Date().toISOString();
  const withRx: ChatJourney = {
    ...s,
    prescriptions: [
      { id: "rx1", medication: "Adderall 20 mg", supply: "30-day supply", pharmacy: "CVS Pharmacy, South Congress", status: "sent", at },
    ],
  };
  const plan = modelContext(withRx).plan;
  assert.match(plan, /^Dr\. Chen signed the care plan: continue Adderall 20 mg \(30-day supply, sent to CVS Pharmacy, South Congress through DoseSpot\)/);
  assert.match(plan, /Follow-up in about 2 weeks, not booked yet\.$/);
});

test("the brief also gets the patient's story, goal and note", () => {
  const s = withChat(momentState("booked"), { storyMode: "words", storyText: " I can't focus at work ", note: "Can we talk about sleep?" });
  const context = modelContext(s, { brief: true });
  assert.equal(context.story, "I can't focus at work");
  assert.equal(context.goal, "Talk about medication");
  assert.equal(context.note, "Can we talk about sleep?");
});
