import type { Provider, Slot } from "../model/types";
import { extendInventory } from "../model/fixtures";

/**
 * A fictional Texas directory for the preview. Five clinicians have full
 * profiles; the rest exist so the matching receipt reflects a real narrowing
 * (focus, network, and availability) rather than a hand-picked answer.
 */
export interface Clinician extends Provider {
  credential: string;
  languages: string[];
  /** Weekly pattern of opening hours in Central Time, keyed by weekday (0 = Sunday). */
  hours: Partial<Record<number, string[]>>;
  payers: string[];
  intro: string;
}

const ALL_PAYERS = [
  "Aetna",
  "Blue Cross Blue Shield of Texas",
  "Cigna",
  "UnitedHealthcare",
  "Oscar",
];

export const CLINICIANS: Clinician[] = [
  {
    id: "maya",
    name: "Maya Chen",
    firstName: "Maya",
    initials: "MC",
    title: "Psychiatric nurse practitioner",
    credential: "PMHNP-BC",
    photo: "/images/maya-chen.jpg",
    focuses: ["ADHD", "Anxiety", "Life transitions"],
    languages: ["English"],
    description:
      "A thoughtful, collaborative approach. We’ll find a plan that fits your everyday life.",
    intro:
      "I like to understand how things feel day to day before we talk about any plan.",
    hours: {
      1: ["08:30", "17:30", "18:30"],
      2: ["09:00", "18:30"],
      3: ["08:30", "17:30", "19:00"],
      4: ["09:00", "18:30", "19:00"],
      5: ["08:30", "17:30"],
    },
    payers: ALL_PAYERS,
  },
  {
    id: "jordan",
    name: "Jordan Ellis",
    firstName: "Jordan",
    initials: "JE",
    title: "Psychiatric nurse practitioner",
    credential: "PMHNP-BC",
    focuses: ["ADHD", "Depression", "Sleep"],
    languages: ["English"],
    description:
      "Practical support, clear explanations, and space to ask every question.",
    intro: "I’ll always explain the why behind any option we consider.",
    hours: {
      1: ["13:00", "14:30"],
      2: ["13:00", "15:30"],
      4: ["13:00", "14:30", "15:30"],
      6: ["10:00", "11:30"],
    },
    payers: ["Aetna", "Blue Cross Blue Shield of Texas", "UnitedHealthcare"],
  },
  {
    id: "priya",
    name: "Priya Raman",
    firstName: "Priya",
    initials: "PR",
    title: "Psychiatric nurse practitioner",
    credential: "PMHNP-BC",
    focuses: ["Depression", "Anxiety", "PTSD"],
    languages: ["English", "Hindi"],
    description:
      "Room for your whole story, then a plan we build together, one step at a time.",
    intro: "There’s no wrong way to start. We’ll go at a pace that feels right.",
    hours: {
      1: ["09:00", "10:30"],
      2: ["08:30", "10:30", "14:30"],
      3: ["09:00", "13:00"],
      5: ["09:00", "10:30", "14:30"],
    },
    payers: ALL_PAYERS,
  },
  {
    id: "daniel",
    name: "Daniel Okafor",
    firstName: "Daniel",
    initials: "DO",
    title: "Psychiatric nurse practitioner",
    credential: "PMHNP-BC",
    focuses: ["Bipolar Disorder", "Depression", "Anxiety"],
    languages: ["English"],
    description: "Steady, practical care, with the reasoning behind every option.",
    intro: "Mood can be complicated. I’ll help you make sense of the patterns.",
    hours: {
      2: ["17:30", "19:00"],
      3: ["18:30"],
      4: ["17:30"],
      6: ["09:00", "10:30", "12:00"],
    },
    payers: ["Aetna", "Cigna", "UnitedHealthcare", "Oscar"],
  },
  {
    id: "elena",
    name: "Elena Ruiz",
    firstName: "Elena",
    initials: "ER",
    title: "Psychiatric nurse practitioner",
    credential: "PMHNP-BC",
    focuses: ["ADHD", "PTSD", "Anxiety"],
    languages: ["English", "Spanish"],
    description: "Care that respects your pace and your culture. Hablo español.",
    intro: "Many of my patients are adults finding out about ADHD for the first time.",
    hours: {
      1: ["14:30", "17:30"],
      3: ["14:30", "15:30", "18:30"],
      5: ["13:00", "17:30"],
    },
    payers: ["Blue Cross Blue Shield of Texas", "Cigna", "UnitedHealthcare"],
  },
];

