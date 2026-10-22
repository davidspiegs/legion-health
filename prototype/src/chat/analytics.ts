import { PREVIEW } from "./env";
import type { ChatInput, ChatNode } from "./engine";
import { inventory } from "./inventory";
import type { ChatJourney } from "./state";

/*
 * Event tracking, in PostHog's capture format. The prototype keeps the events in the
 * journey (Preview tools shows them) and forwards them to `window.posthog` when a real
 * client is on the page; nothing else leaves the browser.
 *
 * Names keep Legion's existing PostHog events where a step still exists
 * (portal.onboarding.started, portal.provider_selected, portal.provider.reservation.created,
 * portal.onboarding.userCreated), so the new funnel reads against the brief's baseline.
 * New events cover what the current funnel can't see: a saved payment method, a booked
 * visit, check-in, and the first visit completed.
 *
 * Minimum necessary: properties are enums, counts and booleans from an allowlist, never
 * answers to health questions, free text, conditions, names, birth dates, phone numbers,
 * emails or member IDs. Events about a patient of a psychiatric practice are still health
 * information, so PostHog runs under a BAA with an internal ID as the person. Crisis and
 * support events are marked for a restricted stream with narrower access.
 */

export type EventValue = string | number | boolean | null;
export type EventProps = Record<string, EventValue>;

export interface PostHogEvent {
  uuid: string;
  event: string;
  timestamp: string;
  distinct_id: string;
  properties: EventProps;
}

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

/** Like posthog-js: one session across reloads and tabs until 30 minutes without activity. */
const SESSION_KEY = "legion-posthog-session";
const FALLBACK_SESSION = randomId();
function sessionId(): string {
  try {
    const now = Date.now();
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as {
      id: string;
      at: number;
    } | null;
    const id = saved && now - saved.at < 30 * 60_000 ? saved.id : randomId();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
    return id;
  } catch {
    return FALLBACK_SESSION;
  }
}

/** Every property an event may carry. Anything else is dropped before the event is built. */
export const ALLOWED_PROPS = new Set([
  "step",
  "choice",
  "mode",
  "count",
  "soonest",
  "windows",
  "rank",
  "offers",
  "ranked",
  "lead_hours",
  "result",
  "via",
  "member_id_entered",
  "ai_notes",
  "method",
  "coverage",
  "sources",
  "days_from_booking",
  "source",
  "status",
  "weeks_out",
  "action",
  "actions",
  "from",
  "kind",
  "reason",
  "reason_changed",
  "note_changed",
  "stage",
  "$pathname",
  "$anon_distinct_id",
  "$set",
]);

/** Crisis and support events go to a restricted stream, kept apart from product analytics. */
export function streamFor(
  event: string,
  props: EventProps,
): "product" | "restricted" {
  if (event.startsWith("portal.support.")) return "restricted";
  if (
    event === "portal.onboarding.fit_exited" &&
    props.reason === "immediate_support"
  )
    return "restricted";
  if (
    event === "portal.assistant.question_answered" &&
    props.source === "crisis"
  )
    return "restricted";
  return "product";
}

const currentUrl = () =>
  typeof window === "undefined"
    ? ""
    : `${window.location.origin}${window.location.pathname}`;

/** Sent with every event: what posthog-js adds, plus which experience this is. */
function superProperties(s: ChatJourney): EventProps {
  return {
    $session_id: sessionId(),
    $current_url: currentUrl(),
    $lib: "posthog-js",
    experience: "chat",
    assistant: "wren",
    booked: !!s.appointment && s.appointment.status !== "cancelled",
    preview: PREVIEW,
    ...(s.scenario !== "standard" ? { preview_scenario: s.scenario } : {}),
  };
}

/** Builds one event. Super properties come first, so an event's own properties win. */
export function capture(
  s: ChatJourney,
  distinctId: string,
  event: string,
  props: EventProps = {},
): PostHogEvent {
  const allowed = Object.fromEntries(
    Object.entries(props).filter(([key]) => ALLOWED_PROPS.has(key)),
  );
  return {
    uuid: randomId(),
    event,
    timestamp: new Date().toISOString(),
    distinct_id: distinctId,
    properties: {
      ...superProperties(s),
      distinct_id: distinctId,
      analytics_stream: streamFor(event, allowed),
      ...allowed,
    },
  };
}

/** The anonymous ID before the patient has an account, as posthog-js would generate it. */
export const anonymousId = () => `anon_${randomId()}`;

/** Hands an event to a real PostHog client when one is on the page. */
export function forward(event: PostHogEvent) {
  const client =
    typeof window === "undefined"
      ? undefined
      : (window as Window & { posthog?: PostHogClient }).posthog;
  if (!client) return;
  if (event.event === "$identify")
    client.identify?.(
      event.distinct_id,
      JSON.parse(String(event.properties.$set ?? "{}")),
    );
  else client.capture?.(event.event, event.properties);
}

