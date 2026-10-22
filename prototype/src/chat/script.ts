import { CONDITION_OPTIONS, formatDate, formatTime, validateBirth } from "../model/fixtures";
import { joinAvailability, journeyNow } from "../model/journey-state";
import type { AgentBlock, ChatNode, ChatOption } from "./engine";
import { mentionsCrisis, readStory } from "./guide-ai";
import {
  VERIFIED_RECORD,
  addTask,
  clinicianFirst,
  clinicianName,
  connectChart,
  createAccount,
  followupOptions,
  matchInputs,
  receipt,
  releaseNotice,
  reminderTimes,
  runBenefits,
  runBooking,
  runBrief,
  runHold,
  runIdentity,
  runMatch,
  runRecords,
  runStory,
  sendCode,
  slotLabel,
  track,
  verifyCode,
  type ChatContext,
} from "./agent";
import { PREVIEW } from "./env";
import { RISK_ORDER, SCREEN, addFlags, flagRisk, screenFlags, screenLevel } from "./safety";
import type { ChatJourney, ChatState, RiskSource } from "./state";

export type { ChatContext, ChatPatch } from "./agent";
export type Node = ChatNode<ChatJourney, ChatContext>;

const say = (id: string, text: string): AgentBlock => ({ kind: "text", id, text });
const card = (id: string, name = id): AgentBlock => ({ kind: "card", id, card: name });
const work = (job: string): AgentBlock => ({ kind: "work", id: `work-${job}`, job });

export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const conditionLabel = (c: string) => (c === "Bipolar Disorder" ? "bipolar disorder" : c);
export const booked = (s: ChatJourney) => !!s.appointment && s.appointment.status !== "cancelled";
const preBooking = (s: ChatJourney) => !booked(s);
/** ADHD care where a controlled medication may come up: starting one, or continuing one. */
export const medicationPath = (s: ChatJourney) =>
  s.conditions.includes("ADHD") && (s.goal === "Talk about medication" || s.goal === "Continue my care");

export function priceLine(s: ChatJourney): string {
  if (s.coverage === "selfpay" || s.chat.benefitsChoice === "selfpay")
    return "$250 after your first visit";
  if (s.chat.benefits?.copay != null)
    return `your $${s.chat.benefits.copay} estimated copay after your visit`;
  return "your plan’s share after your visit";
}

// Booked visits are labeled from their own start time; inventory rolls forward and forgets old slots.
export function appointmentWhen(s: ChatJourney): string {
  return s.appointment ? `${formatDate(s.appointment.start)} at ${formatTime(s.appointment.start)}` : "";
}

const centralDay = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(time);

function appointmentDay(s: ChatJourney): string {
  if (!s.appointment) return "your visit";
  const start = new Date(s.appointment.start).getTime();
  if (centralDay(start) === centralDay(journeyNow(s))) return "your visit today";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long" }).format(start);
}

const visitLabel = (iso: string) => `${formatDate(iso, true)}, ${formatTime(iso)}`;

/** Risk language was found in this free text at some point; the record of it never goes away. */

/** Said right after risk language in free text, before anything else. */
const CARE_FIRST =
  "Thank you for telling me that. You don’t have to carry it alone, and people are ready to talk right now.";

/** Said after risk language once a visit is booked: the visit stays on, and a person follows up. */
const CARE_BOOKED =
  "Thank you for telling me. I’ve asked your care team to check in with you today, and your visit is still on. If you’re in danger right now, call 911.";


function formatPhoneMasked(raw: string, mask = true): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 10) return raw;
  // Non-breaking space and hyphen keep a phone number on one line.
  return mask
    ? `(${d.slice(0, 3)})\u00a0•••\u2011${d.slice(6)}`
    : `(${d.slice(0, 3)})\u00a0${d.slice(3, 6)}\u2011${d.slice(6)}`;
}

// =============================================================== Your story

const hello: Node = {
  id: "hello",
  stage: "story",
  say: () => [
    say(
      "hi",
      "Hi, I’m Wren. I’ll help you find a psychiatric clinician, see your cost upfront, and get ready for your first visit.",
    ),
    card("disclosure"),
  ],
  input: () => ({
    kind: "single",
    options: [
      { value: "person", label: "Talk to a person" },
      { value: "start", label: "Let’s get started", primary: true },
    ],
  }),
  answer: (s) =>
    s.chat.intro
      ? {
          text:
            s.chat.intro === "start"
              ? "Let’s get started"
              : s.chat.intro === "data"
                ? "How is my information used?"
                : "Talk to a person",
          editable: false,
        }
      : null,
  after: (s) =>
    s.chat.intro === "data"
      ? [card("data-use"), say("ready", "Ready when you are.")]
      : s.chat.intro === "person"
        ? [card("person"), say("ready", "Or we can start now, and the care team will see everything you share.")]
        : [],
  submit: (value, ctx) =>
    ctx.update({ chat: { intro: value as ChatState["intro"], begun: value === "start" } }),
};

const helloReady: Node = {
  id: "hello-ready",
  stage: "story",
  applies: (s) => s.chat.intro === "data" || s.chat.intro === "person",
  say: () => [],
  input: () => ({
    kind: "single",
    options: [{ value: "start", label: "Let’s get started", primary: true }],
  }),
  answer: (s) => (s.chat.begun ? { text: "Let’s get started", editable: false } : null),
  submit: (_value, ctx) => ctx.update({ chat: { begun: true } }),
};

const CONDITION_CHOICES: ChatOption[] = CONDITION_OPTIONS.map((condition) => ({
  value: condition,
  label: condition === "Bipolar Disorder" ? "Bipolar disorder" : condition.replace("'", "’"),
  icon: condition,
}));

const story: Node = {
  id: "story",
  stage: "story",
  why: "So your clinician knows where to start, and so I can suggest clinicians who focus on it.",
  say: () => [say("ask", "What would you like help with? Choose any that fit.")],
  input: (s) =>
    s.chat.storyMode === "words"
      ? {
          kind: "text",
          mode: "text",
          label: "What you’d like help with, in your own words",
          placeholder: "In your own words",
          submit: "Send",
          maxLength: 600,
          alternate: { label: "Choose from a list instead", value: "__chips" },
        }
      : {
          kind: "multi",
          layout: "grid",
          confirm: "Continue",
          exclusive: ["I'm not sure"],
          options: CONDITION_CHOICES,
          alternate: { label: "Tell me in my own words", value: "__words" },
        },
  value: (s) =>
    s.chat.storyMode === "words"
      ? s.chat.storyText
      : s.conditions.length
        ? s.conditions
        : s.chat.storySuggested,
  answer: (s) => {
    if (s.chat.storyMode === "words" && s.chat.storyText)
      return { text: s.chat.storyText, editable: preBooking(s) };
    if (s.chat.storyMode === "chips" && s.conditions.length)
      return { text: listOf(s.conditions.map(conditionLabel)), editable: preBooking(s) };
    return null;
  },
  after: (s) => {
    if (s.chat.storyMode === "words") {
      if (storyRisk(s)) return [say("care", CARE_FIRST), card("support-line")];
      // Wren is typing while Claude reads the words.
      return readingStory(s) ? [] : reflection(s);
    }
    const unsure = s.conditions.length === 1 && s.conditions[0] === "I'm not sure";
    return [
      say(
        "ack",
        unsure
          ? "That’s okay. Working it out together is what a first visit is for."
          : "Thanks. That helps me find the right clinician for you.",
      ),
    ];
  },
  submit: async (value, ctx) => {
    if (value === "__words") {
      ctx.update({ chat: { storyMode: "words", storyConfirmed: false } });
      return false;
    }
    if (value === "__chips") {
      ctx.update({ chat: { storyMode: "chips", storyConfirmed: false } });
      return false;
    }
    if (Array.isArray(value))
      return ctx.update({ conditions: value, chat: { storyMode: "chips", storyConfirmed: false } });
    await runStory(ctx, value);
    // Risk language doesn't stop the conversation; it asks about safety right away.
    if (storyRisk(ctx.get())) flagRisk(ctx, "story", value);
  },
};

/** Risk language in the story: the local check's, or one Claude's reading added. */
const storyRisk = (s: ChatJourney) => s.chat.storyCrisis || mentionsCrisis(s.chat.storyText);

/** Claude is reading the patient's words; the read-back and its question wait. */
export const readingStory = (s: ChatJourney) => s.chat.jobs.story?.status === "running";

