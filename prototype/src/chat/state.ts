import type { JourneyState } from "../model/types";
import { initialState } from "../model/fixtures";

/** Work Wren does on the patient’s behalf. Each job renders as a work card with a receipt. */
export type JobId =
  | "match"
  | "hold"
  | "code"
  | "identity"
  | "benefits"
  | "account"
  | "payment"
  | "book"
  | "records"
  | "brief"
  | "idcheck"
  | "followup";

export interface ChatJob {
  status: "idle" | "running" | "done" | "pending" | "failed";
  startedAt?: number;
  finishedAt?: number;
  /** Fingerprint of the inputs behind the result; a change re-runs the job. */
  inputs?: string;
  /** Allowlisted, non-clinical detail for the work card (counts, vendor status codes). */
  note?: string;
}

/** One line in the activity log: what was done, through which source, and when. */
export interface Receipt {
  id: string;
  at: string;
  actor: "Legion AI" | "You" | "Your clinician" | "Care team";
  action: string;
  source: string;
}

export interface Benefits {
  payer: string;
  plan: string;
  memberLast4: string;
  network: "in-network" | "out-of-network" | "unknown";
  copay: number | null;
  deductibleRemaining: number | null;
  /** How the plan was found. */
  via: "discovery" | "chosen";
}

/** The safety question, as in Legion's live flow; "now" is the only item asked today. */
export type ScreenItem = "now";

/** Free text that can carry risk language. */
export type RiskSource = "story" | "other" | "help" | "note" | "medication" | "allergy" | "brief";

/** A follow-up for a person on the care team (a simulated queue in the preview). */
export interface CareTask {
  id: string;
  at: string;
  kind: "risk-review" | "safety-callback" | "coordinator-call" | "post-visit" | "care-team";
  title: string;
  /** When a person should act, in words ("Today", "Within 1 business day"). */
  due: string;
  /** A number the patient gave for this follow-up only. */
  contact?: string;
  status: "open" | "done";
}

/** Something the assistant can do from a reply, shown as a button under it. */
export type AskActionId =
  | "calendar"
  | "reschedule"
  | "message"
  | "support"
  | "checkin-skip"
  | "followup"
  | "join";

/** A question asked once the onboarding questions are done, and the assistant's reply. */
export interface Ask {
  id: string;
  at: string;
  /** The conversation step it follows, so it stays in place as the thread grows. */
  anchor: string;
  question: string;
  answer: string;
  status: "thinking" | "done";
  actions?: AskActionId[];
  /** A message sent to the care team; their reply shows under it. */
  messageId?: string;
  /** Answered again when the visit actually moves, so the conversation confirms it. */
  awaiting?: "move";
}

export interface RecordsFound {
  sources: { name: string; kind: "clinic" | "pharmacy" | "lab"; date: string }[];
  medication: { name: string; dose: string; lastFilled: string; pharmacy: string } | null;
  allergy: string | null;
  pharmacy: { name: string; address: string } | null;
}

export interface ChatState {
  version: 1;
  /** Transcript items already shown, so reloads and edits never replay them. */
  seen: string[];

  // Your story
  intro: "" | "start" | "data" | "person";
  begun: boolean;
  storyMode: "" | "chips" | "words";
  storyText: string;
  storySuggested: string[];
  storyConfirmed: boolean;
  otherText: string;
  otherDone: boolean;
  quickCheck: "" | "all" | "not-all";
  quickCheckFailed: "" | "adult" | "texas" | "video";
  /** The safety answer: "no", "thoughts" (has thoughts, safe right now) or "unsafe". */
  screen: Partial<Record<ScreenItem, string>>;
  /** "Are you safe right now?", asked right after risk language in the patient's own words. */
  safeNow: Partial<Record<"story" | "other", "safe" | "unsafe">>;

  // Your clinician
  payMethod: "" | "insurance" | "selfpay" | "public" | "unsure";
  payerChoice: string;
  availability: string[];
  match: {
    offerIds: string[];
    rankedIds: string[];
    funnel: { label: string; count: number }[];
    /** Why each clinician was suggested, as shown on their card. */
    reasons?: Record<string, string[]>;
  } | null;
  showMore: boolean;
  watchOpenings: boolean;
  slotChosen: boolean;
  holdNotice: "" | "taken" | "expired" | "released" | "not-covered";
  /** The time a re-match let go of, so the card can name it and say why. */
  releasedSlot: string;

  // Booking
  manualDetails: boolean;
  codeSentAt: number | null;
  codeVerified: boolean;
  codeError: string;
  dobEntered: boolean;
  identity: "" | "found" | "not-found" | "confirmed";
  sexAtBirth: "" | "Female" | "Male";
  emailEntered: boolean;
  benefits: Benefits | null;
  benefitsAccepted: boolean;
  benefitsChoice: "" | "selfpay";
  aiNotes: boolean;
  controlledAck: boolean;
  paymentDone: boolean;