interface PostHogClient {
  capture?: (event: string, properties: EventProps) => void;
  identify?: (distinctId: string, set?: EventProps) => void;
}

/* ---------------------------------------------------------------- answers */

/** The canonical event for each answered step; anything else is portal.onboarding.step_answered. */
const ANSWER_EVENTS: Record<string, string> = {
  hello: "portal.onboarding.started",
  story: "portal.onboarding.conditions",
  // Legion's needs page asks what the patient wants help with; here that's the goal question.
  goal: "portal.onboarding.needs",
  quick: "portal.onboarding.fit_checked",
  "screen-now": "portal.onboarding.safety_answered",
  hospital: "portal.onboarding.history_answered",
  pay: "portal.onboarding.insurance_selected",
  payer: "portal.onboarding.payer_selected",
  when: "portal.onboarding.availability_set",
  choose: "portal.provider_selected",
  phone: "portal.onboarding.phone_submitted",
  code: "portal.onboarding.phone_verified",
  identity: "portal.onboarding.details_confirmed",
  email: "portal.onboarding.email_added",
  benefits: "portal.onboarding.benefits_answered",
  prep: "portal.prep.offer_answered",
  records: "portal.prep.records_answered",
  brief: "portal.prep.brief_answered",
  "id-check": "portal.prep.id_check_answered",
  mychart: "portal.prep.mychart_answered",
  ready: "portal.prep.ready",
  reminder: "portal.visit.reminder_answered",
  followup: "portal.followup.answered",
};

/** Steps whose answers are health information: the event says the step was answered, never how. */
const CLINICAL = new Set([
  "story",
  "story-confirm",
  "story-other",
  "goal",
  "quick-which",
  "screen-now",
  "hospital",
  "medication",
  "allergy",
  "day-meds",
  "day-allergies",
]);

/** An answered step as an event: the choice only when it's one of the step's own options and not clinical. */
export function answerEvent<C>(
  node: ChatNode<ChatJourney, C>,
  input: ChatInput | null | undefined,
  value: string | string[],
  s: ChatJourney,
  changed: boolean,
): [string, EventProps] {
  if (changed) return ["portal.onboarding.answer_changed", { step: node.id }];
  const props: EventProps = { step: node.id };
  if (node.id === "story") {
    props.mode = s.chat.storyMode || "chips";
    props.count = s.conditions.length;
  } else if (node.id === "when") {
    props.soonest = s.chat.availability.includes("soonest");
    props.windows = s.chat.availability.filter(
      (item) => item !== "soonest",
    ).length;
  } else if (node.id === "choose" && s.chat.match) {
    const rank = s.chat.match.offerIds.indexOf(s.providerId);
    props.rank = rank >= 0 ? rank + 1 : null;
  } else if (
    !CLINICAL.has(node.id) &&
    typeof value === "string" &&
    input?.kind === "single" &&
    input.options.some((option) => option.value === value)
  ) {
    props.choice = value.replace(/^__/, "");
  }
  return [ANSWER_EVENTS[node.id] ?? "portal.onboarding.step_answered", props];
}

/* ------------------------------------------------------------- milestones */

const hoursUntil = (iso: string | undefined) =>
  iso
    ? Math.max(
        0,
        Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000),
      )
    : null;

const accountCreated = (s: ChatJourney) =>
  s.events.some(
    (event) =>
      event.service === "Auth" &&
      event.operation === "account.created" &&
      event.outcome === "success",
  );

/** Fit-check exits as coarse reason codes, so appropriate exits can be told apart from friction. */
const EXIT_REASON: Record<string, string> = {
  age: "age",
  state: "location",
  virtual: "in_person",
  coverage: "coverage",
  review: "level_of_care",
  safety: "immediate_support",
};

/**
 * What happened between two states of the same conversation, as events. Milestones come
 * from the journey itself (a booking, a visit, a plan), never from the screen alone.
 */
