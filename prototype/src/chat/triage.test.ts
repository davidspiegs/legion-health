/**
 * The care team inbox: the model's first pass on a patient's message, the fixed rules for who
 * owns it, and a reply sent from the inbox. The model is a stubbed fetch, so nothing reaches
 * the network; without a window there's no model at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMockApi } from "../model/services";
import { applyJourneyPatch } from "../model/journey-state";
import type { CareMessage, JourneyState, TriageCategory } from "../model/types";
import type { ChatContext, ChatPatch } from "./agent";
import { streamFor } from "./analytics";
import { inventory } from "./inventory";
import { momentState } from "./moments";
import type { ChatJourney } from "./state";
import { careReply, fallbackTriage, recoverTriage, sendCareReply, triageFromModel, triageMessage, triageRoute } from "./triage";

inventory();

const DOSE = "I keep forgetting my morning dose. Can I take it after lunch instead, or should I skip it that day?";
const CLAUDE = {
  category: "medication",
  summary: "Asks whether a missed morning dose can be taken after lunch.",
  draft: "If you remember by early afternoon, you can take it then. After that, skip it and take the next one as usual. Dr. Chen will follow up if anything needs to change.",
};

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

/** A booked patient, with the mock services behind them. */
function booked() {
  let state: ChatJourney = momentState("booked");
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
  /** What MessageSheet does: the message goes to the care team, and comes back with its id. */
  const send = async (body: string) => {
    ctx.update({ careMessage: body });
    await ctx.api.sendCareMessage();
    return [...(state.careMessages ?? [])].reverse().find((message) => message.sender === "patient")!;
  };
  const message = (id: string) => state.careMessages?.find((item) => item.id === id);
  return { get state() { return state; }, ctx, send, message };
}

const patientMessage = (extra: Partial<CareMessage> = {}): CareMessage => ({
  id: "message-1",
  body: DOSE,
  at: new Date().toISOString(),
  sender: "patient",
  status: "delivered",
  ...extra,
});
const sorted = (category: TriageCategory) => patientMessage({ triage: { category, summary: "x", draft: "y", status: "ready" } });

test("medication and clinical messages go to the booked clinician today; the rest to a coordinator", () => {
  const s = momentState("booked");
  for (const category of ["medication", "clinical"] as const)
    assert.deepEqual(triageRoute(s, sorted(category)), { category, owner: "Dr. Chen", due: "Today" });
  for (const category of ["scheduling", "billing", "records", "other"] as const)
    assert.deepEqual(triageRoute(s, sorted(category)), { category, owner: "Care coordinator", due: "1 business day" });
  assert.deepEqual(triageRoute(s, patientMessage()), { category: "other", owner: "Care coordinator", due: "1 business day" }, "not sorted yet");
});

test("an urgent message goes to the care team now, whatever it was sorted as", () => {
  const s = momentState("booked");
  assert.deepEqual(triageRoute(s, { ...sorted("medication"), urgent: true }), { category: "urgent", owner: "Care team", due: "Now" });
  assert.equal(streamFor("portal.care_team.reply_sent", { category: "urgent", edited: true }), "restricted");
  assert.equal(streamFor("portal.care_team.reply_sent", { category: "medication", edited: false }), "product");
});