/** The patient's own words, read back as a starting point, never a diagnosis. */
function reflection(s: ChatJourney): AgentBlock[] {
  // The stored reading; a conversation saved before readings were stored reads the words again.
  const local = s.chat.storyReflection && s.chat.storySuggested.length ? null : readStory(s.chat.storyText);
  const conditions = local?.conditions ?? s.chat.storySuggested;
  return [
    say("reflect", local?.reflection ?? s.chat.storyReflection),
    say(
      "noted",
      conditions[0] === "I'm not sure"
        ? "I’ll tell your clinician you’re not sure yet what to call it. Did I get that right?"
        : `I’ll note ${listOf(conditions.map((c) => (c === "Other" ? "what you described" : conditionLabel(c))))} for your clinician as a starting point, not a diagnosis. Did I get that right?`,
    ),
  ];
}


const storyConfirm: Node = {
  id: "story-confirm",
  stage: "story",
  applies: (s) => s.chat.storyMode === "words" && !!s.chat.storyText,
  // After risk language, the read-back waits until safety has been asked.
  say: (s) => (storyRisk(s) ? reflection(s) : []),
  input: (s) =>
    readingStory(s)
      ? null
      : {
          kind: "single",
          options: [
            { value: "choose", label: "Not quite" },
            { value: "right", label: "Yes, that’s right" },
          ],
        },
  answer: (s) => (s.chat.storyConfirmed ? { text: "Yes, that’s right", editable: false } : null),
  submit: (value, ctx) => {
    const suggested = ctx.get().chat.storySuggested;
    if (value === "right")
      return ctx.update({ conditions: suggested, chat: { storyConfirmed: true } });
    // The suggestion is preselected so choosing is a correction, not a restart.
    // The patient's own words stay with the brief.
    ctx.update({ conditions: [], chat: { storyMode: "chips", storyConfirmed: false } });
  },
};

const storyOther: Node = {
  id: "story-other",
  stage: "story",
  applies: (s) => s.chat.storyMode === "chips" && s.conditions.includes("Other"),
  say: () => [say("ask", "What else would you like help with? A few words is plenty.")],
  input: () => ({
    kind: "text",
    mode: "text",
    label: "Something else you’d like help with",
    placeholder: "For example, trouble sleeping",
    submit: "Send",
    maxLength: 160,
    skip: "Skip",
  }),
  value: (s) => s.chat.otherText,
  answer: (s) =>
    s.chat.otherDone ? { text: s.chat.otherText || "Skipped", editable: preBooking(s) } : null,
  after: (s) => (mentionsCrisis(s.chat.otherText) ? [say("care", CARE_FIRST), card("support-line")] : []),
  submit: (value, ctx) => {
    const text = String(value);
    ctx.update({ chat: { otherText: text, otherDone: true } });
    if (mentionsCrisis(text)) flagRisk(ctx, "other", text);
  },
};

const GOALS: ChatOption[] = [
  { value: "Understand what’s going on", label: "Understand what’s going on" },
  { value: "Talk about medication", label: "Talk about medication" },
  { value: "Continue my care", label: "Continue care I already have" },
];

const goal: Node = {
  id: "goal",
  stage: "story",
  why: "It shapes how your clinician spends your first visit with you.",
  say: () => [say("ask", "What would make your first visit worthwhile?")],
  input: () => ({ kind: "single", layout: "stack", options: GOALS }),
  value: (s) => s.goal,
  answer: (s) =>
    s.goal
      ? { text: GOALS.find((g) => g.value === s.goal)?.label ?? s.goal, editable: preBooking(s) }
      : null,
  after: (s) => [
    say(
      "ack",
      s.goal === "Talk about medication"
        ? "Okay. Your clinician will talk through options with you. Whether medication is right is their decision, made together with you."
        : s.goal === "Continue my care"
          ? "Good to know. Your clinician will want to hear what’s worked so far."
          : "That’s a good place to start.",
    ),
  ],
  submit: (value, ctx) => ctx.update({ goal: String(value) }),
};

const QUICK = {
  adult: { label: "I’m under 18", exit: "age", fit: "fit-age" },
  texas: { label: "I won’t be in Texas", exit: "state", fit: "fit-state" },
  video: { label: "I need to be seen in person", exit: "virtual", fit: "fit-virtual" },
} as const;

const quick: Node = {
  id: "quick",
  stage: "story",
  why: "Legion’s clinicians are licensed in Texas and care for adults by video.",
  say: () => [
    say("ask", "A few quick checks. Are all of these true for you?"),
    card("quick-list"),
  ],
  input: () => ({
    kind: "confirm-list",
    items: ["I’m 18 or older", "I’ll be in Texas for my visits", "Video visits work for me"],
    yes: "Yes, all true",
    no: "Not all of them",
  }),
  value: (s) => s.chat.quickCheck,
  answer: (s) =>
    s.chat.quickCheck
      ? { text: s.chat.quickCheck === "all" ? "Yes, all true" : "Not all of them", editable: preBooking(s) }
      : null,
  submit: (value, ctx) => {
    if (value === "yes")
      return ctx.update({
        fit: { ...ctx.get().fit, "fit-age": "yes", "fit-state": "yes", "fit-virtual": "yes" },
        exitReason: "",
        chat: { quickCheck: "all", quickCheckFailed: "" },
      });
    ctx.update({ chat: { quickCheck: "not-all", quickCheckFailed: "" } });
  },
};

const quickWhich: Node = {
  id: "quick-which",
  stage: "story",
  applies: (s) => s.chat.quickCheck === "not-all",
  say: () => [say("ask", "Which one isn’t true for you right now?")],
  input: () => ({
    kind: "single",
    layout: "stack",
    options: Object.entries(QUICK).map(([value, item]) => ({ value, label: item.label })),
  }),
  answer: (s) =>
    s.chat.quickCheckFailed ? { text: QUICK[s.chat.quickCheckFailed].label, editable: true } : null,
  after: () => [card("fit-exit")],
  halts: () => true,
  submit: (value, ctx) => {
    const key = value as keyof typeof QUICK;
    ctx.update({
      fit: { ...ctx.get().fit, [QUICK[key].fit]: "no" },
      exitReason: QUICK[key].exit,
      chat: { quickCheckFailed: key },
    });
  },
};

/** Follow-ups a person owns after a safety answer with risk, queued once each. */
function queueSafetyTasks(ctx: ChatContext, screen: ChatState["screen"]) {
  const level = screenLevel(screen);
  const wanted =
    level === "high"
      ? { title: "Review a patient who said they’re not safe right now", due: "Today" }
      : level === "moderate"
        ? { title: "Check in about thoughts of harm", due: "Within 1 business day" }
        : null;
  if (!wanted || ctx.get().chat.tasks.some((task) => task.title === wanted.title)) return;
  addTask(
    ctx,
    { kind: "risk-review", ...wanted, contact: ctx.get().profile.phone || undefined },
    "Shared your safety answer with the care team",
  );
}

const SAFETY_QUESTION = SCREEN[0];

const safety: Node = {
  // Named like the clinician view's records of each safety question.
  id: "screen-now",
  stage: "story",
  why: "Your safety comes before booking anything. Your answer goes only to your care team.",
  say: () => [say("ask", SAFETY_QUESTION.ask)],
  input: () => ({ kind: "single", layout: "stack", options: SAFETY_QUESTION.options }),
  value: (s) => s.chat.screen.now,
  answer: (s) => {
    const value = s.chat.screen.now;
    if (!value) return null;
    const label = SAFETY_QUESTION.options.find((option) => option.value === value)?.label ?? value;
    return { text: label, editable: preBooking(s) };
  },
  // As in the live fit check: needing help now, or not being sure, ends the flow with crisis resources.
  after: (s) => (s.chat.screen.now === "unsafe" ? [card("crisis")] : []),
  halts: (s) => s.chat.screen.now === "unsafe",
  submit: (value, ctx) => {
    const s = ctx.get();
    const screen = { ...s.chat.screen, now: String(value) };
    const level = screenLevel(screen);
    ctx.update({
      fit: { ...s.fit, "fit-safety": level === "none" ? "no" : "yes" },
      exitReason: level === "high" ? "safety" : s.exitReason === "safety" ? "" : s.exitReason,
      chat: { screen },
    });
    addFlags(ctx, screenFlags(screen));
    queueSafetyTasks(ctx, screen);
  },
};

const HOSPITAL: Record<string, string> = { no: "No", yes: "Yes", discuss: "I’d rather discuss it" };

