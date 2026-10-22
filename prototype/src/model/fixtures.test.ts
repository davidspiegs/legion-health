import test from "node:test";
import assert from "node:assert/strict";
import { REGIMENS, REGIMEN_FALLBACK, initialState, regimenFor, regimenLine, reviewIntakeAnswers } from "./fixtures";
import { FLOW } from "./flow";
import type { Step } from "./types";

const fitSteps: Step[] = [
  "fit-state",
  "fit-age",
  "fit-coverage",
  "fit-safety",
  "fit-history",
  "fit-virtual",
];
const completeFit = {
  "fit-state": "yes",
  "fit-age": "yes",
  "fit-coverage": "no",
  "fit-safety": "no",
  "fit-history": "no",
  "fit-virtual": "yes",
};

test("reviewing each fit question seeds only its completed prerequisites", () => {
  for (const [index, step] of fitSteps.entries()) {
    const answers = reviewIntakeAnswers(step);
    assert.deepEqual(Object.keys(answers.fit), fitSteps.slice(0, index));
    for (const completed of fitSteps.slice(0, index)) {
      assert.equal(
        answers.fit[completed],
        completeFit[completed as keyof typeof completeFit],
      );
    }
    for (const unanswered of fitSteps.slice(index)) {
      assert.equal(
        answers.fit[unanswered],
        undefined,
        `${step}: ${unanswered} must be unanswered`,
      );
    }
    assert.deepEqual(answers.conditions, []);
    assert.equal(answers.goal, "");
  }
});

test("needs and goal review screens do not preselect their own answer", () => {
  assert.deepEqual(reviewIntakeAnswers("needs"), {
    fit: completeFit,
    conditions: [],
    goal: "",
  });
  assert.deepEqual(reviewIntakeAnswers("goal"), {
    fit: completeFit,
    conditions: ["ADHD"],
    goal: "",
  });
});

test("downstream review jumps receive complete intake prerequisites", () => {
  const downstream = FLOW.slice(
    FLOW.findIndex((entry) => entry.id === "coverage"),
  );
  for (const { id } of downstream) {
    assert.deepEqual(
      reviewIntakeAnswers(id),
      {
        fit: completeFit,
        conditions: ["ADHD"],
        goal: "Understand what’s going on",
      },
      id,
    );
  }
});

test("welcome and generic fit exits remain empty, and review fixtures share no mutable answers", () => {
  for (const step of ["welcome", "fit-exit"] as const) {
    assert.deepEqual(reviewIntakeAnswers(step), {
      fit: {},
      conditions: [],
      goal: "",
    });
  }
  const first = reviewIntakeAnswers("review");
  first.fit["fit-state"] = "no";
  first.conditions.push("Anxiety");
  const second = reviewIntakeAnswers("review");
  assert.equal(second.fit["fit-state"], "yes");
  assert.deepEqual(second.conditions, ["ADHD"]);
  const fresh = initialState();
  assert.deepEqual(fresh.fit, {});
  assert.deepEqual(fresh.conditions, []);
  assert.equal(fresh.goal, "");
});

const FIVE = ["ADHD", "Depression", "Anxiety", "Bipolar Disorder", "PTSD"];
const subsets = (items: string[]): string[][] =>
  items.reduce<string[][]>((all, item) => [...all, ...all.map((set) => [...set, item])], [[]]).filter((set) => set.length);

test("every combination of the five conditions has its own regimen, whatever the order", () => {
  const combinations = subsets(FIVE);
  assert.equal(combinations.length, 31);
  assert.equal(Object.keys(REGIMENS).length, 31);
  for (const conditions of combinations) {
    const regimen = regimenFor(conditions);
    assert.ok(regimen.length > 0, conditions.join("+"));
    assert.notEqual(regimen, REGIMEN_FALLBACK, conditions.join("+"));
    assert.deepEqual(regimenFor([...conditions].reverse()), regimen, "order doesn't matter");
    for (const med of regimen) assert.ok(med.name && med.dose && med.schedule && med.for, conditions.join("+"));
  }
});

test("only \"I'm not sure\" or \"Other\" gets the fallback; next to a condition they're ignored", () => {
  for (const conditions of [[], ["I'm not sure"], ["Other"], ["Other", "I'm not sure"]])
    assert.deepEqual(regimenFor(conditions), REGIMEN_FALLBACK, JSON.stringify(conditions));
  assert.equal(regimenLine(REGIMEN_FALLBACK), "Sertraline (Zoloft) 50 mg once every morning");
  assert.deepEqual(regimenFor(["Other", "Anxiety", "I'm not sure"]), regimenFor(["Anxiety"]));
});

test("the regimen reads as one line, medication by medication", () => {
  assert.equal(
    regimenLine(regimenFor(["Anxiety", "ADHD"])),
    "Adderall 20 mg once every morning; Escitalopram (Lexapro) 10 mg once a day",
  );
  assert.equal(
    regimenLine(regimenFor(["PTSD"])),
    "Sertraline (Zoloft) 100 mg once every morning; Prazosin (Minipress) 2 mg once at bedtime",
  );
});
