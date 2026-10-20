import type { Step } from "./types";

export type FlowPhase =
  | "fit"
  | "match"
  | "details"
  | "prepare"
  | "visit"
  | "continue";
export interface FlowEntry {
  id: Step;
  title: string;
  phase: FlowPhase;
  description: string;
  integration: string;
}
export const PHASES: { id: FlowPhase; title: string; description: string }[] = [
  {
    id: "fit",
    title: "A good fit",
    description: "Screen for safe, appropriate care and understand the goal.",
  },
  {
    id: "match",
    title: "Your care, your time",
    description:
      "See a suitable provider, transparent cost, and real availability.",
  },
  {
    id: "details",
    title: "Make it yours",
    description: "Save one detail at a time and confirm the appointment.",
  },
  {
    id: "prepare",
    title: "Feel ready",
    description: "Prepare together without making optional records a blocker.",
  },
  {
    id: "visit",
    title: "Meet your provider",
    description: "Reach, join, and complete the first appointment.",
  },
  {
    id: "continue",
    title: "Keep moving forward",
    description: "Leave with a plan, ongoing support, and a next step.",
  },
];
export const FLOW_GROUPS = PHASES;
export const FLOW: FlowEntry[] = [
  {
    id: "welcome",
    title: "A little support changes a lot",
    phase: "fit",
    description:
      "Understand the journey, the time it takes, and the end goal: your first visit.",
    integration: "Local session; no account required",
  },
  {
    id: "fit-state",
    title: "Where will you receive care?",
    phase: "fit",
    description:
      "Confirm the state where the patient will be during virtual visits.",
    integration: "Mock service-area rules",
  },
  {
    id: "fit-age",
    title: "Are you 18 or older?",
    phase: "fit",
    description: "Route adults into the supported care model.",
    integration: "Mock eligibility rules; aggregate outcome event",
  },
  {
    id: "fit-coverage",
    title: "Do you have Medicare or Medicaid?",
    phase: "fit",
    description:
      "Explain coverage limits before the patient invests more effort.",
    integration: "Mock practice acceptance rules",
  },
  {
    id: "fit-safety",
    title: "First, a quick safety check",
    phase: "fit",
    description:
      "Route urgent needs to immediate support with an actionable exit.",
    integration: "Fixed screening demonstration; clinical validation required",
  },
  {
    id: "fit-history",
    title: "Any recent hospital stays?",
    phase: "fit",
    description:
      "Identify support needs that fall outside this demonstrated care model.",
    integration: "Mock clinical routing policy",
  },
  {
    id: "fit-virtual",
    title: "Does virtual care work for you?",
    phase: "fit",
    description: "Set expectations for private video visits.",
    integration: "Draft persistence",
  },
  {
    id: "fit-exit",
    title: "Find the right support",
    phase: "fit",
    description:
      "A clear, compassionate route for unsupported or urgent needs.",
    integration: "Outcome category kept separate from abandonment",
  },
  {
    id: "needs",
    title: "What brings you here?",
    phase: "fit",
    description:
      "Select every relevant condition from Legion’s existing intake choices, with unsure and other options.",
    integration:
      "Multiple condition selections saved to the draft; no clinical answers in analytics",
  },
  {
    id: "goal",
    title: "What would feeling better look like?",
    phase: "fit",
    description: "Capture a short patient goal to carry into the visit.",
    integration: "Draft persistence; optional later care brief input",
  },
  {
    id: "coverage",
    title: "How will you pay for care?",
    phase: "match",
    description: "Separate self-pay pricing from an insurance estimate early.",
    integration: "Sohar mock status; self-pay skips eligibility lookup",
  },
  {
    id: "match",
    title: "Meet your potential provider",
    phase: "match",
    description:
      "Put clinician, next availability, cost, and concrete match reasons in view.",
    integration:
      "Mock provider directory and scheduling adapter; no opaque AI ranking",
  },
  {
    id: "slots",
    title: "Find a time that fits",
    phase: "match",
    description:
      "Book, reschedule, or recover from a slot conflict with explicit Central Time.",
    integration:
      "Scheduling mock; temporary reservation versus confirmed appointment",
  },
  {
    id: "name",
    title: "What’s your name?",
    phase: "details",
    description:
      "Collect the name needed for a care record, with keyboard-friendly advance.",
    integration: "Incremental draft profile",
  },
  {
    id: "birth",
    title: "What’s your date of birth?",
    phase: "details",
    description:
      "Use numeric fields and validation to match records accurately.",
    integration: "Local date validation; mock identity matching",
  },
  {
    id: "address",
    title: "Where do you live?",
    phase: "details",
    description:
      "Collect the address needed for care and billing, with autofill support.",
    integration: "Incremental draft profile",
  },
  {
    id: "insurance",
    title: "Let’s check your coverage",
    phase: "details",
    description:
      "Collect member details only when needed and preserve a clear pending state.",
    integration: "Sohar mock eligibility; unresolved never becomes verified",
  },
  {
    id: "email",
    title: "What’s your email?",
    phase: "details",
    description:
      "Explain that this is for the visit link and care updates; use the email keyboard.",
    integration: "Draft-to-account association through mock Auth",
  },
  {
    id: "phone",
    title: "What’s your phone number?",
    phase: "details",
    description:
      "Format as typed, use the telephone keypad, and separate optional text reminders.",
    integration: "Mock Auth; explicit SMS preference",
  },
  {
    id: "review",
    title: "Your first visit, ready to book",
    phase: "details",
    description:
      "Review provider, time, price, agreements, and demo payment setup in one place.",
    integration:
      "Mock Auth + payment setup + idempotent scheduling confirmation",
  },
  {
    id: "confirmed",
    title: "You’re booked",
    phase: "prepare",
    description:
      "Confirm the appointment and make preparation feel achievable.",
    integration: "Confirmed appointment is the source of truth",
  },
  {
    id: "records",
    title: "Bring your story with you",
    phase: "prepare",
    description:
      "Offer permission-based records retrieval with skip and unavailable recovery.",
    integration: "Metriport mock; no lookup after a decline",
  },
  {
    id: "brief",
    title: "Let’s get your provider up to speed",
    phase: "prepare",
    description:
      "Review, correct, and approve a short care brief with source context.",
    integration:
      "Mock AI draft; patient-reviewed; no prescribing or clinical decision",
  },
  {
    id: "visit-home",
    title: "Your visit is coming up",
    phase: "prepare",
    description:
      "A single home for the visit link, readiness, rescheduling, and support.",
    integration: "Appointment, preparation, and reminder state",
  },
  {
    id: "reminders",
    title: "A helpful nudge, your way",
    phase: "prepare",
    description:
      "Preview confirmation, day-before, and visit-time reminders without sending them.",
    integration: "Mock reminder outbox; channel preference respected",
  },
  {
    id: "device",
    title: "A quick check before you join",
    phase: "visit",
    description:
      "Preview camera, microphone, and connection checks with a recovery route.",
    integration: "Simulated video checks; no device permissions requested",
  },
  {
    id: "waiting",
    title: "You’re in the right place",
    phase: "visit",
    description: "Set waiting-room expectations and keep help within reach.",
    integration: "Mock video room; joined is not completed",
  },
  {
    id: "visit",
    title: "Time to talk",
    phase: "visit",
    description:
      "Demonstrate a collaborative first appointment and connection recovery.",
    integration: "Mock video; clinician-originated encounter completion",
  },
  {
    id: "complete",
    title: "A plan you can move forward with",
    phase: "continue",
    description:
      "Show a reviewed visit summary, next steps, and a way to ask questions.",
    integration:
      "Encounter completion event; fictional plan, no medication order",
  },
  {
    id: "followup",
    title: "Keep your care connected",
    phase: "continue",
    description:
      "Choose a follow-up with the same provider after the first visit is complete.",
    integration: "Mock follow-up scheduling; separate appointment identity",
  },
  {
    id: "feedback",
    title: "How did that feel?",
    phase: "continue",
    description:
      "Capture experience feedback and offer support when the visit fell short.",
    integration: "Local feedback; simulated care-team message, nothing sent",
  },
];