const hospital: Node = {
  id: "hospital",
  stage: "story",
  why: "Legion’s video care fits people who don’t need hospital-level support right now. If you might, a coordinator can help you find the right fit.",
  say: () => [
    say("ask", "In the past year, have you stayed overnight in a hospital for mental health or substance use?"),
  ],
  input: () => ({
    kind: "single",
    layout: "stack",
    options: [
      { value: "no", label: HOSPITAL.no },
      { value: "yes", label: HOSPITAL.yes },
      { value: "discuss", label: HOSPITAL.discuss },
    ],
  }),
  value: (s) => s.fit["fit-history"],
  answer: (s) =>
    s.fit["fit-history"] ? { text: HOSPITAL[s.fit["fit-history"]], editable: preBooking(s) } : null,
  after: (s) => (s.fit["fit-history"] && s.fit["fit-history"] !== "no" ? [card("review-exit")] : []),
  halts: (s) => !!s.fit["fit-history"] && s.fit["fit-history"] !== "no",
  submit: (value, ctx) =>
    ctx.update({
      fit: { ...ctx.get().fit, "fit-history": String(value) },
      exitReason: value === "no" ? "" : "review",
    }),
};

// =========================================================== Your clinician

const PAY: Record<string, string> = {
  insurance: "Insurance",
  selfpay: "Pay myself",
  public: "Medicare or Medicaid",
  unsure: "I’m not sure",
};

const pay: Node = {
  id: "pay",
  stage: "clinician",
  why: "So I only show clinicians you can see, and so you know your cost before you book.",
  say: () => [say("ask", "How would you like to pay for visits?")],
  input: () => ({
    kind: "single",
    layout: "stack",
    options: [
      { value: "insurance", label: PAY.insurance, icon: "insurance" },
      { value: "selfpay", label: PAY.selfpay, icon: "selfpay", detail: "$250 first visit, $150 follow-ups" },
      { value: "public", label: PAY.public, icon: "public" },
      { value: "unsure", label: PAY.unsure, icon: "unsure" },
    ],
  }),
  value: (s) => s.chat.payMethod,
  answer: (s) => (s.chat.payMethod ? { text: PAY[s.chat.payMethod], editable: preBooking(s) } : null),
  after: (s) =>
    s.chat.payMethod === "selfpay"
      ? [say("ack", "You’re charged after each visit, not before. Changing a visit within 48 hours, or missing it, costs $100.")]
      : s.chat.payMethod === "unsure"
        ? [say("ack", "No problem. Once I know who you are, I can look up your coverage for you.")]
        : s.chat.payMethod === "public"
          ? [card("public-exit")]
          : [],
  halts: (s) => s.chat.payMethod === "public",
  submit: (value, ctx) => {
    const method = value as ChatState["payMethod"];
    ctx.update({
      coverage: method === "selfpay" || method === "public" ? "selfpay" : "insurance",
      payer: method === "insurance" ? ctx.get().payer : "",
      fit: { ...ctx.get().fit, "fit-coverage": method === "public" ? "yes" : "no" },
      exitReason: method === "public" ? "coverage" : "",
      chat: {
        payMethod: method,
        payerChoice: method === "insurance" ? ctx.get().chat.payerChoice : "",
        benefits: null,
        benefitsAccepted: false,
        benefitsChoice: "",
        jobs: { ...ctx.get().chat.jobs, benefits: undefined },
      },
    });
  },
};

export const PAYERS = [
  "Aetna",
  "Blue Cross Blue Shield of Texas",
  "Cigna",
  "UnitedHealthcare",
  "Oscar",
];

const payer: Node = {
  id: "payer",
  stage: "clinician",
  applies: (s) => s.chat.payMethod === "insurance",
  say: () => [say("ask", "Who’s your insurance with?")],
  input: () => ({
    kind: "single",
    layout: "grid",
    options: [
      ...PAYERS.map((name) => ({
        value: name,
        label: name === "Blue Cross Blue Shield of Texas" ? "Blue Cross Blue Shield" : name,
      })),
      { value: "unsure", label: "Find it for me" },
    ],
  }),
  value: (s) => s.chat.payerChoice,
  answer: (s) =>
    s.chat.payerChoice
      ? { text: s.chat.payerChoice === "unsure" ? "Find it for me" : s.chat.payerChoice, editable: preBooking(s) }
      : null,
  after: (s) => [
    say(
      "ack",
      s.chat.payerChoice === "unsure"
        ? "I will, once I have your name and birth date. For now I’ll show clinicians who take most Texas plans."
        : `I’ll show you clinicians in network with ${s.chat.payerChoice} and check your exact benefits before you book.`,
    ),
  ],
  submit: (value, ctx) =>
    ctx.update({
      payer: value === "unsure" ? "" : String(value),
      chat: {
        payerChoice: String(value),
        benefits: null,
        benefitsAccepted: false,
        jobs: { ...ctx.get().chat.jobs, benefits: undefined },
      },
    }),
};

const WHEN: ChatOption[] = [
  { value: "mornings", label: "Mornings", icon: "mornings" },
  { value: "afternoons", label: "Afternoons", icon: "afternoons" },
  { value: "evenings", label: "Evenings", icon: "evenings" },
  { value: "weekends", label: "Weekends", icon: "weekends" },
];

const when: Node = {
  id: "when",
  stage: "clinician",
  say: () => [say("ask", "When could you usually meet by video? Choose any.")],
  input: () => ({
    kind: "multi",
    confirm: "Continue",
    options: WHEN,
    alternate: { label: "Whatever’s soonest", value: "__soonest" },
    alternateFirst: true,
  }),
  value: (s) => s.chat.availability.filter((v) => v !== "soonest"),
  answer: (s) =>
    s.chat.availability.length
      ? {
          text: s.chat.availability.includes("soonest")
            ? "Whatever’s soonest"
            : listOf(s.chat.availability.map((v) => WHEN.find((w) => w.value === v)?.label ?? v)),
          editable: preBooking(s),
        }
      : null,
  submit: (value, ctx) =>
    ctx.update({ chat: { availability: value === "__soonest" ? ["soonest"] : (value as string[]) } }),
};

const PREF_PHRASE: Record<string, string> = {
  mornings: "morning",
  afternoons: "afternoon",
  evenings: "evening",
  weekends: "weekend",
};

const choose: Node = {
  id: "choose",
  stage: "clinician",
  why: "I rank clinicians by what you told me, who your plan covers, and when you’re free. You choose.",
  enter: (ctx) => void runMatch(ctx),
  enterKey: (s) => matchInputs(s),
  say: (s) => {
    const blocks: AgentBlock[] = [work("match")];
    if (s.chat.jobs.match?.status === "failed") {
      blocks.push(say("failed", "I couldn’t reach clinicians’ calendars just now. Let’s try that again."));
      return blocks;
    }
    const match = s.chat.match;
    if (s.chat.jobs.match?.status !== "done" || !match) return blocks;
    if (!match.offerIds.length) {
      const released = s.chat.holdNotice === "released" || s.chat.holdNotice === "not-covered";
      blocks.push(
        say(
          "none",
          `${released ? `${releaseNotice(s)} ` : ""}I couldn’t find openings that fit this week. Try a wider time window, or see every opening.`,
        ),
      );
      return blocks;
    }
    const first = clinicianFirst(match.offerIds[0]);
    const pref = s.chat.availability.find((v) => PREF_PHRASE[v]);
    blocks.push(
      say(
        "intro",
        match.offerIds.length === 1
          ? `${first} is the best fit with openings that work for you.`
          : `Here are your best fits. ${first} has the soonest ${pref ? `${PREF_PHRASE[pref]} ` : ""}opening.`,
      ),
      card("clinicians"),
    );
    // A taken time is explained inside the clinician card, next to the times.
    return blocks;
  },
  input: (s) =>
    s.chat.jobs.match?.status === "failed"
      ? { kind: "single", options: [{ value: "__retry", label: "Try again", primary: true }] }
      : s.chat.jobs.match?.status === "done"
      ? {
          kind: "single",
          options: [
            ...(s.chat.match && s.chat.match.rankedIds.length > s.chat.match.offerIds.length && !s.chat.showMore
              ? [{ value: "__more", label: "Other clinicians" }]
              : []),
            { value: "__times", label: "More times" },
          ],
        }
      : null,
  value: (s) => s.slotId,
  answer: (s) =>
    s.chat.slotChosen && s.slotId
      ? { text: `${slotLabel(s.slotId)} with ${clinicianName(s.providerId)}`, editable: preBooking(s) }
      : null,
  after: () => [work("hold")],
  submit: async (value, ctx) => {
    if (value === "__retry") {
      void runMatch(ctx);
      return false;
    }
    if (value === "__more") {
      ctx.update({ chat: { showMore: true } });
      return false;
    }
    if (value === "__times") {
      // "choose" lets the sheet pick a time even when one is already held (changing an answer).
      ctx.openSheet("times", "choose");
      return false;
    }
    // A time that couldn't be held isn't an answer; any earlier hold stays.
    const held = await runHold(ctx, String(value));
    if (held === false) return false;
  },
};

// ================================================================ Booking

