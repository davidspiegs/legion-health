import type { JourneyState, Profile, Provider, Slot, Step } from "./types";

const reviewFitAnswers: readonly [Step, string][] = [
  ["fit-state", "yes"],
  ["fit-age", "yes"],
  ["fit-coverage", "no"],
  ["fit-safety", "no"],
  ["fit-history", "no"],
  ["fit-virtual", "yes"],
];

/** Seed completed prerequisites for a review jump, never the question being reviewed. */
export function reviewIntakeAnswers(
  step: Step,
): Pick<JourneyState, "fit" | "conditions" | "goal"> {
  if (step === "welcome" || step === "fit-exit") {
    return { fit: {}, conditions: [], goal: "" };
  }
  const fitIndex = reviewFitAnswers.findIndex(([id]) => id === step);
  const completedFit = fitIndex >= 0 ? fitIndex : reviewFitAnswers.length;
  return {
    fit: Object.fromEntries(reviewFitAnswers.slice(0, completedFit)),
    conditions: fitIndex >= 0 || step === "needs" ? [] : ["ADHD"],
    goal:
      fitIndex >= 0 || step === "needs" || step === "goal"
        ? ""
        : "Understand what’s going on",
  };
}

// Exact choices observed in Legion's current intake, including its two open-ended routes.
export const CONDITION_OPTIONS = [
  "ADHD",
  "Depression",
  "Anxiety",
  "Bipolar Disorder",
  "PTSD",
  "I'm not sure",
  "Other",
] as const;

/** Only restore explicit condition selections; never infer a diagnosis from a legacy symptom topic. */
export function normalizeConditions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return CONDITION_OPTIONS.filter((condition) => value.includes(condition));
}

export function toggleCondition(
  selected: string[],
  condition: string,
): string[] {
  return normalizeConditions(
    selected.includes(condition)
      ? selected.filter((item) => item !== condition)
      : [...selected, condition],
  );
}

export const sampleProfile: Profile = {
  firstName: "Alex",
  lastName: "Rivera",
  month: "8",
  day: "14",
  year: "1993",
  address: "100 Example Lane",
  city: "Austin",
  zip: "78701",
  email: "alex@example.com",
  phone: "2025550147",
  sms: true,
};

export const providers: Provider[] = [
  {
    id: "maya",
    name: "Maya Chen",
    firstName: "Maya",
    initials: "MC",
    title: "Psychiatric nurse practitioner",
    photo: "/images/maya-chen.jpg",
    focuses: ["ADHD", "Anxiety", "Life transitions"],
    description:
      "A thoughtful, collaborative approach. We’ll find a plan that fits your everyday life.",
  },
  {
    id: "jordan",
    name: "Jordan Ellis",
    firstName: "Jordan",
    initials: "JE",
    title: "Psychiatric nurse practitioner",
    focuses: ["ADHD", "Depression", "Sleep"],
    description:
      "Practical support, clear explanations, and space to ask every question.",
  },
];

export const slots: Slot[] = [
  {
    id: "maya-oct22-0900",
    providerId: "maya",
    start: "2026-10-22T09:00:00-05:00",
  },
  {
    id: "maya-oct22-1130",
    providerId: "maya",
    start: "2026-10-22T11:30:00-05:00",
  },
  {
    id: "maya-oct22-1600",
    providerId: "maya",
    start: "2026-10-22T16:00:00-05:00",
  },
  {
    id: "maya-oct23-1000",
    providerId: "maya",
    start: "2026-10-23T10:00:00-05:00",
  },
  {
    id: "maya-oct23-1430",
    providerId: "maya",
    start: "2026-10-23T14:30:00-05:00",
  },
  {
    id: "maya-oct26-0900",
    providerId: "maya",
    start: "2026-10-26T09:00:00-05:00",
  },
  {
    id: "maya-oct26-1530",
    providerId: "maya",
    start: "2026-10-26T15:30:00-05:00",
  },
  {
    id: "jordan-oct22-1030",
    providerId: "jordan",
    start: "2026-10-22T10:30:00-05:00",
  },
  {
    id: "jordan-oct23-0900",
    providerId: "jordan",
    start: "2026-10-23T09:00:00-05:00",
  },
  {
    id: "jordan-oct26-1300",
    providerId: "jordan",
    start: "2026-10-26T13:00:00-05:00",
  },
];

// Daylight saving ends November 1. Follow-ups deliberately use the winter offset.
export const followupSlots: Slot[] = [
  {
    id: "maya-nov05-0900",
    providerId: "maya",
    start: "2026-11-05T09:00:00-06:00",
  },
  {
    id: "maya-nov05-1430",
    providerId: "maya",
    start: "2026-11-05T14:30:00-06:00",
  },
  {
    id: "maya-nov06-1100",
    providerId: "maya",
    start: "2026-11-06T11:00:00-06:00",
  },
  {
    id: "jordan-nov05-1030",
    providerId: "jordan",
    start: "2026-11-05T10:30:00-06:00",
  },
  {
    id: "jordan-nov06-0900",
    providerId: "jordan",
    start: "2026-11-06T09:00:00-06:00",
  },
];

/**
 * The conversation generates its own fictional inventory relative to today, so
 * a reviewer never sees past dates. Registering it here lets the existing
 * scheduling adapter validate holds and bookings exactly as it does for fixtures.
 */
