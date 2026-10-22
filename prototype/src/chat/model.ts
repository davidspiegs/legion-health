import {
  formatDate,
  formatTime,
  isControlled,
  prescriptionFor,
  regimenFor,
  regimenLine,
  type RegimenMed,
} from "../model/fixtures";
import { clinicianById, formalName } from "./inventory";
import type { ChatJourney } from "./state";

/*
 * The one way the app reaches the model behind /api/assistant, and the patient context
 * every task sends with it. Wren's scripted questions never call it; only the places
 * where the patient's own words vary do. Every caller has a local answer for when this
 * returns null: in Vite dev, in Node tests, when the call fails or runs long.
 *
 * This module imports nothing from the conversation script or the agent, so both can
 * call the model without an import cycle.
 */

export type ModelTask = "question" | "story" | "brief" | "triage";

const viteEnv = (import.meta as ImportMeta & { env?: { DEV?: boolean; VITE_ASSISTANT_API?: string } }).env;
/** Vite's dev server has no /api; `vercel dev` or a deploy does. VITE_ASSISTANT_API can point elsewhere. */
export const MODEL_ENDPOINT = viteEnv?.VITE_ASSISTANT_API ?? (viteEnv?.DEV ? "" : "/api/assistant");

/**
 * One task's answer as parsed JSON, or null when there's no model here, the call
 * fails, or it takes longer than `timeoutMs`. Never throws. The fields are unchecked:
 * each caller checks the ones it uses.
 */