const phone: Node = {
  id: "phone",
  stage: "booking",
  applies: (s) => !s.chat.manualDetails,
  why: "Your number lets me find your details so you don’t have to type them, and it’s where visit reminders go.",
  say: () => [
    say(
      "ask",
      "Let’s get you booked. What’s your mobile number? I’ll text you a code, then fill in your details for you.",
    ),
  ],
  input: () => ({
    kind: "text",
    mode: "tel",
    label: "Mobile number",
    placeholder: "Mobile number",
    submit: "Send code",
    alternate: { label: "I’d rather type my details", value: "__manual" },
    footnote:
      "Your details come from Verified (simulated). By continuing, you agree to texts about your care. Reply STOP anytime.",
  }),
  value: (s) => s.profile.phone,
  answer: (s) =>
    s.chat.codeSentAt
      ? { text: formatPhoneMasked(s.profile.phone, false), editable: !s.chat.codeVerified }
      : null,
  submit: async (value, ctx) => {
    if (value === "__manual") return ctx.update({ chat: { manualDetails: true } });
    const phone = String(value).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (phone.length !== 10) throw new Error("Enter a 10-digit US mobile number.");
    ctx.update({
      profile: { ...ctx.get().profile, phone, sms: true },
      chat: { codeVerified: false, codeSentAt: null },
    });
    await sendCode(ctx);
    // A text that didn't go through is said here, under the number; "Send code" tries again.
    const { codeSentAt, codeError } = ctx.get().chat;
    if (!codeSentAt && codeError) throw new Error(codeError);
  },
};

const code: Node = {
  id: "code",
  stage: "booking",
  applies: (s) => !s.chat.manualDetails,
  say: (s) => [say("ask", `I sent a 6-digit code to ${formatPhoneMasked(s.profile.phone)}.`)],
  input: () => ({
    kind: "text",
    mode: "otp",
    label: "6-digit code",
    placeholder: "6-digit code",
    submit: "Verify",
    suggestions: ["246810"],
    alternate: { label: "Send a new code", value: "__resend" },
  }),
  answer: (s) => (s.chat.codeVerified ? { text: "Code verified", editable: false } : null),
  submit: async (value, ctx) => {
    if (value === "__resend") return void (await sendCode(ctx));
    await verifyCode(ctx, String(value).replace(/\D/g, ""));
  },
};

const ADULT_ERROR = "Legion currently cares for adults 18 and older.";

const dob: Node = {
  id: "dob",
  stage: "booking",
  applies: (s) => !s.chat.manualDetails,
  why: "It confirms it’s you, and every part of your care record needs it.",
  say: () => [say("ask", "Thanks. What’s your date of birth? It confirms it’s you.")],
  input: () => ({
    kind: "text",
    mode: "date",
    label: "Date of birth",
    placeholder: "MM/DD/YYYY",
    submit: "Continue",
    autoComplete: "bday",
  }),
  value: (s) =>
    s.profile.month
      ? `${s.profile.month.padStart(2, "0")}/${s.profile.day.padStart(2, "0")}/${s.profile.year}`
      : "",
  answer: (s) =>
    s.chat.dobEntered
      ? {
          text: `${s.profile.month.padStart(2, "0")}/${s.profile.day.padStart(2, "0")}/${s.profile.year}`,
          editable: s.chat.identity !== "confirmed",
        }
      : null,
  after: (s) => (validateBirth(s.profile) === ADULT_ERROR ? [card("age-exit")] : []),
  halts: (s) => validateBirth(s.profile) === ADULT_ERROR,
  submit: async (value, ctx) => {
    const [month, day, year] = String(value).split("/");
    const profile = { ...ctx.get().profile, month: String(Number(month)), day: String(Number(day)), year };
    const problem = validateBirth(profile);
    // An impossible date is asked again; only the adult rule ends the conversation here.
    if (problem && problem !== ADULT_ERROR) throw new Error(problem);
    ctx.update({ profile, chat: { dobEntered: true, identity: "", ageBlocked: problem === ADULT_ERROR } });
    if (problem) return;
    await runIdentity(ctx);
  },
};

/** The lookup found nothing and the patient added their details by hand. */
const addedByHand = (s: ChatJourney) => s.chat.jobs.identity?.note === "not-found";

/** The patient changed something the lookup returned before confirming. */
const editedFound = (s: ChatJourney) =>
  s.profile.firstName !== VERIFIED_RECORD.firstName ||
  s.profile.lastName !== VERIFIED_RECORD.lastName ||
  s.profile.address !== VERIFIED_RECORD.address ||
  s.profile.city !== VERIFIED_RECORD.city ||
  s.profile.zip !== VERIFIED_RECORD.zip ||
  s.chat.sexAtBirth !== VERIFIED_RECORD.sexAtBirth;

const identity: Node = {
  id: "identity",
  stage: "booking",
  applies: (s) => !s.chat.manualDetails,
  // A reload mid-lookup restarts it rather than leaving a spinner.
  enter: (ctx) => {
    const s = ctx.get();
    if (s.chat.dobEntered && s.chat.identity === "" && !s.chat.jobs.identity && !validateBirth(s.profile))
      void runIdentity(ctx);
  },
  enterKey: (s) => `identity:${s.chat.jobs.identity ? "tried" : "new"}`,
  say: (s) => {
    const blocks: AgentBlock[] = [work("identity")];
    if (addedByHand(s) || s.chat.identity === "not-found")
      blocks.push(
        say("missing", "I couldn’t find your details from your number. That happens. Let’s add them by hand; it takes a minute."),
      );
    else if (s.chat.identity === "found" || s.chat.identity === "confirmed")
      blocks.push(say("found", "Is this you?"), card("identity"));
    return blocks;
  },
  input: (s) =>
    s.chat.identity === "found"
      ? {
          kind: "single",
          options: [
            { value: "edit", label: "Edit details" },
            { value: "yes", label: "Yes, that’s me", primary: true },
          ],
        }
      : s.chat.identity === "not-found"
        ? { kind: "widget", widget: "details", label: "Add my details" }
        : null,
  answer: (s) =>
    s.chat.identity === "confirmed"
      ? {
          text: addedByHand(s) ? "Added my details" : editedFound(s) ? "Yes, with my changes" : "Yes, that’s me",
          editable: false,
        }
      : null,
  after: (s) => (addedByHand(s) && s.chat.identity === "confirmed" ? [card("identity")] : []),
  submit: (value, ctx) => {
    if (value === "edit") {
      ctx.openSheet("details");
      return false;
    }
    ctx.update({ chat: { identity: "confirmed" } });
    receipt(ctx, "Confirmed your details", "You", "You");
    // Coverage work starts now and finishes behind the next question.
    void runBenefits(ctx);
  },
};

const manualDetails: Node = {
  id: "details",
  stage: "booking",
  applies: (s) => s.chat.manualDetails,
  say: () => [say("ask", "No problem. Add your details and I’ll take it from there.")],
  input: () => ({ kind: "widget", widget: "details", label: "Add my details" }),
  answer: (s) =>
    s.chat.ageBlocked
      ? { text: "Added my details", editable: preBooking(s) }
      : s.chat.identity === "confirmed"
        ? { text: `${s.profile.firstName} ${s.profile.lastName}`, editable: preBooking(s) }
        : null,
  // The same warm exit as the phone path when the birth date is under 18.
  after: (s) => (s.chat.ageBlocked ? [card("age-exit")] : []),
  halts: (s) => s.chat.ageBlocked,
};

const email: Node = {
  id: "email",
  stage: "booking",
  why: "Your visit link, receipts and visit summary go here.",
  say: (s) => [
    say(
      "ask",
      s.coverage === "insurance"
        ? "While I check your benefits: where should I send your visit link and receipts?"
        : "Where should I send your visit link and receipts?",
    ),
  ],
  input: () => ({ kind: "text", mode: "email", label: "Email address", placeholder: "Email address", submit: "Continue" }),
  value: (s) => s.profile.email,
  answer: (s) => (s.chat.emailEntered ? { text: s.profile.email, editable: preBooking(s) } : null),
  submit: async (value, ctx) => {
    ctx.update({ profile: { ...ctx.get().profile, email: String(value) } });
    // The account exists before the conversation moves on; a failure stays on this question.
    await createAccount(ctx);
    ctx.update({ chat: { emailEntered: true } });
  },
};