export function milestoneEvents(
  prev: ChatJourney,
  next: ChatJourney,
): [string, EventProps][] {
  const events: [string, EventProps][] = [];
  const add = (event: string, props: EventProps = {}) =>
    events.push([event, props]);

  if (next.exitReason && next.exitReason !== prev.exitReason)
    add("portal.onboarding.fit_exited", {
      reason: EXIT_REASON[next.exitReason] ?? "other",
    });

  const match = next.chat.jobs.match;
  if (
    match?.status === "done" &&
    match.finishedAt !== prev.chat.jobs.match?.finishedAt &&
    next.chat.match
  )
    add("portal.provider.match_shown", {
      offers: next.chat.match.offerIds.length,
      ranked: next.chat.match.rankedIds.length,
    });

  if (next.reservation && next.reservation.slotId !== prev.reservation?.slotId)
    add("portal.provider.reservation.created", {
      lead_hours: hoursUntil(slotStart(next.reservation.slotId)),
    });

  if (
    next.chat.identity !== prev.chat.identity &&
    (next.chat.identity === "found" || next.chat.identity === "not-found")
  )
    add("portal.onboarding.identity_prefilled", {
      result: next.chat.identity === "found" ? "found" : "not_found",
    });

  if (accountCreated(next) && !accountCreated(prev))
    add("portal.onboarding.userCreated");

  if (next.agreements && !prev.agreements)
    add("portal.onboarding.agreements_accepted", {
      ai_notes: next.chat.aiNotes,
    });

  const benefits = next.chat.jobs.benefits;
  if (
    benefits &&
    ["done", "pending", "failed"].includes(benefits.status) &&
    (benefits.status !== prev.chat.jobs.benefits?.status ||
      benefits.finishedAt !== prev.chat.jobs.benefits?.finishedAt)
  )
    add("portal.onboarding.benefits_checked", {
      result:
        benefits.status === "done"
          ? next.chat.benefits?.network === "out-of-network"
            ? "out_of_network"
            : "verified"
          : benefits.status === "pending"
            ? "pending"
            : benefits.note === "not-found"
              ? "plan_not_found"
              : benefits.note === "unmatched"
                ? "not_matched"
                : "error",
      via: next.chat.benefits?.via ?? (next.payer ? "chosen" : "discovery"),
      member_id_entered: next.chat.receipts.some(
        (item) => item.action === "Added the member ID from your card",
      ),
    });

  if (
    next.paymentSetup.status === "succeeded" &&
    prev.paymentSetup.status !== "succeeded"
  )
    add("portal.onboarding.payment_method_saved", {
      method:
        next.paymentSetup.method?.id === "pm_mock_applepay"
          ? "apple_pay"
          : "card",
    });

  const appointment = next.appointment;
  const before = prev.appointment;
  if (
    appointment?.status === "confirmed" &&
    (before?.id !== appointment.id || before.status !== "confirmed")
  )
    add("portal.appointment.booked", {
      lead_hours: hoursUntil(appointment.start),
      coverage: next.coverage,
    });
  else if (
    appointment &&
    before &&
    appointment.id === before.id &&
    appointment.slotId !== before.slotId
  )
    add("portal.appointment.rescheduled", {
      lead_hours: hoursUntil(appointment.start),
    });

  if (
    next.recordsStatus !== prev.recordsStatus &&
    (next.recordsStatus === "ready" || next.recordsStatus === "unavailable")
  )
    add("portal.records.searched", {
      result: next.recordsStatus === "ready" ? "found" : "none",
      sources: next.chat.recordsFound?.sources.length ?? 0,
    });

  if (next.chartImport && !prev.chartImport) add("portal.chart.imported");

  const status = next.encounter.status;
  if (status !== prev.encounter.status) {
    if (status === "waiting") add("portal.visit.checked_in");
    if (status === "in_progress") add("portal.visit.joined");
    if (status === "completed")
      add("portal.onboarding.first_visit_completed", {
        days_from_booking: daysFromBooking(next),
        source: "encounter",
      });
  }

  if (
    next.carePlan.status === "published" &&
    prev.carePlan.status !== "published"
  )
    add("portal.care_plan.published");

  // One event per prescription DoseSpot sends, or resends.
  const sentBefore = new Set((prev.prescriptions ?? []).map((rx) => rx.id));
  for (const rx of next.prescriptions ?? [])
    if (!sentBefore.has(rx.id))
      add("portal.prescription.sent", { status: rx.status });

  if (
    next.followupAppointment &&
    next.followupAppointment.id !== prev.followupAppointment?.id
  )
    add("portal.followup.booked", {
      weeks_out: weeksOut(next.followupAppointment.start),
    });

  const sent = (s: ChatJourney) =>
    (s.careMessages ?? []).filter((message) => message.sender === "patient")
      .length;
  if (sent(next) > sent(prev)) add("portal.care_message.sent");

  return events;
}

/** When a held time starts, from the preview's inventory. */
const slotStart = (slotId: string) => {
  const { slots, followups } = inventory();
  return [...slots, ...followups].find((slot) => slot.id === slotId)?.start;
};

function daysFromBooking(s: ChatJourney): number | null {
  const booked = s.chat.receipts.find((item) =>
    item.action.startsWith("Booked "),
  )?.at;
  if (!booked) return null;
  return Math.max(
    0,
    Math.round((Date.now() - new Date(booked).getTime()) / 86_400_000),
  );
}

const weeksOut = (iso: string) =>
  Math.max(
    0,
    Math.round((new Date(iso).getTime() - Date.now()) / (7 * 86_400_000)),
  );
