import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reviewIntakeAnswers } from "./fixtures";
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
