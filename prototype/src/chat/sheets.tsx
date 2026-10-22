import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  Copy,
  GraduationCap,
  Lock,
  Mail,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Phone,
  RotateCcw,
  Sparkles,
  Stethoscope,
  UserRound,
  UsersRound,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { formatPhone } from "../model/fixtures";
import type { Notification, Profile, Scenario } from "../model/types";
import { addTask, clinicianName, receipt, reminderTimes, skipToVisitDay, track, type ChatContext } from "./agent";
import {
  STAGES,
  deriveTranscript,
  type AgentBlock,
  type ChatAnswer,
  type ChatInput,
  type ChatStage,
  type Transcript,
} from "./engine";
import { ASSISTANT, PREVIEW } from "./env";
import { bookingAnswer } from "./assistant";
import { answerQuestion, type GuideAnswer } from "./guide-ai";
import { clinicianById, type Clinician } from "./inventory";
import type { Moment } from "./moments";
import { SupportLines } from "./cards";
import { AgentAvatar, AssistantAvatar } from "./parts";
import type { CardMap, CardProps, SheetMap, SheetProps } from "./registry";
import {
  FLAG_INFO,
  SCREEN,
  SUPPORT_LINES,
  flagRisk,
  hasRisk,
  isRiskAnswer,
  requestSafetyCallback,
  screenDone,
  screenFlags,
  screenItems,
  type ScreenQuestion,
} from "./safety";
import {
  SCRIPT,
  appointmentWhen,
  booked,
  conditionLabel,
  listOf,
  medicationPath,
  type Node as ScriptNode,
} from "./script";
import {
  PREVIEW_CODE,
  type CareTask,
  type ChatJourney,
  type ChatState,
  type Receipt,
  type RiskSource,
  type ScreenItem,
} from "./state";
import "./sheets.css";

/* ============================================================== Shared */

type Path = Transcript<ChatJourney, ChatContext>["path"];

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/** Keeps relative times true while a sheet stays open. */
function useNow(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

const CENTRAL = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const CENTRAL_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Oct 21, 3:14 PM" in Central Time, for records stamped on the journey clock. */
const stampLabel = (at: string) => CENTRAL_DAY.format(new Date(at));

function ago(at: string | number, now: number): string {
  const time = typeof at === "number" ? at : new Date(at).getTime();
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return CENTRAL.format(new Date(time));
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const fullName = (p: Profile) => [p.firstName, p.lastName].filter(Boolean).join(" ");

/** Ten digits with a leading 1 or +1 dropped, or null when it isn't a US number. */
function phoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(ten) ? ten : null;
}

/** "(512) •••-0148", with a non-breaking space and hyphen so it stays on one line. */
function maskPhone(raw: string): string {
  const d = phoneDigits(raw);
  return d ? `(${d.slice(0, 3)})\u00a0•••\u2011${d.slice(6)}` : raw;
}

const telHref = (number: string) => `tel:${number.replace(/\D/g, "")}`;

/** A task's due reads mid-sentence ("today", "within 1 business day"); a day name keeps its capital. */
function dueWords(due: string): string {
  return /^(Today|Tomorrow|Within|Before|After|At|By|In)\b/.test(due) ? lowerFirst(due) : due;
}

/** The newest open follow-up of a kind. Confirmations read from it, so they say only what was recorded. */
function openTask(s: ChatJourney, kind: CareTask["kind"], title?: string): CareTask | undefined {
  return [...s.chat.tasks]
    .reverse()
    .find((task) => task.kind === kind && task.status === "open" && (!title || task.title === title));
}

function ageOf(p: Profile, today = new Date()): number | null {
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  if (!year || !month || !day) return null;
  const beforeBirthday =
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  const age = today.getFullYear() - year - (beforeBirthday ? 1 : 0);
  return age >= 0 && age < 130 ? age : null;
}

function birthLabel(p: Profile): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

function Section({
  title,
  lead,
  aside,
  className = "",
  children,
}: {
  title: string;
  lead?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`sh-section ${className}`} aria-labelledby={id}>
      <div className="sh-section-head">
        <h3 id={id} className="sh-h">
          {title}
        </h3>
        {aside != null ? <span className="sh-aside">{aside}</span> : null}
      </div>
      {lead ? <p className="sh-lead">{lead}</p> : null}
      {children}
    </section>
  );
}

function ReviewerNote({ children }: { children: ReactNode }) {
  return (
    <p className="sh-note">
      <Wrench size={15} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Missing({ children = "Not shared yet" }: { children?: string }) {
  return <span className="sh-missing">{children}</span>;
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/* ============================================================ Support */

function Line988({ emergency = false }: { emergency?: boolean }) {
  return (
    <div className="sh-pills">
      <a className="sh-pill" href={telHref(SUPPORT_LINES.crisis)}>
        <Phone size={14} aria-hidden="true" /> Call 988
      </a>
      <a className="sh-pill" href={`sms:${SUPPORT_LINES.crisis}`}>
        <MessageCircle size={14} aria-hidden="true" /> Text 988
      </a>
      {emergency ? (
        <a className="sh-pill is-emergency" href={telHref(SUPPORT_LINES.emergency)}>
          <Phone size={14} aria-hidden="true" /> Call 911
        </a>
      ) : null}
    </div>
  );
}

/** 988's web chat. The visible label stays short; the full name is read out. */
function Chat988({ className = "sh-btn" }: { className?: string }) {
  return (
    <a className={className} href="https://988lifeline.org/chat/" target="_blank" rel="noreferrer">
      <MessagesSquare size={17} aria-hidden="true" />
      <span aria-hidden="true">Chat online</span>
      <span className="sh-vh">Chat with 988 online (opens in a new tab)</span>
    </a>
  );
}

/** One strong action, then quieter alternatives. Never a wall of red. */
function CrisisActions() {
  return (
    <div className="sh-crisis-actions">
      <a className="sh-btn is-urgent" href={telHref(SUPPORT_LINES.crisis)}>
        <Phone size={18} aria-hidden="true" /> Call 988
      </a>
      <div className="sh-crisis-alt">
        <a className="sh-btn" href={`sms:${SUPPORT_LINES.crisis}`}>
          <MessageCircle size={17} aria-hidden="true" /> Text 988
        </a>
        <Chat988 />
      </div>
      <a className="sh-btn sh-btn-two" href={telHref(SUPPORT_LINES.emergency)}>
        <span className="sh-btn-line">
          <Phone size={16} aria-hidden="true" /> Call 911
        </span>
        <span className="sh-btn-sub">If you’re in immediate danger</span>
      </a>
    </div>
  );
}

/** A possible overdose or poisoning: emergency services first, then Poison Control. */
function EmergencyActions() {
  return (
    <div className="sh-crisis-actions">
      <a className="sh-btn is-urgent" href={telHref(SUPPORT_LINES.emergency)}>
        <Phone size={17} aria-hidden="true" /> Call 911
      </a>
      <a className="sh-btn sh-btn-two" href={telHref(SUPPORT_LINES.poison)}>
        <span className="sh-btn-line">
          <Phone size={16} aria-hidden="true" /> Call Poison Control
        </span>
        <span className="sh-btn-sub">{SUPPORT_LINES.poison}</span>
      </a>
    </div>
  );
}

/** A number for one follow-up. It never replaces the number on the account. */
function PhoneRequest({
  label,
  detail,
  submit,
  initial = "",
  focus = false,
  onSubmit,
}: {
  label: string;
  detail?: string;
  submit: string;
  initial?: string;
  /** Takes focus when it replaces the button that opened it. */
  focus?: boolean;
  onSubmit: (digits: string) => void;
}) {
  const [value, setValue] = useState(() => {
    const onFile = phoneDigits(initial);
    return onFile ? formatPhone(onFile) : "";
  });
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const detailId = useId();
  const errorId = useId();
  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);
  const send = (event: FormEvent) => {
    event.preventDefault();
    const digits = phoneDigits(value);
    if (!digits) {
      setError("Enter a 10-digit US phone number.");
      input.current?.focus();
      return;
    }
    setError("");
    onSubmit(digits);
  };
  const described = [detail ? detailId : "", error ? errorId : ""].filter(Boolean).join(" ");
  return (
    <form className="sh-phone" onSubmit={send} noValidate>
      <label className="sh-phone-label" htmlFor={inputId}>
        {label}
      </label>
      {detail ? (
        <p className="sh-phone-detail" id={detailId}>
          {detail}
        </p>
      ) : null}
      <div className="sh-phone-row">
        <input
          ref={input}
          id={inputId}
          className="sh-phone-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="send"
          maxLength={20}
          placeholder="(512) 555-0100"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError("");
          }}
        />
        <button type="submit" className="sh-btn">
          {submit}
        </button>
      </div>
      {error ? (
        <p className="sh-phone-error" id={errorId} role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The crisis card's optional callback. Safety questions come before Legion has a phone
 * number, so the patient gives one here, and the confirmation is read from the queued task.
 */
function SafetyCallback({ state, ctx, from }: { state: ChatJourney; ctx: ChatContext; from: "crisis-card" | "help" }) {
  const task = openTask(state, "safety-callback");
  const [asked, setAsked] = useState(false);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asked && task) confirmation.current?.focus();
  }, [asked, task]);
  if (task)
    return (
      <div className="sh-status sh-callback-done" ref={confirmation} tabIndex={-1}>
        <span className="sh-status-icon" aria-hidden="true">
          <Check size={12} strokeWidth={3} />
        </span>
        <span>
          A Legion clinician will call {task.contact ? maskPhone(task.contact) : "you"} {dueWords(task.due)}.
          <span className="sh-status-sub">
            This preview doesn’t place real calls. If you need to talk now, call or text 988.
          </span>
        </span>
      </div>
    );
  return (
    <div className="sh-callback">
      <PhoneRequest
        label="Have a Legion clinician call me"
        detail="Optional. If you answered by mistake, the clinician can talk it through with you."
        submit="Call me"
        initial={state.profile.phone}
        onSubmit={(digits) => {
          setAsked(true);
          requestSafetyCallback(ctx, digits);
          track(ctx, "portal.support.safety_callback_requested", { from });
        }}
      />
    </div>
  );
}

const CARE_DUE = "Within 1 business day";

/** Asking for a person puts a task in the care team queue, and the confirmation names the number and when. */
const CARE_REQUESTS = {
  message: {
    label: "Message the care team",
    detail: "Texts back within 1 business day",
    Icon: MessageCircle,
    title: "Text the patient back",
    receipt: "Asked the care team to text you",
    ask: "What number should they text?",
    submit: "Send",
    sent: "Sent.",
    line: (number: string, due: string) => `Someone from the care team will text ${number} ${due}`,
  },
  call: {
    label: "Request a call",
    detail: "Calls back within 1 business day",
    Icon: Phone,
    title: "Call the patient back",
    receipt: "Asked the care team to call you",
    ask: "What number should they call?",
    submit: "Request",
    sent: "Requested.",
    line: (number: string, due: string) => `Someone from the care team will call ${number} ${due}`,
  },
} satisfies Record<
  string,
  {
    label: string;
    /** How they'll answer, matching the due time the request records (CARE_DUE). */
    detail: string;
    Icon: LucideIcon;
    title: string;
    receipt: string;
    ask: string;
    submit: string;
    sent: string;
    /** What happens and when, read from the recorded task. */
    line: (number: string, due: string) => string;
  }
>;

type CareKind = keyof typeof CARE_REQUESTS;

function CareRequest({ kind, state, ctx }: { kind: CareKind; state: ChatJourney; ctx: ChatContext }) {
  const item = CARE_REQUESTS[kind];
  const task = openTask(state, "care-team", item.title);
  // With no number on file yet (Help is there from the first message), the patient gives one.
  const [asking, setAsking] = useState(false);
  const [pressed, setPressed] = useState(false);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (pressed && task) confirmation.current?.focus();
  }, [pressed, task]);
  const send = (digits: string) => {
    setPressed(true);
    addTask(ctx, { kind: "care-team", title: item.title, due: CARE_DUE, contact: digits }, item.receipt);
    track(ctx, "portal.support.care_team_requested", { kind });
  };
  if (task) {
    return (
      <p className="sh-status" ref={confirmation} tabIndex={-1}>
        <span className="sh-status-icon" aria-hidden="true">
          <Check size={12} strokeWidth={3} />
        </span>
        {item.sent} {item.line(task.contact ? maskPhone(task.contact) : "you", dueWords(task.due))} (simulated).
      </p>
    );
  }
  if (asking)
    return (
      <div className="sh-reach-ask">
        <PhoneRequest label={item.ask} submit={item.submit} focus onSubmit={send} />
      </div>
    );
  const Icon = item.Icon;
  return (
    <button
      type="button"
      className="sh-reach"
      onClick={() => {
        const onFile = phoneDigits(state.profile.phone);
        if (onFile) send(onFile);
        else setAsking(true);
      }}
    >
      <span className="sh-reach-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="sh-reach-text">
        <strong>{item.label}</strong>
        <span>{item.detail}</span>
      </span>
    </button>
  );
}