export function extendInventory(extra: {
  providers?: Provider[];
  slots?: Slot[];
  followupSlots?: Slot[];
}) {
  const add = <T extends { id: string }>(target: T[], items: T[] = []) => {
    for (const item of items)
      if (!target.some((existing) => existing.id === item.id)) target.push(item);
  };
  add(providers, extra.providers);
  add(slots, extra.slots);
  add(followupSlots, extra.followupSlots);
}

export function getProvider(id: string): Provider {
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error("Choose a provider to continue.");
  return provider;
}

export function getSlot(id: string): Slot {
  const slot = [...slots, ...followupSlots].find((item) => item.id === id);
  if (!slot) throw new Error("Choose an available appointment time.");
  return slot;
}

function dateValue(value: string | Slot): Date {
  const start =
    typeof value === "string"
      ? ([...slots, ...followupSlots].find((slot) => slot.id === value)
          ?.start ?? value)
      : value.start;
  return new Date(start);
}

export function formatDate(value: string | Slot, short = false): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: short ? "short" : "long",
    month: short ? "short" : "long",
    day: "numeric",
  }).format(dateValue(value));
}

export function formatTime(value: string | Slot): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  }).format(dateValue(value));
}

export function formatSlot(
  id: string,
  { short = false }: { short?: boolean } = {},
): string {
  return `${formatDate(id, short)} · ${formatTime(id)} CT`;
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function validateBirth(
  profile: Pick<Profile, "month" | "day" | "year">,
): string {
  const { month, day, year } = profile;
  if (
    !/^\d{1,2}$/.test(month) ||
    !/^\d{1,2}$/.test(day) ||
    !/^\d{4}$/.test(year)
  )
    return "Enter your full date of birth.";
  const m = Number(month),
    d = Number(day),
    y = Number(year);
  const birth = new Date(Date.UTC(y, m - 1, d));
  if (
    birth.getUTCFullYear() !== y ||
    birth.getUTCMonth() !== m - 1 ||
    birth.getUTCDate() !== d ||
    y < 1900
  )
    return "Check your date of birth.";
  const today = new Date();
  // A date in the future is a typo, not a minor.
  if (birth > today) return "Check your date of birth.";
  const adultCutoff = new Date(
    Date.UTC(
      today.getUTCFullYear() - 18,
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  );
  if (birth > adultCutoff)
    return "Legion currently cares for adults 18 and older.";
  return "";
}

export function initialState(): JourneyState {
  return {
    version: 1,
    step: "welcome",
    history: [],
    scenario: "standard",
    fit: {},
    exitReason: "",
    conditions: [],
    topic: "",
    goal: "",
    coverage: "selfpay",
    payer: "",
    memberId: "",
    profile: {
      firstName: "",
      lastName: "",
      month: "",
      day: "",
      year: "",
      address: "",
      city: "",
      zip: "",
      email: "",
      phone: "",
      sms: false,
    },
    providerId: "maya",
    slotId: "",
    eligibility: { status: "unverified", estimate: null },
    reservation: null,
    paymentReady: false,
    paymentSetup: { id: null, status: "empty", method: null },
    financialConsent: false,
    portalAuth: { status: "signed_out", codeExpiresAt: null },
    notifications: [],
    clock: null,
    healthReviewed: false,
    medications: "",
    allergies: "",
    currentLocation: "",
    callbackConfirmed: false,
    encounter: {
      status: "not_started",
      connection: "disconnected",
      clinicianStatus: "not_present",
    },
    carePlan: { status: "unavailable", followupWeeks: 2 },
    appointment: null,
    followupAppointment: null,
    bookingMode: "first",
    agreements: false,
    recordsPermission: false,
    recordsStatus: "idle",
    recordsReviewed: false,
    briefGoal: "",
    briefNote: "",
    outdatedRecord: false,
    briefApproved: false,
    deviceReady: false,
    emailReminder: true,
    reminderScheduled: false,
    followupReminderScheduled: false,
    visitDay: false,
    micOn: true,
    cameraOn: true,
    visitPhase: 0,
    rating: 0,
    feedback: "",
    feedbackSaved: false,
    careMessage: "",
    careMessages: [],
    events: [],
    faultsUsed: [],
  };
}

/** The texted sign-in code in this preview; any other code is rejected. */
export const PREVIEW_CODE = "246810";

/** The fictional record the identity network returns for the preview persona. */
export const VERIFIED_RECORD = {
  firstName: "Alex",
  lastName: "Rivera",
  address: "418 Maple Hollow Dr",
  city: "Austin",
  zip: "78745",
  sexAtBirth: "Female" as const,
};

/** What insurance discovery finds when the patient doesn't know their plan or member ID. */
export const DISCOVERED_PLAN = { payer: "Blue Cross Blue Shield of Texas", memberId: "W2N48217" };

/** The pharmacy's NCPDP ID in DoseSpot (fictional). */
export const PHARMACY_NCPDP_ID = "4512783";

/** The fictional chart Epic MyChart shares for the preview persona. */
export const MYCHART_CHART = {
  conditions: ["Generalized anxiety disorder", "Seasonal allergies"],
  medications: ["Sertraline 50 mg daily", "Cetirizine 10 mg as needed"],
  allergies: ["Penicillin (rash)"],
  labResults: 6,
  visitNotes: 3,
};
