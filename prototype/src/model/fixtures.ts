import type { JourneyState, Profile, Provider, Slot } from "./types";

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
    photo: "/images/maya-chen.png",
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