/** Directory entries without open profiles this week; they count in the receipt only. */
const BOOKED_OUT: { focuses: string[]; payers: string[] }[] = [
  { focuses: ["ADHD", "Anxiety"], payers: ALL_PAYERS },
  { focuses: ["ADHD", "Depression"], payers: ["Aetna", "Cigna"] },
  { focuses: ["Anxiety", "Depression"], payers: ALL_PAYERS },
  { focuses: ["Bipolar Disorder"], payers: ["Aetna", "UnitedHealthcare"] },
  { focuses: ["PTSD", "Anxiety"], payers: ["Blue Cross Blue Shield of Texas"] },
  { focuses: ["ADHD"], payers: ALL_PAYERS },
  { focuses: ["Depression"], payers: ["Oscar", "Cigna"] },
  { focuses: ["ADHD", "Anxiety", "Depression"], payers: ["Aetna"] },
  { focuses: ["Anxiety"], payers: ["UnitedHealthcare", "Cigna"] },
  { focuses: ["ADHD", "PTSD"], payers: ALL_PAYERS },
  { focuses: ["Depression", "Bipolar Disorder"], payers: ["Blue Cross Blue Shield of Texas", "Aetna"] },
  { focuses: ["Anxiety", "PTSD"], payers: ["Cigna"] },
  { focuses: ["ADHD", "Anxiety"], payers: ["Oscar", "UnitedHealthcare"] },
];

const ZONE = "America/Chicago";

function offsetFor(year: number, month: number, day: number): string {
  // Noon avoids the 2 AM daylight-saving changeover on transition days.
  const probe = new Date(Date.UTC(year, month - 1, day, 17));
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT-06:00";
  const match = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return match ? `${match[1]}:${match[2] ?? "00"}` : "-06:00";
}

function centralDate(base: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(base);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Openings for `days` days in Central Time, starting `fromDay` days from now. */
export function generateSlots(
  now: Date,
  fromDay: number,
  days: number,
  prefix: string,
): Slot[] {
  const result: Slot[] = [];
  for (let offset = fromDay; offset < fromDay + days; offset++) {
    const date = centralDate(new Date(now.getTime() + offset * 86_400_000));
    const zone = offsetFor(date.year, date.month, date.day);
    for (const clinician of CLINICIANS) {
      for (const time of clinician.hours[date.weekday] ?? []) {
        // A little scarcity, decided by date and time alone so a saved slot id
        // still resolves when the inventory is rebuilt on a later day.
        const key = `${clinician.id}${date.year}${date.month}${date.day}${time}`;
        const hash = [...key].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7);
        if (hash % 5 === 0) continue;
        result.push({
          id: `${prefix}-${clinician.id}-${date.year}${pad(date.month)}${pad(date.day)}-${time.replace(":", "")}`,
          providerId: clinician.id,
          start: `${date.year}-${pad(date.month)}-${pad(date.day)}T${time}:00${zone}`,
        });
      }
    }
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}

let registered: { slots: Slot[]; followups: Slot[] } | null = null;

/**
 * Builds and registers the preview inventory once per page load. Past weeks are
 * included so a saved appointment still resolves; matching only offers future times.
 */
export function inventory(now = new Date()) {
  if (!registered) {
    const slots = generateSlots(now, -21, 31, "chat");
    const followups = generateSlots(now, -7, 52, "chat-fu");
    extendInventory({ providers: CLINICIANS, slots, followupSlots: followups });
    registered = { slots, followups };
  }
  return registered;
}

export type TimePreference = "mornings" | "afternoons" | "evenings" | "weekends" | "soonest";

export function centralHour(slot: Slot): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(slot.start)),
  );
}

function centralWeekday(slot: Slot): number {
  return centralDate(new Date(slot.start)).weekday;
}

export function fitsPreference(slot: Slot, prefs: string[]): boolean {
  if (!prefs.length || prefs.includes("soonest")) return true;
  const hour = centralHour(slot);
  const weekday = centralWeekday(slot);
  const weekend = weekday === 0 || weekday === 6;
  return prefs.some((pref) =>
    pref === "weekends"
      ? weekend
      : pref === "mornings"
        ? !weekend && hour < 12
        : pref === "afternoons"
          ? !weekend && hour >= 12 && hour < 17
          : pref === "evenings"
            ? !weekend && hour >= 17
            : false,
  );
}

