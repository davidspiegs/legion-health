import { addTask, stamp, type ChatContext } from "./agent";
import type { ChatJourney, ChatState, RiskSource, ScreenItem } from "./state";

export type { RiskSource, ScreenItem } from "./state";

/*
 * Safety rules are code, not model judgment. Every patient answers one safety
 * question before booking, as in Legion's live flow, with three answers instead of
 * two so people with thoughts but no immediate danger aren't turned away. The
 * wording and what happens after each answer are proposals for Legion's medical
 * director to approve.
 *
 * Two rules hold everywhere:
 * - Risk is never erased. Flags and risk events only accumulate, and an answer can
 *   be raised but not lowered in the chat; a person on the care team resolves it.
 * - After booking, risk never blocks the path to the visit. It adds crisis resources
 *   and a same-day task for the care team instead.
 */

type Screen = ChatState["screen"];

export interface ScreenQuestion {
  id: ScreenItem;
  /** What the assistant asks. */
  ask: string;
  /** How the clinician's record states the answer. */
  record: (value: string) => string;
  /** How the patient's own brief states it, in the second person. */
  mine: (value: string) => string;
  options: { value: string; label: string }[];
  applies?: (screen: Screen) => boolean;
}

export const SCREEN: ScreenQuestion[] = [
  {
    id: "now",
    // Legion's live fit check question, worded so "yes" means safe.
    ask: "Are you safe right now? That means you’re not in immediate danger of harming yourself or someone else.",
    record: (value) =>
      value === "unsafe" ? "Said they don’t feel safe right now, or weren’t sure" : "Said they’re safe right now",
    mine: (value) => (value === "unsafe" ? "you don’t feel safe right now, or you’re not sure" : "you’re safe right now"),
    // Values name the risk (none, or unsafe), not the words on the buttons.
    options: [
      { value: "no", label: "Yes, I’m safe right now" },
      { value: "unsafe", label: "No, I don’t feel safe / Not sure" },
    ],
  },
];

export const screenQuestion = (id: ScreenItem) => SCREEN.find((item) => item.id === id)!;

export function screenItems(screen: Screen): ScreenQuestion[] {
  return SCREEN.filter((item) => !item.applies || item.applies(screen));
}

export const screenDone = (screen: Screen) => screenItems(screen).every((item) => !!screen[item.id]);

/** A risk answer: anything but "no". */
export const isRiskAnswer = (value: string | undefined) => !!value && value !== "no";

/** Answers in order of risk, so a change can only go up. */
export const RISK_ORDER = ["no", "unsafe"];

export type ScreenLevel = "none" | "moderate" | "high";

/** Proposed dispositions for the safety answer. */
export function screenLevel(screen: Screen): ScreenLevel {
  return screen.now === "unsafe" ? "high" : "none";
}

/** Reason codes the safety answer adds; they accumulate and are never removed. */
export function screenFlags(screen: Screen): string[] {
  const level = screenLevel(screen);
  return level === "none" ? [] : [`screen-${level}`];
}

/** The clinician's line, stated from the question itself. */
export function screenRecordLines(screen: Screen): string[] {
  return screenItems(screen)
    .filter((item) => isRiskAnswer(screen[item.id]))
    .map((item) => item.record(screen[item.id]!));
}

/** The patient's brief: the same answer in the second person, never paraphrased further. */
export function screenPatientLines(screen: Screen): string[] {
  return screenItems(screen)
    .filter((item) => isRiskAnswer(screen[item.id]))
    .map((item) => item.mine(screen[item.id]!));
}

export const SOURCE_LABEL: Record<RiskSource, string> = {
  story: "their own words about why they came",
  other: "what else they’d like help with",
  help: "a question in Help",
  note: "their note for the clinician",
  medication: "their medication answer",
  allergy: "their allergy answer",
  brief: "an edit to their brief",
};

/** What each reason code means, what should happen, and by when. */
export const FLAG_INFO: Record<string, { short: string; detail: string; due: string }> = {
  "screen-high": {
    short: "Said they’re not safe right now",
    detail:
      "Has thoughts of harming themself or someone else and said they’re not safe right now. Routine booking paused and crisis lines shown. A callback request, if any, is in today’s care team queue.",
    due: "Today",
  },
  "screen-moderate": {
    short: "Thoughts of harm, safe right now",
    detail:
      "Has thoughts of harming themself or someone else and said they’re safe right now. Clinician reviews before the visit; care team checks in within 1 business day.",
    due: "Within 1 business day",
  },
  "safe-now-unsafe": {
    short: "Said they’re not safe right now",
    detail:
      "Routine booking paused and crisis lines shown. A callback request, if any, is in today’s care team queue.",
    due: "Today",
  },
  "post-visit-worse": {
    short: "Felt worse after the first visit",
    detail: "Care team checks in within 1 business day.",
    due: "Within 1 business day",
  },
};
for (const source of Object.keys(SOURCE_LABEL) as RiskSource[]) {
  FLAG_INFO[`risk-language-in-${source}`] = {
    short: `Risk language in ${SOURCE_LABEL[source]}`,
    detail: "Care team checks in today. The exact words are below.",
    due: "Today",
  };
}

/** Anything a clinician must see before the visit: screener risk, risk language, or an unsafe answer. */
export function hasRisk(s: ChatJourney): boolean {
  return (
    screenLevel(s.chat.screen) !== "none" ||
    s.chat.riskEvents.length > 0 ||
    Object.values(s.chat.safeNow).includes("unsafe") ||
    s.chat.flags.some((flag) => flag in FLAG_INFO && flag !== "post-visit-worse")
  );
}

/** Adds reason codes without ever removing one. */
export function addFlags(ctx: ChatContext, codes: string[]) {
  const flags = ctx.get().chat.flags;
  const fresh = codes.filter((code) => !flags.includes(code));
  if (fresh.length) ctx.update({ chat: { flags: [...flags, ...fresh] } });
}

/**
 * Free text matched risk language. Records the words for the clinician, adds a reason code,
 * and puts a same-day check-in in the care team queue. It never stops the conversation;
 * the caller decides what to show.
 */
export function flagRisk(ctx: ChatContext, source: RiskSource, text: string) {
  const s = ctx.get();
  ctx.update({
    chat: { riskEvents: [...s.chat.riskEvents, { source, text: text.slice(0, 600), at: stamp(s) }] },
  });
  addFlags(ctx, [`risk-language-in-${source}`]);
  const open = ctx
    .get()
    .chat.tasks.some((task) => task.kind === "risk-review" && task.status === "open" && task.title.includes(SOURCE_LABEL[source]));
  if (!open)
    addTask(
      ctx,
      {
        kind: "risk-review",
        title: `Check in about ${SOURCE_LABEL[source]}`,
        due: "Today",
        contact: s.profile.phone || undefined,
      },
      "Asked the care team to check in with you today",
    );
}

/** The patient asked for a clinician to call them about their safety. */
export function requestSafetyCallback(ctx: ChatContext, phone: string) {
  addTask(
    ctx,
    { kind: "safety-callback", title: "Call the patient about their safety", due: "Today", contact: phone },
    "Asked a Legion clinician to call you today",
  );
}

/** Help lines shown with every safety message. */
export const SUPPORT_LINES = {
  crisis: "988",
  emergency: "911",
  poison: "1-800-222-1222",
} as const;