  // First visit
  prep: "" | "yes" | "later";
  records: "" | "yes" | "no";
  recordsFound: RecordsFound | null;
  medication: "" | "taking" | "stopped" | "changed" | "none" | "other";
  medicationNote: string;
  allergy: "" | "yes" | "no" | "unsure" | "none" | "other";
  allergyNote: string;
  pharmacy: "" | "suggested" | "other";
  pcp: "" | "share" | "keep" | "none";
  baselineIntro: "" | "start" | "skip";
  baseline: Record<string, number>;
  noteDone: boolean;
  note: string;
  briefApproved: boolean;
  idCheck: "" | "done" | "later";
  readyAck: boolean;
  reminderReply: "" | "confirm" | "reschedule";
  checkinOpen: boolean;
  visitOverlay: boolean;
  afterFeeling: "" | "better" | "same" | "worse";
  followup: "" | "booked" | "later";
  completeSeen: boolean;

  /** Clinical flags for the clinician packet (reason codes only, never free text). */
  flags: string[];
  edits: Record<string, number>;
  /** When each answer was last given (ISO time), for the clinician's view. */
  answeredAt: Record<string, string>;
  /** Questions Wren handed to the clinician instead of answering. */
  questions: string[];
  /** A callback number for this visit only; the account's phone stays as it is. */
  callbackPhone: string;
  /** Free text that matched risk language: where, what, and when. Never removed. */
  riskEvents: { source: RiskSource; text: string; at: string }[];
  /** Follow-ups for the care team, oldest first. */
  tasks: CareTask[];
  /** Every changed answer, oldest first, for the clinician's view. */
  history: { node: string; from: string; to: string; at: string }[];
  /** Product events, oldest first (the measurement plan in the design doc). */
  analytics: { event: string; at: string; props?: Record<string, string | number | boolean> }[];
  /** A birth date showed the patient is under 18, on either details path. */
  ageBlocked: boolean;
  /** The estimate the patient agreed to; consent survives a re-check that returns the same number. */
  agreedEstimate: number | null;
  /** The primary care doctor the patient named when they chose to share a summary. */
  pcpName: string;
  /** The patient chose not to send a pre-visit brief. */
  briefSkipped: boolean;
  /** Visit-day check, asked as two questions. */
  dayMeds: "" | "yes" | "no";
  dayAllergies: "" | "yes" | "no" | "unsure";
  /** At check-in the patient said they're outside Texas. */
  outsideTexas: boolean;
  /** Questions and quick requests after booking, oldest first. */
  asks: Ask[];
  jobs: Partial<Record<JobId, ChatJob>>;
  receipts: Receipt[];
}

export type ChatJourney = JourneyState & { chat: ChatState };

export function initialChat(): ChatState {
  return {
    version: 1,
    seen: [],
    intro: "",
    begun: false,
    storyMode: "",
    storyText: "",
    storySuggested: [],
    storyConfirmed: false,
    otherText: "",
    otherDone: false,
    quickCheck: "",
    quickCheckFailed: "",
    screen: {},
    safeNow: {},
    payMethod: "",
    payerChoice: "",
    availability: [],
    match: null,
    showMore: false,
    watchOpenings: false,
    slotChosen: false,
    holdNotice: "",
    releasedSlot: "",
    manualDetails: false,
    codeSentAt: null,
    codeVerified: false,
    codeError: "",
    dobEntered: false,
    identity: "",
    sexAtBirth: "",
    emailEntered: false,
    benefits: null,
    benefitsAccepted: false,
    benefitsChoice: "",
    aiNotes: false,
    controlledAck: false,
    paymentDone: false,
    prep: "",
    records: "",
    recordsFound: null,
    medication: "",
    medicationNote: "",
    allergy: "",
    allergyNote: "",
    pharmacy: "",
    pcp: "",
    baselineIntro: "",
    baseline: {},
    noteDone: false,
    note: "",
    briefApproved: false,
    idCheck: "",
    readyAck: false,
    reminderReply: "",
    checkinOpen: false,
    visitOverlay: false,
    afterFeeling: "",
    followup: "",
    completeSeen: false,
    flags: [],
    edits: {},
    answeredAt: {},
    questions: [],
    callbackPhone: "",
    riskEvents: [],
    tasks: [],
    history: [],
    analytics: [],
    ageBlocked: false,
    agreedEstimate: null,
    pcpName: "",
    briefSkipped: false,
    dayMeds: "",
    dayAllergies: "",
    outsideTexas: false,
    asks: [],
    jobs: {},
    receipts: [],
  };
}

export function initialChatJourney(): ChatJourney {
  return { ...initialState(), providerId: "", chat: initialChat() };
}

export function jobStatus(s: ChatJourney, job: JobId): ChatJob["status"] {
  return s.chat.jobs[job]?.status ?? "idle";
}

export const PREVIEW_CODE = "246810";

/** Where the preview keeps the conversation in this browser. v2: one safety question. */
export const STORAGE_KEY = "legion-chat-preview-v2";
