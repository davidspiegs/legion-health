import {
  CalendarClock,
  FastForward,
  CalendarPlus,
  CalendarSync,
  ClipboardList,
  FileHeart,
  LifeBuoy,
  MessageSquareText,
  Pill,
  Receipt,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";
import { formatDate, formatTime } from "../model/fixtures";
import { joinAvailability } from "../model/journey-state";
import { clinicianFirst, lateFees, stamp, type ChatContext } from "./agent";
import { FIRST_VISIT_LENGTH, PREVIEW } from "./env";
import { answerQuestion, type GuideAnswer } from "./guide-ai";
import { CLINICIANS } from "./inventory";
import { callModel, modelContext } from "./model";
import { flagRisk } from "./safety";
import { booked, priceLine } from "./script";
import type { Ask, AskActionId, ChatJourney } from "./state";

/*
 * Once the onboarding questions are done, the conversation stays open: the patient
 * can ask for common things in one tap, or type anything. One-tap requests, and
 * typed questions about the booking's own facts (when it is, what it costs, when
 * check-in opens), are answered from the booking itself. Other typed questions go
 * to a language model behind /api/assistant when the deployment has one, after the
 * local crisis check, with Legion's stated policies as the fallback.
 */

export type QuickId =
  | "when"
  | "join"
  | "prep"
  | "reschedule"
  | "message"
  | "billing"
  | "support"
  | "plan"
  | "followup"
  | "rx"
  | "chart"
  | "preview-day"
  | "preview-checkin";

export interface QuickAction {
  id: QuickId;
  label: string;
  icon: LucideIcon;
  /** A reviewer shortcut, drawn so it can't be mistaken for something a patient would do. */
  tone?: "preview";
}

/** Reviewer shortcuts that skip waiting, at the end of the row. */
function previewActions(s: ChatJourney): QuickAction[] {
  if (!PREVIEW || s.encounter.status !== "not_started") return [];
  if (!s.visitDay) return [{ id: "preview-day", label: "Preview: skip to visit day", icon: FastForward, tone: "preview" }];
  if (joinAvailability(s) === "before")
    return [{ id: "preview-checkin", label: "Preview: skip to check-in", icon: FastForward, tone: "preview" }];
  return [];
}

/** What a booked patient is most likely to need next, in that order. */
export function quickActions(s: ChatJourney): QuickAction[] {
  if (!booked(s)) return [];
  const first = clinicianFirst(s.appointment!.providerId);
  const message: QuickAction = { id: "message", label: `Message ${first}`, icon: MessageSquareText };
  const support: QuickAction = { id: "support", label: "Get support", icon: LifeBuoy };
  if (s.encounter.status === "completed")
    return [
      { id: "plan", label: "My care plan", icon: ClipboardList },
      ...(s.carePlan.status !== "published"
        ? []
        : s.followupAppointment && s.followupAppointment.status !== "cancelled"
          ? [{ id: "followup" as const, label: "Change my follow-up", icon: CalendarSync }]
          : [{ id: "followup" as const, label: "Book a follow-up", icon: CalendarPlus }]),
      message,
      { id: "rx", label: "Prescription question", icon: Pill },
      support,
    ];
  // Most asked first. MyChart is offered in the chat; it's here only for someone who said "Not now".
  return [
    s.visitDay
      ? { id: "join", label: "Join my visit", icon: Video }
      : { id: "when", label: "When is my visit?", icon: CalendarClock },
    { id: "reschedule", label: "Reschedule", icon: CalendarSync },
    message,
    { id: "billing", label: "What will I pay?", icon: Receipt },
    ...(s.chat.prep !== "yes" && !s.visitDay ? [{ id: "prep" as const, label: "Help me get ready", icon: Sparkles }] : []),
    ...(s.chat.chart === "later" && !s.chartImport
      ? [{ id: "chart" as const, label: "Import MyChart", icon: FileHeart }]
      : []),
    support,
    ...previewActions(s),
  ];
}

export function visitWhenLine(s: ChatJourney): string {
  const appointment = s.appointment!;
  return `Your visit with ${clinicianFirst(appointment.providerId)} is ${formatDate(appointment.start)} at ${formatTime(appointment.start)} Central, by video. It takes about ${FIRST_VISIT_LENGTH}, and check-in opens right here 15 minutes before.`;
}

export function checkInOpensLine(s: ChatJourney): string {
  const opens = new Date(new Date(s.appointment!.start).getTime() - 15 * 60_000).toISOString();
  return `Check-in opens at ${formatTime(opens)}, 15 minutes before your visit. I’ll have it ready right here.`;
}

export function billingLine(s: ChatJourney): string {
  const fees = lateFees(s);
  const agreed =
    fees === 1 ? ", plus the $100 late-change fee you agreed to" : fees > 1 ? `, plus $${fees * 100} in late-change fees you agreed to` : "";
  return `You’ll pay ${priceLine(s)}${agreed}. You’re charged after each visit, not before. Changing a visit within 48 hours, or missing it, costs $100.`;
}

/** Adds a question to the thread and returns its id, so a reply can land on it later. */
export function addAsk(
  ctx: ChatContext,
  anchor: string,
  ask: {
    question: string;
    answer?: string;
    status?: Ask["status"];
    actions?: AskActionId[];
    messageId?: string;
    awaiting?: Ask["awaiting"];
  },
): string {
  const s = ctx.get();
  const id = `ask-${s.chat.asks.length + 1}-${Date.now().toString(36)}`;
  ctx.update({
    chat: {
      asks: [
        ...s.chat.asks,
        { id, at: stamp(s), anchor, answer: "", status: "done", ...ask },
      ],
    },
  });
  return id;
}

export function settleAsk(ctx: ChatContext, id: string, patch: Partial<Ask>) {
  const asks = ctx.get().chat.asks;
  ctx.update({ chat: { asks: asks.map((ask) => (ask.id === id ? { ...ask, ...patch } : ask)) } });
}

const ACTION_IDS: AskActionId[] = ["calendar", "reschedule", "message", "support", "followup", "join"];
const isAction = (value: unknown): value is AskActionId =>
  typeof value === "string" && (ACTION_IDS as string[]).includes(value);

/** The local answers' topics, mapped to the one action that helps most. */
function actionsFor(intent: GuideAnswer["intent"]): AskActionId[] {
  if (intent === "changes") return ["reschedule"];
  if (intent === "timing" || intent === "visits") return ["calendar"];
  if (intent === "medication" || intent === "clinician" || intent === "other") return ["message"];
  return [];
}

const ASKS_WHEN = /\b(?:when|what time|what day|which day|what date|date|time|today|tonight|tomorrow|how early|how soon)\b/;
/** The clinician's own name counts: "when do I see Dr. Chen?" (or Maya, or Chen) is a question about the visit. */
const aboutVisit = (who: string) => {
  const surname = who.toLowerCase().replace(/^dr\.?\s*/, "");
  const names = [`(?:dr\\.?\\s*)?${surname}`, ...(clinicianFirstNameFor(surname) ? [clinicianFirstNameFor(surname)!] : [])];
  return new RegExp(
    String.raw`\b(?:visits?|appointments?|appts?|sessions?|follow[\s-]?ups?|(?:see|seeing|meet|meeting)\s+(?:${names.join("|")}|my clinician|the clinician|the doctor|my doctor|her|him|them))\b`,
  );
};
/** The given name of the clinician with this surname, lowercased, for matching typed questions. */
function clinicianFirstNameFor(surname: string): string | undefined {
  return CLINICIANS.find((c) => c.name.toLowerCase().endsWith(` ${surname}`))?.firstName.toLowerCase();
}
const ABOUT_COST = /\b(?:costs?|pay|paying|price|charge|charged|copay|co-pay|bill|billed|owe|fees?)\b|\bhow much\b(?!\s+(?:time|longer))/;
const ABOUT_CHECKIN = /\bcheck[\s-]?in\b/;
/** Asking to change the time is a reschedule, not a question about when. */
const WANTS_CHANGE =
  /\b(?:chang\w*|move|moving|moved|reschedul\w*|cancel\w*|swap\w*|switch\w*|push(?:ed|ing)?\s+(?:it|my|the|back)|earlier|(?:a\s+)?(?:different|another|new|later)\s+(?:time|day|date|slot))\b/;

/** Facts about this patient's own booking, answered from the booking as the one-tap answers are. */
export function bookingAnswer(s: ChatJourney, question: string): { answer: string; actions: AskActionId[] } | null {
  if (!booked(s)) return null;
  const q = question.toLowerCase().replace(/’/g, "'");
  const first = clinicianFirst(s.appointment!.providerId);
  if (WANTS_CHANGE.test(q)) {
    // Moving or cancelling the visit is a booking action with its own button. Other changes
    // (a different clinician, a plan) aren't about the booking and go to the model.
    const aboutTheVisit =
      /\b(?:reschedul\w*|cancel\w*|time|day|date|slot)\b/.test(q) || aboutVisit(first).test(q);
    if (!aboutTheVisit || s.encounter.status === "completed") return null;
    const lead = /\bcancel\w*/.test(q)
      ? `To cancel, a person on the care team can help: open Help, then Talk to a person. You can also pick a new time with ${first} here.`
      : `You can pick a new time with ${first} here.`;
    return { answer: `${lead} Changing a visit within 48 hours, or missing it, costs $100.`, actions: ["reschedule"] };
  }
  // "When do I pay?" is about money, so cost is read before time.
  if (ABOUT_COST.test(q)) return { answer: billingLine(s), actions: ["message"] };
  if (ABOUT_CHECKIN.test(q) && ASKS_WHEN.test(q) && s.encounter.status === "not_started")
    return joinAvailability(s) === "open"
      ? { answer: `Check-in is open now, right here. ${first} will let you in at the start of your visit.`, actions: ["join"] }
      : { answer: checkInOpensLine(s), actions: [] };
  if (ASKS_WHEN.test(q) && aboutVisit(first).test(q)) {
    if (s.encounter.status !== "completed") return { answer: visitWhenLine(s), actions: ["calendar"] };
    const next = s.followupAppointment?.status === "confirmed" ? s.followupAppointment : null;
    return next
      ? {
          answer: `Your follow-up with ${clinicianFirst(next.providerId)} is ${formatDate(next.start)} at ${formatTime(next.start)} Central, by video.`,
          actions: [],
        }
      : { answer: `Your first visit with ${first} is done. Want to book a follow-up?`, actions: ["followup"] };
  }
  return null;
}

/** Crisis and emergency words are recognized on the device, from the words alone; no model decides that. */
export function urgentQuestion(question: string): boolean {
  const { intent } = answerQuestion(question);
  return intent === "crisis" || intent === "emergency";
}

/**
 * A typed question still being answered when the page closed can't finish now, so it
 * says so. Crisis words still get the crisis lines: those never wait on anything.
 */
export function recoverAsks(asks: Ask[]): Ask[] {
  return asks.map((ask) =>
    ask.status !== "thinking"
      ? ask
      : urgentQuestion(ask.question)
        ? { ...ask, status: "done", answer: answerQuestion(ask.question).text, actions: ["support"] }
        : {
            ...ask,
            status: "done",
            answer: "This question didn’t finish before the page reloaded. Ask it again and I’ll answer.",
          },
  );
}

async function askModel(s: ChatJourney, question: string): Promise<{ answer: string; actions: AskActionId[] } | null> {
  const data = await callModel<{ reply?: unknown; actions?: unknown }>(
    "question",
    { question, context: modelContext(s) },
    15_000,
  );
  if (!data || typeof data.reply !== "string" || !data.reply.trim()) return null;
  return {
    answer: data.reply.trim(),
    actions: Array.isArray(data.actions) ? data.actions.filter(isAction).slice(0, 2) : [],
  };
}

/**
 * A typed question. Crisis language is caught locally before anything else and
 * always gets the crisis lines; a model never decides that.
 */
/** Where a typed answer came from, for measurement: never the question itself. */
export type AnswerSource = "crisis" | "booking" | "model" | "policies";

export async function answerTyped(
  ctx: ChatContext,
  question: string,
): Promise<{ answer: string; actions: AskActionId[]; source: AnswerSource }> {
  const local = answerQuestion(question);
  if (local.intent === "crisis" || local.intent === "emergency") {
    flagRisk(ctx, "help", question);
    return { answer: local.text, actions: ["support"], source: "crisis" };
  }
  const fromBooking = bookingAnswer(ctx.get(), question);
  if (fromBooking) return { ...fromBooking, source: "booking" };
  const live = await askModel(ctx.get(), question);
  if (live) return { ...live, source: "model" };
  if (local.forClinician) {
    const questions = ctx.get().chat.questions;
    ctx.update({ chat: { questions: [...questions, question] } });
  }
  return { answer: local.text, actions: actionsFor(local.intent), source: "policies" };
}
