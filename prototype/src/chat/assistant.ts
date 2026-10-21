import {
  CalendarClock,
  FastForward,
  CalendarPlus,
  CalendarSync,
  ClipboardList,
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
import { clinicianFirst, stamp, type ChatContext } from "./agent";
import { FIRST_VISIT_LENGTH, PREVIEW } from "./env";
import { answerQuestion, type GuideAnswer } from "./guide-ai";
import { flagRisk } from "./safety";
import { booked, priceLine } from "./script";
import type { Ask, AskActionId, ChatJourney } from "./state";

/*
 * Once the onboarding questions are done, the conversation stays open: the patient
 * can ask for common things in one tap, or type anything. One-tap requests are
 * answered from the booking itself. Typed questions go to a language model behind
 * /api/assistant when the deployment has one, after the local crisis check, with
 * Legion's stated policies as the fallback.
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
  return [
    s.visitDay
      ? { id: "join", label: "Join my visit", icon: Video }
      : { id: "when", label: "When is my visit?", icon: CalendarClock },
    ...(s.chat.prep !== "yes" && !s.visitDay ? [{ id: "prep" as const, label: "Help me get ready", icon: Sparkles }] : []),
    { id: "reschedule", label: "Reschedule", icon: CalendarSync },
    message,
    { id: "billing", label: "What will I pay?", icon: Receipt },
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
  return `You’ll pay ${priceLine(s)}. You’re charged after each visit, not before. Changing a visit within 48 hours, or missing it, costs $100.`;
}

/** Adds a question to the thread and returns its id, so a reply can land on it later. */
export function addAsk(
  ctx: ChatContext,
  anchor: string,
  ask: { question: string; answer?: string; status?: Ask["status"]; actions?: AskActionId[]; messageId?: string },
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

/** Only what the model needs to answer logistics: no story, notes, or safety answers. */
function modelContext(s: ChatJourney) {
  const appointment = booked(s) ? s.appointment : null;
  return {
    stage: !appointment
      ? "before booking"
      : s.encounter.status === "completed"
        ? "after the first visit"
        : s.visitDay
          ? "visit day"
          : "booked",
    clinician: appointment ? clinicianFirst(appointment.providerId) : null,
    visit: appointment ? `${formatDate(appointment.start)} at ${formatTime(appointment.start)} Central` : null,
    cost: priceLine(s),
    coverage: s.coverage,
  };
}

const viteEnv = (import.meta as ImportMeta & { env?: { DEV?: boolean; VITE_ASSISTANT_API?: string } }).env;
/** Vite's dev server has no /api; `vercel dev` or a deploy does. VITE_ASSISTANT_API can point elsewhere. */
const MODEL_ENDPOINT = viteEnv?.VITE_ASSISTANT_API ?? (viteEnv?.DEV ? "" : "/api/assistant");

async function askModel(s: ChatJourney, question: string): Promise<{ answer: string; actions: AskActionId[] } | null> {
  if (typeof fetch === "undefined" || typeof window === "undefined" || !MODEL_ENDPOINT) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(MODEL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, context: modelContext(s) }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { reply?: unknown; actions?: unknown };
    if (typeof data.reply !== "string" || !data.reply.trim()) return null;
    return {
      answer: data.reply.trim(),
      actions: Array.isArray(data.actions) ? data.actions.filter(isAction).slice(0, 2) : [],
    };
  } catch {
    // No model in this deployment, or it timed out: the local answers take over.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A typed question. Crisis language is caught locally before anything else and
 * always gets the crisis lines; a model never decides that.
 */
export async function answerTyped(ctx: ChatContext, question: string): Promise<{ answer: string; actions: AskActionId[] }> {
  const local = answerQuestion(question);
  if (local.intent === "crisis" || local.intent === "emergency") {
    flagRisk(ctx, "help", question);
    return { answer: local.text, actions: ["support"] };
  }
  const live = await askModel(ctx.get(), question);
  if (live) return live;
  if (local.forClinician) {
    const questions = ctx.get().chat.questions;
    ctx.update({ chat: { questions: [...questions, question] } });
  }
  return { answer: local.text, actions: actionsFor(local.intent) };
}
