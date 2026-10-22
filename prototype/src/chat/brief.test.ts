/**
 * Claude drafting the visit brief's reason and focus, one draft per set of brief inputs, with the
 * patient's own words underneath. The model is a stubbed fetch, so nothing reaches the network;
 * without a window there's no model at all, which is how every other test stays deterministic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createMockApi } from "../model/services";
import { applyJourneyPatch } from "../model/journey-state";
import type { JourneyState } from "../model/types";
import { briefKey, runBrief, type ChatContext, type ChatPatch } from "./agent";
import { briefFromModel } from "./brief";
import { deriveTranscript } from "./engine";
import { inventory } from "./inventory";
import { momentState } from "./moments";
import { reconcile } from "./reconcile";
import { SCRIPT } from "./script";
import { initialChatJourney, type ChatJourney } from "./state";

inventory();

const CLAUDE = {
  reason: "They want help with focus at work and constant worry, and want to talk about medication.",
  focus: "They’d like to ask whether a stimulant could help with mornings.",
};
const DRAFTED = "Drafted a visit brief for your clinician to review";
const REDRAFTED = "Redrafted your visit brief with your changes";

/** A browser with a model behind /api/assistant: each call gets `reply`, and is recorded. */
function withModel(reply: (body: Record<string, unknown>) => Promise<Response> | Response) {
  const calls: Record<string, unknown>[] = [];
  const saved = { window: (globalThis as { window?: unknown }).window, fetch: globalThis.fetch };
  (globalThis as { window?: unknown }).window = { location: { origin: "http://localhost", pathname: "/", search: "" } };
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push(body);
    return reply(body);
  }) as typeof fetch;
  const restore = () => {
    (globalThis as { window?: unknown }).window = saved.window;
    globalThis.fetch = saved.fetch;
  };
  return { calls, restore };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** A model that answers only when the test says so, to look at the brief while Claude drafts. */
function heldModel(value: unknown = CLAUDE) {
  const pending: (() => void)[] = [];
  const model = withModel(() => new Promise((resolve) => pending.push(() => resolve(json(value)))));
  return { ...model, answer: () => pending.shift()?.() };
}