const benefits: Node = {
  id: "benefits",
  stage: "booking",
  applies: (s) => s.coverage === "insurance" && s.chat.benefitsChoice !== "selfpay",
  enter: (ctx) => {
    const status = ctx.get().chat.jobs.benefits?.status;
    if (!status || status === "idle") void runBenefits(ctx);
  },
  say: (s) => {
    const status = s.chat.jobs.benefits?.status;
    const blocks: AgentBlock[] = [work("benefits")];
    if (status === "done") blocks.push(card("benefits"));
    if (status === "done" && outOfNetwork(s))
      blocks.push(
        say(
          "oon",
          `${clinicianFirst(s.providerId)} isn’t in network with ${s.payer}. You can keep ${clinicianFirst(s.providerId)} and pay $250 yourself, or see clinicians who are in network.`,
        ),
      );
    if (status === "pending")
      blocks.push(say("pending", `${s.payer || "Your plan"} hasn’t answered yet. That usually takes under a minute.`));
    if (status === "failed")
      blocks.push(
        say(
          "failed",
          !missedPlan(s)
            ? `${s.payer || "Your plan"} didn’t answer just now. Let’s try that again.`
            : !s.payer
              ? "I couldn’t find your plan from your details. You can add it with the member ID from your card."
              : s.chat.jobs.benefits?.note === "unmatched"
                ? `${s.payer} couldn’t match those details. What’s the member ID on your card?`
                : `I couldn’t find your ${s.payer} plan from your details. What’s the member ID on your card?`,
        ),
      );
    if (status === "failed" && missedPlan(s) && s.payer && s.chat.memberIdSkipped)
      blocks.push(say("nocard", "No problem. You can pay yourself for now, or someone on the care team can help find your plan."));
    return blocks;
  },
  input: (s) => {
    const status = s.chat.jobs.benefits?.status;
    if (status === "done" && outOfNetwork(s))
      return {
        kind: "single",
        layout: "stack",
        options: [
          { value: "innetwork", label: "See in-network clinicians" },
          { value: "selfpay", label: `Keep ${clinicianFirst(s.providerId)} and pay myself`, detail: "$250 first visit" },
          { value: "different", label: "Use a different plan" },
        ],
      };
    if (status === "done")
      return {
        kind: "single",
        options: [
          { value: "different", label: "Use a different plan" },
          { value: "use", label: "Use this plan", primary: true },
        ],
      };
    if (status === "failed" && missedPlan(s)) {
      if (s.payer && !s.chat.memberIdSkipped)
        return {
          kind: "text",
          mode: "text",
          label: "Member ID",
          placeholder: "Member ID from your card",
          submit: "Check my plan",
          maxLength: 24,
          autoComplete: "off",
          alternate: { label: "I don’t have my card", value: "__nocard" },
          footnote: "It’s on the front of your insurance card, often labeled ID or Member ID.",
        };
      return {
        kind: "single",
        layout: "stack",
        options: [
          s.payer ? { value: "__memberid", label: "Enter my member ID" } : { value: "different", label: "Add my insurance" },
          { value: "selfpay", label: "Pay myself instead", detail: "$250 first visit" },
          { value: "person", label: "Have the care team help" },
        ],
      };
    }
    if (status === "pending" || status === "failed")
      return {
        kind: "single",
        layout: "stack",
        options: [
          { value: "retry", label: status === "pending" ? "Check again" : "Try again" },
          { value: "selfpay", label: "Pay myself instead", detail: "$250 first visit" },
          { value: "person", label: "Have the care team help" },
        ],
      };
    return null;
  },
  answer: (s) => (s.chat.benefitsAccepted ? { text: "Use this plan", editable: false } : null),
  submit: async (value, ctx) => {
    if (value === "use") return ctx.update({ chat: { benefitsAccepted: true } });
    if (value === "__nocard" || value === "__memberid") {
      ctx.update({ chat: { memberIdSkipped: value === "__nocard" } });
      return false;
    }
    if (value === "selfpay") {
      ctx.update({ coverage: "selfpay", chat: { benefitsChoice: "selfpay", payMethod: "selfpay" } });
      receipt(ctx, "Switched to self-pay at your request", "You", "You");
      return;
    }
    if (value === "person") {
      ctx.openSheet("help");
      return false;
    }
    if (value === "different") {
      ctx.openSheet("insurance");
      return false;
    }
    if (value === "innetwork") {
      // Matching now uses the plan that was found; the time is released with a reason.
      const s = ctx.get();
      ctx.update({
        reservation: null,
        slotId: "",
        chat: {
          slotChosen: false,
          holdNotice: "not-covered",
          releasedSlot: s.slotId,
          payerChoice: s.payer,
          benefits: null,
          benefitsAccepted: false,
          jobs: { ...s.chat.jobs, benefits: undefined },
        },
      });
      receipt(ctx, `Let go of your time so you can choose a clinician in network with ${s.payer}`, "You", "You");
      return;
    }
    // After a miss, what's typed is the member ID from the card, and the plan is checked with it.
    if (value !== "retry" && missedPlan(ctx.get())) {
      const memberId = String(value).replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z0-9-]{4,20}$/.test(memberId)) throw new Error("Enter the member ID from your card, using letters and numbers.");
      ctx.update({
        memberId,
        scenario: "standard",
        chat: { memberIdSkipped: false, benefits: null, jobs: { ...ctx.get().chat.jobs, benefits: undefined } },
      });
      receipt(ctx, "Added the member ID from your card", "You", "You");
      await runBenefits(ctx);
      return;
    }
    // A retry asks the plan again; the preview's fault is consumed the first time.
    ctx.update({ scenario: "standard", chat: { jobs: { ...ctx.get().chat.jobs, benefits: undefined } } });
    await runBenefits(ctx);
  },
};

const outOfNetwork = (s: ChatJourney) => s.chat.benefits?.network === "out-of-network";

/** No plan or member ID could be matched from what the patient gave, as opposed to an error. */
const missedPlan = (s: ChatJourney) => {
  const job = s.chat.jobs.benefits;
  return job?.status === "failed" && (job.note === "not-found" || job.note === "unmatched");
};

const agreements: Node = {
  id: "agreements",
  stage: "booking",
  why: "These are the agreements every Legion patient makes, each in plain language.",
  say: () => [say("ask", "Almost there. Please review these before I book."), card("agreements")],
  input: () => ({ kind: "widget", widget: "agreements", label: "Review and agree" }),
  answer: (s) =>
    s.agreements ? { text: s.chat.aiNotes ? "I agree, and AI notes are okay" : "I agree", editable: false } : null,
};

const payment: Node = {
  id: "payment",
  stage: "booking",
  say: (s) => [say("ask", `Last step: a card on file. You’ll pay ${priceLine(s)}.`)],
  input: () => ({ kind: "widget", widget: "payment", label: "Add a card" }),
  answer: (s) =>
    s.paymentSetup.status === "succeeded" && s.paymentSetup.method
      ? { text: `${s.paymentSetup.method.brand} ending ${s.paymentSetup.method.last4}`, editable: false }
      : null,
};

/** Booking stopped because the estimate changed since the patient agreed to it. */
const needsConsent = (s: ChatJourney) =>
  !booked(s) && s.chat.jobs.book?.status === "failed" && s.chat.jobs.book.note === "consent";

const book: Node = {
  id: "book",
  stage: "booking",
  enter: (ctx) => {
    const status = ctx.get().chat.jobs.book?.status;
    if (!status || status === "idle") void runBooking(ctx).catch(() => undefined);
  },
  enterKey: (s) => `book:${s.chat.jobs.book ? "tried" : "new"}`,
  say: (s) =>
    booked(s)
      ? [work("book"), card("booked")]
      : needsConsent(s)
        ? [
            work("book"),
            say(
              "consent",
              s.eligibility.estimate != null
                ? `Your estimate is now $${s.eligibility.estimate} for this time. Okay to book with that?`
                : "Your payment terms changed with the new time. Okay to book with the updated terms?",
            ),
          ]
        : s.chat.jobs.book?.status === "failed"
          ? [work("book"), say("failed", s.chat.jobs.book.note || "I couldn’t finish booking. Your details and card are saved.")]
          : [work("book")],
  input: (s) =>
    needsConsent(s)
      ? {
          kind: "single",
          options: [
            { value: "times", label: "Pick another time" },
            { value: "consent", label: "Agree and book", primary: true },
          ],
        }
      : s.chat.jobs.book?.status === "failed"
        ? {
            kind: "single",
            options: [
              { value: "times", label: "Pick another time" },
              { value: "retry", label: "Try again", primary: true },
            ],
          }
        : null,
  answer: (s) => (booked(s) ? { text: "", editable: false } : null),
  submit: (value, ctx) => {
    const jobs = { ...ctx.get().chat.jobs, book: undefined };
    if (value === "times")
      return ctx.update({ reservation: null, slotId: "", chat: { slotChosen: false, jobs } });
    if (value === "consent") {
      ctx.update({ financialConsent: true, chat: { jobs } });
      receipt(ctx, "Agreed to the updated estimate", "You", "You");
      return;
    }
    ctx.update({ chat: { jobs } });
  },
};

