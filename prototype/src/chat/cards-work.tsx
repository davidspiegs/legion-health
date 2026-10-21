import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import {
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronDown,
  Clock3,
  Contact,
  FileSearch,
  FlaskConical,
  Mail,
  MessageSquare,
  NotebookPen,
  Pill,
  ShieldCheck,
  Stethoscope,
  UserSearch,
  type LucideIcon,
} from "lucide-react";
import { formatTime } from "../model/fixtures";
import { journeyNow } from "../model/journey-state";
import type { Notification } from "../model/types";
import { VERIFIED_RECORD, clinicianFirst, clinicianName, matchInputs, payerFor, slotById, slotLabel } from "./agent";
import { ASSISTANT } from "./env";
import { inventory, match } from "./inventory";
import type { CardMap, CardProps } from "./registry";
import type { ChatJob, ChatJourney, RecordsFound } from "./state";
import { useReducedMotion } from "./useReveal";
import "./cards-work.css";

type Phase = "running" | "done" | "pending" | "failed";
type SourceKind = RecordsFound["sources"][number]["kind"];

/** Work that hasn't started is about to: its question just became current. */
function phaseOf(job: ChatJob | undefined): Phase {
  return !job || job.status === "idle" ? "running" : job.status;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Keeps a short phrase, such as a person's name, on one line. */
const unbroken = (text: string) => text.replace(/ /g, " ");

/** "Thu, Oct 22, 9:00 AM with Maya Chen", or nothing once the time has left the preview's inventory. */
function slotWith(slotId: string | undefined): string {
  if (!slotId) return "";
  try {
    inventory();
    const providerId = slotById(slotId)?.providerId ?? /^chat(?:-fu)?-([a-z]+)-/.exec(slotId)?.[1] ?? "";
    return `${slotLabel(slotId)} with ${unbroken(clinicianName(providerId))}`;
  } catch {
    return "";
  }
}

// ==================================================================== Time

const ZONE = "America/Chicago";
const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short" });
const DATE = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, day: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long" });
const STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
/** A birth date is a calendar day, not a moment, so it's read in UTC and never shifts. */
const BIRTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });

/** Calendar day number in Central Time, where every visit happens. */
function centralDay(ms: number): number {
  const parts = DAY_PARTS.formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return Math.round(Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000);
}

/**
 * Jobs record real finish times, but the preview can skip ahead to visit day.
 * Placing them on the journey clock keeps receipts true to the story: work done
 * before the skip reads as days ago, not minutes.
 */
function storyTime(s: ChatJourney, realAt: number): number {
  const clock = s.clock;
  if (!clock || realAt <= clock.realStart) return realAt;
  return clock.virtualStart + (realAt - clock.realStart) * clock.rate;
}

function since(then: number, now: number): string {
  const elapsed = now - then;
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  const days = centralDay(now) - centralDay(then);
  if (days < 1) return `${Math.floor(elapsed / 3_600_000)} hr ago`;
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const TICK_MS = 20_000;
const listeners = new Set<() => void>();
let ticker: number | undefined;

function subscribeTick(listener: () => void) {
  listeners.add(listener);
  ticker ??= window.setInterval(() => listeners.forEach((notify) => notify()), TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size || ticker === undefined) return;
    window.clearInterval(ticker);
    ticker = undefined;
  };
}
const tickSnapshot = () => Math.floor(Date.now() / TICK_MS);

/** Re-renders as relative times age. One shared timer serves every card. */
function useNow(): number {
  useSyncExternalStore(subscribeTick, tickSnapshot);
  return Date.now();
}

/** When work finished and the time now, both on the journey clock. */
function useStoryTime(s: ChatJourney, at: number | undefined): { then: number; now: number } | null {
  const now = useNow();
  return at == null ? null : { then: storyTime(s, at), now: journeyNow(s, now) };
}

/**
 * "2 min ago" keeps changing, and the thread is a live log that would read each
 * change aloud, so screen readers get the date and time instead, once.
 */
function Ago({ then, now }: { then: number; now: number }) {
  return (
    <>
      <span aria-hidden="true">{since(then, now)}</span>
      <span className="wk-sr">{STAMP.format(new Date(then))}</span>
    </>
  );
}

// =================================================================== Motion

/**
 * True inside a card whose state moved on after it mounted. Parts that appear
 * then animate in once; a restored conversation renders settled. A card being
 * revealed for the first time animates through the shell's `.msg.enter`.
 */
