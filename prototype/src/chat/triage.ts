import type { CareMessage, CareTriage, TriageCategory } from "../model/types";
import { clinicianFirst, track, type ChatContext } from "./agent";
import { callModel, modelContext } from "./model";
import type { ChatJourney } from "./state";

/*
 * The care team inbox's first pass on a patient's message: the model sorts it, sums it up
 * in a line and drafts a reply a person edits and sends. Who owns it and by when come from
 * fixed rules here, never from the model. Urgent messages skip the model: the local crisis
 * check already showed the crisis lines, and the care team checks in now.
 */

export const TRIAGE_CATEGORIES: readonly TriageCategory[] = ["scheduling", "billing", "medication", "clinical", "records", "other"];

export type InboxCategory = TriageCategory | "urgent";

export const CATEGORY_LABEL: Record<InboxCategory, string> = {
  urgent: "Urgent",
  medication: "Medication",
  clinical: "Clinical",
  scheduling: "Scheduling",
  billing: "Billing",
  records: "Records",
  other: "Other",
};

const CLINICAL = new Set<InboxCategory>(["medication", "clinical"]);

/** Who owns a message and by when, from its category; a message still being read counts as other. */
export function triageRoute(s: ChatJourney, message: CareMessage): { category: InboxCategory; owner: string; due: string } {
  if (message.urgent) return { category: "urgent", owner: "Care team", due: "Now" };
  const category = message.triage?.category ?? "other";
  if (CLINICAL.has(category))
    return { category, owner: s.appointment ? clinicianFirst(s.appointment.providerId) : "Clinician", due: "Today" };
  return { category, owner: "Care coordinator", due: "1 business day" };
}

/** What the inbox shows when the model can't help: the start of the message, and no draft. */
export function fallbackTriage(body: string): CareTriage {
  const text = body.trim().replace(/\s+/g, " ");
  const cut = text.length <= 80 ? text : `${text.slice(0, 80).replace(/\s+\S*$/, "")}…`;
  return { category: "other", summary: cut, draft: "", status: "failed" };
}

/** The model's answer, checked: a known category, a summary to show, and a draft (possibly empty). */
export function triageFromModel(data: unknown): Omit<CareTriage, "status"> | null {
  if (!data || typeof data !== "object") return null;
  const { category, summary, draft } = data as Record<string, unknown>;
  if (typeof summary !== "string" || !summary.trim()) return null;
  return {
    category: TRIAGE_CATEGORIES.includes(category as TriageCategory) ? (category as TriageCategory) : "other",
    summary: summary.trim().slice(0, 200),
    draft: typeof draft === "string" ? draft.trim().slice(0, 1200) : "",
  };
}

function setTriage(ctx: ChatContext, id: string, triage: CareTriage) {
  const messages = ctx.get().careMessages ?? [];
  if (!messages.some((message) => message.id === id)) return;
  ctx.update({ careMessages: messages.map((message) => (message.id === id ? { ...message, triage } : message)) });
}

/** Runs in the background once a message is sent. Never throws; a failure leaves the fallback. */
export async function triageMessage(ctx: ChatContext, id: string, timeoutMs = 20_000): Promise<void> {
  const message = ctx.get().careMessages?.find((item) => item.id === id);
  if (!message || message.sender !== "patient" || message.urgent) return;
  setTriage(ctx, id, { category: "other", summary: "", draft: "", status: "drafting" });
  const data = await callModel("triage", { message: message.body, context: modelContext(ctx.get()) }, timeoutMs);
  const read = triageFromModel(data);
  setTriage(ctx, id, read ? { ...read, status: "ready" } : fallbackTriage(message.body));
}

/** A first pass cut off by a reload can't finish, so it shows the fallback instead of drafting forever. */
export function recoverTriage(message: CareMessage): CareMessage {
  return message.triage?.status === "drafting" ? { ...message, triage: fallbackTriage(message.body) } : message;
}

/** The care team's reply to one message; the patient's thread shows it under their message. */
export const replyId = (messageId: string) => `team-${messageId}`;

export function careReply(s: ChatJourney, messageId: string): CareMessage | undefined {
  return s.careMessages?.find((message) => message.id === replyId(messageId));
}

/**
 * Sends a reply from the inbox. A medication or clinical reply is signed by the clinician,
 * so the patient sees their name instead of the team's. Returns false if there's nothing to send.
 */
export function sendCareReply(ctx: ChatContext, messageId: string, text: string): boolean {
  const s = ctx.get();
  const message = s.careMessages?.find((item) => item.id === messageId);
  const body = text.trim();
  if (!message || !body || careReply(s, messageId)) return false;
  const route = triageRoute(s, message);
  const reply: CareMessage = {
    id: replyId(messageId),
    replyTo: messageId,
    body,
    at: new Date().toISOString(),
    sender: "care-team",
    status: "delivered",
    ...(CLINICAL.has(route.category) ? { author: route.owner } : {}),
  };
  ctx.update({ careMessages: [...(s.careMessages ?? []), reply] });
  track(ctx, "portal.care_team.reply_sent", { category: route.category, edited: body !== (message.triage?.draft ?? "").trim() });
  return true;
}