// ========================================================== Your first visit

/** Prep is optional: once check-in opens or the visit has started, unanswered prep steps step aside. */
const prepPassed = (s: ChatJourney) =>
  s.encounter.status !== "not_started" || (s.visitDay && joinAvailability(s) !== "before");

const prepOffer: Node = {
  id: "prep",
  stage: "visit",
  applies: booked,
  skip: prepPassed,
  say: (s) => [
    say(
      "ask",
      `Want to help ${clinicianFirst(s.appointment!.providerId)} get to know you before ${appointmentDay(s)}? It takes about three minutes and makes your first visit more useful.`,
    ),
  ],
  input: () => ({
    kind: "single",
    options: [
      { value: "later", label: "Later" },
      { value: "yes", label: "Let’s do it", primary: true },
    ],
  }),
  answer: (s) =>
    s.chat.prep ? { text: s.chat.prep === "yes" ? "Let’s do it" : "Later", editable: !prepPassed(s) } : null,
  submit: (value, ctx) => ctx.update({ chat: { prep: value as ChatState["prep"] } }),
};

const prepping = (s: ChatJourney) => booked(s) && s.chat.prep === "yes";

const records: Node = {
  id: "records",
  stage: "visit",
  applies: prepping,
  skip: prepPassed,
  why: "Past diagnoses, medications and allergies help your clinician start from what’s on record, not from memory.",
  say: (s) => [
    say(
      "ask",
      `With your permission, I can request your records from past doctors, pharmacies and labs through a health information network. ${clinicianFirst(s.appointment!.providerId)} will see them, and you can check what I find.`,
    ),
  ],
  input: () => ({
    kind: "single",
    options: [
      { value: "no", label: "Not now" },
      { value: "yes", label: "Yes, find my records", primary: true },
    ],
  }),
  answer: (s) =>
    s.chat.records ? { text: s.chat.records === "yes" ? "Yes, find my records" : "Not now", editable: false } : null,
  after: (s) => (s.chat.records === "yes" ? [work("records")] : []),
  submit: async (value, ctx) => {
    ctx.update({ chat: { records: value as ChatState["records"] } });
    if (value === "yes") return void (await runRecords(ctx));
    await ctx.api.requestRecords(false).catch(() => undefined);
    receipt(ctx, "Skipped records for now", "You", "You");
  },
};

const recordsSettled = (s: ChatJourney) =>
  s.chat.records === "no" ||
  (s.chat.records === "yes" && !!s.chat.jobs.records && s.chat.jobs.records.status !== "running");

const medication: Node = {
  id: "medication",
  stage: "visit",
  applies: (s) => prepping(s) && recordsSettled(s),
  skip: prepPassed,
  say: (s) => {
    const med = s.chat.recordsFound?.medication;
    return [
      ...(s.chat.recordsFound
        ? [card("records-found")]
        : s.chat.records === "yes"
          ? [say("none", "No records came back yet. That’s common, and you can add what matters yourself.")]
          : []),
      say(
        "ask",
        med
          ? `Your pharmacy shows ${med.name.toLowerCase()} ${med.dose}, last filled ${med.lastFilled}. Are you still taking it?`
          : "Are you taking any medications right now?",
      ),
    ];
  },
  input: (s) =>
    s.chat.medication === "other" && !s.chat.medicationNote
      ? {
          kind: "text",
          mode: "text",
          label: "Medications you take",
          placeholder: "Medication and dose, if you know it",
          submit: "Send",
          maxLength: 200,
        }
      : s.chat.recordsFound?.medication
        ? {
            kind: "single",
            options: [
              { value: "changed", label: "Different dose" },
              { value: "stopped", label: "I stopped" },
              { value: "taking", label: "Yes" },
            ],
          }
        : {
            kind: "single",
            options: [
              { value: "other", label: "Yes" },
              { value: "none", label: "No" },
            ],
          },
  answer: (s) => {
    if (!s.chat.medication) return null;
    if (s.chat.medication === "other")
      return s.chat.medicationNote ? { text: s.chat.medicationNote, editable: true } : null;
    const labels: Record<string, string> = { taking: "Yes", stopped: "I stopped", changed: "Different dose", none: "No" };
    return { text: labels[s.chat.medication], editable: true };
  },
  after: (s) =>
    mentionsCrisis(s.chat.medicationNote)
      ? [say("care", CARE_BOOKED), card("support-line")]
      : s.chat.medication === "changed" || s.chat.medication === "stopped"
        ? [say("ack", "Thanks. I’ll flag it for your clinician so you can go over it together.")]
        : [],
  submit: (value, ctx) => {
    const current = ctx.get().chat;
    if (current.medication === "other" && !current.medicationNote && value !== "other" && value !== "none") {
      ctx.update({ medications: String(value), chat: { medicationNote: String(value) } });
      if (mentionsCrisis(String(value))) flagRisk(ctx, "medication", String(value));
      return;
    }
    ctx.update({ chat: { medication: value as ChatState["medication"], medicationNote: "" } });
  },
};

const allergy: Node = {
  id: "allergy",
  stage: "visit",
  applies: (s) =>
    prepping(s) && !!s.chat.medication && (s.chat.medication !== "other" || !!s.chat.medicationNote),
  skip: prepPassed,
  say: (s) => [
    say(
      "ask",
      s.chat.recordsFound?.allergy
        ? `Your records list an allergy to ${s.chat.recordsFound.allergy.split(" (")[0].toLowerCase()}. Is that right?`
        : "Any allergies to medications?",
    ),
  ],
  input: (s) =>
    s.chat.allergy === "other" && !s.chat.allergyNote
      ? { kind: "text", mode: "text", label: "Medication allergies", placeholder: "Which medications?", submit: "Send", maxLength: 160 }
      : s.chat.recordsFound?.allergy
        ? {
            kind: "single",
            options: [
              { value: "unsure", label: "Not sure" },
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ],
          }
        : {
            kind: "single",
            options: [
              { value: "other", label: "Yes" },
              { value: "none", label: "None that I know of" },
            ],
          },
  answer: (s) => {
    if (!s.chat.allergy) return null;
    if (s.chat.allergy === "other")
      return s.chat.allergyNote ? { text: s.chat.allergyNote, editable: true } : null;
    const labels: Record<string, string> = { yes: "Yes", no: "No", unsure: "Not sure", none: "None that I know of" };
    return { text: labels[s.chat.allergy], editable: true };
  },
  after: (s) => (mentionsCrisis(s.chat.allergyNote) ? [say("care", CARE_BOOKED), card("support-line")] : []),
  submit: async (value, ctx) => {
    const current = ctx.get().chat;
    if (current.allergy === "other" && !current.allergyNote && value !== "other" && value !== "none") {
      ctx.update({ allergies: String(value), chat: { allergyNote: String(value) } });
      if (mentionsCrisis(String(value))) flagRisk(ctx, "allergy", String(value));
    } else {
      ctx.update({ chat: { allergy: value as ChatState["allergy"], allergyNote: "" } });
      if (value === "other") return;
    }
    // Medications and allergies reviewed: the one preparation step check-in requires.
    await ctx.api.saveHealthDetails().catch(() => undefined);
  },
};

const pharmacy: Node = {
  id: "pharmacy",
  stage: "visit",
  applies: (s) => prepping(s) && !!s.chat.recordsFound?.pharmacy && s.healthReviewed,
  skip: prepPassed,
  why: "Prescriptions can only be sent once a pharmacy is chosen.",
  say: (s) => [
    say(
      "ask",
      `If your clinician sends a prescription, should it go to the ${s.chat.recordsFound!.pharmacy!.name} at ${s.chat.recordsFound!.pharmacy!.address.split(",")[0]} you used last?`,
    ),
  ],
  input: () => ({
    kind: "single",
    options: [
      { value: "other", label: "Choose another" },
      { value: "suggested", label: "Yes, that one", primary: true },
    ],
  }),
  answer: (s) =>
    s.chat.pharmacy ? { text: s.chat.pharmacy === "suggested" ? "Yes, that one" : "Choose another", editable: true } : null,
  after: (s) =>
    s.chat.pharmacy === "other"
      ? [say("ack", "No problem. Your clinician can set it with you during the visit.")]
      : [],
  submit: async (value, ctx) => {
    const found = ctx.get().chat.recordsFound?.pharmacy;
    ctx.update({ pharmacy: value === "suggested" ? ctx.get().pharmacy : null, chat: { pharmacy: value as ChatState["pharmacy"] } });
    if (value !== "suggested" || !found) return;
    // DoseSpot keeps the pharmacy, so a prescription after the visit goes straight there.
    await ctx.api.savePharmacy(found).then(
      (saved) =>
        receipt(ctx, `Saved ${saved.name}, ${saved.address.split(",")[0]} as your pharmacy for prescriptions`, "DoseSpot (simulated)"),
      () => undefined,
    );
  },
};