test("the model's first pass is stored on the message, drafting until it answers", async () => {
  const p = booked();
  const sent = await p.send(DOSE);
  let answer!: () => void;
  const model = withModel(() => new Promise((resolve) => (answer = () => resolve(json(CLAUDE)))));
  try {
    const running = triageMessage(p.ctx, sent.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(p.message(sent.id)?.triage?.status, "drafting");
    answer();
    await running;
    assert.equal(model.calls.length, 1);
    const call = model.calls[0] as { task: string; message: string; context: Record<string, string> };
    assert.equal(call.task, "triage");
    assert.equal(call.message, DOSE);
    assert.match(call.context.clinician, /Chen/);
    assert.ok(call.context.medications, "the patient's regimen goes with it");
  } finally {
    model.restore();
  }
  assert.deepEqual(p.message(sent.id)?.triage, { ...CLAUDE, status: "ready" });
});

test("no model, a failed call or an unusable answer leaves the fallback: other, the start of the message, no draft", async () => {
  const p = booked();
  const sent = await p.send(DOSE);
  await triageMessage(p.ctx, sent.id);
  const fallback = p.message(sent.id)?.triage;
  assert.equal(fallback?.status, "failed");
  assert.equal(fallback?.category, "other");
  assert.equal(fallback?.draft, "");
  assert.ok(fallback!.summary.length <= 81 && DOSE.startsWith(fallback!.summary.slice(0, -1)) && fallback!.summary.endsWith("…"));
  assert.deepEqual(fallback, fallbackTriage(DOSE));
  for (const reply of [() => json({ error: "unavailable" }, 503), () => json({ category: "billing", summary: " ", draft: "Hi" })]) {
    const model = withModel(reply);
    try {
      await triageMessage(p.ctx, sent.id);
      assert.deepEqual(p.message(sent.id)?.triage, fallbackTriage(DOSE));
    } finally {
      model.restore();
    }
  }
  assert.equal(triageFromModel({ ...CLAUDE, category: "refills" })?.category, "other", "an unknown category is other");
  assert.equal(fallbackTriage("Can I move my visit?").summary, "Can I move my visit?", "a short message is its own summary");
});

test("urgent messages never reach the model, and a reload doesn't leave a draft spinning", async () => {
  const p = booked();
  const sent = await p.send("I don't want to be alive anymore");
  p.ctx.update({ careMessages: p.state.careMessages!.map((m) => (m.id === sent.id ? { ...m, urgent: true } : m)) });
  const model = withModel(() => json(CLAUDE));
  try {
    await triageMessage(p.ctx, sent.id);
    assert.equal(model.calls.length, 0);
    assert.equal(p.message(sent.id)?.triage, undefined);
  } finally {
    model.restore();
  }
  const cut = patientMessage({ triage: { category: "other", summary: "", draft: "", status: "drafting" } });
  assert.deepEqual(recoverTriage(cut).triage, fallbackTriage(DOSE));
  assert.equal(recoverTriage(sorted("billing")).triage?.status, "ready");
});

test("Send reply signs a medication answer with the clinician's name, replies once, and tracks it once", async () => {
  const p = booked();
  const sent = await p.send(DOSE);
  const model = withModel(() => json(CLAUDE));
  try {
    await triageMessage(p.ctx, sent.id);
  } finally {
    model.restore();
  }
  const events = () => p.state.chat.analytics.filter((event) => event.event === "portal.care_team.reply_sent");
  assert.equal(sendCareReply(p.ctx, sent.id, CLAUDE.draft), true);
  const reply = careReply(p.state, sent.id)!;
  assert.equal(reply.replyTo, sent.id);
  assert.equal(reply.sender, "care-team");
  assert.equal(reply.author, "Dr. Chen");
  assert.equal(reply.body, CLAUDE.draft);
  assert.equal(events().length, 1);
  assert.equal(events()[0].properties.category, "medication");
  assert.equal(events()[0].properties.edited, false);
  assert.equal(events()[0].properties.analytics_stream, "product");
  assert.ok(!JSON.stringify(events()).includes("dose"), "the message never reaches the event");
  // Sent is sent: a second press does nothing.
  assert.equal(sendCareReply(p.ctx, sent.id, "Again"), false);
  assert.equal(p.state.careMessages!.filter((m) => m.replyTo === sent.id && m.sender === "care-team").length, 1);
  assert.equal(events().length, 1);
});

test("a scheduling reply comes from the care team, and changing the draft counts as edited", async () => {
  const p = booked();
  const sent = await p.send("Can I move my visit to Friday?");
  const model = withModel(() => json({ category: "scheduling", summary: "Wants to move the visit to Friday.", draft: "Yes, Friday works." }));
  try {
    await triageMessage(p.ctx, sent.id);
  } finally {
    model.restore();
  }
  assert.equal(sendCareReply(p.ctx, sent.id, "  "), false, "an empty reply isn't sent");
  assert.equal(sendCareReply(p.ctx, sent.id, "Yes, Friday at 9 works. I’ve moved it."), true);
  assert.equal(careReply(p.state, sent.id)?.author, undefined);
  const event = p.state.chat.analytics.at(-1)!;
  assert.equal(event.event, "portal.care_team.reply_sent");
  assert.equal(event.properties.category, "scheduling");
  assert.equal(event.properties.edited, true);
});

test("the clinician view renders on its own, without a second care team queue", async () => {
  // Stylesheets are the bundler's job; here they load as nothing.
  register(
    `data:text/javascript,${encodeURIComponent(
      'export async function load(url, context, next) { return url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : next(url, context); }',
    )}`,
  );
  const { ClinicianView } = await import("./sheets");
  const p = booked();
  const html = renderToStaticMarkup(createElement(ClinicianView, { state: p.state, ctx: p.ctx }));
  assert.match(html, /AI draft\. Clinician review required\./);
  assert.match(html, /Rule checks/);
  assert.doesNotMatch(html, /Care team queue/);
});

test("after the visit the clinician view says the brief was reviewed and the plan signed, with nothing left to accept", async () => {
  register(
    `data:text/javascript,${encodeURIComponent(
      'export async function load(url, context, next) { return url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : next(url, context); }',
    )}`,
  );
  const { ClinicianView } = await import("./sheets");
  const p = booked();
  const before = renderToStaticMarkup(createElement(ClinicianView, { state: p.state, ctx: p.ctx }));
  assert.match(before, /Accept brief/);
  const done = momentState("complete");
  const html = renderToStaticMarkup(createElement(ClinicianView, { state: done, ctx: p.ctx }));
  assert.match(html, /Maya Chen reviewed this brief and signed the care plan\./);
  assert.doesNotMatch(html, /AI draft\. Clinician review required\.|Accept brief|Flag for review/);
});