const Changed = createContext(false);

function useIsNew(): boolean {
  const changed = useContext(Changed);
  const [isNew] = useState(changed);
  return isNew;
}

/** Sticky: true once the card shows something other than what it showed on mount. */
function useChanged(signature: string): boolean {
  const [initial] = useState(signature);
  const [changed, setChanged] = useState(false);
  if (!changed && signature !== initial) setChanged(true);
  return changed || signature !== initial;
}

/**
 * Resolves rows one at a time as a purely visual stagger, faster once the real
 * result is in. Restored cards and reduced motion show the outcome at once.
 */
function useStagger(total: number, working: boolean, card: RefObject<HTMLElement | null>): number {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useLayoutEffect(() => {
    if (reduced || !card.current?.closest(".msg.enter")) setStep(total);
  }, [reduced, total, card]);
  useEffect(() => {
    if (step >= total) return;
    const timer = window.setTimeout(
      () => setStep((value) => Math.min(total, value + 1)),
      working ? 320 : 200,
    );
    return () => window.clearTimeout(timer);
  }, [step, total, working]);
  return step;
}

// ================================================================ Work card

interface WorkCardProps {
  state: ChatJourney;
  phase: Phase;
  /** What the work is about, shown in the status circle while it runs. */
  icon: LucideIcon;
  title: string;
  detail?: string;
  /** Stays in view after the work is done, such as "Nothing is booked yet". */
  note?: string;
  /** Waiting on someone else, such as a health plan: amber text, never a fill. */
  waiting?: boolean;
  source: string;
  /** When the work finished, for the receipt. */
  at?: number;
  /** A vendor status code the care team can look up. */
  code?: string;
  label: string;
  /** Names the steps a finished card folds away, for the button that opens them again. */
  more?: string;
  /** How long resolved steps stay in view before they fold, when the work finishes in front of the patient. */
  linger?: number;
  cardRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

/**
 * Live work is a full card: a status circle, a title that shimmers while it runs,
 * and the steps resolving one by one. Finished work folds into a one-line summary
 * with its receipt, and its steps open again on request.
 */
function WorkCard({
  state,
  phase,
  icon,
  title,
  detail,
  note,
  waiting,
  source,
  at,
  code,
  label,
  more,
  linger = 0,
  cardRef,
  children,
}: WorkCardProps) {
  const reduced = useReducedMotion();
  const changed = useChanged(`${phase}:${title}`);
  const settled = phase === "done" || phase === "failed";
  const foldable = settled && !!children && !!more;
  const [open, setOpen] = useState(false);
  // Work that finishes in front of the patient leaves its resolved steps up for a beat, then folds.
  const [lingering, setLingering] = useState(false);
  // A card that moves to a new phase starts folded again.
  const [openFor, setOpenFor] = useState(phase);
  if (openFor !== phase) {
    const wasSettled = openFor === "done" || openFor === "failed";
    setOpenFor(phase);
    setOpen(false);
    setLingering(settled && !wasSettled && linger > 0 && !reduced);
  }
  useEffect(() => {
    if (!lingering) return;
    const timer = window.setTimeout(() => setLingering(false), linger);
    return () => window.clearTimeout(timer);
  }, [lingering, linger]);
  const shown = !!children && (!settled || open || lingering);
  const bodyId = useId();
  // Not a live region of its own: the thread's log already reads a new title once.
  return (
    <Changed.Provider value={changed}>
      <section
        ref={cardRef}
        className={`card-shell wk-card is-${phase}${settled ? " is-settled" : ""}${foldable ? " is-foldable" : ""}`}
        aria-label={label}
      >
        <Status key={phase} phase={phase} icon={icon} />
        <div className="wk-text">
          <div className="wk-top">
            <Title key={title} text={title} waiting={waiting} />
            {foldable ? (
              <button
                type="button"
                className="wk-toggle"
                aria-expanded={shown}
                aria-controls={bodyId}
                onClick={() => {
                  setLingering(false);
                  setOpen(!shown);
                }}
              >
                <span className="wk-sr">{more}</span>
                <ChevronDown size={18} strokeWidth={2.1} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {detail ? <Detail key={detail} text={detail} /> : null}
          {note ? <p className="wk-note">{note}</p> : null}
          {children ? (
            <div id={bodyId} className={`wk-body${shown ? "" : " is-closed"}${open ? " is-reopened" : ""}`}>
              {/* Opening again remounts the steps, so they settle in once more. */}
              <div className="wk-body-inner" key={open ? "again" : "first"}>
                <div className="wk-body-pad">{children}</div>
              </div>
            </div>
          ) : null}
          <Receipt state={state} source={source} at={phase === "running" ? undefined : at} code={code} />
        </div>
      </section>
    </Changed.Provider>
  );
}

function Title({ text, waiting }: { text: string; waiting?: boolean }) {
  const isNew = useIsNew();
  return (
    <p className={`wk-title${waiting ? " is-waiting" : ""}${isNew ? " is-new" : ""}`}>{text}</p>
  );
}

function Detail({ text }: { text: string }) {
  const isNew = useIsNew();
  return <p className={`wk-detail${isNew ? " is-new" : ""}`}>{text}</p>;
}

/** A soft circle: the work's own icon while it runs, a check that pops in when it's done. */
function Status({ phase, icon: Icon }: { phase: Phase; icon: LucideIcon }) {
  const isNew = useIsNew();
  return (
    <span className={`wk-status is-${phase}${isNew ? " is-new" : ""}`} aria-hidden="true">
      {phase === "done" ? (
        <svg className="wk-check" viewBox="0 0 20 20" focusable="false">
          <path d="M5.3 10.4l3.1 3.1 6.3-6.7" pathLength={1} />
        </svg>
      ) : phase === "pending" ? (
        <Clock3 size={16} strokeWidth={2.1} />
      ) : (
        <Icon size={16} strokeWidth={2} />
      )}
    </span>
  );
}

function Receipt({
  state,
  source,
  at,
  code,
}: {
  state: ChatJourney;
  source: string;
  at?: number;
  code?: string;
}) {
  const time = useStoryTime(state, at);
  return (
    <p className="wk-receipt">
      <span>
        {source}
        {time ? (
          <>
            , <Ago {...time} />
          </>
        ) : null}
      </span>
      {code ? <span className="wk-code">Code {code}</span> : null}
    </p>
  );
}

type Mark = "queued" | "active" | "done" | "waiting" | "none";

interface Step {
  label: string;
  value?: string;
  mark: Mark;
}

function Steps({ steps, label, pairs = false }: { steps: Step[]; label: string; pairs?: boolean }) {
  return (
    <ul className={`wk-steps${pairs ? " is-pairs" : ""}`} aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.label} className={`wk-step is-${step.mark}`} style={{ ["--i" as string]: index }}>
          <StepMark key={step.mark} mark={step.mark} />
          <span className="wk-step-label">{step.label}</span>
          {step.value ? <StepValue key={step.value} text={step.value} /> : null}
        </li>
      ))}
    </ul>
  );
}