const PCP: Record<string, string> = {
  none: "I don’t have one",
  keep: "Yes, but don’t share",
  share: "Yes, share my summary",
};

const pcp: Node = {
  id: "pcp",
  stage: "visit",
  applies: (s) => prepping(s) && s.healthReviewed && (!s.chat.recordsFound?.pharmacy || !!s.chat.pharmacy),
  skip: prepPassed,
  why: "Texas telemedicine rules expect your primary care doctor to hear about your visit when you agree to it.",
  say: () => [
    say("ask", "Do you have a primary care doctor? With your permission, your clinician can send them a short summary after your visit."),
  ],
  input: () => ({
    kind: "single",
    layout: "stack",
    options: Object.entries(PCP).map(([value, label]) => ({ value, label })),
  }),
  value: (s) => s.chat.pcp,
  answer: (s) => (s.chat.pcp ? { text: PCP[s.chat.pcp], editable: true } : null),
  submit: (value, ctx) => ctx.update({ chat: { pcp: value as ChatState["pcp"] } }),
};

/** Consent to share names a doctor; the summary never goes to a clinic guessed from records. */
const pcpName: Node = {
  id: "pcp-name",
  stage: "visit",
  applies: (s) => prepping(s) && s.chat.pcp === "share",
  skip: prepPassed,
  say: () => [say("ask", "Who’s your primary care doctor? A name and practice is plenty.")],
  input: (s) => ({
    kind: "text",
    mode: "text",
    label: "Your primary care doctor",
    placeholder: "For example, Dr. Lee at Austin Family Medicine",
    submit: "Send",
    maxLength: 120,
    suggestions: (s.chat.recordsFound?.sources ?? [])
      .filter((source) => source.kind === "clinic")
      .map((source) => source.name),
  }),
  value: (s) => s.chat.pcpName,
  answer: (s) => (s.chat.pcpName ? { text: s.chat.pcpName, editable: !prepPassed(s) } : null),
  submit: (value, ctx) => ctx.update({ chat: { pcpName: String(value).trim() } }),
};

const note: Node = {
  id: "note",
  stage: "visit",
  applies: (s) => prepping(s) && !!s.chat.pcp && (s.chat.pcp !== "share" || !!s.chat.pcpName),
  skip: prepPassed,
  say: (s) => [
    say("ask", `Anything you’d like ${clinicianFirst(s.appointment!.providerId)} to know before you meet? This is optional.`),
  ],
  input: () => ({
    kind: "text",
    mode: "text",
    label: "A note for your clinician",
    placeholder: "Anything on your mind",
    submit: "Send",
    maxLength: 600,
    skip: "Skip",
  }),
  value: (s) => s.chat.note,
  answer: (s) => (s.chat.noteDone ? { text: s.chat.note || "Skipped", editable: true } : null),
  // After booking, risk language brings in a person; it never takes the visit away.
  after: (s) => (mentionsCrisis(s.chat.note) ? [say("care", CARE_BOOKED), card("support-line")] : []),
  submit: (value, ctx) => {
    const text = String(value);
    ctx.update({ briefNote: text, chat: { note: text, noteDone: true } });
    if (mentionsCrisis(text)) flagRisk(ctx, "note", text);
  },
};

const brief: Node = {
  id: "brief",
  stage: "visit",
  applies: (s) => prepping(s) && s.chat.noteDone,
  skip: prepPassed,
  enter: (ctx) => void runBrief(ctx),
  // A change to what the brief is built from clears it, and the new draft is asked about again.
  enterKey: (s) => `brief:${s.chat.jobs.brief ? "drafted" : "none"}`,
  say: (s) =>
    s.chat.jobs.brief?.status === "done"
      ? [
          work("brief"),
          say(
            "ask",
            s.chat.receipts.some((item) => item.action.startsWith("Shared your approved brief"))
              ? `Here’s your updated brief for ${clinicianFirst(s.appointment!.providerId)}, with your changes. Does it still look right?`
              : `Here’s what I’ll share with ${clinicianFirst(s.appointment!.providerId)}. They’ll review it before your visit. It isn’t a diagnosis.`,
          ),
          card("brief"),
        ]
      : [work("brief")],
  input: (s) =>
    s.chat.jobs.brief?.status === "done"
      ? {
          kind: "single",
          options: [
            { value: "skip", label: "Don’t send it" },
            { value: "edit", label: "Edit" },
            { value: "approve", label: "Looks good", primary: true },
          ],
        }
      : null,
  answer: (s) =>
    s.chat.briefApproved
      ? { text: "Looks good", editable: false }
      : s.chat.briefSkipped
        ? { text: "Don’t send it", editable: !prepPassed(s) }
        : null,
  submit: (value, ctx) => {
    if (value === "edit") {
      ctx.openSheet("brief");
      return false;
    }
    if (value === "skip") {
      ctx.update({ chat: { briefSkipped: true } });
      receipt(ctx, "Kept your brief to yourself; your clinician starts fresh at the visit", "You", "You");
      return;
    }
    ctx.update({ briefApproved: true, chat: { briefApproved: true, briefSkipped: false } });
    receipt(ctx, "Shared your approved brief with your clinician", "You", "You");
  },
};

const briefSettled = (s: ChatJourney) => s.chat.briefApproved || s.chat.briefSkipped;

const idCheck: Node = {
  id: "idcheck",
  stage: "visit",
  applies: (s) => prepping(s) && briefSettled(s) && medicationPath(s),
  skip: prepPassed,
  why: "Legion verifies your ID before prescribing a controlled medication. The pharmacy may check ID again at pickup.",
  say: () => [
    say(
      "ask",
      "If a controlled medication like a stimulant becomes part of your plan, Legion verifies your photo ID first. Want to do that now? It takes about a minute.",
    ),
  ],
  input: () => ({
    kind: "single",
    options: [
      { value: "later", label: "Later" },
      { value: "now", label: "Verify my ID", primary: true },
    ],
  }),
  answer: (s) =>
    s.chat.idCheck ? { text: s.chat.idCheck === "done" ? "ID verified" : "Later", editable: s.chat.idCheck === "later" } : null,
  submit: (value, ctx) => {
    if (value === "now") {
      ctx.openSheet("idcheck");
      return false;
    }
    ctx.update({ chat: { idCheck: "later" } });
  },
};

export const prepFinished = (s: ChatJourney) =>
  booked(s) &&
  (s.chat.prep === "later" ||
    prepPassed(s) ||
    (briefSettled(s) && (!medicationPath(s) || !!s.chat.idCheck)));

/** Bringing the chart from MyChart: asked once after prep, with its own card, and always skippable. */
const chartOffer: Node = {
  id: "mychart",
  stage: "visit",
  applies: (s) =>
    prepFinished(s) && (s.chat.chart !== "" || (!s.visitDay && s.encounter.status === "not_started" && !s.chartImport)),
  say: (s) => [
    say(
      "ask",
      `One more thing, and it’s optional: if another doctor’s office uses MyChart, I can bring your chart over so ${clinicianFirst(s.appointment!.providerId)} has it before your visit.`,
    ),
    card("mychart"),
  ],
  // While it connects, the card shows the progress and there's nothing to answer.
  input: (s) =>
    s.chat.chart === "connecting"
      ? null
      : {
          kind: "single",
          options: [
            { value: "later", label: "Not now" },
            { value: "connect", label: s.chat.chart === "failed" ? "Try again" : "Connect MyChart", primary: true },
          ],
        },
  answer: (s) =>
    s.chat.chart === "later"
      ? { text: "Not now", editable: false }
      : s.chat.chart === "done"
        ? { text: "Connect MyChart", editable: false }
        : null,
  after: (s) =>
    s.chat.chart === "done" && s.chartImport
      ? [
          say(
            "ack",
            `Done. ${clinicianFirst(s.appointment!.providerId)} will have your chart from ${s.chartImport.organization} before your visit.`,
          ),
        ]
      : s.chat.chart === "later"
        ? [say("ack", "No problem. You can bring it anytime before your visit from the options below.")]
        : [],
  submit: async (value, ctx) => {
    if (value === "later") return ctx.update({ chat: { chart: "later" } });
    await connectChart(ctx);
  },
};

