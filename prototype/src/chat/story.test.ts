/**
 * Reading the patient's own words with Claude, with the keyword reader underneath. The model
 * is a stubbed fetch, so nothing reaches the network; without a window there's no model at all,
 * which is how every other test stays deterministic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMockApi } from "../model/services";
import { applyJourneyPatch } from "../model/journey-state";
import type { JourneyState } from "../model/types";
import type { ChatContext, ChatPatch } from "./agent";
import { deriveTranscript } from "./engine";
import { readStory } from "./guide-ai";
import { inventory } from "./inventory";
import { SCRIPT, readingStory } from "./script";
import { initialChatJourney, type ChatJourney } from "./state";
import { readStoryLive, storyFromModel } from "./story";

inventory();

const FOCUS = "I can't focus at work and I'm always on edge";
const CLAUDE = {
  conditions: ["Anxiety", "ADHD"],
  other: "",
  reflection: "Here’s what I heard: focusing at work is hard, and you feel on edge most of the time.",
  crisis: false,
};

/** A browser with a model behind /api/assistant: each call gets `reply`, and is recorded. */
function withModel(reply: (body: Record<string, unknown>, signal: AbortSignal) => Promise<Response> | Response) {
  const calls: Record<string, unknown>[] = [];
  const saved = { window: (globalThis as { window?: unknown }).window, fetch: globalThis.fetch };
  (globalThis as { window?: unknown }).window = { location: { origin: "http://localhost", pathname: "/", search: "" } };
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push(body);
    return reply(body, init.signal as AbortSignal);
  }) as typeof fetch;
  const restore = () => {
    (globalThis as { window?: unknown }).window = saved.window;
    globalThis.fetch = saved.fetch;
  };
  return { calls, restore };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function patient() {
  let state: ChatJourney = initialChatJourney();
  const update = (patch: ChatPatch) => {
    const { chat, ...journey } = patch;
    const next = applyJourneyPatch(state, journey as Partial<JourneyState>) as ChatJourney;
    state = { ...next, chat: chat ? { ...state.chat, ...chat } : state.chat };
  };
  const ctx: ChatContext = {
    get: () => state,
    update,
    api: createMockApi({ getState: () => state, update, delayMs: 0, eligibilityDelayMs: 0 }),
    act: async (fn) => fn().catch(() => undefined),
    openSheet: () => undefined,
    closeSheet: () => undefined,
    answer: () => undefined,
    edit: () => undefined,
    setVisitOpen: () => undefined,
    preview: { restart: () => undefined, jump: () => undefined, setScenario: () => undefined },
  };
  const node = (id: string) => SCRIPT.find((item) => item.id === id)!;
  const transcript = () => deriveTranscript(SCRIPT, state);
  const said = (id: string) =>
    transcript().items.flatMap((item) =>
      item.from === "agent" && item.block.kind === "text" && item.key === id ? [item.block.text] : [],
    )[0];
  const cards = () =>
    transcript().items.flatMap((item) => (item.from === "agent" && item.block.kind === "card" ? [item.block.card] : []));
  return { get state() { return state; }, set state(next) { state = next; }, ctx, node, transcript, said, cards };
}

/** Up to the story question, typing instead of choosing. */
async function atStory(p: ReturnType<typeof patient>) {
  await p.node("hello").submit!("start", p.ctx);
  await p.node("story").submit!("__words", p.ctx);
  assert.equal(p.transcript().active?.node.id, "story");
}

test("Claude's reading keeps only the intake's choices, in the intake's order", () => {
  const reading = storyFromModel({ ...CLAUDE, conditions: ["PTSD", "Insomnia", "Anxiety", "PTSD", 7] });
  assert.deepEqual(reading?.conditions, ["Anxiety", "PTSD"]);
  assert.equal(reading?.reflection, CLAUDE.reflection);
  assert.equal(reading?.crisis, false);
  assert.deepEqual(storyFromModel({ ...CLAUDE, conditions: ["Other", "Depression"] })?.conditions, ["Depression", "Other"]);
});

test("'I'm not sure' stands alone, and nothing that fits means not sure", () => {
  assert.deepEqual(storyFromModel({ ...CLAUDE, conditions: ["I'm not sure", "Anxiety"] })?.conditions, ["Anxiety"]);
  assert.deepEqual(storyFromModel({ ...CLAUDE, conditions: [] })?.conditions, ["I'm not sure"]);
  assert.deepEqual(storyFromModel({ ...CLAUDE, conditions: "Anxiety" })?.conditions, ["I'm not sure"]);
});

test("a reading with no read-back to show isn't used, and only a real true flags a crisis", () => {
  assert.equal(storyFromModel(null), null);
  assert.equal(storyFromModel({ ...CLAUDE, reflection: "  " }), null);
  assert.equal(storyFromModel({ ...CLAUDE, reflection: undefined }), null);
  assert.equal(storyFromModel({ ...CLAUDE, crisis: "true" })?.crisis, false);
  assert.equal(storyFromModel({ ...CLAUDE, crisis: true })?.crisis, true);
  assert.equal(storyFromModel({ ...CLAUDE, reflection: "x".repeat(900) })?.reflection.length, 400);
});