function StepMark({ mark }: { mark: Mark }) {
  const isNew = useIsNew();
  return (
    <span className={`wk-step-mark${isNew ? " is-new" : ""}`} aria-hidden="true">
      {mark === "done" ? (
        <svg className="wk-tick" viewBox="0 0 16 16" focusable="false">
          <path d="M4.2 8.4l2.5 2.5 5.1-5.4" pathLength={1} />
        </svg>
      ) : mark === "waiting" ? (
        <Clock3 size={14} strokeWidth={2.2} />
      ) : (
        <i />
      )}
    </span>
  );
}

function StepValue({ text }: { text: string }) {
  const isNew = useIsNew();
  return <span className={`wk-step-value${isNew ? " is-new" : ""}`}>{text}</span>;
}

// =============================================================== Work cards

interface FunnelRow {
  label: string;
  count?: number;
}

function MatchWork({ state }: CardProps) {
  const job = state.chat.jobs.match;
  const result = state.chat.match;
  const settled = job?.status === "done" && !!result;
  const inputs = matchInputs(state);
  // While matching runs, the criteria being applied appear first; their counts land with the result.
  const criteria = useMemo(() => {
    if (settled) return [];
    const [conditions, payer, prefs] = JSON.parse(inputs) as [string[], string, string[]];
    return match(conditions, payer, prefs).funnel.map((row) => row.label);
  }, [inputs, settled]);
  const rows: FunnelRow[] = result && settled ? result.funnel : criteria.map((label) => ({ label }));
  const found = settled ? (rows[rows.length - 1]?.count ?? 0) : 0;
  const searched = settled ? (rows[0]?.count ?? 0) : 0;
  return (
    <WorkCard
      state={state}
      phase={settled ? "done" : "running"}
      icon={UserSearch}
      title={
        !settled
          ? "Looking for clinicians who fit"
          : found
            ? `Found ${found} ${found === 1 ? "clinician" : "clinicians"} who fit`
            : searched
              ? `Searched ${searched} Texas clinicians`
              : "How I searched"
      }
      detail={
        settled ? undefined : payerFor(state) ? "Checking focus, insurance and openings" : "Checking focus and openings"
      }
      source="Legion directory and calendars"
      at={job?.finishedAt}
      label="Clinician matching"
      more="How I searched"
    >
      {rows.length ? <Funnel rows={rows} settled={settled} /> : null}
      {settled && found ? <p className="wk-caption">Ranked by focus, then the soonest opening.</p> : null}
    </WorkCard>
  );
}

