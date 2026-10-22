import { callModel, modelContext } from "./model";
import type { ChatJourney } from "./state";

/*
 * Drafting the visit brief's reason and focus with Claude, from the patient's own words, goal,
 * conditions and note. Without a model, or when the call fails or runs long, the brief keeps the
 * rows it builds from the answers themselves (visit.tsx). Medications, allergies and records
 * are never drafted: they stay facts from their sources.
 */

/** Long enough for two short sentences; past it, the brief goes ahead in the patient's own words. */
export const BRIEF_TIMEOUT_MS = 10_000;

/** What the brief task returns, unchecked. */
export interface ModelBrief {
  reason?: unknown;
  focus?: unknown;
}

/** Claude's draft, kept only when it has a reason to show. The focus can be empty. */
export function briefFromModel(data: ModelBrief | null): { reason: string; focus: string } | null {
  if (!data || typeof data.reason !== "string" || !data.reason.trim()) return null;
  return {
    reason: data.reason.trim().slice(0, 600),
    focus: typeof data.focus === "string" ? data.focus.trim().slice(0, 400) : "",
  };
}

/** Claude's draft of this patient's brief, or null when there's no model or no answer in time. */
export async function draftBrief(s: ChatJourney, timeoutMs = BRIEF_TIMEOUT_MS) {
  return briefFromModel(await callModel<ModelBrief>("brief", { context: modelContext(s, { brief: true }) }, timeoutMs));
}
