import test from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, mentionsCrisis, readStory } from "./guide-ai";
import {
  CRISIS_CASES,
  HELP_CASES,
  KNOWN_GAPS,
  STORY_CASES,
  type CrisisCase,
  type Split,
} from "./language-eval-data";

/*
 * Labeled evals for the deterministic interpreter (docs/language-evals.md). The bar:
 * the crisis floor catches every labeled positive with no false alarms, safety questions
 * in Help always get the emergency or crisis answer, and the story read-back gets at
 * least 90% of stories exactly right. Each run prints the table.
 */

const SPLITS: { split: Split; label: string }[] = [
  { split: "dev", label: "Built against" },
  { split: "holdout-1", label: "Held out, round 1" },
  { split: "holdout-2", label: "Held out, round 2" },
  { split: "holdout-3", label: "Held out, round 3" },
  { split: "holdout-4", label: "Held out, round 4" },
];

const inSplit = <T extends { split?: Split }>(cases: T[], split: Split) =>
  cases.filter((item) => (item.split ?? "dev") === split);
const pct = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : "n/a");

function table(head: string[], rows: (string | number)[][]): string {
  const cells = [head, ...rows].map((row) => row.map(String));
  const widths = head.map((_, col) => Math.max(...cells.map((row) => row[col].length)));
  return cells
    .map((row) => row.map((cell, col) => (col ? cell.padStart(widths[col]) : cell.padEnd(widths[col]))).join("  "))
    .join("\n");
}

function crisisScore(cases: CrisisCase[]) {
  const got = cases.map((item) => ({ ...item, flagged: mentionsCrisis(item.text) }));
  const caught = got.filter((item) => item.crisis && item.flagged).length;
  const positives = got.filter((item) => item.crisis).length;
  const falseAlarms = got.filter((item) => !item.crisis && item.flagged).length;
  const negatives = got.length - positives;
  return {
    cases: got.length,
    positives,
    caught,
    falseAlarms,
    recall: positives ? caught / positives : 1,
    precision: caught + falseAlarms ? caught / (caught + falseAlarms) : 1,
    falsePositiveRate: negatives ? falseAlarms / negatives : 0,
    missed: got.filter((item) => item.crisis && !item.flagged).map((item) => item.text),
    alarms: got.filter((item) => !item.crisis && item.flagged).map((item) => item.text),
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item));

test("crisis floor: every labeled risk is caught, with no false alarms", () => {
  assert.ok(CRISIS_CASES.length >= 80, "at least 80 labeled crisis cases");
  const rows = SPLITS.map(({ split, label }) => ({ label, ...crisisScore(inSplit(CRISIS_CASES, split)) }));
  const all = crisisScore(CRISIS_CASES);
  const gaps = KNOWN_GAPS.filter((item) => mentionsCrisis(item.text)).length;
  console.log(
    `\n${table(
      ["Crisis floor", "cases", "positive", "caught", "false alarms", "recall", "precision", "FPR"],
      [...rows, { label: "All", ...all }].map((row) => [
        row.label,
        row.cases,
        row.positives,
        row.caught,
        row.falseAlarms,
        pct(row.caught, row.positives),
        pct(row.caught, row.caught + row.falseAlarms),
        pct(row.falseAlarms, row.cases - row.positives),
      ]),
    )}\nKnown gaps, reported and not scored: ${gaps} of ${KNOWN_GAPS.length} caught\n`,
  );
  assert.deepEqual(all.missed, [], "missed risk language");
  assert.deepEqual(all.alarms, [], "false alarms");
  assert.equal(all.recall, 1);
  assert.equal(all.precision, 1);
  assert.equal(all.falsePositiveRate, 0);
});

test("story read-back: at least 90% exactly right, and crisis in a story is always flagged", () => {
  assert.ok(STORY_CASES.length >= 40, "at least 40 labeled stories");
  const score = (cases: typeof STORY_CASES) => {
    const wrong = cases
      .map((item) => ({ item, reading: readStory(item.text) }))
      .filter(({ item, reading }) => !sameSet(reading.conditions, item.conditions));
    return { stories: cases.length, right: cases.length - wrong.length, wrong };
  };
  const rows = SPLITS.map(({ split, label }) => ({ label, ...score(inSplit(STORY_CASES, split)) })).filter(
    (row) => row.stories,
  );
  const all = score(STORY_CASES);
  console.log(
    `\n${table(
      ["Story read-back", "stories", "exactly right", "accuracy"],
      [...rows, { label: "All", ...all }].map((row) => [row.label, row.stories, row.right, pct(row.right, row.stories)]),
    )}\n`,
  );
  for (const { item, reading } of all.wrong)
    console.log(`  read ${JSON.stringify(item.text)} as ${reading.conditions.join(", ")}`);
  assert.ok(all.right / all.stories >= 0.9, `story accuracy ${pct(all.right, all.stories)} is under 90%`);
  for (const item of STORY_CASES) {
    const reading = readStory(item.text);
    assert.equal(reading.crisis, item.crisis ?? false, item.text);
    // The read-back repeats content. It never names a diagnosis or reads a feeling into it.
    assert.doesNotMatch(reading.reflection, /ADHD|Depression|Anxiety|Bipolar|PTSD|sounds like|painful|carrying/, item.text);
  }
});

test("Help: safety questions always get the emergency or crisis answer", () => {
  const graded = HELP_CASES.map((item) => {
    const reply = answerQuestion(item.text);
    return { item, reply, right: reply.intent === item.intent && (!item.says || item.says.test(reply.text)) };
  });
  const rows = SPLITS.map(({ split, label }) => {
    const cases = graded.filter(({ item }) => (item.split ?? "dev") === split);
    return [label, cases.length, cases.filter((row) => row.right).length, pct(cases.filter((row) => row.right).length, cases.length)];
  }).filter((row) => row[1]);
  const right = graded.filter((row) => row.right).length;
  console.log(
    `\n${table(["Help questions", "questions", "right", "accuracy"], [...rows, ["All", graded.length, right, pct(right, graded.length)]])}\n`,
  );
  for (const { item, reply } of graded.filter((row) => !row.right))
    console.log(`  answered ${JSON.stringify(item.text)} as ${reply.intent}: ${reply.text}`);
  for (const { item, reply } of graded.filter(({ item }) => item.intent === "emergency" || item.intent === "crisis")) {
    assert.equal(reply.intent, item.intent, item.text);
    assert.doesNotMatch(reply.text, /first visit|bring it/, item.text);
  }
  assert.ok(right / graded.length >= 0.9, `Help accuracy ${pct(right, graded.length)} is under 90%`);
});