test("without a window there's no model, so the keyword reader answers", async () => {
  assert.deepEqual(await readStoryLive(FOCUS), readStory(FOCUS));
});

test("with a model, the story task reads the words", async () => {
  const model = withModel(() => json(CLAUDE));
  try {
    const reading = await readStoryLive(FOCUS);
    assert.deepEqual(reading, { conditions: ["ADHD", "Anxiety"], reflection: CLAUDE.reflection, crisis: false });
    assert.deepEqual(model.calls, [{ text: FOCUS, task: "story" }]);
  } finally {
    model.restore();
  }
});

test("risk language never waits on the model: the local reading answers at once", async () => {
  const model = withModel(() => json(CLAUDE));
  try {
    const text = "I don't want to be alive anymore";
    const reading = await readStoryLive(text);
    assert.equal(reading.crisis, true);
    assert.equal(model.calls.length, 0, "no call was made");
  } finally {
    model.restore();
  }
});

test("a failed, malformed or slow answer falls back to the keyword reader", async () => {
  const local = readStory(FOCUS);
  for (const reply of [
    () => json({ error: "unavailable" }, 503),
    () => new Response("not json", { status: 200 }),
    () => json({ conditions: ["Anxiety"], reflection: "" }),
  ]) {
    const model = withModel(reply);
    try {
      assert.deepEqual(await readStoryLive(FOCUS), local);
    } finally {
      model.restore();
    }
  }
  const slow = withModel(
    (_body, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
  );
  try {
    assert.deepEqual(await readStoryLive(FOCUS, local, 20), local);
  } finally {
    slow.restore();
  }
});

test("the read-back waits while Claude reads, then shows Claude's reading to confirm", async () => {
  const p = patient();
  await atStory(p);
  let answer!: () => void;
  const model = withModel(() => new Promise((resolve) => (answer = () => resolve(json(CLAUDE)))));
  try {
    const submitted = p.node("story").submit!(FOCUS, p.ctx);
    await new Promise((resolve) => setTimeout(resolve, 5));
    // The patient's words are in the thread; Wren is typing, with nothing to answer yet.
    assert.equal(readingStory(p.state), true);
    assert.equal(p.transcript().items.at(-1)?.from, "patient");
    assert.equal(p.transcript().active?.node.id, "story-confirm");
    assert.equal(p.transcript().active?.input, null);
    answer();
    await submitted;
  } finally {
    model.restore();
  }
  assert.equal(readingStory(p.state), false);
  assert.equal(p.said("story::reflect"), CLAUDE.reflection);
  assert.match(p.said("story::noted") ?? "", /^I’ll note ADHD and Anxiety for your clinician/);
  assert.ok(p.transcript().active?.input, "the confirm question is asked");
  await p.node("story-confirm").submit!("right", p.ctx);
  assert.deepEqual(p.state.conditions, ["ADHD", "Anxiety"]);
});

test("a page closed while Claude was reading still has the local reading to confirm", async () => {
  const p = patient();
  await atStory(p);
  let fail!: () => void;
  const model = withModel(() => new Promise<Response>((_resolve, reject) => (fail = () => reject(new Error("closed")))));
  let submitted: Promise<unknown>;
  try {
    submitted = Promise.resolve(p.node("story").submit!(FOCUS, p.ctx));
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(readingStory(p.state), true);
  } finally {
    model.restore();
  }
  // What restore does with work that was mid-flight.
  const { story: _running, ...jobs } = p.state.chat.jobs;
  p.state = { ...p.state, chat: { ...p.state.chat, jobs } };
  assert.equal(p.said("story::reflect"), readStory(FOCUS).reflection);
  assert.ok(p.transcript().active?.input, "the confirm question is asked");
  // The old page's call ending late changes nothing.
  const before = p.state;
  fail();
  await submitted;
  assert.equal(p.state, before);
});

test("Claude can add a crisis flag the local check missed, and the crisis lines come first", async () => {
  const p = patient();
  await atStory(p);
  const text = "Lately I've been saying goodbye to people and giving my things away";
  assert.equal(readStory(text).crisis, false, "a phrasing the keyword check doesn't catch");
  const model = withModel(() => json({ ...CLAUDE, conditions: ["Depression"], crisis: true }));
  try {
    await p.node("story").submit!(text, p.ctx);
  } finally {
    model.restore();
  }
  assert.ok(p.cards().includes("support-line"));
  assert.ok(p.state.chat.flags.includes("risk-language-in-story"));
  assert.equal(p.state.chat.riskEvents.at(-1)?.source, "story");
});

test("Claude can't clear the local crisis check", async () => {
  const p = patient();
  await atStory(p);
  const model = withModel(() => json({ ...CLAUDE, crisis: false }));
  try {
    await p.node("story").submit!("I want to kill myself", p.ctx);
    assert.equal(model.calls.length, 0);
  } finally {
    model.restore();
  }
  assert.equal(p.state.chat.storyCrisis, true);
  assert.ok(p.cards().includes("support-line"));
});