/** Receipt-backed requests that no person has to act on today. */
const REQUESTS = {
  plan: {
    // A long label carries itself; an icon would strand at the edge when it wraps.
    label: "Tell me when Legion accepts my plan",
    action: "Asked to hear when Legion accepts Medicare or Medicaid",
    source: "Legion (simulated)",
    done: "Saved. Legion will let you know when it can accept your plan (simulated).",
  },
} satisfies Record<string, { label: string; action: string; source: string; done: string }>;

type RequestKind = keyof typeof REQUESTS;

/** The receipt is the record of the request, so the card, help and reloads all agree. */
function RequestButton({
  kind,
  state,
  ctx,
}: {
  kind: RequestKind;
  state: ChatJourney;
  ctx: ChatContext;
}) {
  const item = REQUESTS[kind];
  const done = state.chat.receipts.some((entry) => entry.action === item.action);
  const [pressed, setPressed] = useState(false);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // The button is replaced by its confirmation, so focus follows it.
    if (pressed && done) confirmation.current?.focus();
  }, [pressed, done]);
  if (done) {
    return (
      <p className="sh-status" ref={confirmation} tabIndex={-1}>
        <span className="sh-status-icon" aria-hidden="true">
          <Check size={12} strokeWidth={3} />
        </span>
        {item.done}
      </p>
    );
  }
  return (
    <button
      type="button"
      className="sh-btn"
      onClick={() => {
        setPressed(true);
        receipt(ctx, item.action, item.source, "You");
      }}
    >
      {item.label}
    </button>
  );
}

/** Focus moves to each confirmation, so the group isn't also a live region. */
function PersonActions({ state, ctx }: { state: ChatJourney; ctx: ChatContext }) {
  return (
    <div className="sh-actions">
      <CareRequest kind="message" state={state} ctx={ctx} />
      <CareRequest kind="call" state={state} ctx={ctx} />
    </div>
  );
}

const USES: { Icon: LucideIcon; title: string; text: string }[] = [
  { Icon: UsersRound, title: "Who sees your answers", text: "Your clinician and the Legion care team." },
  {
    Icon: Stethoscope,
    title: "What they’re for",
    text: "Preparing and providing your care, and billing for your visits.",
  },
  {
    Icon: Ban,
    title: "What never happens",
    text: "In this preview, your answers are never sent to analytics or advertising tools.",
  },
  {
    Icon: Sparkles,
    title: "The AI part",
    text: `${ASSISTANT.name} uses generative AI to draft messages and your visit brief. Your clinician reviews anything clinical, and this conversation is saved to your record.`,
  },
];

