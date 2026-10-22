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

/** One medication in a patient's regimen, as the pharmacy's fill history shows it. */
export interface RegimenMed {
  /** Display name: the brand alone for Adderall, otherwise "Generic (Brand)". */
  name: string;
  dose: string;
  schedule: string;
  /** What it treats, in the chart's words. */
  for: string;
}

const adderall = (treats = "ADHD"): RegimenMed => ({ name: "Adderall", dose: "20 mg", schedule: "once every morning", for: treats });
const escitalopram = (treats: string): RegimenMed => ({
  name: "Escitalopram (Lexapro)",
  dose: "10 mg",
  schedule: "once a day",
  for: treats,
});
const sertraline = (treats: string): RegimenMed => ({
  name: "Sertraline (Zoloft)",
  dose: "100 mg",
  schedule: "once every morning",
  for: treats,
});
const prazosin = (): RegimenMed => ({
  name: "Prazosin (Minipress)",
  dose: "2 mg",
  schedule: "once at bedtime",
  for: "PTSD (nightmares)",
});
const lamotrigine = (treats: string): RegimenMed => ({
  name: "Lamotrigine (Lamictal)",
  dose: "200 mg",
  schedule: "once a day",
  for: treats,
});
const hydroxyzine = (treats: string): RegimenMed => ({
  name: "Hydroxyzine (Vistaril)",
  dose: "25 mg",
  schedule: "as needed, up to three times a day",
  for: treats,
});

/** The five conditions a regimen is chosen from; "I'm not sure" and "Other" never pick one. */
const REGIMEN_CONDITIONS = ["ADHD", "Anxiety", "Bipolar Disorder", "Depression", "PTSD"];

/** The lookup key for a set of conditions: the known labels, sorted, joined with "+". */
export function regimenKey(conditions: readonly string[]): string {
  return REGIMEN_CONDITIONS.filter((condition) => conditions.includes(condition)).join("+");
}

/**
 * The fictional medications each demo patient already takes, by the conditions they
 * chose: every combination of the five, so the records, the chart, the plan and the
 * prescriptions all name the same ones.
 */
export const REGIMENS: Record<string, readonly RegimenMed[]> = {
  ADHD: [adderall()],
  Anxiety: [escitalopram("Anxiety")],
  Depression: [sertraline("Depression")],
  PTSD: [sertraline("PTSD"), prazosin()],
  "Bipolar Disorder": [lamotrigine("Bipolar Disorder")],
  "ADHD+Anxiety": [adderall(), escitalopram("Anxiety")],
  "ADHD+Depression": [adderall(), sertraline("Depression")],
  "ADHD+PTSD": [adderall(), sertraline("PTSD"), prazosin()],
  "ADHD+Bipolar Disorder": [adderall(), lamotrigine("Bipolar Disorder")],
  "Anxiety+Depression": [sertraline("Anxiety and Depression")],
  "Anxiety+PTSD": [sertraline("Anxiety and PTSD"), prazosin()],
  "Anxiety+Bipolar Disorder": [lamotrigine("Bipolar Disorder"), hydroxyzine("Anxiety")],
  "Depression+PTSD": [sertraline("Depression and PTSD"), prazosin()],
  "Bipolar Disorder+Depression": [lamotrigine("Bipolar Disorder and Depression")],
  "Bipolar Disorder+PTSD": [lamotrigine("Bipolar Disorder"), prazosin()],
  "ADHD+Anxiety+Depression": [adderall(), sertraline("Anxiety and Depression")],
  "ADHD+Anxiety+PTSD": [adderall(), sertraline("Anxiety and PTSD"), prazosin()],
  "ADHD+Anxiety+Bipolar Disorder": [adderall(), lamotrigine("Bipolar Disorder"), hydroxyzine("Anxiety")],
  "ADHD+Depression+PTSD": [adderall(), sertraline("Depression and PTSD"), prazosin()],
  "ADHD+Bipolar Disorder+Depression": [adderall(), lamotrigine("Bipolar Disorder and Depression")],
  "ADHD+Bipolar Disorder+PTSD": [adderall(), lamotrigine("Bipolar Disorder"), prazosin()],
  "Anxiety+Depression+PTSD": [sertraline("Anxiety, Depression and PTSD"), prazosin()],
  "Anxiety+Bipolar Disorder+Depression": [lamotrigine("Bipolar Disorder and Depression"), hydroxyzine("Anxiety")],
  "Anxiety+Bipolar Disorder+PTSD": [lamotrigine("Bipolar Disorder"), hydroxyzine("Anxiety"), prazosin()],
  "Bipolar Disorder+Depression+PTSD": [lamotrigine("Bipolar Disorder and Depression"), prazosin()],
  "ADHD+Anxiety+Depression+PTSD": [adderall(), sertraline("Anxiety, Depression and PTSD"), prazosin()],
  "ADHD+Anxiety+Bipolar Disorder+Depression": [
    adderall(),
    lamotrigine("Bipolar Disorder and Depression"),
    hydroxyzine("Anxiety"),
  ],
  "ADHD+Anxiety+Bipolar Disorder+PTSD": [adderall(), lamotrigine("Bipolar Disorder"), hydroxyzine("Anxiety and PTSD")],
  "ADHD+Bipolar Disorder+Depression+PTSD": [adderall(), lamotrigine("Bipolar Disorder and Depression"), prazosin()],
  "Anxiety+Bipolar Disorder+Depression+PTSD": [
    lamotrigine("Bipolar Disorder and Depression"),
    hydroxyzine("Anxiety"),
    prazosin(),
  ],
  "ADHD+Anxiety+Bipolar Disorder+Depression+PTSD": [
    adderall(),
    lamotrigine("Bipolar Disorder and Depression"),
    hydroxyzine("Anxiety and PTSD"),
  ],
};

