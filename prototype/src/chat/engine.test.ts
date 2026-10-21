import test from "node:test";
import assert from "node:assert/strict";
import { deriveTranscript, stageProgress, type ChatNode } from "./engine";

interface Toy {
  greeted: boolean;
  topic: string;
  state: string;
  time: string;
}

const script: ChatNode<Toy>[] = [
  {
    id: "hello",
    stage: "story",
    say: () => [{ kind: "text", id: "hi", text: "Hi" }],
    input: () => ({ kind: "single", options: [{ value: "go", label: "Start" }] }),
    answer: (s) => (s.greeted ? { text: "Start", editable: false } : null),
  },
  {
    id: "topic",
    stage: "story",
    say: () => [{ kind: "text", id: "ask", text: "What brings you here?" }],
    input: () => ({
      kind: "single",
      options: [
        { value: "focus", label: "Focus" },
        { value: "mood", label: "Mood" },
      ],
    }),
    answer: (s) => (s.topic ? { text: s.topic, editable: true } : null),
    after: (s) => [{ kind: "text", id: "ack", text: `Noted ${s.topic}` }],
  },
  {
    id: "where",
    stage: "story",
    say: () => [{ kind: "text", id: "ask", text: "Texas?" }],
    input: () => ({
      kind: "single",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    }),
    answer: (s) => (s.state ? { text: s.state, editable: true } : null),
    halts: (s) => s.state === "no",
  },
  {
    id: "exit-note",
    stage: "story",
    applies: (s) => s.state === "no",
    say: () => [{ kind: "text", id: "sorry", text: "Not yet in your state" }],
    answer: () => null,
  },
  {
    id: "time",
    stage: "clinician",
    say: () => [{ kind: "text", id: "ask", text: "When?" }],
    input: () => ({ kind: "widget", widget: "times" }),
    answer: (s) => (s.time ? { text: s.time, editable: true } : null),
  },
];

const blank: Toy = { greeted: false, topic: "", state: "", time: "" };

test("the first unanswered node becomes the active question", () => {
  const t = deriveTranscript(script, blank);
  assert.equal(t.active?.node.id, "hello");
  assert.deepEqual(
    t.items.map((item) => item.key),
    ["hello::hi"],
  );
  assert.equal(t.stage, "story");
});

test("answered nodes render the patient answer and acknowledgment in order", () => {
  const t = deriveTranscript(script, { ...blank, greeted: true, topic: "Focus" });
  assert.deepEqual(
    t.items.map((item) => item.key),
    ["hello::hi", "hello::answer", "topic::ask", "topic::answer", "topic::ack", "where::ask"],
  );
  assert.equal(t.active?.node.id, "where");
});

test("editing an earlier answer keeps later answers that still apply", () => {
  const before = deriveTranscript(script, {
    greeted: true,
    topic: "Focus",
    state: "yes",
    time: "Thu 5 PM",
  });
  assert.equal(before.active, null);
  const after = deriveTranscript(script, {
    greeted: true,
    topic: "Mood",
    state: "yes",
    time: "Thu 5 PM",
  });
  assert.equal(after.active, null);
  const ack = after.items.find((item) => item.key === "topic::ack");
  assert.ok(ack && ack.from === "agent" && ack.block.kind === "text");
  assert.equal(ack.block.kind === "text" && ack.block.text, "Noted Mood");
  assert.ok(after.items.some((item) => item.key === "time::answer"));
});

test("a halting answer stops the walk and hides later questions", () => {
  const t = deriveTranscript(script, {
    greeted: true,
    topic: "Focus",
    state: "no",
    time: "",
  });
  assert.equal(t.halted, true);
  assert.equal(t.active, null);
  assert.ok(!t.items.some((item) => item.nodeId === "time"));
});

test("branch-only nodes are skipped unless they apply", () => {
  const t = deriveTranscript(script, {
    greeted: true,
    topic: "Focus",
    state: "yes",
    time: "",
  });
  assert.ok(!t.items.some((item) => item.nodeId === "exit-note"));
  assert.equal(t.active?.node.id, "time");
  assert.equal(t.stage, "clinician");
});

test("progress reports the active stage and how much of it is answered", () => {
  const t = deriveTranscript(script, { ...blank, greeted: true });
  const progress = stageProgress(t);
  assert.equal(progress.stage, "story");
  assert.equal(progress.index, 0);
  assert.ok(progress.fraction > 0 && progress.fraction < 1);
});

test("an optional step whose moment has passed is left out unanswered, and kept once answered", () => {
  interface Day {
    prep: string;
    visitDay: boolean;
    checkedIn: boolean;
  }
  const day: ChatNode<Day>[] = [
    {
      id: "prep",
      stage: "visit",
      skip: (s) => s.visitDay,
      say: () => [{ kind: "text", id: "ask", text: "Prepare now?" }],
      input: () => ({ kind: "single", options: [{ value: "yes", label: "Yes" }] }),
      answer: (s) => (s.prep ? { text: s.prep, editable: true } : null),
    },
    {
      id: "checkin",
      stage: "visit",
      say: () => [{ kind: "text", id: "ask", text: "Check in?" }],
      input: () => ({ kind: "single", options: [{ value: "go", label: "Check in" }] }),
      answer: (s) => (s.checkedIn ? { text: "Checked in", editable: false } : null),
    },
  ];
  const before = deriveTranscript(day, { prep: "", visitDay: false, checkedIn: false });
  assert.equal(before.active?.node.id, "prep", "before visit day, prep waits for an answer");
  const skipped = deriveTranscript(day, { prep: "", visitDay: true, checkedIn: false });
  assert.equal(skipped.active?.node.id, "checkin", "on visit day, unanswered prep steps aside");
  assert.ok(!skipped.items.some((item) => item.nodeId === "prep"), "and isn't shown");
  assert.ok(!skipped.path.some((step) => step.id === "prep"), "or counted in progress");
  const kept = deriveTranscript(day, { prep: "yes", visitDay: true, checkedIn: false });
  assert.ok(kept.items.some((item) => item.nodeId === "prep" && item.from === "patient"), "an answered step stays in the record");
});

test("reaching the finish line fills the progress, though it has nothing to answer", () => {
  const ending: ChatNode<Toy>[] = [
    script[0],
    { id: "done", stage: "story", ends: true, say: () => [{ kind: "text", id: "bye", text: "All set" }], answer: () => null },
  ];
  const progress = stageProgress(deriveTranscript(ending, { greeted: true, topic: "", state: "", time: "" }));
  assert.equal(progress.fraction, 1);
  const waiting = stageProgress(
    deriveTranscript([script[0], { ...ending[1], ends: undefined }], { greeted: true, topic: "", state: "", time: "" }),
  );
  assert.equal(waiting.fraction, 0.5, "a message that isn't the finish line still counts as a step left");
});
