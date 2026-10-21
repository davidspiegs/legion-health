import test from "node:test";
import assert from "node:assert/strict";
import { FIRST_VISIT_LENGTH } from "./env";
import { answerQuestion, mentionsCrisis, normalizeText, readStory } from "./guide-ai";
import { CLINICIANS } from "./inventory";
import { SUPPORT_LINES } from "./safety";

test("own words map to the intake's condition choices with a reflection", () => {
  const reading = readStory(
    "I can't focus at work and my mind races at night when I try to sleep",
  );
  assert.deepEqual(reading.conditions, ["ADHD", "Anxiety"]);
  assert.match(reading.reflection, /trouble staying focused and a lot of worry/);
  assert.equal(reading.crisis, false);
});

test("concerns outside the intake choices are kept as Other, never dropped", () => {
  const reading = readStory("I can't sleep and I have intrusive thoughts all day");
  assert.deepEqual(reading.conditions, ["Other"]);
  assert.match(reading.reflection, /trouble sleeping and intrusive thoughts/);
});

test("unclear words become 'I'm not sure' instead of a guessed diagnosis", () => {
  const reading = readStory("Things just feel off and I don't know why");
  assert.deepEqual(reading.conditions, ["I'm not sure"]);
  assert.doesNotMatch(reading.reflection, /ADHD|Depression|Anxiety/);
});

test("text is normalized before any pattern reads it", () => {
  assert.equal(normalizeText("  I DON’T\u00A0want  to\u200B live "), "i don't want to live");
  assert.equal(normalizeText("can\u02BCt ‘go’ on"), "can't 'go' on");
  assert.equal(normalizeText("I don`t, I don\u00B4t, I don\uFF07t"), "i don't, i don't, i don't");
  assert.equal(normalizeText("self\u2011harm — again"), "self-harm - again");
  assert.equal(normalizeText("\uFF21\uFF24\uFF28\uFF24"), "adhd");
});

test("crisis language is caught locally in stories and questions", () => {
  for (const text of [
    "sometimes I want to die",
    "I've been thinking about suicide",
    "I keep wanting to hurt myself",
    "everyone would be better off without me",
    // Misses found by the synthetic-patient suite are kept here as regressions.
    "I keep thinking about ending it all",
    "I've been hurting myself again",
    "honestly I don't want to be alive",
    "there's no point in living",
    "I wish I was dead",
  ]) {
    assert.equal(mentionsCrisis(text), true, text);
    assert.equal(readStory(text).crisis, true, text);
    assert.equal(answerQuestion(text).intent, "crisis", text);
  }
  assert.equal(mentionsCrisis("my focus is killing my grades"), false);
  assert.equal(mentionsCrisis("my deadlines are ending soon"), false);
});

test("iPhone punctuation and everyday phrasings are caught (review regressions)", () => {
  for (const text of [
    // iOS Smart Punctuation types U+2019 for every apostrophe.
    "I don’t want to be alive anymore",
    "I can’t go on like this",
    "I don’t want to wake up tomorrow",
    "I don’t want to live anymore",
    "I’ve been thinking about ending it",
    "life isn’t worth living",
    "I wish I wasn’t here",
    "I do not want to be alive",
    "I wanna die",
    "part of me wants to die",
    "I want to unalive myself",
    "honestly I just want to kms",
    "I've been cutting again",
    "I took a whole bottle of pills last night",
    "jumping off a bridge",
    "I want to hurt my husband",
  ]) {
    assert.equal(mentionsCrisis(text), true, text);
    assert.equal(readStory(text).crisis, true, text);
  }
});

test("idioms are not crisis language (review regressions)", () => {
  for (const text of [
    "this job is killing me and I can't focus",
    "my anxiety is killing me",
    "deadlines are killing me",
    "I could kill for a coffee",
    "I’m dying to know",
    "I'd die of embarrassment",
    "I'm dead tired",
    "I killed it at work today",
    "During panic attacks I feel like I'm going to die",
    "I don't want to go on medication",
    "I've been cutting back on caffeine",
  ])
    assert.equal(mentionsCrisis(text), false, text);
});

test("ADD in capitals is the condition, and 'add' is just a verb", () => {
  assert.deepEqual(readStory("I was diagnosed with ADD as a kid").conditions, ["ADHD"]);
  assert.deepEqual(readStory("I want to add more structure to my life").conditions, ["I'm not sure"]);
  assert.deepEqual(readStory("I want to add that I've been feeling low").conditions, ["Depression"]);
});