function DataUse() {
  return (
    <>
      <ul className="sh-uses">
        {USES.map(({ Icon, title, text }) => (
          <li key={title}>
            <span className="sh-use-icon" aria-hidden="true">
              <Icon size={16} strokeWidth={2} />
            </span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="sh-operator">Operated by Legion Health, Inc. and Legion Health, PA.</p>
    </>
  );
}

/* ============================================================== Cards */

function Disclosure({ ctx }: CardProps) {
  const id = useId();
  return (
    <section className="card-shell sh-card" aria-labelledby={id}>
      <h3 id={id} className="card-title">
        Before we start
      </h3>
      <ul className="sh-points">
        <li>
          <AssistantAvatar className="sh-point-avatar" />
          <p>
            I’m {ASSISTANT.name}, Legion’s virtual assistant. I’m an AI, not a person, and I set up your care.
          </p>
        </li>
        <li>
          <span className="sh-point-icon" aria-hidden="true">
            <Stethoscope size={16} strokeWidth={2} />
          </span>
          <p>Licensed clinicians make every diagnosis and treatment decision.</p>
        </li>
        <li>
          <span className="sh-point-icon" aria-hidden="true">
            <Lock size={16} strokeWidth={2} />
          </span>
          <div>
            <p>What you share goes only to your Legion care team.</p>
            <button type="button" className="sh-link sh-point-link" onClick={() => ctx.openSheet("help", "data")}>
              How your information is used
            </button>
          </div>
        </li>
      </ul>
    </section>
  );
}

function DataUseCard() {
  const id = useId();
  return (
    <section className="card-shell sh-card" aria-labelledby={id}>
      <h3 id={id} className="card-title">
        How your information is used
      </h3>
      <DataUse />
    </section>
  );
}

function PersonCard({ state, ctx }: CardProps) {
  const id = useId();
  const started = !!state.chat.storyMode || state.conditions.length > 0;
  return (
    <section className="card-shell sh-card" aria-labelledby={id}>
      <h3 id={id} className="card-title">
        Reach the care team
      </h3>
      <p className="card-lead">
        {started
          ? "Your answers so far are shared so you don’t have to repeat yourself."
          : "Whatever you share with me goes to them too, so you won’t have to repeat yourself."}
      </p>
      <PersonActions state={state} ctx={ctx} />
    </section>
  );
}

/** The calmer card: shown with risk that doesn't pause booking, before or after a visit is booked. */
function SupportLine() {
  return (
    <section className="card-shell tone-quiet sh-card sh-support" aria-label="Support any time">
      <p>
        Call or text 988 any time to talk with someone. It’s free and confidential. In an
        emergency, call 911.
      </p>
      <Line988 emergency />
    </section>
  );
}

/** Shown when booking pauses for safety. The way back is a person, never re-answering. */
function CrisisCard({ state, ctx }: CardProps) {
  const id = useId();
  return (
    <section className="card-shell sh-card sh-crisis" aria-labelledby={id}>
      <h3 id={id} className="card-title">
        You don’t have to handle this alone
      </h3>
      <p className="card-lead">
        Legion isn’t an emergency service, and people are ready to talk right now.
      </p>
      <CrisisActions />
      <p className="sh-es" lang="es">
        En español: llama al 988 y marca 2, o envía AYUDA al 988.
      </p>
      <SafetyCallback state={state} ctx={ctx} from="crisis-card" />
      <div className="sh-crisis-foot">
        <p>Your answers are saved, so you won’t have to repeat yourself.</p>
      </div>
    </section>
  );
}

function PublicExit() {
  const id = useId();
  return (
    <section className="card-shell sh-card" aria-labelledby={id}>
      <h3 id={id} className="card-title">
        Legion can’t accept Medicare or Medicaid yet
      </h3>
      <p className="card-lead">You can still get care. Here’s where to start.</p>
      <ul className="sh-points">
        <li>
          <span className="sh-point-icon" aria-hidden="true">
            <Phone size={16} strokeWidth={2} />
          </span>
          <p>
            Call the member services number on your card and ask for in-network psychiatry. They
            can tell you who takes your plan.
          </p>
        </li>
      </ul>
      <SupportLines />
      <p className="card-foot">Answered by mistake? Tap your answer to change it.</p>
    </section>
  );
}

function AgeExit({ state }: CardProps) {
  const id = useId();
  const fromQuickCheck = state.chat.quickCheckFailed === "adult";
  return (
    <section className="card-shell sh-card" aria-labelledby={id}>
      <h3 id={id} className="card-title">
        Legion’s clinicians care for adults 18 and older
      </h3>
      <p className="card-lead">You deserve care that fits you, and these are good places to start.</p>
      <ul className="sh-points">
        <li>
          <span className="sh-point-icon" aria-hidden="true">
            <UsersRound size={16} strokeWidth={2} />
          </span>
          <p>A parent or guardian can help you find a clinician who works with young people.</p>
        </li>
        <li>
          <span className="sh-point-icon" aria-hidden="true">
            <GraduationCap size={16} strokeWidth={2} />
          </span>
          <p>Your school counselor can talk with you and help you find care nearby.</p>
        </li>
        <li>
          <span className="sh-point-icon" aria-hidden="true">
            <Stethoscope size={16} strokeWidth={2} />
          </span>
          <p>Your pediatrician or family doctor can start care or refer you.</p>
        </li>
      </ul>
      <SupportLines />
      <p className="card-foot">
        {fromQuickCheck
          ? "Answered by mistake? Tap your answer to change it."
          : state.chat.manualDetails
            ? "Entered the wrong birth date? Tap your details to change them."
            : "Entered the wrong birth date? Tap it to change it."}
      </p>
    </section>
  );
}

/* ========================================================= Help sheet */

interface Exchange {
  id: number;
  question: string;
  reply: GuideAnswer;
}

const SUGGESTED = [
  "How much will this cost?",
  "Am I talking to a real person?",
  "Can we talk about medication?",
];

/** Questions that get crisis or emergency help before anything else. */
function urgency(reply: GuideAnswer): "crisis" | "emergency" | null {
  return reply.intent === "crisis" || reply.intent === "emergency" ? reply.intent : null;
}

function HelpSheet({ state, ctx, data }: SheetProps) {
  // Opened from "How your information is used": that answer comes first, right after crisis help.
  const dataFirst = data === "data";
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [dataOpen, setDataOpen] = useState(dataFirst);
  const noted = state.chat.questions;
  const crisisId = useId();
  const askId = useId();
  const dataId = useId();
  const dataBodyId = useId();

  const ask = (raw: string) => {
    const question = raw.trim().slice(0, 300);
    if (!question) return;
    const local = answerQuestion(question);
    // After booking, questions about the booking itself are answered from it, as in the chat.
    // Crisis help is decided first, from the words alone.
    const booking = urgency(local) ? null : bookingAnswer(ctx.get(), question);
    const reply: GuideAnswer = booking ? { ...local, text: booking.answer, forClinician: false } : local;
    setExchanges((items) => [...items, { id: items.length + 1, question, reply }]);
    setDraft("");
    if (reply.forClinician) {
      ctx.update({ chat: { questions: [...ctx.get().chat.questions, question] } });
      receipt(ctx, "Noted your question for your clinician", "Your visit notes");
    }
    const urgent = urgency(reply);
    if (urgent) {
      // The words go to the clinician with a same-day check-in. Help stays open; nothing else stops.
      flagRisk(ctx, "help", question);
      track(ctx, "portal.support.crisis_resources_shown", { source: "help" });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  const dataSection = (
    <section className="sh-section" aria-labelledby={dataId}>
      <h3 className="sh-h">
        <button
          type="button"
          id={dataId}
          className="sh-disclose"
          aria-expanded={dataOpen}
          aria-controls={dataBodyId}
          onClick={() => setDataOpen((open) => !open)}
        >
          How your information is used
          <ChevronDown size={18} className="sh-chevron" aria-hidden="true" />
        </button>
      </h3>
      <div id={dataBodyId} className="sh-disclose-body" hidden={!dataOpen}>
        <DataUse />
      </div>
    </section>
  );

  return (
    <div className="sh-sheet sh-help">
      <section className="sh-crisisbar" aria-labelledby={crisisId}>
        <div className="sh-crisisbar-head">
          <span className="sh-crisisbar-icon" aria-hidden="true">
            <Phone size={16} strokeWidth={2.2} />
          </span>
          <div>
            <h3 id={crisisId} className="sh-h">
              If you’re in crisis
            </h3>
            <p>Call or text 988 any time. It’s free and confidential. In immediate danger, call 911.</p>
          </div>
        </div>
        <div className="sh-crisis-compact">
          <a className="sh-btn" href={telHref(SUPPORT_LINES.crisis)}>
            <Phone size={16} aria-hidden="true" /> Call 988
          </a>
          <a className="sh-btn" href={`sms:${SUPPORT_LINES.crisis}`}>
            <MessageCircle size={16} aria-hidden="true" /> Text 988
          </a>
          <Chat988 />
          <a className="sh-btn is-emergency" href={telHref(SUPPORT_LINES.emergency)}>
            <Phone size={16} aria-hidden="true" /> Call 911
          </a>
        </div>
        <p className="sh-es" lang="es">
          En español: llama al 988 y marca 2, o envía AYUDA al 988.
        </p>
      </section>

      {dataFirst ? dataSection : null}

      <section className="sh-section" aria-labelledby={askId}>
        <h3 id={askId} className="sh-h">
          Ask a question
        </h3>
        <p className="sh-lead">
          {ASSISTANT.name} answers from Legion’s own policies. Anything medical goes to your clinician.
        </p>
        {exchanges.length ? (
          <div className="sh-qa" role="log" aria-label={`Your questions and ${ASSISTANT.name}’s answers`}>
            {exchanges.map((item) => (
              <Fragment key={item.id}>
                <div className="msg from-patient enter">
                  <div className="bubble">{item.question}</div>
                </div>
                <div className="msg from-agent enter">
                  <AgentAvatar />
                  <div className="bubble">{item.reply.text}</div>
                </div>
                {item.reply.forClinician ? (
                  <p className="sh-noted-line">
                    <Check size={13} strokeWidth={3} aria-hidden="true" />
                    I’ve noted this for your clinician.
                  </p>
                ) : null}
                {urgency(item.reply) === "crisis" ? (
                  <div className="sh-qa-crisis">
                    <CrisisActions />
                    <SafetyCallback state={state} ctx={ctx} from="help" />
                  </div>
                ) : urgency(item.reply) === "emergency" ? (
                  <div className="sh-qa-crisis">
                    <EmergencyActions />
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="sh-suggest" role="group" aria-label="Example questions">
            {SUGGESTED.map((question, index) => (
              <button
                type="button"
                className="sh-suggestion"
                key={question}
                style={{ ["--i" as string]: index }}
                onClick={() => ask(question)}
              >
                {question}
              </button>
            ))}
          </div>
        )}
        <form className="sh-ask" onSubmit={submit}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a question"
            aria-labelledby={askId}
            inputMode="text"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={300}
          />
          <button
            type="submit"
            className="sh-ask-send"
            disabled={!draft.trim()}
            aria-label={`Ask ${ASSISTANT.name}`}
          >
            <ArrowUp size={19} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </form>
        {noted.length ? (
          <div className="sh-noted">
            <h4 className="sh-h4">Noted for your clinician</h4>
            <ul>
              {noted.map((question, index) => (
                <li key={`${index}-${question}`}>“{question}”</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <Section
        title="Talk to a person"
        lead="The care team can help by text or phone, and they’ll see what you’ve already shared."
      >
        <PersonActions state={state} ctx={ctx} />
        <p className="sh-meta">Response times in this preview are simulated.</p>
      </Section>

      {dataFirst ? null : dataSection}

      {/* Reviewer tools stay out of the patient's Help when the link says ?preview=0. */}
      {PREVIEW ? (
        <button type="button" className="sh-entry" onClick={() => ctx.openSheet("preview")}>
          <span className="sh-entry-icon" aria-hidden="true">
            <Wrench size={16} strokeWidth={2} />
          </span>
          <span>
            <strong>Preview tools</strong>
            <span>For reviewers: jump ahead, try what can go wrong, and see what your clinician sees.</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

/* ====================================================== Journey sheet */

type StageStatus = "done" | "current" | "next";

function stageDetail(
  stage: ChatStage,
  status: StageStatus,
  s: ChatJourney,
  halted: boolean,
  upNext: boolean,
): string {
  if (status === "current" && halted) return "Paused. The last message has your next steps.";
  const waiting = upNext ? "Up next" : "Later";
  switch (stage) {
    case "story":
      return status === "done" ? "Done" : "In progress";
    case "clinician":
      if (status === "done") return s.providerId ? `With ${clinicianName(s.providerId)}` : "Done";
      return status === "current" ? "In progress" : waiting;
    case "booking":
      if (status === "done") return booked(s) ? "Booked" : "Done";
      return status === "current" ? "In progress" : waiting;
    case "visit":
      if (status === "done") return "First visit complete";
      if (status === "current")
        return booked(s) ? safe(() => appointmentWhen(s), "Getting ready") : "Getting ready";
      return waiting;
  }
}

function StageList({
  state,
  transcript,
}: {
  state: ChatJourney;
  transcript: Transcript<ChatJourney, ChatContext>;
}) {
  const index = Math.max(
    0,
    STAGES.findIndex((stage) => stage.id === transcript.stage),
  );
  const complete = state.encounter.status === "completed";
  return (
    <ol className="sh-stages" aria-label="Your progress">
      {STAGES.map((stage, i) => {
        const status: StageStatus =
          i < index || (complete && stage.id === "visit")
            ? "done"
            : i === index
              ? "current"
              : "next";
        return (
          <li
            key={stage.id}
            className={`sh-stage is-${status}`}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className="sh-stage-dot" aria-hidden="true">
              {status === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span className="sh-stage-text">
              <strong>{stage.title}</strong>
              <span>
                {stageDetail(stage.id, status, state, transcript.halted, i === index + 1)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface SharedMeta {
  label: string;
  /** A clearer summary than the chip that was tapped, when the chip only makes sense in context. */
  show?: (s: ChatJourney, text: string) => string;
}

function nameAndPlace(s: ChatJourney, text: string): string {
  const name = fullName(s.profile);
  if (!name) return text;
  return [name, s.profile.address, s.profile.city].filter(Boolean).join(", ");
}

function medicationShown(s: ChatJourney, text: string): string {
  const med = s.chat.recordsFound?.medication;
  if (s.chat.medication === "none") return "None";
  if (!med) return text;
  const name = med.name.toLowerCase();
  if (s.chat.medication === "taking") return `Still taking ${name} ${med.dose}`;
  if (s.chat.medication === "stopped") return `Stopped ${name}`;
  if (s.chat.medication === "changed") return `Different dose of ${name}`;
  return text;
}

function allergyShown(s: ChatJourney, text: string): string {
  const recorded = s.chat.recordsFound?.allergy;
  if (!recorded) return text;
  const name = recorded.split(" (")[0].toLowerCase();
  if (s.chat.allergy === "yes") return `Allergic to ${name}`;
  if (s.chat.allergy === "no") return `Not allergic to ${name}`;
  if (s.chat.allergy === "unsure") return `Not sure about ${name}`;
  return text;
}

/** Short name for the safety question, kept to its own words (SCREEN in safety.ts). */
const SCREEN_LABEL: Record<ScreenItem, string> = {
  now: "Safe right now",
};

/** Answers worth seeing again. Confirmations and flow choices are left out. */
const SHARED: Record<string, SharedMeta> = {
  story: { label: "What you’d like help with" },
  "story-other": { label: "Something else" },
  goal: { label: "Your goal for the first visit" },
  quick: {
    label: "Quick checks",
    show: (s, text) => (s.chat.quickCheck === "all" ? "18 or older, in Texas, video works" : text),
  },
  "quick-which": { label: "What isn’t true right now" },
  "story-safe": { label: "Safe right now" },
  "other-safe": { label: "Safe right now" },
  ...Object.fromEntries(SCREEN.map((item) => [`screen-${item.id}`, { label: SCREEN_LABEL[item.id] }])),
  hospital: { label: "Hospital stay in the past year" },
  pay: { label: "How you’ll pay" },
  payer: { label: "Insurance company" },
  when: { label: "When you’re free" },
  choose: { label: "Your clinician and time" },
  phone: { label: "Mobile number" },
  dob: { label: "Date of birth" },
  identity: { label: "Name and address", show: nameAndPlace },
  details: { label: "Name and address", show: nameAndPlace },
  email: { label: "Email" },
  benefits: {
    label: "Insurance plan",
    show: (s, text) => (s.chat.benefits ? `${s.chat.benefits.payer} ${s.chat.benefits.plan}` : text),
  },
  agreements: { label: "Agreements" },
  payment: { label: "Card on file" },
  prep: { label: "Visit prep", show: (s) => (s.chat.prep === "yes" ? "Started" : "Later") },
  records: {
    label: "Records from past care",
    show: (s) => (s.chat.records === "yes" ? "Requested" : "Not now"),
  },
  medication: { label: "Current medication", show: medicationShown },
  allergy: { label: "Medication allergies", show: allergyShown },
  pharmacy: {
    label: "Pharmacy",
    show: (s, text) => {
      const found = s.chat.recordsFound?.pharmacy;
      return s.chat.pharmacy === "suggested" && found ? `${found.name}, ${found.address}` : text;
    },
  },
  pcp: { label: "Primary care doctor" },
  "pcp-name": { label: "Summary goes to" },
  baseline: {
    label: "Check-ins",
    show: (s) => (s.chat.baselineIntro === "start" ? "Started" : "Skipped"),
  },
  "baseline-gad1": { label: "Nervous or on edge" },
  "baseline-gad2": { label: "Can’t stop worrying" },
  "baseline-phq1": { label: "Little interest or pleasure" },
  "baseline-phq2": { label: "Down or hopeless" },
  note: { label: "Note for your clinician" },
  brief: { label: "Visit brief", show: (s) => (s.chat.briefApproved ? "Approved" : "Not sent") },
  idcheck: { label: "Photo ID" },
  "day-meds": { label: "Taking medications on visit day" },
  "day-allergies": { label: "Medication allergies on visit day" },
  after: { label: "How you felt after the visit" },
  followup: { label: "Follow-up visit" },
};

/** Screener items and "Are you safe right now?": a risk answer there is never taken back in chat. */
const isSafetyNode = (id: string) => id.startsWith("screen-") || id === "story-safe" || id === "other-safe";

/** The answer on record for a safety question is a risk answer. */
function isRiskRow(s: ChatJourney, id: string): boolean {
  if (id === "story-safe") return s.chat.safeNow.story === "unsafe";
  if (id === "other-safe") return s.chat.safeNow.other === "unsafe";
  const item = id.startsWith("screen-") ? (id.slice("screen-".length) as keyof ChatState["screen"]) : null;
  return !!item && isRiskAnswer(s.chat.screen[item]);
}

interface SharedRow {
  id: string;
  stage: ChatStage;
  label: string;
  text: string;
  editable: boolean;
  /** A risk answer to a safety question, which only a person can follow up on. */
  risk: boolean;
}

function sharedRows(s: ChatJourney, path: Path): SharedRow[] {
  const rows: SharedRow[] = [];
  for (const step of path) {
    const meta = SHARED[step.id];
    if (!step.answered || !meta) continue;
    const node = SCRIPT.find((item) => item.id === step.id);
    if (!node?.input) continue;
    const answer = safe(() => node.answer(s), null);
    if (!answer?.text) continue;
    rows.push({
      id: node.id,
      stage: node.stage,
      label: meta.label,
      text: meta.show ? meta.show(s, answer.text) : answer.text,
      editable: answer.editable,
      risk: isRiskRow(s, node.id),
    });
  }
  return rows;
}

/** Stages with nothing left to change start folded, so the list stays about what can still move. */
function SharedAnswers({
  rows,
  current,
  onChange,
}: {
  rows: SharedRow[];
  current: ChatStage;
  onChange: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState<Partial<Record<ChatStage, boolean>>>({});
  const baseId = useId();
  if (!rows.length) return <p className="sh-empty">Nothing yet. Your answers show up here as you go.</p>;
  const locked = rows.filter((row) => !row.editable);
  const lockedSafety = locked.some((row) => row.risk);
  const lockedOther = locked.some((row) => !row.risk);
  return (
    <>
      <div className="sh-shared-panel">
      {STAGES.map((stage) => {
        const items = rows.filter((row) => row.stage === stage.id);
        if (!items.length) return null;
        const expanded =
          open[stage.id] ?? (stage.id === current || items.some((row) => row.editable));
        const bodyId = `${baseId}-${stage.id}`;
        return (
          <div className="sh-shared-group" key={stage.id}>
            <h4 className="sh-h4">
              <button
                type="button"
                className="sh-group-toggle"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => setOpen((state) => ({ ...state, [stage.id]: !expanded }))}
              >
                <span>{stage.title}</span>
                <span className="sh-group-count">
                  {items.length === 1 ? "1 answer" : `${items.length} answers`}
                </span>
                <ChevronDown size={16} className="sh-chevron" aria-hidden="true" />
              </button>
            </h4>
            <ul className="sh-shared" id={bodyId} hidden={!expanded}>
              {items.map((row) => (
                <li className="sh-shared-row" key={row.id}>
                  <span className="sh-shared-text">
                    <span className="sh-shared-label">{row.label}</span>
                    <span className="sh-shared-value">{row.text}</span>
                  </span>
                  {row.editable ? (
                    <button
                      type="button"
                      className="sh-link sh-change"
                      aria-label={`Change ${lowerFirst(row.label)}`}
                      onClick={() => onChange(row.id)}
                    >
                      Change
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      </div>
      {lockedSafety ? (
        <p className="sh-meta">
          Some safety answers can’t be changed here. A Legion clinician can talk them through
          with you.
        </p>
      ) : null}
      {lockedOther ? (
        <p className="sh-meta">
          {lockedSafety ? "Other answers" : "Answers"} without Change are set because something
          already depends on them. The care team can update them for you.
        </p>
      ) : null}
    </>
  );
}

const ACTOR_CLASS: Record<Receipt["actor"], string> = {
  "Legion AI": "is-ai",
  You: "is-you",
  "Your clinician": "is-clinician",
  "Care team": "is-team",
};

/** Receipts keep "Legion AI" as their actor value; people see the assistant's name. */
const actorName = (actor: Receipt["actor"]) => (actor === "Legion AI" ? ASSISTANT.name : actor);

function ActorIcon({ actor }: { actor: Receipt["actor"] }) {
  if (actor === "Legion AI") return <AssistantAvatar className="sh-actor-avatar" />;
  return (
    <span className={`sh-actor ${ACTOR_CLASS[actor]}`} aria-hidden="true">
      {actor === "You" ? (
        <UserRound size={14} strokeWidth={2.1} />
      ) : actor === "Your clinician" ? (
        <Stethoscope size={14} strokeWidth={2.1} />
      ) : (
        <UsersRound size={14} strokeWidth={2.1} />
      )}
    </span>
  );
}

const RECEIPT_CAP = 6;

function ReceiptList({
  receipts,
  now,
  empty,
  compact = false,
  named = false,
}: {
  receipts: Receipt[];
  now: number;
  empty: string;
  compact?: boolean;
  /** Says who did each step in words too, for lists that mix the assistant and people. */
  named?: boolean;
}) {
  const [all, setAll] = useState(false);
  const listId = useId();
  if (!receipts.length) return <p className="sh-empty">{empty}</p>;
  // The full trail is for reviewers; the patient's list starts with the latest few.
  const capped = !compact && receipts.length > RECEIPT_CAP + 1;
  const shown = capped && !all ? receipts.slice(0, RECEIPT_CAP) : receipts;
  return (
    <div className="sh-log-wrap">
      <ol className={`sh-log ${compact ? "is-compact" : ""}`} id={listId}>
        {shown.map((item) => (
          <li className="sh-log-item" key={item.id}>
            <ActorIcon actor={item.actor} />
            <div className="sh-log-body">
              <p className="sh-log-action">
                <span className={named ? "sh-log-who" : "sh-vh"}>
                  {actorName(item.actor)}
                  {named ? null : ": "}
                </span>
                {item.action}
              </p>
              <p className="sh-log-meta">
                <span>{item.source}</span>
                <time dateTime={item.at}>{ago(item.at, now)}</time>
              </p>
            </div>
          </li>
        ))}
      </ol>
      {capped ? (
        <button
          type="button"
          className="sh-link sh-more"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll((open) => !open)}
        >
          {all ? "Show fewer" : `Show all ${receipts.length}`}
          <ChevronDown size={16} className="sh-chevron" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function Switch({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="sh-choice">
      <div>
        <p id={labelId} className="sh-choice-label">
          {label}
        </p>
        <p id={descriptionId} className="sh-choice-desc">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        className="sh-switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="sh-switch-state" aria-hidden="true">
          {checked ? "On" : "Off"}
        </span>
        <span className="sh-switch-track" aria-hidden="true">
          <span className="sh-switch-thumb" />
        </span>
      </button>
    </div>
  );
}

function Choices({ state, ctx }: { state: ChatJourney; ctx: ChatContext }) {
  const [said, setSaid] = useState("");
  const hasPhone = state.profile.phone.replace(/\D/g, "").length === 10;

  const setNotes = (on: boolean) => {
    ctx.update({ chat: { aiNotes: on } });
    receipt(
      ctx,
      on ? "Turned on AI notes for your visits" : "Turned off AI notes for your visits",
      "Your choices",
      "You",
    );
    setSaid(on ? "AI notes are on." : "AI notes are off. Your clinician will write the notes.");
  };

  const setTexts = (on: boolean) => {
    ctx.update({ profile: { ...ctx.get().profile, sms: on } });
    receipt(ctx, on ? "Turned on text reminders" : "Turned off text reminders", "Your choices", "You");
    const appointment = ctx.get().appointment;
    // Reminders already queued follow the new choice.
    if (appointment?.status === "confirmed")
      void ctx.api.scheduleReminders(appointment.id).catch(() => undefined);
    setSaid(
      on
        ? "Text reminders are on."
        : state.emailReminder
          ? "Text reminders are off. Email reminders still go out."
          : "Text reminders are off.",
    );
  };

  return (
    <div className="sh-choices">
      <Switch
        label="AI notes during visits"
        description="An AI tool listens during your visit and drafts notes for your clinician to review. When it’s off, your clinician writes the notes."
        checked={state.chat.aiNotes}
        onChange={setNotes}
      />
      <Switch
        label="Text reminders"
        description={
          hasPhone
            ? `A text ${reminderTimes(state)} your visit.`
            : "Available once you add a mobile number."
        }
        checked={hasPhone && state.profile.sms}
        disabled={!hasPhone}
        onChange={setTexts}
      />
      <p className="sh-meta" role="status">
        {said}
      </p>
    </div>
  );
}

const DUE_ORDER = ["Today", "Before the visit", "Within 1 business day", "At the visit"];
const dueRank = (due: string) => {
  const index = DUE_ORDER.indexOf(due);
  return index < 0 ? DUE_ORDER.length : index;
};

/** Open follow-ups first, soonest due first, then in the order they were added. */
function byUrgency(tasks: CareTask[]): CareTask[] {
  return [...tasks].sort(
    (a, b) => Number(a.status === "done") - Number(b.status === "done") || dueRank(a.due) - dueRank(b.due),
  );
}

/** What a follow-up means for the patient. The care team's own work (a clinician's flag) stays off this list. */
function followupLine(task: CareTask): string | null {
  const when = dueWords(task.due);
  const number = task.contact ? maskPhone(task.contact) : "";
  switch (task.kind) {
    case "safety-callback":
      return `A Legion clinician will call ${number || "you"} ${when}.`;
    case "coordinator-call":
      return number ? `A care coordinator will call ${number} ${when}.` : `A care coordinator will follow up ${when}.`;
    case "post-visit":
      return `Someone from the care team will check in with you${number ? ` at ${number}` : ""} ${when}.`;
    case "risk-review":
      // Without a number the team can still read what was shared, but can't reach out.
      return number
        ? `The care team will follow up with you at ${number} ${when}.`
        : `The care team will review what you shared ${when}.`;
    case "care-team": {
      const request = Object.values(CARE_REQUESTS).find((item) => item.title === task.title);
      return request ? `${request.line(number || "you", when)}.` : null;
    }
  }
}

function CareFollowups({ state }: { state: ChatJourney }) {
  const items: { line: string; actor: Receipt["actor"] }[] = [];
  for (const task of byUrgency(state.chat.tasks.filter((item) => item.status === "open"))) {
    const line = followupLine(task);
    if (line && !items.some((item) => item.line === line))
      items.push({ line, actor: task.kind === "safety-callback" ? "Your clinician" : "Care team" });
  }
  if (!items.length) return null;
  return (
    <Section title="What the care team will do" lead="A person at Legion handles each of these. Simulated in this preview.">
      <ul className="sh-followups">
        {items.map((item) => (
          <li key={item.line}>
            <ActorIcon actor={item.actor} />
            <p>{item.line}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function JourneySheet({ state, ctx, close, data }: SheetProps) {
  const rail = data === "rail";
  const now = useNow();
  const transcript = deriveTranscript(SCRIPT, state);
  const rows = sharedRows(state, transcript.path);
  return (
    <div className={`sh-sheet sh-journey ${rail ? "is-rail" : ""}`}>
      {rail ? <h2 className="sh-rail-title">Your first visit</h2> : null}
      <StageList state={state} transcript={transcript} />
      <Section
        title="What you’ve shared"
        lead={rows.length ? "Change an answer and anything that depends on it updates too." : undefined}
      >
        <SharedAnswers
          rows={rows}
          current={transcript.stage}
          onChange={(nodeId) => {
            ctx.edit(nodeId);
            close();
          }}
        />
      </Section>
      <CareFollowups state={state} />
      <Section
        title={`What ${ASSISTANT.name} did for you`}
        lead="Each step is logged with where the information came from, newest first."
      >
        <ReceiptList
          receipts={[...state.chat.receipts].reverse()}
          now={now}
          empty={`Nothing yet. When ${ASSISTANT.name} looks up openings or checks your insurance, it shows up here.`}
        />
      </Section>
      <Section title="Your choices" lead="You can change these anytime.">
        <Choices state={state} ctx={ctx} />
      </Section>
    </div>
  );
}

/* ========================================================= Skip sheet */

function SkipSheet({ state, ctx, close }: SheetProps) {
  const appointment = state.appointment;
  const ready = appointment?.status === "confirmed" && !state.visitDay;
  const when = appointment ? safe(() => appointmentWhen(state), "") : "";
  const skip = () => {
    skipToVisitDay(ctx);
    // The reviewer pressed it; no one on the care team did.
    receipt(ctx, "Skipped ahead to visit day", "Preview tools", "You");
    close();
  };
  return (
    <div className="sh-sheet">
      <div className="sh-preview">
        <ReviewerNote>Preview only. Real patients wait for their visit day.</ReviewerNote>
        <p className="sh-body">
          In real life, the time before your visit would pass here, and Legion would remind you{" "}
          {reminderTimes(state)}.
        </p>
        <p className="sh-body">
          Skipping moves the preview clock to 14 minutes before your visit, just after check{"\u2011"}in opens.
        </p>
        {when && appointment ? (
          <dl className="sh-kv">
            <Row k="Your visit" v={`${when} with ${clinicianName(appointment.providerId)}`} />
          </dl>
        ) : null}
      </div>
      <div className="sh-footer-actions">
        <button type="button" className="sh-btn" onClick={close}>
          Not now
        </button>
        <button type="button" className="sh-btn is-primary" onClick={skip} disabled={!ready}>
          Skip to visit day
        </button>
      </div>
      {!ready ? (
        <p className="sh-meta">
          {state.visitDay ? "You’re already at visit day." : "Book a visit first."}
        </p>
      ) : null}
    </div>
  );
}

/* ====================================================== Preview sheet */

const MOMENTS: { id: Moment; title: string; detail: string }[] = [
  { id: "start", title: "The beginning", detail: `Meeting ${ASSISTANT.name} and the first question` },
  { id: "clinician", title: "Choosing a clinician", detail: "Matches with openings that fit" },
  { id: "booking", title: "Booking", detail: "Phone, identity and insurance" },
  { id: "booked", title: "Just booked", detail: "Getting ready for the visit" },
  { id: "visit-day", title: "Visit day", detail: "Reminder, check-in and the visit" },
  { id: "complete", title: "After the visit", detail: "Care plan and follow\u2011up" },
];

const SCENARIOS: { value: Scenario; title: string; where: string; moment?: Moment }[] = [
  { value: "standard", title: "Everything goes smoothly", where: "Every service answers normally" },
  {
    value: "calendars-unavailable",
    title: "Calendars don’t answer",
    where: `When ${ASSISTANT.name} looks for clinicians`,
    moment: "start",
  },
  { value: "slot-taken", title: "Someone takes the time", where: "When you pick a time", moment: "clinician" },
  {
    value: "code-not-delivered",
    title: "Code text doesn’t arrive",
    where: `When ${ASSISTANT.name} texts your code`,
    moment: "booking",
  },
  {
    value: "identity-not-found",
    title: "Phone lookup finds nothing",
    where: "After you enter your birth date",
    moment: "booking",
  },
  {
    value: "coverage-not-found",
    title: "No plan found",
    where: `When ${ASSISTANT.name} looks up your plan`,
    moment: "booking",
  },
  {
    value: "coverage-pending",
    title: "Insurance takes longer",
    where: "During the insurance check",
    moment: "booking",
  },
  {
    value: "coverage-unmatched",
    title: "Insurance details don’t match",
    where: "During the insurance check",
    moment: "booking",
  },
  {
    value: "payment-authentication",
    title: "Bank asks to confirm",
    where: "When you add a card",
    moment: "booking",
  },
  { value: "payment-retry", title: "Card needs a retry", where: "When you add a card", moment: "booking" },
  {
    value: "records-unavailable",
    title: "No records found",
    where: `When ${ASSISTANT.name} looks for records`,
    moment: "booked",
  },
  { value: "id-unreadable", title: "ID photo can’t be read", where: "When you verify your photo ID", moment: "booked" },
  {
    value: "mychart-unavailable",
    title: "MyChart doesn’t connect",
    where: "When you bring your chart from MyChart",
    moment: "booked",
  },
  { value: "clinician-late", title: "Clinician running late", where: "In the waiting room", moment: "visit-day" },
  { value: "connection-lost", title: "Visit disconnects", where: "During the visit", moment: "visit-day" },
  { value: "care-plan-delayed", title: "Plan takes longer", where: "After the visit", moment: "visit-day" },
  {
    value: "prescription-failed",
    title: "Refill doesn’t reach the pharmacy",
    where: "When your clinician sends your refill after the visit",
    moment: "visit-day",
  },
  {
    value: "share-failed",
    title: "Summary doesn’t send",
    where: "When you share your summary with your doctor",
    moment: "complete",
  },
];

const REMINDER_TITLES: Record<string, string> = {
  "1440": "Your visit is tomorrow",
  "60": "Your visit is in an hour",
  "15": "Your visit starts in 15 minutes",
};

function notificationTitle(item: Notification): string {
  switch (item.kind) {
    case "confirmation":
      return "Your visit is booked";
    case "rescheduled":
      return "Your visit time changed";
    case "cancelled":
      return "Your visit is cancelled";
    case "care-plan":
      return "Your care plan is ready";
    case "reminder":
      return REMINDER_TITLES[/reminder-(\d+)$/.exec(item.id)?.[1] ?? ""] ?? "Your visit is coming up";
  }
}

/** Status is written into the line; the trailing icon is only a scanning aid. */
const DELIVERY: Record<
  Exclude<Notification["status"], "cancelled">,
  { phrase: string; Icon: LucideIcon }
> = {
  delivered: { phrase: "delivered", Icon: Check },
  queued: { phrase: "scheduled for", Icon: Clock3 },
  failed: { phrase: "not delivered,", Icon: CircleAlert },
};

function InboxRow({
  channel,
  title,
  meta,
  status,
}: {
  channel: Notification["channel"];
  title: string;
  meta: string;
  status: keyof typeof DELIVERY;
}) {
  const Icon = DELIVERY[status].Icon;
  return (
    <li className="sh-msg">
      <span className="sh-msg-icon" aria-hidden="true">
        {channel === "sms" ? <MessageSquareText size={16} /> : <Mail size={16} />}
      </span>
      <div>
        <p className="sh-msg-title">{title}</p>
        <p className="sh-msg-meta">{meta}</p>
      </div>
      <span className={`sh-msg-status is-${status}`} aria-hidden="true">
        <Icon size={15} strokeWidth={2.4} />
      </span>
    </li>
  );
}

function Inbox({ state, now }: { state: ChatJourney; now: number }) {
  const items = state.notifications
    .filter(
      (item): item is Notification & { status: keyof typeof DELIVERY } => item.status !== "cancelled",
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const codeSent = state.chat.codeSentAt;
  return (
    <ul className="sh-inbox">
      <InboxRow
        channel="sms"
        title={`Your Legion code is ${PREVIEW_CODE}`}
        meta={codeSent ? `Text, sent ${lowerFirst(ago(codeSent, now))}` : "Text, sent when you add your number"}
        status={codeSent ? "delivered" : "queued"}
      />
      {items.map((item) => (
        <InboxRow
          key={item.id}
          channel={item.channel}
          title={notificationTitle(item)}
          meta={`${item.channel === "sms" ? "Text" : "Email"}, ${DELIVERY[item.status].phrase} ${CENTRAL_DAY.format(new Date(item.scheduledAt))}`}
          status={item.status}
        />
      ))}
    </ul>
  );
}

const TASK_KIND: Record<CareTask["kind"], string> = {
  "risk-review": "Safety review",
  "safety-callback": "Safety call",
  "coordinator-call": "Coordinator call",
  "post-visit": "After the visit",
  "care-team": "Care team request",
};

/** The care team queue: the people behind Wren, and what each of them owes the patient. */
function TaskList({ tasks, empty }: { tasks: CareTask[]; empty: string }) {
  if (!tasks.length) return <p className="sh-empty">{empty}</p>;
  return (
    <ul className="sh-tasks">
      {byUrgency(tasks).map((task) => {
        const done = task.status === "done";
        return (
          <li key={task.id} className={`sh-task ${done ? "is-done" : ""}`}>
            <span className="sh-task-mark" aria-hidden="true">
              {done ? <CircleCheck size={16} /> : <CircleDashed size={16} />}
            </span>
            <div className="sh-task-body">
              <div className="sh-task-head">
                <p className="sh-task-title">{task.title}</p>
                <span className={`sh-due ${done ? "is-done" : task.due === "Today" ? "is-today" : ""}`}>
                  {done ? (
                    "Done"
                  ) : (
                    <>
                      <span className="sh-vh">Open, due </span>
                      {task.due}
                    </>
                  )}
                </span>
              </div>
              <p className="sh-task-meta">
                {TASK_KIND[task.kind]}, {task.contact ? maskPhone(task.contact) : "no number given"}, added{" "}
                <time dateTime={task.at}>{stampLabel(task.at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const EVENT_CAP = 8;

/** The measurement plan, live: ids and outcomes, newest first. */
/** What posthog-js adds to every event, left out of the list so each event's own properties stand out. */
const SUPER_PROPS = new Set(["distinct_id", "experience", "assistant", "booked", "preview", "preview_scenario"]);
const ownProps = (event: ChatState["analytics"][number]) =>
  Object.fromEntries(Object.entries(event.properties).filter(([key]) => !key.startsWith("$") || key === "$anon_distinct_id").filter(([key]) => !SUPER_PROPS.has(key)));

function EventLog({ events }: { events: ChatState["analytics"] }) {
  const [all, setAll] = useState(false);
  const listId = useId();
  if (!events.length) return <p className="sh-empty">No events yet. They appear as the conversation moves.</p>;
  const newest = events.map((event, index) => ({ event, index })).reverse();
  const shown = all ? newest : newest.slice(0, EVENT_CAP);
  return (
    <div className="sh-events-wrap">
      <ol className="sh-events" id={listId}>
        {shown.map(({ event, index }) => (
          <li key={index} className="sh-event">
            <span className="sh-event-name">{event.event}</span>
            <time className="sh-event-time" dateTime={event.timestamp}>
              {stampLabel(event.timestamp)}
            </time>
            {Object.keys(ownProps(event)).length ? (
              <span className="sh-event-props">
                {Object.entries(ownProps(event))
                  .map(([key, value]) => `${key}: ${String(value)}`)
                  .join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {newest.length > EVENT_CAP ? (
        <button
          type="button"
          className="sh-link"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll((open) => !open)}
        >
          {all ? "Show the newest 8" : `Show all ${newest.length} events`}
        </button>
      ) : null}
    </div>
  );
}

function PreviewSheet({ state, ctx, close }: SheetProps) {
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const [picked, setPicked] = useState<Scenario | null>(null);
  const keepGoing = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keepGoing.current?.focus();
  }, [confirming]);

  const openCount = state.chat.tasks.filter((task) => task.status === "open").length;
  const eventCount = state.chat.analytics.length;
  const current = SCENARIOS.find((item) => item.value === state.scenario);
  const chosen = picked ? SCENARIOS.find((item) => item.value === picked) : undefined;
  const target = chosen?.moment ? MOMENTS.find((item) => item.id === chosen.moment) : undefined;

  const jump = (moment: Moment) => {
    ctx.preview.jump(moment);
    close();
  };

  const restart = () => {
    ctx.preview.restart();
    close();
  };

  return (
    <div className="sh-sheet">
      <div className="sh-preview">
        <ReviewerNote>
          For reviewers. These tools sit outside the patient experience, and every service here is
          simulated.
        </ReviewerNote>

        <Section
          title="Jump to a moment"
          lead="Each loads a fictional patient partway through, as if they’d answered everything before it."
        >
          <ol className="sh-tiles">
            {MOMENTS.map((moment, index) => (
              <li key={moment.id}>
                <button type="button" className="sh-tile" onClick={() => jump(moment.id)}>
                  <span className="sh-tile-step" aria-hidden="true">
                    {index + 1}
                  </span>
                  <strong>{moment.title}</strong>
                  <span>{moment.detail}</span>
                </button>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Look behind the scenes">
          <div className="sh-tools">
            <button type="button" className="sh-tool" onClick={() => ctx.openSheet("clinician")}>
              <span className="sh-tool-icon" aria-hidden="true">
                <Stethoscope size={18} />
              </span>
              <span>
                <strong>Clinician view</strong>
                <span>The brief {ASSISTANT.name} drafts and a clinician reviews before the visit</span>
              </span>
            </button>
            <button type="button" className="sh-tool" onClick={() => ctx.openSheet("graph")}>
              <span className="sh-tool-icon" aria-hidden="true">
                <Workflow size={18} />
              </span>
              <span>
                <strong>Agent-ready graph</strong>
                <span>Every question as a typed node an assistant could answer</span>
              </span>
            </button>
          </div>
        </Section>

        <Section
          title="Care team queue"
          lead={`Where a person takes over from ${ASSISTANT.name}, soonest due first.`}
          aside={openCount ? `${openCount} open` : undefined}
        >
          <TaskList tasks={state.chat.tasks} empty="Nothing for the care team yet. Asking Help for a call puts a task here." />
        </Section>

        <Section
          title="Try a scenario"
          lead="Each happens once, the next time that step runs. Trying again then works."
          aside={current ? undefined : state.scenario}
        >
          <div className="sh-scenarios" role="group" aria-label="Scenarios">
            {SCENARIOS.map((item) => {
              const on = state.scenario === item.value;
              return (
                <button
                  type="button"
                  key={item.value}
                  className="sh-scenario"
                  aria-pressed={on}
                  onClick={() => {
                    ctx.preview.setScenario(item.value);
                    setPicked(item.value);
                  }}
                >
                  <span className="sh-scenario-mark" aria-hidden="true">
                    {on ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <span>{item.where}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div role="status" className="sh-scenario-status">
            {chosen && chosen.value === state.scenario ? (
              target ? (
                <>
                  <p className="sh-meta">
                    Set. It happens {lowerFirst(chosen.where)}, or jump straight to it.
                  </p>
                  <button type="button" className="sh-btn" onClick={() => jump(target.id)}>
                    Jump to {lowerFirst(target.title)}
                  </button>
                </>
              ) : (
                <p className="sh-meta">Set. Every simulated service answers normally.</p>
              )
            ) : null}
          </div>
        </Section>

        <Section
          title="Simulated inbox"
          lead="Texts and emails this preview would send. Nothing leaves this device."
        >
          <Inbox state={state} now={now} />
        </Section>

        <Section
          title="PostHog events (simulated)"
          lead={`Newest first, in PostHog's capture format${state.chat.distinctId ? `, as ${state.chat.distinctId}` : ""}. Enums, counts and booleans only: never answers, free text or contact details. Nothing leaves this device.`}
          aside={eventCount ? (eventCount === 1 ? "1 event" : `${eventCount} events`) : undefined}
        >
          <EventLog events={state.chat.analytics} />
        </Section>

        {confirming ? (
          <div className="sh-confirm" role="group" aria-label="Restart preview">
            <p>This clears every answer and starts over from the first message.</p>
            <div className="sh-row2">
              <button
                type="button"
                className="sh-btn"
                ref={keepGoing}
                onClick={() => setConfirming(false)}
              >
                Keep going
              </button>
              <button type="button" className="sh-btn is-primary" onClick={restart}>
                Restart
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="sh-link sh-restart" onClick={() => setConfirming(true)}>
            <RotateCcw size={16} aria-hidden="true" /> Restart preview
          </button>
        )}
      </div>
    </div>
  );
}

/* ==================================================== Clinician sheet */

/*
 * Reason codes render from FLAG_INFO in safety.ts, which carries the proposed disposition
 * and due time for each. Nothing clinical is worded here; a code the preview doesn't know
 * gets a neutral label, never a disposition.
 */
const NEUTRAL_FLAG = { short: "Flag recorded", detail: "", due: "" };
const flagInfo = (code: string) => FLAG_INFO[code] ?? NEUTRAL_FLAG;

/** Counts toward "risk" exactly as hasRisk does: any known flag except how the visit felt. */
const isRiskCode = (code: string) => code in FLAG_INFO && code !== "post-visit-worse";

const RISK_WORDS = "risk-language-in-";
const FLAG_ORDER = ["screen-high", "safe-now-unsafe", RISK_WORDS, "screen-moderate", "screen-others", "screen-low", "post-visit-worse"];

function flagRank(code: string): number {
  const index = FLAG_ORDER.findIndex((key) => (key === RISK_WORDS ? code.startsWith(key) : code === key));
  return index < 0 ? FLAG_ORDER.length : index;
}

/**
 * Every reason code, most urgent first. Codes also follow from what's on record (screener
 * answers, "not safe right now", words caught in free text), so one that was never written
 * still shows, and none is ever dropped.
 */
function flagCodes(s: ChatJourney): string[] {
  const codes = [...s.chat.flags];
  const add = (code: string) => {
    if (!codes.includes(code)) codes.push(code);
  };
  screenFlags(s.chat.screen).forEach(add);
  if (Object.values(s.chat.safeNow).includes("unsafe")) add("safe-now-unsafe");
  for (const event of s.chat.riskEvents) add(`${RISK_WORDS}${event.source}`);
  return codes.sort((a, b) => flagRank(a) - flagRank(b));
}

/** Changes to one answer, oldest first. Tapping the same answer again isn't a change. */
function changesTo(s: ChatJourney, node: string) {
  return s.chat.history.filter((entry) => entry.node === node && !!entry.from && entry.from !== entry.to);
}

/** What the patient tapped, as they saw it. History may hold values or labels, so both resolve. */
function optionLabel(item: ScreenQuestion, value: string): string {
  return item.options.find((option) => option.value === value)?.label ?? value;
}

const SAFE_NOW_ANSWER: Record<"safe" | "unsafe", string> = {
  safe: "I’m safe right now",
  unsafe: "I’m not safe right now",
};
const safeNowLabel = (value: string) => SAFE_NOW_ANSWER[value as "safe" | "unsafe"] ?? value;
const SAFE_NOW_NODE = { story: "story-safe", other: "other-safe" } as const;

function askedText(s: ChatJourney, id: string): string {
  const node = SCRIPT.find((item) => item.id === id);
  const blocks: AgentBlock[] = node ? safe(() => node.say(s), []) : [];
  const ask = blocks.find((block) => block.kind === "text" && block.id === "ask");
  return ask?.kind === "text" ? ask.text : "";
}

function answerOf(s: ChatJourney, id: string): ChatAnswer | null {
  const node = SCRIPT.find((item) => item.id === id);
  return node ? safe(() => node.answer(s), null) : null;
}

/** Recorded by the shell when the answer is given or changed. */
function answeredAt(s: ChatJourney, id: string): string | undefined {
  return s.chat.answeredAt[id];
}

/** A tapped value as its chip read; anything else (a label already, or typed text) as it is. */
function choiceLabel(s: ChatJourney, id: string, value: string): string {
  const node = SCRIPT.find((item) => item.id === id);
  const input = node?.input ? safe(() => node.input!(s), null) : null;
  const options = input && (input.kind === "single" || input.kind === "multi") ? input.options : [];
  return options.find((option) => option.value === value)?.label ?? value;
}

function screenScores(s: ChatJourney): { gad: number | null; phq: number | null } {
  const b = s.chat.baseline;
  const sum = (a: string, c: string) => (b[a] != null && b[c] != null ? b[a] + b[c] : null);
  return { gad: sum("gad1", "gad2"), phq: sum("phq1", "phq2") };
}

function dataGaps(s: ChatJourney): string[] {
  const gaps: string[] = [];
  if (s.chat.prep === "later")
    gaps.push("Patient chose to prepare later, so no records, medication review or check-ins yet");
  else if (s.chat.prep !== "yes") gaps.push("Visit prep not started");
  else {
    if (s.chat.records === "no") gaps.push("Patient skipped records");
    else if (s.chat.jobs.records?.status === "failed") gaps.push("No records found (Metriport, simulated)");
    if (s.chat.medication === "other" && !s.chat.recordsFound?.medication)
      gaps.push("Medication list is self-reported only");
    if (s.chat.baselineIntro === "skip") gaps.push("Patient skipped the check-ins");
    if (s.healthReviewed && s.chat.pharmacy !== "suggested") gaps.push("No pharmacy on file");
  }
  if (medicationPath(s) && s.chat.idCheck !== "done")
    gaps.push("Photo ID not verified, which is needed before any controlled medication");
  return gaps;
}

interface ReviewItem {
  text: string;
  due?: string;
}

/** Risk first, most urgent first, then everything else worth a look before the visit. */
function reviewFirst(s: ChatJourney, gaps: string[]): ReviewItem[] {
  const codes = flagCodes(s);
  const asItem = (code: string): ReviewItem => {
    const info = flagInfo(code);
    return { text: info === NEUTRAL_FLAG ? `${info.short}: ${code}` : info.short, due: info.due || undefined };
  };
  const items = codes.filter(isRiskCode).map(asItem);
  if (s.chat.history.some((entry) => isSafetyNode(entry.node) && !!entry.from && entry.from !== entry.to))
    items.push({ text: "Patient changed a safety answer" });
  items.push(...codes.filter((code) => !isRiskCode(code)).map(asItem));
  const { gad, phq } = screenScores(s);
  if (gad != null && gad >= 3) items.push({ text: `GAD-2 at or above the cutoff (${gad} of 6)` });
  if (phq != null && phq >= 3) items.push({ text: `PHQ-2 at or above the cutoff (${phq} of 6)` });
  if (s.chat.medication === "stopped" || s.chat.medication === "changed")
    items.push({ text: "Medication differs from the pharmacy record" });
  if (s.chat.recordsFound?.allergy && (s.chat.allergy === "no" || s.chat.allergy === "unsure"))
    items.push({ text: "Patient questions the allergy on record" });
  if (booked(s) && gaps.length) items.push({ text: gaps.length === 1 ? "1 data gap" : `${gaps.length} data gaps` });
  return items;
}

function Cite({ who, children }: { who: string; children: string }) {
  return (
    <figure className="sh-cite">
      <figcaption>{who}</figcaption>
      <blockquote>“{children}”</blockquote>
    </figure>
  );
}

function PatientSection({ s, clinician }: { s: ChatJourney; clinician?: Clinician }) {
  const p = s.profile;
  const age = ageOf(p);
  const looked = s.chat.identity === "confirmed" && !s.chat.manualDetails;
  const confirmedTexas = s.chat.quickCheck === "all";
  const name = fullName(p);
  const initials = [p.firstName, p.lastName].map((part) => part.trim().charAt(0)).join("").toUpperCase();
  return (
    <Section title="Patient" className="sh-patient">
      <div className="sh-chart-head">
        <span className={`sh-chart-avatar ${initials ? "" : "is-empty"}`} aria-hidden="true">
          {initials || <UserRound size={20} strokeWidth={2} />}
        </span>
        <div className="sh-chart-who">
          <p className="sh-chart-name">{name || <Missing>Name not shared yet</Missing>}</p>
          <p className="sh-chart-sub">
            {age != null ? `${age} years old, born ${birthLabel(p)}` : <Missing>Birth date not shared yet</Missing>}
          </p>
        </div>
      </div>
      <dl className="sh-kv">
        <Row
          k="Location"
          v={
            s.chat.outsideTexas ? (
              "Said at check-in they’re outside Texas"
            ) : confirmedTexas || p.city ? (
              `${p.city ? `${p.city}, Texas` : "Texas"}${confirmedTexas ? ", confirmed by patient" : ""}`
            ) : (
              <Missing>Not confirmed yet</Missing>
            )
          }
        />
        <Row
          k="Sex at birth"
          v={
            s.chat.sexAtBirth ? (
              `${s.chat.sexAtBirth}${looked ? ", from Verified (simulated)" : ""}`
            ) : (
              <Missing />
            )
          }
        />
        <Row
          k="First visit"
          v={
            s.appointment && booked(s) ? (
              safe(() => appointmentWhen(s), "Booked")
            ) : (
              <Missing>Not booked yet</Missing>
            )
          }
        />
        <Row
          k="Clinician"
          v={clinician ? `${clinician.name}, ${clinician.credential}` : <Missing>Not chosen yet</Missing>}
        />
        <Row k="Primary care" v={primaryCare(s)} />
      </dl>
    </Section>
  );
}

/** The patient's own choice about a primary care summary, and the doctor they named. */
function primaryCare(s: ChatJourney): ReactNode {
  switch (s.chat.pcp) {
    case "share":
      return s.chat.pcpName
        ? `${s.chat.pcpName}. Patient agreed to a visit summary being sent`
        : "Has one and agreed to a visit summary being sent. Doctor not named yet";
    case "keep":
      return "Has one. Patient asked not to share a summary";
    case "none":
      return "Doesn’t have one";
    default:
      return <Missing>Not asked yet</Missing>;
  }
}

const GOAL_LABELS: Record<string, string> = {
  "Understand what’s going on": "Understand what’s going on",
  "Talk about medication": "Talk about medication",
  "Continue my care": "Continue care they already have",
};

function ReasonSection({ s, questions }: { s: ChatJourney; questions: string[] }) {
  const conditions = s.conditions.map(conditionLabel);
  const words = s.chat.storyMode === "words" && s.chat.storyText;
  return (
    <Section title="Reason and goals">
      <dl className="sh-kv">
        <Row k="Help with" v={conditions.length ? listOf(conditions) : <Missing />} />
        <Row k="Visit goal" v={s.goal ? (GOAL_LABELS[s.goal] ?? s.goal) : <Missing />} />
      </dl>
      {words ? (
        <Cite who={s.chat.storyConfirmed ? `Patient said, then confirmed ${ASSISTANT.name}’s reading` : "Patient said"}>
          {s.chat.storyText}
        </Cite>
      ) : conditions.length ? (
        <p className="sh-source">Patient chose these from a list.</p>
      ) : null}
      {s.chat.otherText ? <Cite who="Patient said, about something else">{s.chat.otherText}</Cite> : null}
      {s.chat.note ? <Cite who="Patient’s note to you">{s.chat.note}</Cite> : null}
      {questions.map((question, index) => (
        <Cite key={`${index}-${question}`} who={`Patient asked ${ASSISTANT.name} to pass this on`}>
          {question}
        </Cite>
      ))}
    </Section>
  );
}

const EXPLORE: Record<string, string> = {
  ADHD: "Has trouble with focus been there since childhood, and does it show up at work, at home and in relationships?",
  Depression: "How long has low mood lasted, and how much is it affecting sleep, energy and daily life?",
  Anxiety: "How persistent is the worry, and what is it keeping them from doing?",
  "Bipolar Disorder": "Have there been periods of unusually high energy or little need for sleep?",
  PTSD: "What from the past is coming up now, and how is it affecting sleep and safety?",
  "I'm not sure": "They aren’t sure what to call it yet. What brought them in now?",
};

function ExploreSection({ s }: { s: ChatJourney }) {
  const items = s.conditions.map((condition) => ({
    name: condition === "I'm not sure" ? "Not sure yet" : conditionLabel(condition),
    question:
      condition === "Other"
        ? s.chat.otherText
          ? `What do they mean by “${s.chat.otherText}”?`
          : "They chose something else. What’s going on?"
        : (EXPLORE[condition] ?? "What would they like help with?"),
  }));
  return (
    <Section title="Conditions to explore">
      {items.length ? (
        <ul className="sh-explore">
          {items.map((item) => (
            <li key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.question}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sh-empty">Nothing shared yet.</p>
      )}
      <p className="sh-source">Questions drawn from the patient’s words and choices. Not diagnoses.</p>
    </Section>
  );
}

/** One reason code: what it means, what should happen and by when, and the words behind it. */
function FlagCard({ s, code }: { s: ChatJourney; code: string }) {
  const info = flagInfo(code);
  const source = code.startsWith(RISK_WORDS) ? (code.slice(RISK_WORDS.length) as RiskSource) : null;
  const events = source ? s.chat.riskEvents.filter((event) => event.source === source) : [];
  const safeNow = source === "story" || source === "other" ? s.chat.safeNow[source] : undefined;
  const safeNowAt = source === "story" || source === "other" ? answeredAt(s, SAFE_NOW_NODE[source]) : undefined;
  return (
    <div className={`sh-flag ${info.due === "Today" ? "is-today" : ""}`}>
      <CircleAlert size={16} aria-hidden="true" />
      <div className="sh-flag-body">
        <p className="sh-flag-title">{info.short}</p>
        {info.detail ? <p className="sh-flag-text">{info.detail}</p> : null}
        {events.map((event, index) => (
          <Cite key={`${event.at}-${index}`} who={`Patient wrote, ${stampLabel(event.at)}`}>
            {event.text}
          </Cite>
        ))}
        {safeNow ? (
          <p className="sh-flag-text">
            Asked “Are you safe right now?” and answered “{safeNowLabel(safeNow)}”
            {safeNowAt ? `, ${stampLabel(safeNowAt)}` : ""}.
          </p>
        ) : null}
        <p className="sh-flag-meta">
          {info.due ? <span className={`sh-due ${info.due === "Today" ? "is-today" : ""}`}>{info.due}</span> : null}
          <span className="sh-flag-code">
            <span className="sh-vh">Reason code </span>
            {code}
          </span>
        </p>
      </div>
    </div>
  );
}

/** A screener item exactly as asked, the answer the patient tapped, and every change to it. */
function ScreenAnswer({ s, item }: { s: ChatJourney; item: ScreenQuestion }) {
  const value = s.chat.screen[item.id];
  const node = `screen-${item.id}`;
  const changes = changesTo(s, node);
  const at = answeredAt(s, node);
  return (
    <li>
      <p className="sh-screen-q">{item.ask}</p>
      {value ? (
        <>
          <p className={`sh-screen-a ${isRiskAnswer(value) ? "is-risk" : ""}`}>{optionLabel(item, value)}</p>
          <p className="sh-screen-meta">
            {changes.length
              ? changes
                  .map(
                    (change) =>
                      `Changed from ${optionLabel(item, change.from)} to ${optionLabel(item, change.to)}, ${stampLabel(change.at)}`,
                  )
                  .join(". ")
              : at
                ? `Answered ${stampLabel(at)}`
                : "Answered during intake"}
          </p>
        </>
      ) : (
        <p className="sh-screen-a">
          <Missing>Not asked yet</Missing>
        </p>
      )}
    </li>
  );
}

function SafetySection({ s }: { s: ChatJourney }) {
  const codes = flagCodes(s);
  const hospital = answerOf(s, "hospital");
  const hospitalAt = answeredAt(s, "hospital");
  const hospitalChanges = changesTo(s, "hospital");
  return (
    <Section
      title="Safety"
      aside={codes.length ? (codes.length === 1 ? "1 flag" : `${codes.length} flags`) : "No flags"}
    >
      {codes.map((code) => (
        <FlagCard key={code} s={s} code={code} />
      ))}
      <h4 className="sh-h4 sh-subhead">Screening questions</h4>
      <ul className="sh-screens">
        {screenItems(s.chat.screen).map((item) => (
          <ScreenAnswer key={item.id} s={s} item={item} />
        ))}
        <li>
          <p className="sh-screen-q">{askedText(s, "hospital")}</p>
          {hospital ? (
            <>
              <p className="sh-screen-a">{hospital.text}</p>
              <p className="sh-screen-meta">
                {hospitalChanges.length
                  ? hospitalChanges
                      .map(
                        (change) =>
                          `Changed from ${choiceLabel(s, "hospital", change.from)} to ${choiceLabel(s, "hospital", change.to)}, ${stampLabel(change.at)}`,
                      )
                      .join(". ")
                  : hospitalAt
                    ? `Answered ${stampLabel(hospitalAt)}`
                    : "Answered during intake"}
              </p>
            </>
          ) : (
            <p className="sh-screen-a">
              <Missing>Not asked yet</Missing>
            </p>
          )}
        </li>
      </ul>
      <p className="sh-source">
        The screener follows the C-SSRS screener’s structure. Its wording and follow-ups are
        proposals for Legion’s medical director to approve.
      </p>
    </Section>
  );
}

type Tone = "ok" | "review" | "open";

interface MedFact {
  label: string;
  value: string;
  source?: string;
  check?: { text: string; tone: Tone };
}

const TONE_ICON: Record<Tone, LucideIcon> = { ok: CircleCheck, review: CircleAlert, open: CircleDashed };

function medFacts(s: ChatJourney): MedFact[] {
  const found = s.chat.recordsFound;
  const med = found?.medication;
  const medicationChecks: Record<string, { text: string; tone: Tone }> = {
    taking: { text: "Patient confirmed they still take it", tone: "ok" },
    stopped: { text: "Patient says they stopped", tone: "review" },
    changed: { text: "Patient says the dose is different", tone: "review" },
  };
  const medication: MedFact = med
    ? {
        label: "Medication",
        value: `${med.name} ${med.dose}`,
        source: `Filled at ${med.pharmacy}, last on ${med.lastFilled}. Metriport (simulated)`,
        check: medicationChecks[s.chat.medication] ?? { text: "Not confirmed by patient yet", tone: "open" },
      }
    : s.chat.medication === "none"
      ? { label: "Medication", value: "None", source: "Patient reported" }
      : s.chat.medication === "other"
        ? {
            label: "Medication",
            value: s.chat.medicationNote || "Takes something, will share at the visit",
            source: "Patient reported",
            check: { text: "No pharmacy record to compare", tone: "open" },
          }
        : { label: "Medication", value: "Not reviewed yet" };

  const clinic = found?.sources.find((source) => source.kind === "clinic");
  const allergyChecks: Record<string, { text: string; tone: Tone }> = {
    yes: { text: "Patient confirmed", tone: "ok" },
    no: { text: "Patient says this isn’t right", tone: "review" },
    unsure: { text: "Patient isn’t sure", tone: "review" },
  };
  const allergy: MedFact = found?.allergy
    ? {
        label: "Allergies",
        value: found.allergy,
        source: `${clinic ? `${clinic.name} record, ${clinic.date}` : "Connected records"}. Metriport (simulated)`,
        check: allergyChecks[s.chat.allergy] ?? { text: "Not confirmed by patient yet", tone: "open" },
      }
    : s.chat.allergy === "none"
      ? { label: "Allergies", value: "None known", source: "Patient reported" }
      : s.chat.allergy === "other"
        ? { label: "Allergies", value: s.chat.allergyNote || "Patient will share at the visit", source: "Patient reported" }
        : s.chat.allergy === "unsure"
          ? { label: "Allergies", value: "Patient will share at the visit", source: "Patient reported" }
          : { label: "Allergies", value: "Not reviewed yet" };

  const pharmacy: MedFact =
    s.chat.pharmacy === "suggested" && found?.pharmacy
      ? {
          label: "Pharmacy",
          value: `${found.pharmacy.name}, ${found.pharmacy.address}`,
          source: "From pharmacy records. Metriport (simulated)",
          check: { text: "Patient chose it", tone: "ok" },
        }
      : s.chat.pharmacy === "other"
        ? { label: "Pharmacy", value: "To choose at the visit", source: "Patient asked for a different one" }
        : { label: "Pharmacy", value: "None on file" };

  return [medication, allergy, pharmacy];
}

function MedsSection({ s }: { s: ChatJourney }) {
  return (
    <Section title="Medications and allergies">
      <dl className="sh-kv sh-meds">
        {medFacts(s).map((fact) => {
          const Icon = fact.check ? TONE_ICON[fact.check.tone] : null;
          return (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>
                <span className="sh-med-value">{fact.value}</span>
                {fact.source ? <span className="sh-med-source">{fact.source}</span> : null}
                {fact.check && Icon ? (
                  <span className={`sh-med-check is-${fact.check.tone}`}>
                    <Icon size={14} aria-hidden="true" />
                    {fact.check.text}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}

const SCREENS = [
  {
    name: "GAD-2",
    about: "anxiety",
    items: [
      ["gad1", "Nervous, anxious or on edge"],
      ["gad2", "Can’t stop or control worrying"],
    ],
  },
  {
    name: "PHQ-2",
    about: "depression",
    items: [
      ["phq1", "Little interest or pleasure"],
      ["phq2", "Down, depressed or hopeless"],
    ],
  },
] as const;

const FREQUENCY = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

function StartingPoint({ s }: { s: ChatJourney }) {
  const b = s.chat.baseline;
  if (s.chat.baselineIntro === "skip") {
    return (
      <Section title="Starting point">
        <p className="sh-empty">Patient skipped the check-ins.</p>
      </Section>
    );
  }
  if (!Object.keys(b).length) {
    return (
      <Section title="Starting point">
        <p className="sh-empty">Not collected yet.</p>
      </Section>
    );
  }
  return (
    <Section
      title="Starting point"
      lead="Two-question screens over the last two weeks. A score of 3 or more is the usual cutoff for a fuller assessment."
    >
      <ul className="sh-scores">
        {SCREENS.map((screen) => {
          const values = screen.items.map(([id]) => b[id]);
          const total = values.every((value) => value != null)
            ? values.reduce((sum, value) => sum + value, 0)
            : null;
          const over = total != null && total >= 3;
          return (
            <li key={screen.name} className={`sh-score-card ${over ? "is-over" : ""}`}>
              <div className="sh-score-head">
                <span className="sh-score-name">
                  <strong>{screen.name}</strong>
                  <span>{screen.about}</span>
                </span>
                <span className="sh-score">
                  {total != null ? (
                    <>
                      {total}
                      <small> of 6</small>
                    </>
                  ) : (
                    <small>In progress</small>
                  )}
                </span>
              </div>
              {total != null ? (
                <span className="sh-score-bar" aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6].map((step) => (
                    <i key={step} className={`${step <= total ? "is-on" : ""} ${step === 3 ? "is-cut" : ""}`} />
                  ))}
                </span>
              ) : null}
              {total != null ? (
                <p className={`sh-score-note ${over ? "is-over" : ""}`}>
                  {over ? (
                    <>
                      <CircleAlert size={14} aria-hidden="true" /> At or above the cutoff of 3
                    </>
                  ) : (
                    "Below the cutoff of 3"
                  )}
                </p>
              ) : null}
              <dl className="sh-kv is-tight">
                {screen.items.map(([id, label]) =>
                  b[id] != null ? <Row key={id} k={label} v={FREQUENCY[b[id]] ?? String(b[id])} /> : null,
                )}
              </dl>
            </li>
          );
        })}
      </ul>
      <p className="sh-source">Screening scores, not a diagnosis.</p>
    </Section>
  );
}

function coverageFacts(s: ChatJourney): [string, ReactNode][] {
  const method = s.chat.benefitsChoice === "selfpay" ? "selfpay" : s.chat.payMethod;
  if (!method) return [["Payment", <Missing key="m" />]];
  if (method === "public")
    return [
      ["Payment", "Medicare or Medicaid"],
      ["Status", "Not accepted yet. Patient was given next steps"],
    ];
  if (method === "selfpay")
    return [
      ["Payment", "Self-pay"],
      ["Estimate", "$250 first visit, $150 follow-ups"],
      [
        "Source",
        s.chat.benefitsChoice === "selfpay" ? "Switched from insurance at the patient’s request" : "Patient chose",
      ],
    ];
  const benefits = s.chat.benefits;
  const status = s.chat.jobs.benefits?.status;
  const facts: [string, ReactNode][] = [["Payer", benefits?.payer || s.payer || "Not found yet"]];
  if (benefits) facts.push(["Plan", `${benefits.plan}, member ID ending ${benefits.memberLast4}`]);
  facts.push([
    "Network",
    benefits
      ? benefits.network === "in-network"
        ? "In network"
        : benefits.network === "out-of-network"
          ? "Not in network for this clinician"
          : "Not confirmed"
      : status === "pending"
        ? "Waiting on the plan"
        : status === "failed"
          ? "Plan couldn’t match these details"
          : "Not checked yet",
  ]);
  facts.push(["Estimate", benefits?.copay != null ? `$${benefits.copay} copay` : "Not available yet"]);
  facts.push([
    "Source",
    benefits
      ? benefits.via === "discovery"
        ? "Sohar insurance discovery and eligibility (simulated)"
        : "Patient chose the plan. Sohar eligibility (simulated)"
      : "Patient chose",
  ]);
  return facts;
}

type CheckStatus = "pass" | "review" | "stop" | "open";

const CHECK_STATUS: Record<CheckStatus, { label: string; Icon: LucideIcon }> = {
  pass: { label: "Passed", Icon: CircleCheck },
  review: { label: "Review", Icon: CircleAlert },
  stop: { label: "Stopped", Icon: Ban },
  open: { label: "Not checked yet", Icon: CircleDashed },
};

interface RuleCheck {
  rule: string;
  status: CheckStatus;
  evidence: string;
}

/**
 * High screener risk or "not safe right now" stops routine booking. Any other risk, wherever
 * it was found, means review. It passes only on a finished screener with no risk anywhere.
 * Flags count as well as answers, so a later change never turns a stop back into a pass.
 */
function safetyCheck(s: ChatJourney): RuleCheck {
  const rule = "No current risk of harm";
  const screen = s.chat.screen;
  const risks = flagCodes(s).filter(isRiskCode);
  const said = (codes: string[]) => codes.map((code) => flagInfo(code).short).join(". ");
  const stops = risks.filter((code) => code === "screen-high" || code === "safe-now-unsafe");
  if (stops.length) return { rule, status: "stop", evidence: said(stops) };
  if (risks.length || hasRisk(s)) return { rule, status: "review", evidence: said(risks) || "Risk on record" };
  if (screenDone(screen)) {
    const count = screenItems(screen).length;
    return {
      rule,
      status: "pass",
      evidence: count === 1 ? "Answered no to the screener question" : `Answered no to all ${count} screener questions`,
    };
  }
  return { rule, status: "open", evidence: Object.keys(screen).length ? "Screener in progress" : "Asked before booking" };
}

function ruleChecks(s: ChatJourney): RuleCheck[] {
  const all = s.chat.quickCheck === "all";
  const failed = s.chat.quickCheckFailed;
  const age = s.chat.dobEntered ? ageOf(s.profile) : null;
  const history = s.fit["fit-history"];
  const method = s.chat.payMethod;
  return [
    failed === "adult" || (age != null && age < 18)
      ? {
          rule: "18 or older",
          status: "stop",
          evidence: failed === "adult" ? "Patient said they’re under 18" : `Birth date shows age ${age}`,
        }
      : all
        ? {
            rule: "18 or older",
            status: "pass",
            evidence: age != null ? `Patient confirmed, and birth date shows age ${age}` : "Patient confirmed in quick checks",
          }
        : { rule: "18 or older", status: "open", evidence: "Asked in quick checks" },
    failed === "texas"
      ? { rule: "In Texas for visits", status: "stop", evidence: "Patient won’t be in Texas" }
      : all
        ? { rule: "In Texas for visits", status: "pass", evidence: "Patient confirmed in quick checks" }
        : { rule: "In Texas for visits", status: "open", evidence: "Asked in quick checks" },
    failed === "video"
      ? { rule: "Video visits work", status: "stop", evidence: "Patient needs in-person care" }
      : all
        ? { rule: "Video visits work", status: "pass", evidence: "Patient confirmed in quick checks" }
        : { rule: "Video visits work", status: "open", evidence: "Asked in quick checks" },
    safetyCheck(s),
    history === "no"
      ? { rule: "No recent hospital stay", status: "pass", evidence: "No overnight stay in the past year" }
      : history
        ? {
            rule: "No recent hospital stay",
            status: "stop",
            evidence: history === "yes" ? "Overnight stay in the past year, coordinator review" : "Patient asked to discuss it, coordinator review",
          }
        : { rule: "No recent hospital stay", status: "open", evidence: "Asked before booking" },
    method === "public"
      ? { rule: "Coverage Legion accepts", status: "stop", evidence: "Medicare or Medicaid isn’t accepted yet" }
      : method === "selfpay" || s.chat.benefitsChoice === "selfpay"
        ? { rule: "Coverage Legion accepts", status: "pass", evidence: "Self-pay" }
        : method === "insurance" || method === "unsure"
          ? s.chat.benefits?.network === "in-network"
            ? { rule: "Coverage Legion accepts", status: "pass", evidence: `${s.chat.benefits.payer}, verified in network` }
            : s.chat.benefits?.network === "out-of-network"
              ? { rule: "Coverage Legion accepts", status: "review", evidence: `${s.chat.benefits.payer}, clinician not in network` }
              : { rule: "Coverage Legion accepts", status: "review", evidence: "Commercial insurance, benefits not verified yet" }
          : { rule: "Coverage Legion accepts", status: "open", evidence: "Asked before matching" },
  ];
}

/** What the reviewing clinician did with the brief. Each one is a "Your clinician" entry in the trail. */
const BRIEF_REVIEW = {
  flag: "Flagged the visit brief for care team review",
  edit: "Opened the visit brief to edit",
  accept: "Reviewed and accepted the visit brief",
} as const;
type BriefReview = keyof typeof BRIEF_REVIEW;

const FLAG_TASK = "Review the visit brief the clinician flagged";

/** The clinician's latest action on the brief, read from the trail so it outlasts the sheet. */
function lastReview(s: ChatJourney): BriefReview | null {
  for (const entry of [...s.chat.receipts].reverse()) {
    if (entry.actor !== "Your clinician") continue;
    const kind = (Object.keys(BRIEF_REVIEW) as BriefReview[]).find((key) => BRIEF_REVIEW[key] === entry.action);
    if (kind) return kind;
  }
  return null;
}

function ClinicianSheet({ state, ctx }: SheetProps) {
  const s = state;
  const now = useNow();
  const questions = s.chat.questions;
  const gaps = dataGaps(s);
  const review = reviewFirst(s, gaps);
  const providerId = s.appointment?.providerId || (s.chat.slotChosen ? s.providerId : "");
  const clinician = providerId ? clinicianById(providerId) : undefined;
  const reviewer = clinician?.name ?? "The clinician";
  const last = lastReview(s);
  const flagged = !!openTask(s, "care-team", FLAG_TASK);
  const openCount = s.chat.tasks.filter((task) => task.status === "open").length;

  const act = (kind: BriefReview) => {
    if (lastReview(ctx.get()) === kind) return;
    receipt(ctx, BRIEF_REVIEW[kind], "Clinician view (simulated)", "Your clinician");
    track(ctx, "portal.clinician.brief_reviewed", { action: kind });
    if (kind === "flag" && !openTask(ctx.get(), "care-team", FLAG_TASK))
      addTask(ctx, { kind: "care-team", title: FLAG_TASK, due: "Before the visit" }, "Put the clinician’s flag in the care team queue");
  };
  const said =
    last === "accept"
      ? `Accepted (simulated). ${reviewer} signed off on this brief.`
      : last === "flag"
        ? "Flagged. It’s in the care team queue (simulated)."
        : last === "edit"
          ? "Opened for editing (simulated). Changes are signed by the clinician."
          : "";

  return (
    <div className="sh-sheet sh-chart">
      <p className="sh-banner">
        <Sparkles size={18} aria-hidden="true" />
        <span>
          <strong>AI draft. Clinician review required.</strong>
          <span>
            {ASSISTANT.name} drafted this from the patient’s answers and connected sources. It isn’t a
            diagnosis, and nothing here is final until a clinician reviews it.
          </span>
          <span className="sh-banner-meta">
            {s.chat.briefApproved
              ? "The patient reviewed and approved their brief."
              : s.chat.briefSkipped
                ? "The patient chose not to send their brief."
                : s.chat.jobs.brief?.status === "done"
                  ? "The patient hasn’t reviewed their brief yet."
                  : "Still filling in as the patient answers."}
            {last === "accept" ? ` ${reviewer} accepted it (simulated).` : ""}
          </span>
        </span>
      </p>

      <PatientSection s={s} clinician={clinician} />

      <Section
        title="Review first"
        aside={review.length ? (review.length === 1 ? "1 item" : `${review.length} items`) : undefined}
      >
        {review.length ? (
          <ul className="sh-attn">
            {review.map((item, index) => (
              <li key={`${index}-${item.text}`}>
                <CircleAlert size={16} aria-hidden="true" />
                <span className="sh-attn-body">
                  <span className="sh-attn-text">{item.text}</span>
                  {item.due ? (
                    <span className={`sh-due ${item.due === "Today" ? "is-today" : ""}`}>
                      <span className="sh-vh">Due </span>
                      {item.due}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sh-ok-line">
            <CircleCheck size={16} aria-hidden="true" /> Nothing flagged for review.
          </p>
        )}
      </Section>

      <ReasonSection s={s} questions={questions} />
      <ExploreSection s={s} />
      <SafetySection s={s} />
      <MedsSection s={s} />
      <StartingPoint s={s} />

      <Section title="Coverage">
        <dl className="sh-kv">
          {coverageFacts(s).map(([k, v]) => (
            <Row key={k} k={k} v={v} />
          ))}
        </dl>
      </Section>

      <Section
        title="Data gaps"
        aside={booked(s) && gaps.length ? (gaps.length === 1 ? "1 gap" : `${gaps.length} gaps`) : undefined}
      >
        {!booked(s) ? (
          <p className="sh-empty">Intake isn’t finished yet.</p>
        ) : gaps.length ? (
          <ul className="sh-gaps">
            {gaps.map((gap) => (
              <li key={gap}>
                <CircleDashed size={15} aria-hidden="true" />
                {gap}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sh-ok-line">
            <CircleCheck size={16} aria-hidden="true" /> No gaps. Everything requested came back.
          </p>
        )}
      </Section>

      <Section title="Rule checks" lead="Eligibility rules Legion runs on every path, with the answers behind each.">
        <ul className="sh-checks">
          {ruleChecks(s).map((check) => {
            const status = CHECK_STATUS[check.status];
            return (
              <li key={check.rule} className={`is-${check.status}`}>
                <status.Icon size={16} strokeWidth={2.2} aria-hidden="true" />
                <span className="sh-check-rule">{check.rule}</span>
                <span className="sh-check-status">{status.label}</span>
                <span className="sh-check-evidence">{check.evidence}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Care team queue"
        lead="Follow-ups a person owns, soonest due first. Simulated in this preview."
        aside={openCount ? `${openCount} open` : undefined}
      >
        <TaskList tasks={s.chat.tasks} empty="Nothing in the queue." />
      </Section>

      <Section title="Activity trail" lead="Who did what, in order, and where each detail came from.">
        <ReceiptList receipts={s.chat.receipts} now={now} compact named empty="No activity yet." />
      </Section>

      <div className="sh-chart-actions">
        <p className="sh-meta" role="status">
          {said}
        </p>
        <div className="sh-chart-buttons">
          <button type="button" className="sh-btn" disabled={flagged} onClick={() => act("flag")}>
            {flagged ? "Flagged" : "Flag for review"}
          </button>
          <button type="button" className="sh-btn" onClick={() => act("edit")}>
            Edit
          </button>
          <button
            type="button"
            className="sh-btn is-primary"
            disabled={last === "accept"}
            onClick={() => act("accept")}
          >
            <Check size={16} aria-hidden="true" /> {last === "accept" ? "Accepted" : "Accept brief"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================== Graph sheet */

const TEXT_MODES: Record<string, string> = {
  text: "Free text",
  tel: "Phone number",
  otp: "One-time code",
  email: "Email",
  date: "Date",
};

const WIDGETS: Record<string, string> = {
  payment: "Card form",
  details: "Details form",
  agreements: "Agreements",
  checkin: "Check-in",
  rejoin: "Visit room",
};

function inputLabel(node: ScriptNode, input: ChatInput | null): string {
  if (!node.input) return "Message only";
  // The input depends on work the assistant does first, such as a lookup or a booking.
  if (!input) return `${ASSISTANT.name} step`;
  switch (input.kind) {
    case "single":
      return "Single choice";
    case "multi":
      return "Multiple choice";
    case "confirm-list":
      return "Confirm a list";
    case "text":
      return TEXT_MODES[input.mode] ?? "Text";
    case "widget":
      return WIDGETS[input.widget] ?? "Form";
  }
}

type InputSpec =
  | { kind: "single" | "multi"; options: { value: string; label: string }[] }
  | { kind: "confirm-list"; items: string[] }
  | { kind: "text"; mode: string }
  | { kind: "widget"; widget: string }
  | { kind: "message" }
  | { kind: "agent-step" };

/** The contract an assistant would need to answer a node. Script content only, never answers. */
function inputSpec(node: ScriptNode, input: ChatInput | null): InputSpec {
  if (!node.input) return { kind: "message" };
  if (!input) return { kind: "agent-step" };
  switch (input.kind) {
    case "single":
    case "multi":
      return {
        kind: input.kind,
        options: input.options.map(({ value, label }) => ({ value, label })),
      };
    case "confirm-list":
      return { kind: "confirm-list", items: input.items };
    case "text":
      return { kind: "text", mode: input.mode };
    case "widget":
      return { kind: "widget", widget: input.widget };
  }
}

function GraphSheet({ state }: SheetProps) {
  const [copied, setCopied] = useState("");
  const transcript = deriveTranscript(SCRIPT, state);
  const activeId = transcript.active?.node.id;
  const rows = transcript.path.flatMap((step) => {
    const node = SCRIPT.find((item) => item.id === step.id);
    if (!node) return [];
    return [{ node, input: safe(() => node.input?.(state) ?? null, null), answered: step.answered }];
  });
  const answered = rows.filter((row) => row.answered).length;

  const copy = async () => {
    const json = JSON.stringify(
      rows.map(({ node, input, answered: done }) => ({
        id: node.id,
        stage: node.stage,
        input: inputSpec(node, input),
        why: node.why ?? null,
        answered: done,
      })),
      null,
      2,
    );
    const ok = await copyText(json);
    setCopied(
      ok
        ? `Copied ${rows.length} nodes as JSON.`
        : "Couldn’t copy. This browser blocked the clipboard.",
    );
  };

  return (
    <div className="sh-sheet sh-graph">
      <ReviewerNote>For reviewers. How the intake is built underneath the chat.</ReviewerNote>
      <p className="sh-body">
        Every question is a typed node with an id, a stage, an input and a reason, so the same
        graph can render as this chat, as screens, or be offered to a patient’s own AI assistant
        with their consent. Legion’s rails still run either way: eligibility rules, the safety
        check and clinician review apply no matter who answers.
      </p>
      <div className="sh-graph-bar">
        <p className="sh-meta">
          {rows.length} nodes apply right now, {answered} answered. The JSON holds no answers or
          personal details.
        </p>
        <button type="button" className="sh-btn" onClick={() => void copy()}>
          <Copy size={16} aria-hidden="true" /> Copy as JSON
        </button>
      </div>
      <p className="sh-meta sh-copied" role="status">
        {copied}
      </p>
      <div className="sh-table-wrap">
        <table className="sh-table">
          <caption className="sh-vh">Intake nodes that apply right now</caption>
          <colgroup>
            <col className="sh-col-node" />
            <col />
            <col className="sh-col-state" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Node</th>
              <th scope="col">Why we ask</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, input, answered: done }) => {
              const active = node.id === activeId;
              const stage = STAGES.find((item) => item.id === node.stage)?.title ?? node.stage;
              return (
                <tr key={node.id} className={active ? "is-active" : undefined}>
                  <th scope="row">
                    <span className="sh-node-id">{node.id}</span>
                    <span className="sh-node-meta">
                      {stage}, {lowerFirst(inputLabel(node, input))}
                    </span>
                  </th>
                  <td>{node.why ?? <span className="sh-vh">None</span>}</td>
                  <td>
                    {done ? (
                      <span className="sh-state is-done">
                        <Check size={13} strokeWidth={3} aria-hidden="true" /> Done
                      </span>
                    ) : active ? (
                      <span className="sh-state is-now">Now</span>
                    ) : (
                      <span className="sh-state">Later</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================ Exports */

export const INFO_CARDS: CardMap = {
  disclosure: (props) => <Disclosure {...props} />,
  "data-use": () => <DataUseCard />,
  person: (props) => <PersonCard {...props} />,
  "support-line": () => <SupportLine />,
  "public-exit": () => <PublicExit />,
  "age-exit": (props) => <AgeExit {...props} />,
  crisis: (props) => <CrisisCard {...props} />,
};

export const INFO_SHEETS: SheetMap = {
  help: { title: "Help", render: (props) => <HelpSheet {...props} /> },
  journey: { title: "Your first visit", render: (props) => <JourneySheet {...props} /> },
  skip: { title: "Skip to visit day", render: (props) => <SkipSheet {...props} /> },
  preview: { title: "Preview tools", render: (props) => <PreviewSheet {...props} /> },
  clinician: { title: "What your clinician sees", render: (props) => <ClinicianSheet {...props} /> },
  graph: { title: "Agent-ready intake", render: (props) => <GraphSheet {...props} /> },
};