/** For patients who chose only "I'm not sure" or "Other": a common starting SSRI from a previous prescriber. */
export const REGIMEN_FALLBACK: readonly RegimenMed[] = [
  { name: "Sertraline (Zoloft)", dose: "50 mg", schedule: "once every morning", for: "Mood and anxiety" },
];

/**
 * A controlled medication: a stimulant. Legion verifies the patient's photo ID before one is sent,
 * and in Texas a physician writes it. Takes a name or a prescription line ("Adderall 20 mg …").
 */
export const isControlled = (medication: string) => /^Adderall\b/.test(medication);

/** The medications a patient with these conditions takes. Order and "I'm not sure" or "Other" don't matter. */
export function regimenFor(conditions: readonly string[]): readonly RegimenMed[] {
  return REGIMENS[regimenKey(conditions)] ?? REGIMEN_FALLBACK;
}

/** The prescription DoseSpot sends for one medication: "Adderall 20 mg once every morning". */
export const prescriptionFor = (med: RegimenMed) => `${med.name} ${med.dose} ${med.schedule}`;

/** "Adderall 20 mg once every morning; Escitalopram (Lexapro) 10 mg once a day". */
export function regimenLine(meds: readonly RegimenMed[]): string {
  return meds.map(prescriptionFor).join("; ");
}

/** A medication mid-sentence: "escitalopram (Lexapro) 10 mg". A brand on its own, like Adderall, keeps its capital. */
export const medInSentence = (text: string) => (/^[A-Z][a-z]+ \(/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

/** "Adderall 20 mg and escitalopram (Lexapro) 10 mg", as a sentence names them; without doses when none are given. */
export function medsInSentence(meds: readonly { name: string; dose?: string }[]): string {
  const named = meds.map((med) => medInSentence(med.dose ? `${med.name} ${med.dose}` : med.name));
  return named.length <= 1 ? (named[0] ?? "") : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/** How the family clinic's chart names each intake choice. */
const DIAGNOSES: Record<string, string> = {
  ADHD: "ADHD, combined type",
  Anxiety: "Generalized anxiety disorder",
  Depression: "Major depressive disorder",
  PTSD: "Post-traumatic stress disorder",
  "Bipolar Disorder": "Bipolar II disorder",
};

/**
 * The fictional chart Epic MyChart shares: the family clinic's diagnoses for the conditions the
 * patient chose, and the same regimen the pharmacy fills, so the chart never disagrees with the records.
 */
export function mychartChart(conditions: readonly string[]) {
  const diagnoses = REGIMEN_CONDITIONS.filter((condition) => conditions.includes(condition)).map((c) => DIAGNOSES[c]);
  return {
    // The starting SSRI's reason, for a patient who chose none of the five.
    conditions: [...(diagnoses.length ? diagnoses : ["Anxiety with depressed mood"]), "Seasonal allergies"],
    medications: [...regimenFor(conditions).map((med) => `${med.name} ${med.dose} ${med.schedule}`), "Cetirizine 10 mg as needed"],
    allergies: ["Penicillin (rash)"],
    labResults: 6,
    visitNotes: 3,
  };
}