test("ruled-out conditions and relatives' conditions aren't noted as the patient's", () => {
  assert.deepEqual(readStory("I don't have depression, I just get anxious").conditions, ["Anxiety"]);
  assert.deepEqual(readStory("I'm not sure if it's ADHD or anxiety").conditions, ["ADHD", "Anxiety"]);
  assert.deepEqual(readStory("I can't focus at work. My mom has bipolar.").conditions, ["ADHD"]);
  assert.deepEqual(readStory("My son has ADHD and I think I have it too").conditions, ["ADHD"]);
  assert.deepEqual(readStory("My husband says I have ADHD").conditions, ["ADHD"]);
});

test("substance use is its own concern, never read as trauma", () => {
  for (const text of ["alcohol abuse is becoming a problem", "I've been drinking too much lately"]) {
    const reading = readStory(text);
    assert.deepEqual(reading.conditions, ["Other"], text);
    assert.equal(reading.reflection, "Here’s what I heard: alcohol or drug use.", text);
  }
  assert.deepEqual(readStory("I grew up with abuse at home").conditions, ["PTSD"]);
  assert.doesNotMatch(readStory("I grew up with abuse at home").reflection, /painful|carrying/);
});

test("losing interest in things reads as depression", () => {
  for (const text of ["nothing feels fun anymore", "I've lost interest in everything"]) {
    const reading = readStory(text);
    assert.deepEqual(reading.conditions, ["Depression"], text);
    assert.match(reading.reflection, /losing interest in things/, text);
  }
});

test("an overdose or an ER question gets 911 and Poison Control, never 'wait for your visit'", () => {
  for (const text of [
    "I took too many pills last night",
    "I took a whole bottle of my xanax",
    "should I go to the ER?",
    "My kid swallowed some of my pills",
    "I accidentally took a double dose",
  ]) {
    const answer = answerQuestion(text);
    assert.equal(answer.intent, "emergency", text);
    assert.equal(answer.forClinician, false, text);
    for (const line of Object.values(SUPPORT_LINES)) assert.ok(answer.text.includes(line), `${text}: ${line}`);
    assert.doesNotMatch(answer.text, /first visit|bring it/, text);
  }
  assert.equal(answerQuestion("I don’t want to be alive anymore").intent, "crisis");
});

test("medication questions are routed to the clinician, never answered", () => {
  const answer = answerQuestion("Can I get Adderall?");
  assert.equal(answer.intent, "medication");
  assert.equal(answer.forClinician, true);
  assert.match(answer.text, /clinician/);
});

test("insurance answers say yes or no from the plans the directory's clinicians take", () => {
  const accepted = new Set(CLINICIANS.flatMap((clinician) => clinician.payers));
  assert.ok(accepted.has("Aetna"));
  assert.match(answerQuestion("Do you take Aetna?").text, /^Yes, Legion takes Aetna\./);
  assert.match(answerQuestion("do you take bcbs").text, /^Yes, Legion takes Blue Cross Blue Shield of Texas\./);
  const humana = answerQuestion("Do you take Humana?");
  assert.equal(humana.intent, "insurance");
  assert.match(humana.text, /^Humana isn’t a plan Legion takes\./);
  assert.match(answerQuestion("Do you take Medicaid?").text, /can’t accept Medicaid yet/);
  const general = answerQuestion("What insurance do you take?").text;
  for (const payer of accepted) assert.ok(general.includes(payer), payer);
});

test("visit length, charges and changes match the rest of the product", () => {
  assert.ok(answerQuestion("How long is the first visit?").text.includes(FIRST_VISIT_LENGTH));
  assert.match(
    answerQuestion("When will I be charged?").text,
    /You’re charged after each visit, not before\. Changing a visit within 48 hours, or missing it, costs \$100\./,
  );
  const cancel = answerQuestion("How do I cancel?");
  assert.equal(cancel.intent, "changes");
  assert.match(cancel.text, /care team/);
  assert.doesNotMatch(cancel.text, /cancel from your visit card|messaging me/);
});

test("common questions get grounded answers in curly-apostrophe copy", () => {
  assert.equal(answerQuestion("How much does it cost?").intent, "cost");
  assert.equal(answerQuestion("Do you take Aetna?").intent, "insurance");
  assert.equal(answerQuestion("Am I talking to a bot?").intent, "ai");
  assert.equal(answerQuestion("Can I see someone in person?").intent, "visits");
  assert.equal(answerQuestion("Can I reschedule my appointment?").intent, "changes");
  assert.equal(answerQuestion("What's the weather like?").intent, "other");
  for (const question of [
    "How much does it cost?",
    "Do you take Humana?",
    "Am I talking to a bot?",
    "Can I see someone in person?",
    "How do I cancel?",
    "Is my data private?",
    "How soon can I be seen?",
    "Who is my clinician?",
    "What's the weather like?",
    "Can I get Adderall?",
    "should I go to the ER?",
    "I want to die",
  ])
    assert.doesNotMatch(answerQuestion(question).text, /'/, question);
});