const ready: Node = {
  id: "ready",
  stage: "visit",
  applies: prepFinished,
  say: (s) => [
    say(
      "ask",
      s.chat.prep === "later"
        ? `Okay. I’ll check in before ${appointmentDay(s)}, and you can prepare anytime from here.`
        : s.profile.sms
          ? `You’re ready. I’ll text you ${reminderTimes(s)} your visit. You can reply to reschedule.`
          : `You’re ready. Texts are off, so your reminders come by email ${reminderTimes(s)} your visit.`,
    ),
  ],
  input: (s) =>
    s.visitDay
      ? null
      : {
          kind: "single",
          options: [
            ...(PREVIEW ? [{ value: "skip", label: "Preview: skip to visit day", tone: "preview" as const }] : []),
            { value: "ok", label: "Sounds good", primary: true },
          ],
        },
  answer: (s) =>
    s.chat.readyAck || s.visitDay ? { text: s.chat.readyAck ? "Sounds good" : "", editable: false } : null,
  submit: (value, ctx) => {
    if (value === "skip") {
      ctx.openSheet("skip");
      return false;
    }
    ctx.update({ chat: { readyAck: true } });
  },
};

const waitingForVisit: Node = {
  id: "waiting-day",
  stage: "visit",
  applies: (s) => prepFinished(s) && s.chat.readyAck && !s.visitDay,
  say: () => [],
  // Nothing to answer while waiting: the dock shows what the patient can ask for instead.
  input: () => null,
  answer: (s) => (s.visitDay ? { text: "", editable: false } : null),
};

const reminder: Node = {
  id: "reminder",
  stage: "visit",
  applies: (s) => booked(s) && s.visitDay,
  say: (s) => [
    card("visit-day"),
    say(
      "ask",
      `Your visit with ${clinicianFirst(s.appointment!.providerId)} is today at ${formatTime(s.appointment!.start)}. Still good?`,
    ),
  ],
  input: () => ({
    kind: "single",
    options: [
      { value: "reschedule", label: "I need to reschedule" },
      { value: "confirm", label: "Yes, I’ll be there", primary: true },
    ],
  }),
  answer: (s) => (s.chat.reminderReply === "confirm" ? { text: "Yes, I’ll be there", editable: false } : null),
  submit: (value, ctx) => {
    if (value === "reschedule") {
      ctx.openSheet("reschedule");
      return false;
    }
    ctx.update({ chat: { reminderReply: "confirm" } });
  },
};

const dayCheckOpen = (s: ChatJourney) => booked(s) && s.visitDay && s.chat.reminderReply === "confirm";

// Medications and allergies are two questions, so neither answer stands in for the other.
const dayMeds: Node = {
  id: "day-meds",
  stage: "visit",
  applies: (s) => dayCheckOpen(s) && (!s.healthReviewed || !!s.chat.dayMeds),
  why: "Your clinician needs to know about current medications and allergies before you meet.",
  say: () => [say("ask", "Before you join: are you taking any medications right now?")],
  input: () => ({
    kind: "single",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes, I’ll tell my clinician" },
    ],
  }),
  answer: (s) =>
    s.chat.dayMeds ? { text: s.chat.dayMeds === "yes" ? "Yes, I’ll tell my clinician" : "No", editable: false } : null,
  submit: (value, ctx) =>
    ctx.update({ chat: { dayMeds: value as "yes" | "no", medication: value === "yes" ? "other" : "none" } }),
};

const DAY_ALLERGIES: Record<string, string> = { no: "No", yes: "Yes", unsure: "Not sure" };

const dayAllergies: Node = {
  id: "day-allergies",
  stage: "visit",
  applies: (s) => dayCheckOpen(s) && !!s.chat.dayMeds,
  say: () => [say("ask", "And any allergies to medications?")],
  input: () => ({
    kind: "single",
    options: Object.entries(DAY_ALLERGIES).map(([value, label]) => ({ value, label })),
  }),
  answer: (s) => (s.chat.dayAllergies ? { text: DAY_ALLERGIES[s.chat.dayAllergies], editable: false } : null),
  submit: async (value, ctx) => {
    const answer = value as "yes" | "no" | "unsure";
    ctx.update({
      chat: { dayAllergies: answer, allergy: answer === "yes" ? "other" : answer === "unsure" ? "unsure" : "none" },
    });
    await ctx.api.saveHealthDetails().catch(() => undefined);
  },
};

const missedWindow = (s: ChatJourney) => s.encounter.status === "not_started" && joinAvailability(s) === "closed";

const checkin: Node = {
  id: "checkin",
  stage: "visit",
  applies: (s) => booked(s) && s.visitDay && s.chat.reminderReply === "confirm" && s.healthReviewed,
  say: (s) => [
    say(
      "ask",
      // Once checked in, the message stays as the patient saw it.
      missedWindow(s)
        ? "The time to join this visit has passed. Let’s find you a new one, or the care team can help."
        : s.encounter.status !== "not_started" || joinAvailability(s) === "open"
          ? "It’s almost time. Let’s check you in. It takes about 30 seconds."
          : `Check-in opens at ${formatTime(new Date(new Date(s.appointment!.start).getTime() - 15 * 60_000).toISOString())}, 15 minutes before your visit. I’ll have it ready right here.`,
    ),
  ],
  input: (s) =>
    missedWindow(s)
      ? {
          kind: "single",
          options: [
            { value: "care", label: "Ask the care team" },
            { value: "reschedule", label: "Pick a new time", primary: true },
          ],
        }
      : joinAvailability(s) === "open"
        ? { kind: "widget", widget: "checkin", label: "Check in" }
        : null,
  answer: (s) => (s.encounter.status !== "not_started" ? { text: "Checked in", editable: false } : null),
  submit: (value, ctx) => {
    ctx.openSheet(value === "reschedule" ? "reschedule" : "help");
    return false;
  },
};

const visitDone = (s: ChatJourney) => s.encounter.status === "completed";

const inVisit: Node = {
  id: "in-visit",
  stage: "visit",
  applies: (s) => booked(s) && s.encounter.status !== "not_started",
  say: () => [card("visit-status")],
  input: (s) => (visitDone(s) ? null : { kind: "widget", widget: "rejoin", label: "Return to your visit" }),
  answer: (s) => (visitDone(s) ? { text: "", editable: false } : null),
};

const plan: Node = {
  id: "plan",
  stage: "visit",
  applies: visitDone,
  say: (s) =>
    s.carePlan.status === "published"
      ? [say("ask", `${clinicianFirst(s.appointment!.providerId)} shared your plan.`), card("plan")]
      : [card("plan-pending")],
  answer: (s) => (s.carePlan.status === "published" ? { text: "", editable: false } : null),
};

const followup: Node = {
  id: "followup",
  stage: "visit",
  applies: (s) => visitDone(s) && s.carePlan.status === "published",
  say: (s) => [
    say(
      "ask",
      `${clinicianFirst(s.appointment!.providerId)} suggests a follow-up in about ${s.carePlan.followupWeeks} weeks. Want one of these times?`,
    ),
  ],
  input: (s) => ({
    kind: "single",
    options: [
      { value: "later", label: "Later" },
      ...followupOptions(s).map((id) => ({ value: id, label: slotLabel(id) })),
    ],
  }),
  answer: (s) =>
    s.followupAppointment && s.followupAppointment.status !== "cancelled"
      ? { text: visitLabel(s.followupAppointment.start), editable: false }
      : s.chat.followup === "later"
        ? { text: "Later", editable: true }
        : null,
  submit: async (value, ctx) => {
    if (value === "later") return ctx.update({ chat: { followup: "later" } });
    const ok = await ctx.act(() => ctx.api.bookFollowup(String(value)));
    if (ok) {
      ctx.update({ chat: { followup: "booked" } });
      receipt(ctx, `Booked your follow-up for ${slotLabel(String(value))}`, "Legion scheduling");
    }
  },
};

const complete: Node = {
  id: "complete",
  stage: "visit",
  ends: true,
  applies: (s) =>
    visitDone(s) && s.carePlan.status === "published" && (!!s.chat.followup || !!s.followupAppointment),
  say: () => [card("complete")],
  answer: () => null,
};

export const SCRIPT: Node[] = [
  hello,
  helloReady,
  story,
  storyConfirm,
  storyOther,
  goal,
  quick,
  quickWhich,
  safety,
  hospital,
  pay,
  payer,
  when,
  choose,
  phone,
  code,
  dob,
  identity,
  manualDetails,
  email,
  benefits,
  agreements,
  payment,
  book,
  prepOffer,
  records,
  medication,
  allergy,
  pharmacy,
  pcp,
  pcpName,
  note,
  brief,
  idCheck,
  chartOffer,
  ready,
  waitingForVisit,
  reminder,
  dayMeds,
  dayAllergies,
  checkin,
  inVisit,
  plan,
  followup,
  complete,
];