function Funnel({ rows, settled }: { rows: FunnelRow[]; settled: boolean }) {
  const top = rows[0]?.count ?? 0;
  const last = rows.length - 1;
  return (
    <ol className={`wk-funnel${settled ? " is-settled" : ""}`} aria-label="How the list narrowed">
      {rows.map((row, index) => (
        <li
          key={index}
          className={settled && index === last && row.count ? "is-result" : undefined}
          style={{ ["--i" as string]: index }}
        >
          <span className="wk-funnel-label">{row.label}</span>
          {row.count != null ? <FunnelCount value={row.count} /> : null}
          <span className="wk-funnel-bar" aria-hidden="true">
            {row.count && top ? <FunnelFill width={(row.count / top) * 100} /> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function FunnelCount({ value }: { value: number }) {
  const isNew = useIsNew();
  return <span className={`wk-funnel-count${isNew ? " is-new" : ""}`}>{value}</span>;
}

function FunnelFill({ width }: { width: number }) {
  const isNew = useIsNew();
  return <i className={isNew ? "is-new" : undefined} style={{ ["--w" as string]: `${width}%` }} />;
}

function HoldWork({ state }: CardProps) {
  const job = state.chat.jobs.hold;
  const status = phaseOf(job);
  const phase: Phase = status === "pending" ? "running" : status;
  const now = useNow();
  const booked = !!state.appointment && state.appointment.status !== "cancelled";
  const holding = !!state.reservation && state.reservation.expiresAt > now;
  return (
    <WorkCard
      state={state}
      phase={phase}
      icon={CalendarClock}
      title={
        phase === "done"
          ? "Held for 15 minutes"
          : phase === "failed"
            ? "That time was just taken"
            : "Holding your time"
      }
      // The job's inputs are the time it tried, even if the visit later moves. Once held,
      // the patient's answer right above names the time, so the summary doesn't repeat it.
      detail={phase === "done" ? undefined : slotWith(job?.inputs || state.slotId) || undefined}
      note={phase === "done" && !booked ? (holding ? "Nothing is booked yet" : "This hold has ended") : undefined}
      source="Legion scheduling"
      at={job?.finishedAt}
      label="Holding a time"
    />
  );
}

const VENDOR_CODE = /^[A-Z]{2,}\d{2,}$/;

function IdentityWork({ state }: CardProps) {
  const job = state.chat.jobs.identity;
  const status = phaseOf(job);
  const phase: Phase = status === "pending" ? "running" : status;
  return (
    <WorkCard
      state={state}
      phase={phase}
      icon={Contact}
      title={
        phase === "done"
          ? "Found your details"
          : phase === "failed"
            ? "No match from your number"
            : "Finding your details"
      }
      // Done, the details card right below says what they were matched to.
      detail={phase === "running" ? "Matching your mobile number and birth date" : undefined}
      source="Verified (simulated)"
      at={job?.finishedAt}
      code={phase === "failed" && job?.note && VENDOR_CODE.test(job.note) ? job.note : undefined}
      label="Identity lookup"
    />
  );
}

function BenefitsWork({ state }: CardProps) {
  const job = state.chat.jobs.benefits;
  const phase = phaseOf(job);
  const plan = state.chat.benefits;
  const payer = plan?.payer || state.payer;
  const insurer = payer || "your plan";
  const finding = phase === "running" && job?.note !== "checking";
  const title = finding
    ? "Finding your plan"
    : phase === "running"
      ? `Checking benefits with ${insurer}`
      : phase === "done"
        ? "Benefits confirmed"
        : phase === "pending"
          ? `Waiting on ${insurer}`
          : "Plan not matched";
  const detail = finding
    ? state.payer
      ? `Looking up your ${state.payer} plan`
      : "Searching with your name and birth date"
    : phase === "running"
      ? "Asking about coverage, network and cost"
      : undefined;
  const steps: Step[] = [
    {
      label: "Plan",
      value: finding ? "Searching" : plan && phase === "done" ? `${plan.payer} ${plan.plan}` : payer,
      mark: finding ? "active" : "done",
    },
    finding
      ? { label: "Benefits", mark: "queued" }
      : phase === "running"
        ? { label: "Benefits", value: "Checking", mark: "active" }
        : phase === "done"
          ? { label: "Benefits", value: "Checked", mark: "done" }
          : phase === "pending"
            ? { label: "Benefits", value: "No answer yet", mark: "waiting" }
            : {
                label: "Benefits",
                value: job?.note === "error" ? "Didn’t go through" : "Not matched",
                mark: "none",
              },
  ];
  return (
    <WorkCard
      state={state}
      phase={phase}
      icon={ShieldCheck}
      title={title}
      detail={detail}
      waiting={phase === "pending"}
      source="Sohar (simulated)"
      at={job?.finishedAt}
      label="Benefits check"
      more="What I checked"
      linger={900}
    >
      <Steps steps={steps} label="Insurance check" pairs />
    </WorkCard>
  );
}

function BookWork({ state }: CardProps) {
  const job = state.chat.jobs.book;
  const status = phaseOf(job);
  const phase: Phase = status === "pending" ? "running" : status;
  const appointment =
    state.appointment && state.appointment.status !== "cancelled" ? state.appointment : null;
  return (
    <WorkCard
      state={state}
      phase={phase}
      icon={CalendarCheck}
      title={phase === "done" ? "Visit booked" : phase === "failed" ? "Not booked yet" : "Booking your visit"}
      // The confirmation right below has every detail of a booked visit. A failure's reason
      // is said in the message right below too, so the card keeps to the time it tried.
      detail={phase === "done" ? undefined : slotWith(appointment?.slotId || state.slotId) || undefined}
      source="Legion scheduling"
      at={job?.finishedAt}
      label="Booking"
    />
  );
}

const SOURCES: { kind: SourceKind; label: string }[] = [
  { kind: "clinic", label: "Clinics and hospitals" },
  { kind: "pharmacy", label: "Pharmacies" },
  { kind: "lab", label: "Labs" },
];

function RecordsWork({ state }: CardProps) {
  const job = state.chat.jobs.records;
  const status = phaseOf(job);
  const card = useRef<HTMLElement>(null);
  const step = useStagger(SOURCES.length, status === "running", card);
  const known = status !== "running";
  // Until the network answers, the last source stays in progress.
  const shown = known ? step : Math.min(step, SOURCES.length - 1);
  const found = state.chat.recordsFound?.sources ?? [];
  const phase: Phase =
    shown < SOURCES.length ? "running" : status === "done" && found.length ? "done" : "failed";
  const counts = SOURCES.map((source) => found.filter((item) => item.kind === source.kind).length);
  const steps: Step[] = SOURCES.map((source, index) => {
    if (index === shown) return { label: source.label, value: "Searching", mark: "active" };
    if (index > shown) return { label: source.label, mark: "queued" };
    if (!known) return { label: source.label, value: "Searched", mark: "done" };
    const count = counts[index];
    return count
      ? { label: source.label, value: `${count} found`, mark: "done" }
      : { label: source.label, value: status === "done" ? "None" : "None yet", mark: "none" };
  });
  return (
    <WorkCard
      state={state}
      cardRef={card}
      phase={phase}
      icon={FileSearch}
      title={
        phase === "running"
          ? "Searching for your records"
          : phase === "done"
            ? `Found ${found.length} ${found.length === 1 ? "source" : "sources"}`
            : "No records available yet"
      }
      detail={phase === "running" ? "Through health information networks, with your permission" : undefined}
      source="Metriport (simulated)"
      at={job?.finishedAt}
      label="Records search"
      more="Where I looked"
      linger={900}
    >
      <Steps steps={steps} label="Where I looked" />
    </WorkCard>
  );
}

function BriefWork({ state }: CardProps) {
  const job = state.chat.jobs.brief;
  const done = job?.status === "done";
  const chat = state.chat;
  const parts = [
    "answers",
    ...(chat.recordsFound ? ["records"] : []),
    // A non-breaking hyphen, so the word never splits across lines.
    ...(Object.keys(chat.baseline).length ? ["check‑ins"] : []),
    ...(chat.note.trim() ? ["note"] : []),
  ];
  return (
    <WorkCard
      state={state}
      phase={done ? "done" : "running"}
      icon={NotebookPen}
      title={done ? "Drafted your visit brief" : "Drafting your visit brief"}
      // Done, the brief right below shows what it was drafted from, and who reviews it.
      detail={done ? undefined : `Using your ${listOf(parts)}`}
      source={ASSISTANT.name}
      at={job?.finishedAt}
      label="Visit brief"
    />
  );
}

// ============================================================ Result cards

function IdentityCard({ state }: CardProps) {
  const profile = state.profile;
  const verified = state.chat.jobs.identity?.status === "done" && !state.chat.manualDetails;
  // A detail the patient changed afterward is theirs, not the record's.
  const found = VERIFIED_RECORD;
  const from = (same: boolean) => (verified && same ? "From Verified" : "From you");
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const month = Number(profile.month);
  const day = Number(profile.day);
  const year = Number(profile.year);
  const birth = month && day && year ? BIRTH.format(new Date(Date.UTC(year, month - 1, day))) : "";
  const rows: { label: string; value: ReactNode; tag: string; note?: string }[] = [
    { label: "Date of birth", value: birth, tag: "From you" },
    {
      label: "Home address",
      value: profile.address ? (
        <>
          {profile.address}
          <br />
          {profile.city}, TX {profile.zip}
        </>
      ) : (
        ""
      ),
      tag: from(profile.address === found.address && profile.city === found.city && profile.zip === found.zip),
    },
    {
      label: "Sex assigned at birth",
      value: state.chat.sexAtBirth,
      tag: from(state.chat.sexAtBirth === found.sexAtBirth),
      note: "Required for Texas medical records. You can share your gender identity with your clinician.",
    },
  ];
  return (
    <section className="card-shell wk-result wk-identity" aria-label="Your details">
      <div className="wk-id-head">
        <p className={`wk-id-name${name ? "" : " is-missing"}`}>
          <span className="wk-sr">Name: </span>
          {name || "Name not added yet"}
        </p>
        {name ? (
          <span className="wk-fact-tag">
            {from(profile.firstName === found.firstName && profile.lastName === found.lastName)}
          </span>
        ) : null}
      </div>
      <dl className="wk-facts">
        {rows.map((row) => (
          <div className="wk-fact" key={row.label}>
            <dt>{row.label}</dt>
            <dd className={`wk-fact-value${row.value ? "" : " is-missing"}`}>
              {row.value || "Not added yet"}
              {row.note ? <span className="wk-fact-note">{row.note}</span> : null}
            </dd>
            {row.value ? <dd className="wk-fact-tag">{row.tag}</dd> : null}
          </div>
        ))}
      </dl>
      {verified ? (
        <p className="wk-foot">Verified (simulated) matched these to your mobile number.</p>
      ) : null}
    </section>
  );
}

function BenefitsCard({ state }: CardProps) {
  const job = state.chat.jobs.benefits;
  const checked = useStoryTime(state, job?.finishedAt);
  const plan = state.chat.benefits;
  if (!plan) return null;
  const active = job?.status === "done";
  const network = plan.network === "in-network";
  const outside = plan.network === "out-of-network";
  const rows: { ok: boolean; text: string }[] = [
    { ok: active, text: active ? "Active coverage" : "Coverage not confirmed yet" },
    {
      ok: network,
      text: network
        ? "In network with Legion"
        : outside
          ? `${clinicianFirst(state.providerId)} isn’t in network with ${plan.payer}`
          : "Network not confirmed yet",
    },
  ];
  return (
    <section className="card-shell wk-result wk-benefits" aria-label="Your insurance plan">
      <div className="wk-plan">
        <span className="wk-plan-icon" aria-hidden="true">
          <ShieldCheck size={18} strokeWidth={2} />
        </span>
        <div className="wk-plan-text">
          <p className="wk-plan-name">{plan.payer}</p>
          <p className="wk-plan-meta">
            {plan.plan}, member ending {plan.memberLast4}
          </p>
          {plan.via === "discovery" ? (
            <p className="wk-plan-meta">Found from your name and birth date</p>
          ) : null}
        </div>
      </div>
      <div className={`wk-cost${plan.copay != null ? "" : " is-open"}`}>
        {plan.copay != null ? (
          <>
            <p className="wk-cost-label">Estimated cost</p>
            <p className="wk-cost-value">
              <strong>${plan.copay}</strong> per visit
            </p>
            <p className="wk-cost-sub">Your final cost depends on your plan; you’re billed after the visit.</p>
          </>
        ) : (
          <p className="wk-cost-sub">
            <Clock3 size={14} strokeWidth={2.2} aria-hidden="true" />
            {outside ? "No in-network estimate for this time" : "Cost estimate not ready yet"}
          </p>
        )}
      </div>
      <ul className="wk-checks">
        {rows.map((row) => (
          <li key={row.text} className={row.ok ? undefined : "is-open"}>
            <span className="wk-checkdot" aria-hidden="true">
              {row.ok ? <Check size={12} strokeWidth={3} /> : <Clock3 size={12} strokeWidth={2.4} />}
            </span>
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
      <p className="wk-foot">
        {checked ? (
          <>
            Checked <Ago {...checked} />, Sohar (simulated)
          </>
        ) : (
          "Sohar (simulated)"
        )}
      </p>
    </section>
  );
}

const KINDS: Record<SourceKind, { icon: LucideIcon; last: string }> = {
  clinic: { icon: Stethoscope, last: "Last visit" },
  pharmacy: { icon: Pill, last: "Last fill" },
  lab: { icon: FlaskConical, last: "Last result" },
};

function RecordsFoundCard({ state }: CardProps) {
  const sources = state.chat.recordsFound?.sources ?? [];
  if (!sources.length) return null;
  const clinician = state.appointment ? clinicianFirst(state.appointment.providerId) : "your clinician";
  return (
    <section className="card-shell wk-result wk-records" aria-label="Records found">
      <ul className="wk-sources">
        {sources.map((source) => {
          const { icon: Icon, last } = KINDS[source.kind];
          return (
            <li className="wk-source" key={source.name}>
              <span className="wk-source-icon" aria-hidden="true">
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <span>
                <span className="wk-source-name">{source.name}</span>
                <span className="wk-source-meta">
                  {last} {source.date}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="wk-foot">Shared with {clinician}. You can review anything that looks wrong.</p>
    </section>
  );
}

const SCORES = [
  { name: "Worry", scale: "GAD-2", items: ["gad1", "gad2"] },
  { name: "Mood", scale: "PHQ-2", items: ["phq1", "phq2"] },
];

function BaselineCard({ state }: CardProps) {
  const answers = state.chat.baseline;
  return (
    <section className="card-shell wk-result wk-baseline" aria-label="Your starting point">
      <h3 className="wk-result-title">Your starting point</h3>
      <p className="wk-result-sub">Over the last two weeks</p>
      <ul className="wk-scores">
        {SCORES.map((score) => {
          const values = score.items.map((id) => answers[id]);
          const total = values.every((value) => typeof value === "number")
            ? values.reduce((sum, value) => sum + value, 0)
            : null;
          return (
            <li key={score.name}>
              <div className="wk-score-head">
                <span className="wk-score-name">{score.name}</span>
                <span className="wk-score-scale">{score.scale}</span>
                <span className="wk-score-value">
                  {total == null ? (
                    "Not answered"
                  ) : (
                    <>
                      <strong>{total}</strong> of 6
                    </>
                  )}
                </span>
              </div>
              <span className="wk-meter" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6].map((segment) => (
                  <i
                    key={segment}
                    className={total != null && segment <= total ? "is-on" : undefined}
                    style={{ ["--i" as string]: segment }}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="wk-foot">
        Scores of 3 or more are worth talking through with your clinician. This isn’t a diagnosis.
      </p>
    </section>
  );
}

interface Sent {
  key: string;
  at: number;
  text: string;
  /** Shown after the text as how long ago it went out. */
  sentAt?: number;
  delivered: Notification[];
}

function Channels({ items }: { items: Notification[] }) {
  const sms = items.some((item) => item.channel === "sms");
  const email = items.some((item) => item.channel === "email");
  if (!sms && !email) return null;
  const label = sms && email ? "By text and email" : sms ? "By text" : "By email";
  return (
    <span className="wk-sent-channel" role="img" aria-label={label} title={label}>
      {sms ? <MessageSquare size={14} strokeWidth={2} /> : null}
      {email ? <Mail size={14} strokeWidth={2} /> : null}
    </span>
  );
}

function VisitDayCard({ state }: CardProps) {
  const realNow = useNow();
  const appointment = state.appointment;
  if (!appointment) return null;
  const now = journeyNow(state, realNow);
  const start = new Date(appointment.start);
  const due = state.notifications.filter(
    (item) =>
      item.appointmentId === appointment.id &&
      (item.kind === "reminder" || item.kind === "confirmation") &&
      item.status !== "cancelled" &&
      // Due reminders count as sent; the simulation delivers them on its next tick.
      (item.status !== "queued" || Date.parse(item.scheduledAt) <= now),
  );
  const groups = new Map<string, Notification[]>();
  for (const item of due) {
    const key = item.kind === "confirmation" ? "confirmation" : item.scheduledAt;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const bookedAt = state.chat.jobs.book?.finishedAt;
  const sent: Sent[] = [...groups.entries()].map(([key, items]) => {
    const delivered = items.filter((item) => item.status !== "failed");
    if (key === "confirmation") {
      // Confirmations are stamped by the adapter's compressed clock; the booking time is the true one.
      const at = bookedAt != null ? storyTime(state, bookedAt) : Date.parse(items[0].scheduledAt);
      return {
        key,
        at,
        text: delivered.length
          ? bookedAt != null
            ? "Confirmation sent"
            : "Confirmation sent when you booked"
          : "Confirmation didn’t go through",
        sentAt: delivered.length && bookedAt != null ? at : undefined,
        delivered,
      };
    }
    const at = Date.parse(key);
    return {
      key,
      at,
      text: delivered.length ? "Reminder sent" : "Reminder didn’t go through",
      sentAt: delivered.length ? at : undefined,
      delivered,
    };
  });
  sent.sort((a, b) => a.at - b.at);
  return (
    <section className="card-shell wk-result wk-visitday" aria-label="Visit day">
      <div className="wk-day">
        <span className="wk-day-tile" aria-hidden="true">
          <span className="wk-day-month">{MONTH.format(start)}</span>
          <span className="wk-day-date">{DATE.format(start)}</span>
        </span>
        <div>
          <h3 className="wk-result-title">Visit day</h3>
          <p className="wk-result-sub">
            {WEEKDAY.format(start)} at {formatTime(appointment.start)} with{" "}
            {unbroken(clinicianName(appointment.providerId))}
          </p>
        </div>
      </div>
      {sent.length ? (
        <>
          <ul className="wk-sent" aria-label="Messages sent">
            {sent.map((item) => (
              <li key={item.key} className={item.delivered.length ? undefined : "is-failed"}>
                <span className="wk-sent-mark" aria-hidden="true">
                  {item.delivered.length ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    <Clock3 size={12} strokeWidth={2.4} />
                  )}
                </span>
                <span className="wk-sent-text">
                  {item.text}
                  {item.sentAt != null ? (
                    <span className="wk-sent-ago">
                      {" "}
                      <Ago then={item.sentAt} now={now} />
                    </span>
                  ) : null}
                </span>
                <Channels items={item.delivered} />
              </li>
            ))}
          </ul>
          <p className="wk-foot">Legion messaging (simulated)</p>
        </>
      ) : (
        <p className="wk-foot">Reminders go out the day before and an hour before your visit (simulated)</p>
      )}
    </section>
  );
}

export const WORK_CARDS: CardMap = {
  "work:match": (props) => <MatchWork {...props} />,
  "work:hold": (props) => <HoldWork {...props} />,
  "work:identity": (props) => <IdentityWork {...props} />,
  "work:benefits": (props) => <BenefitsWork {...props} />,
  "work:book": (props) => <BookWork {...props} />,
  "work:records": (props) => <RecordsWork {...props} />,
  "work:brief": (props) => <BriefWork {...props} />,
  identity: (props) => <IdentityCard {...props} />,
  benefits: (props) => <BenefitsCard {...props} />,
  "records-found": (props) => <RecordsFoundCard {...props} />,
  baseline: (props) => <BaselineCard {...props} />,
  "visit-day": (props) => <VisitDayCard {...props} />,
};
