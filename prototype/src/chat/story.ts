import { CONDITION_OPTIONS } from "../model/fixtures";
import { readStory, type ConditionLabel, type StoryReading } from "./guide-ai";
import { callModel } from "./model";

/*
 * Reading what a new patient wrote about why they want care. Claude reads it when the
 * deployment has a model behind /api/assistant. The keyword reader in guide-ai.ts answers
 * in Vite dev, in Node tests, and whenever the call fails or runs long.
 *
 * The crisis check runs locally first, so the crisis lines never wait on a network call.
 * Claude's reading can add a crisis flag but never clears the local one.
 */

/** Long enough for a short reading; past it, the patient shouldn't wait any longer. */
export const STORY_TIMEOUT_MS = 8_000;

const NOT_SURE: ConditionLabel = "I'm not sure";

/** What the story task returns, unchecked. */
export interface ModelStory {
  conditions?: unknown;
  other?: unknown;
  reflection?: unknown;
  crisis?: unknown;
}

/** A reading, with Claude's short name for an "Other" concern ("trouble sleeping") when it gave one. */
export type LiveReading = StoryReading & { other?: string };

/**
 * Claude's reading, kept only when it holds together: the intake's own choices in the
 * intake's order, "I'm not sure" alone when nothing else fits, and a read-back to show.
 */
export function storyFromModel(data: ModelStory | null): LiveReading | null {
  if (!data || typeof data.reflection !== "string" || !data.reflection.trim()) return null;
  const chosen = Array.isArray(data.conditions) ? data.conditions : [];
  const named = CONDITION_OPTIONS.filter((label) => label !== NOT_SURE && chosen.includes(label));
  const other = named.includes("Other") && typeof data.other === "string" ? data.other.trim().slice(0, 60) : "";
  return {
    conditions: named.length ? [...named] : [NOT_SURE],
    reflection: data.reflection.trim().slice(0, 400),
    crisis: data.crisis === true,
    ...(other ? { other } : {}),
  };
}

/** Claude's reading of the patient's words, or the local one when there's no model or no answer in time. */
export async function readStoryLive(
  text: string,
  local: StoryReading = readStory(text),
  timeoutMs = STORY_TIMEOUT_MS,
): Promise<LiveReading> {
  if (local.crisis) return local;
  return storyFromModel(await callModel<ModelStory>("story", { text }, timeoutMs)) ?? local;
}