/** A booked patient, through a harness that mirrors ChatApp: the reducer, the chat merge, then reconcile. */
function patient() {
  let state: ChatJourney = momentState("booked");
  const sheets: string[] = [];
  const update = (patch: ChatPatch) => {
    const { chat, ...rest } = patch;
    const previous = state;
    const next = applyJourneyPatch(previous, rest as Partial<JourneyState>) as ChatJourney;
    state = reconcile(previous, { ...next, chat: chat ? { ...previous.chat, ...chat } : previous.chat });
  };
  const ctx: ChatContext = {
    get: () => state,
    update,
    api: createMockApi({ getState: () => state, update, delayMs: 0, eligibilityDelayMs: 0 }),
    act: async (fn) => fn().catch(() => undefined),
    openSheet: (name) => void sheets.push(name),
    closeSheet: () => undefined,
    answer: () => undefined,
    edit: () => undefined,
    setVisitOpen: () => undefined,
    preview: { restart: () => undefined, jump: () => undefined, setScenario: () => undefined },
  };
  const transcript = () => deriveTranscript(SCRIPT, state);
  // ChatApp's effect: work starts when a question becomes current, and again when its enterKey changes.
  let entered = "";
  const enter = () => {
    const node = transcript().active?.node;
    const key = node ? `${node.id}:${node.enterKey?.(state) ?? ""}` : "";
    if (!node || key === entered) return;
    entered = key;
    node.enter?.(ctx);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
  const flush = async () => {
    for (let round = 0; round < 6; round++) {
      enter();
      await settle();
    }
  };
  const say = async (expected: string, value: string) => {
    await flush();
    assert.equal(transcript().active?.node.id, expected, `expected to be asked "${expected}"`);
    await transcript().active!.node.submit!(value, ctx);
    await flush();
  };
  const blocks = () =>
    transcript().items.flatMap((item) =>
      item.from === "agent" && item.nodeId === "brief" ? [item.block.kind === "card" ? item.block.card : item.block.kind] : [],
    );
  return {
    get state() {
      return state;
    },
    ctx,
    update,
    flush,
    say,
    sheets,
    blocks,
    active: () => transcript().active,
    receipts: (action: string) => state.chat.receipts.filter((item) => item.action === action).length,
    /** A reload: running work is dropped, and the page's effects start fresh. */
    reload: () => {
      const jobs = Object.fromEntries(Object.entries(state.chat.jobs).filter(([, job]) => job?.status !== "running"));
      state = { ...state, chat: { ...state.chat, jobs } };
      entered = "";
    },
    reset: () => {
      state = initialChatJourney();
    },
  };
}

/** Prep answered through the note, so the brief is next. */
async function toBrief(p: ReturnType<typeof patient>, note = "Mornings are the hardest part") {
  await p.say("prep", "yes");
  await p.say("records", "no");
  await p.say("medication", "none");
  await p.say("allergy", "none");
  await p.say("pcp", "none");
  await p.say("note", note);
}

/** What the patient's Edit sheet saves when they change their note. */
const editNote = (p: ReturnType<typeof patient>, note: string) =>
  p.update({ briefNote: note, briefApproved: false, chat: { note, briefApproved: false } });

test("Claude's brief is kept only with a reason to show, and the focus can be empty", () => {
  assert.equal(briefFromModel(null), null);
  assert.equal(briefFromModel({ ...CLAUDE, reason: "  " }), null);
  assert.equal(briefFromModel({ focus: CLAUDE.focus }), null);
  assert.deepEqual(briefFromModel({ reason: `  ${CLAUDE.reason} `, focus: 4 }), { reason: CLAUDE.reason, focus: "" });
  assert.equal(briefFromModel({ reason: "x".repeat(900), focus: "y".repeat(900) })?.reason.length, 600);
  assert.equal(briefFromModel({ reason: "x", focus: "y".repeat(900) })?.focus.length, 400);
});

test("Claude drafts the reason and focus while Wren shows the brief being drafted", async () => {
  const p = patient();
  const model = heldModel();
  try {
    await toBrief(p);
    assert.equal(p.state.chat.jobs.brief?.status, "running");
    assert.deepEqual(p.blocks(), ["work"], "only the drafting card while Claude drafts");
    assert.equal(p.active()?.input, null, "nothing to approve yet");
    model.answer();
    await p.flush();
    assert.equal(model.calls.length, 1);
    const context = model.calls[0].context as Record<string, string>;
    assert.equal(model.calls[0].task, "brief");
    assert.equal(context.goal, "Talk about medication");
    assert.equal(context.note, "Mornings are the hardest part");
    assert.equal(context.conditions, "ADHD, Anxiety");
  } finally {
    model.restore();
  }
  assert.deepEqual(p.state.chat.briefDraft, { ...CLAUDE, key: briefKey(p.state) });
  assert.equal(p.state.chat.jobs.brief?.status, "done");
  assert.deepEqual(p.blocks(), ["work", "text", "brief"]);
  assert.ok(p.active()?.input, "the patient is asked about it");
  assert.equal(p.receipts(DRAFTED), 1);
});

test("the same inputs reuse the draft, even after a reload", async () => {
  const p = patient();
  const model = withModel(() => json(CLAUDE));
  try {
    await toBrief(p);
    await runBrief(p.ctx);
    p.reload();
    await p.flush();
    // Answers the brief isn't built from change nothing.
    p.update({ chat: { readyAck: true } });
    await p.flush();
    assert.equal(model.calls.length, 1, "drafted once");
  } finally {
    model.restore();
  }
  assert.equal(p.state.chat.briefDraft?.reason, CLAUDE.reason);
  assert.equal(p.receipts(DRAFTED), 1);
});

test("a change before approval redrafts in place, with the brief and its choices kept", async () => {
  const p = patient();
  const model = heldModel();
  try {
    await toBrief(p);
    model.answer();
    await p.flush();
    const first = p.state.chat.briefDraft!;
    editNote(p, "I’d like to ask about sleep too");
    await p.flush();
    assert.equal(model.calls.length, 2, "the new note is drafted from");
    assert.equal((model.calls[1].context as Record<string, string>).note, "I’d like to ask about sleep too");
    // Claude is drafting again, behind the brief the patient is reading.
    assert.equal(p.state.chat.jobs.brief?.status, "done");
    assert.deepEqual(p.blocks(), ["work", "text", "brief"]);
    assert.ok(p.active()?.input);
    assert.equal(p.state.chat.briefDraft, first, "the earlier draft shows meanwhile");
    model.calls.length = 0;
    await p.flush();
    assert.equal(model.calls.length, 0, "one redraft per change");
  } finally {
    model.answer();
    await p.flush();
    model.restore();
  }
  assert.equal(p.state.chat.briefDraft?.key, briefKey(p.state));
  assert.notEqual(p.state.chat.briefDraft?.key, undefined);
  assert.equal(p.receipts(REDRAFTED), 1);
  assert.equal(p.state.chat.briefApproved, false);
});

test("approving, editing and not sending a drafted brief work as before", async () => {
  const p = patient();
  const model = withModel(() => json(CLAUDE));
  try {
    await toBrief(p);
    assert.equal(await p.active()!.node.submit!("edit", p.ctx), false, "Edit opens the sheet and answers nothing");
    assert.deepEqual(p.sheets, ["brief"]);
    await p.say("brief", "approve");
    assert.equal(p.state.briefApproved, true);
    assert.equal(p.state.chat.briefApproved, true);
    assert.equal(p.receipts("Shared your approved brief with your clinician"), 1);
    assert.notEqual(p.active()?.node.id, "brief");

    // After approval, a change undoes it: Wren drafts again, in view, and asks again.
    editNote(p, "Sleep is the other thing");
    assert.equal(p.state.chat.briefApproved, false);
    await p.flush();
    assert.equal(model.calls.length, 2);
    assert.equal(p.state.chat.jobs.brief?.status, "done");
    assert.equal(p.state.chat.briefDraft?.key, briefKey(p.state));
    assert.equal(p.receipts(REDRAFTED), 1);
    await p.say("brief", "approve");
    assert.equal(p.state.chat.briefApproved, true);
  } finally {
    model.restore();
  }

  const unsent = patient();
  const again = withModel(() => json(CLAUDE));
  try {
    await toBrief(unsent);
    await unsent.say("brief", "skip");
  } finally {
    again.restore();
  }
  assert.equal(unsent.state.chat.briefSkipped, true);
  assert.equal(unsent.state.chat.briefApproved, false);
  assert.notEqual(unsent.active()?.node.id, "brief", "nothing waits on the brief");
});

test("without a model, or when the call fails, the brief uses the patient's own words", async () => {
  const offline = patient();
  await toBrief(offline);
  assert.equal(offline.state.chat.briefDraft, null);
  assert.equal(offline.state.chat.jobs.brief?.status, "done");
  assert.equal(offline.receipts(DRAFTED), 1);
  await offline.say("brief", "approve");
  assert.equal(offline.state.chat.briefApproved, true);

  for (const reply of [
    () => json({ error: "unavailable" }, 503),
    () => new Response("not json", { status: 200 }),
    () => json({ reason: "", focus: CLAUDE.focus }),
  ]) {
    const p = patient();
    const model = withModel(reply);
    try {
      await toBrief(p);
      assert.equal(model.calls.length, 1);
    } finally {
      model.restore();
    }
    assert.equal(p.state.chat.briefDraft, null);
    assert.ok(p.active()?.input, "the brief is still shown and asked about");
    assert.deepEqual(p.blocks(), ["work", "text", "brief"]);
  }
});

test("a failed redraft keeps the last draft, and one that lands after approval changes nothing", async () => {
  const p = patient();
  let reply: () => Response | Promise<Response> = () => json(CLAUDE);
  let release!: () => void;
  const model = withModel(() => reply());
  try {
    await toBrief(p);
    const first = p.state.chat.briefDraft;
    reply = () => json({ error: "unavailable" }, 503);
    editNote(p, "Sleep too");
    await p.flush();
    assert.equal(p.state.chat.briefDraft, first);

    reply = () => new Promise((resolve) => (release = () => resolve(json({ ...CLAUDE, focus: "Something new" }))));
    editNote(p, "Sleep, and work stress");
    await p.flush();
    await p.say("brief", "approve");
    release();
    await p.flush();
    assert.equal(p.state.chat.briefDraft, first, "the brief stays as the patient approved it");
    assert.equal(p.state.chat.briefApproved, true);
  } finally {
    model.restore();
  }
});

test("a restart while Claude drafts leaves the new conversation alone", async () => {
  const p = patient();
  const model = heldModel();
  try {
    await toBrief(p);
    p.reset();
    model.answer();
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    model.restore();
  }
  assert.equal(p.state.chat.briefDraft, null);
  assert.equal(p.state.chat.jobs.brief, undefined);
});