export interface MatchOffer {
  clinician: Clinician;
  reasons: string[];
  times: Slot[];
}

export interface MatchResult {
  funnel: { label: string; count: number }[];
  offers: MatchOffer[];
  /** Every clinician with an opening that fits, ranked; offers are the first three. */
  ranked: MatchOffer[];
}

const PREF_LABEL: Record<string, string> = {
  mornings: "morning",
  afternoons: "afternoon",
  evenings: "evening",
  weekends: "weekend",
};

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function preferenceLabel(prefs: string[]): string {
  if (!prefs.length || prefs.includes("soonest")) return "Open this week";
  return `${listOf(prefs.map((pref) => PREF_LABEL[pref] ?? pref))} openings`.replace(/^./, (c) => c.toUpperCase());
}

function conditionPhrase(conditions: string[]): string {
  const specific = conditions.filter((c) => c !== "I'm not sure" && c !== "Other");
  if (!specific.length) return "See adults for a first evaluation";
  return `Focus on ${listOf(specific.map((c) => (c === "Bipolar Disorder" ? "bipolar disorder" : c === "ADHD" || c === "PTSD" ? c : c.toLowerCase())))}`;
}

export function match(
  conditions: string[],
  payer: string,
  prefs: string[],
  now = new Date(),
  coverage: "insurance" | "selfpay" = payer ? "insurance" : "selfpay",
): MatchResult {
  const { slots } = inventory(now);
  const specific = conditions.filter((c) => c !== "I'm not sure" && c !== "Other");
  const treats = (focuses: string[]) =>
    !specific.length || specific.some((condition) => focuses.includes(condition));
  const inNetwork = (payers: string[]) => !payer || payers.includes(payer);
  const pool = [
    ...CLINICIANS.map((c) => ({ focuses: c.focuses, payers: c.payers, clinician: c })),
    ...BOOKED_OUT.map((entry) => ({ ...entry, clinician: null })),
  ];
  const focused = pool.filter((entry) => treats(entry.focuses));
  const networked = focused.filter((entry) => inNetwork(entry.payers));
  const earliest = now.getTime() + 2 * 3_600_000;
  const weekEnd = now.getTime() + 8 * 86_400_000;
  const ranked: MatchOffer[] = networked
    .flatMap((entry) => (entry.clinician ? [entry.clinician] : []))
    .map((clinician) => {
      const times = slots.filter(
        (slot) =>
          slot.providerId === clinician.id &&
          new Date(slot.start).getTime() > earliest &&
          new Date(slot.start).getTime() < weekEnd &&
          fitsPreference(slot, prefs),
      );
      const overlap = specific.filter((c) => clinician.focuses.includes(c));
      const reasons = [
        overlap.length
          ? `Focuses on ${listOf(overlap.map((c) => (c === "Bipolar Disorder" ? "bipolar disorder" : c === "ADHD" || c === "PTSD" ? c : c.toLowerCase())))}`
          : "Sees adults for first evaluations",
        payer
          ? `In network with ${payer}`
          : coverage === "insurance"
            ? "Takes most Texas commercial plans"
            : "Self-pay: $250 first visit",
        times.length
          ? prefs.length && !prefs.includes("soonest")
            ? `${preferenceLabel(prefs)} this week`
            : "Openings this week"
          : "No openings that fit this week",
      ];
      if (clinician.languages.length > 1)
        reasons.push(`Speaks ${listOf(clinician.languages)}`);
      return { clinician, reasons, times, overlap: overlap.length };
    })
    .filter((offer) => offer.times.length)
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        a.times[0].start.localeCompare(b.times[0].start),
    )
    .map(({ clinician, reasons, times }) => ({ clinician, reasons, times }));
  const funnel = [
    { label: "Licensed in Texas", count: pool.length },
    { label: conditionPhrase(conditions), count: focused.length },
    ...(payer ? [{ label: `In network with ${payer}`, count: networked.length }] : []),
    { label: preferenceLabel(prefs), count: ranked.length },
  ];
  return { funnel, offers: ranked.slice(0, 3), ranked };
}

export function clinicianById(id: string): Clinician | undefined {
  return CLINICIANS.find((clinician) => clinician.id === id);
}