export async function callModel<T>(task: ModelTask, payload: Record<string, unknown>, timeoutMs: number): Promise<T | null> {
  if (typeof fetch === "undefined" || typeof window === "undefined" || !MODEL_ENDPOINT) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(MODEL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, task }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data && typeof data === "object" ? (data as T) : null;
  } catch {
    // No model in this deployment, or it timed out: the local answers take over.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------ patient context

const isBooked = (s: ChatJourney) => !!s.appointment && s.appointment.status !== "cancelled";

const clinicianOf = (id: string) => {
  const clinician = clinicianById(id);
  return clinician ? formalName(clinician).replace(/ /g, " ") : "";
};

const when = (iso: string) => `${formatDate(iso)} at ${formatTime(iso)} Central`;

function stageOf(s: ChatJourney): string {
  if (!isBooked(s)) return "before booking";
  if (s.encounter.status === "completed") return "after the first visit";
  return s.visitDay ? "visit day" : "booked";
}

function costOf(s: ChatJourney): string {
  if (s.coverage === "selfpay" || s.chat.benefitsChoice === "selfpay")
    return "Self-pay: $250 for the first visit, charged after it";
  if (s.chat.benefits?.copay != null) return `Estimated copay $${s.chat.benefits.copay}, charged after the visit`;
  return "The plan's share, charged after the visit";
}

/**
 * Claude's short name for the patient's "Other" concern ("trouble sleeping"), while the conditions
 * are the ones it read from their words. Chosen from the list instead, there's none.
 */
export const storyOtherLabel = (s: ChatJourney) =>
  s.chat.storyMode === "words" && s.conditions.includes("Other") ? s.chat.storyOther.trim() : "";

/** The chosen conditions by name, with an "Other" concern in the patient's words, or as Claude named it. */
function conditionsOf(s: ChatJourney): string {
  const named = s.conditions.filter((c) => c !== "I'm not sure" && c !== "Other");
  const other = s.conditions.includes("Other") ? s.chat.otherText.trim() || storyOtherLabel(s) : "";
  return [...named, ...(other ? [other] : [])].join(", ");
}

/** The regimen from the pharmacy's fill history, with what the patient said about it. */
function medicationsOf(s: ChatJourney): string {
  const c = s.chat;
  const note = c.medicationNote.trim();
  // Before the patient says why they're here, there's no regimen to look up.
  if (!s.conditions.length) return "";
  if (c.medication === "none") return "None, the patient says";
  // Without records, the patient listed their own.
  if (c.medication === "other" && note) return `In the patient's words: ${note}`;
  const line = regimenLine(regimenFor(s.conditions));
  if (c.medication === "stopped") return `${line}. The patient says they've stopped taking it`;
  if (c.medication === "changed") return `${line}. The patient says they take a different dose now`;
  return line;
}

function allergiesOf(s: ChatJourney): string {
  const c = s.chat;
  if (c.allergy === "none") return "None known";
  const onRecord = c.recordsFound?.allergy && c.allergy !== "no" ? c.recordsFound.allergy : "";
  return [onRecord, c.allergyNote.trim()].filter(Boolean).join("; ");
}

/**
 * What the clinician continues once the plan is signed: the patient's regimen, unless they said
 * they stopped it or take nothing. A list the patient typed in place of a pharmacy record is
 * theirs to go over in the visit, so nothing is continued from it.
 */
export function continuedRegimen(s: ChatJourney): readonly RegimenMed[] {
  const c = s.chat;
  if (!s.conditions.length || c.medication === "stopped" || c.medication === "none") return [];
  if (c.medication === "other" && c.medicationNote.trim()) return [];
  return regimenFor(s.conditions);
}

/** Who writes a controlled medication. Texas requires a physician, and no one in the directory is an MD or DO. */
export const PSYCHIATRIST = "a Legion psychiatrist";

/** A controlled medication the signed plan continues, not sent yet because the photo ID isn't verified. */
export function waitingForId(s: ChatJourney): RegimenMed[] {
  if (s.carePlan.status !== "published" || s.chat.idCheck === "done") return [];
  const sent = (s.prescriptions ?? []).map((rx) => rx.medication);
  return continuedRegimen(s).filter((med) => isControlled(med.name) && !sent.includes(prescriptionFor(med)));
}

/** Once the clinician signs the plan: what they continued or changed, where it was sent, and what's next. */
function planOf(s: ChatJourney): string {
  if (s.carePlan.status !== "published") return "";
  const who = clinicianOf(s.appointment?.providerId ?? s.providerId) || "The clinician";
  const prescriptions = s.prescriptions ?? [];
  const lines = [
    ...prescriptions.map((rx) => {
      const by = isControlled(rx.medication) ? `written by ${PSYCHIATRIST}, ` : "";
      return rx.status === "sent"
        ? `continue ${rx.medication} (${rx.supply}, ${by}sent to ${rx.pharmacy} through DoseSpot)`
        : `continue ${rx.medication} (${rx.supply}, ${by}not confirmed by ${rx.pharmacy} yet; the care team is resending it)`;
    }),
    ...waitingForId(s).map(
      (med) => `continue ${prescriptionFor(med)} (not sent yet: ${PSYCHIATRIST} sends it once the patient verifies their photo ID)`,
    ),
  ];
  const sent = lines.length ? lines.join("; ") : "no prescriptions sent";
  const followup = s.followupAppointment && s.followupAppointment.status !== "cancelled" ? s.followupAppointment : null;
  return `${who} signed the care plan: ${sent}. Follow-up in about ${s.carePlan.followupWeeks} weeks${
    followup ? `, booked for ${when(followup.start)}` : ", not booked yet"
  }.`;
}

/**
 * What every task knows about the patient, as short strings (empty ones are left out).
 * Safety answers never go. The story, goal and note go only to the brief.
 */
export function modelContext(s: ChatJourney, { brief = false }: { brief?: boolean } = {}): Record<string, string> {
  const appointment = isBooked(s) ? s.appointment : null;
  const context: Record<string, string> = {
    stage: stageOf(s),
    clinician: appointment ? clinicianOf(appointment.providerId) : "",
    visit: appointment ? when(appointment.start) : "",
    cost: costOf(s),
    coverage: s.chat.benefits && s.coverage === "insurance" ? `insurance: ${s.chat.benefits.payer}, ${s.chat.benefits.network}` : s.coverage,
    conditions: conditionsOf(s),
    medications: medicationsOf(s),
    allergies: allergiesOf(s),
    plan: planOf(s),
    ...(brief
      ? { story: s.chat.storyText.trim(), goal: s.goal, note: (s.chat.note || s.briefNote).trim() }
      : {}),
  };
  return Object.fromEntries(Object.entries(context).filter(([, value]) => typeof value === "string" && value.trim()));
}
