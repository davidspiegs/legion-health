import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Camera,
  Check,
  CircleAlert,
  CreditCard,
  FileHeart,
  FileText,
  FlaskConical,
  IdCard,
  LoaderCircle,
  LockKeyhole,
  Pill,
  ReceiptText,
  ScanFace,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { formatPhone, validateBirth } from "../model/fixtures";
import { chartOrganization, clinicianFirst, receipt, runBenefits, type ChatContext } from "./agent";
import { addAsk } from "./assistant";
import { ASSISTANT, PREVIEW } from "./env";
import type {
  CardMap,
  CardProps,
  SheetMap,
  SheetProps,
  WidgetMap,
  WidgetProps,
} from "./registry";
import { PAYERS, medicationPath, priceLine } from "./script";
import type { ChatJourney } from "./state";
import "./forms.css";

/* ============================================================== Shared parts */

type Input = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;
type InputRef = RefObject<HTMLInputElement | null>;

/** A labeled text field with its hint or error, shared by the sheets and the thread's cards. */
export function Field({
  label,
  hint,
  error,
  inputRef,
  adornment,
  ...input
}: Input & {
  label: string;
  hint?: ReactNode;
  error?: string;
  inputRef?: InputRef;
  /** A quiet mark inside the field's trailing edge, such as a card brand. */
  adornment?: ReactNode;
}) {
  const id = useId();
  const note = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`fm-field ${error ? "is-invalid" : ""}`}>
      <label className="fm-label" htmlFor={id}>
        {label}
      </label>
      <div className={`fm-control ${adornment ? "has-adornment" : ""}`}>
        <input
          {...input}
          ref={inputRef}
          id={id}
          className="fm-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={note}
        />
        {adornment ? (
          <span className="fm-adornment" aria-hidden="true">
            {adornment}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="fm-error" id={note}>
          <CircleAlert size={15} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="fm-hint" id={note}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** One choice from a short list, as native radios so arrow keys and forms work as expected. */
function Choices<T extends string>({
  legend,
  options,
  value,
  onChange,
  labelFor = (option) => option,
  error,
  note,
  inputRef,
  variant,
}: {
  legend: string;
  options: readonly T[];
  value: T | "";
  onChange: (value: T) => void;
  labelFor?: (option: T) => string;
  error?: string;
  note?: string;
  inputRef?: InputRef;
  /** A segmented control for two or three short options; tiles for a longer list. */
  variant: "segmented" | "tiles";
}) {
  const id = useId();
  const described = [error ? `${id}-error` : "", note ? `${id}-note` : ""].filter(Boolean).join(" ");
  const picked = value ? options.indexOf(value) : -1;
  return (
    <fieldset className={`fm-fieldset ${error ? "is-invalid" : ""}`} aria-describedby={described || undefined}>
      <legend className="fm-label">{legend}</legend>
      <div
        className={variant === "segmented" ? "fm-seg" : "fm-tiles"}
        style={variant === "segmented" ? { ["--seg-n" as string]: options.length, ["--seg-i" as string]: Math.max(0, picked) } : undefined}
      >
        {variant === "segmented" ? (
          <span className={`fm-seg-thumb ${picked < 0 ? "is-empty" : ""}`} aria-hidden="true" />
        ) : null}
        {options.map((option, index) => (
          <label key={option}>
            <input
              ref={index === 0 ? inputRef : undefined}
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>
              <span className="fm-choice-text">{labelFor(option)}</span>
              {variant === "tiles" ? (
                <span className="fm-tile-mark" aria-hidden="true">
                  <Check size={12} strokeWidth={3.2} />
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p className="fm-error" id={`${id}-error`}>
          <CircleAlert size={15} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="fm-hint" id={`${id}-note`}>
          {note}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Stays at the bottom of the sheet while its content scrolls. */
function SheetFoot({ children }: { children: ReactNode }) {
  return <div className="fm-foot">{children}</div>;
}

/** A persistent live region, so status changes are announced; visible only when `shown`. */
function Status({ text, shown = false }: { text: string; shown?: boolean }) {
  return (
    <p className={`fm-status ${shown && text ? "" : "fm-sr"}`} role="status">
      {shown && text ? <Check size={15} strokeWidth={2.6} aria-hidden="true" /> : null}
      {text}
    </p>
  );
}

function Working({ children }: { children: ReactNode }) {
  return (
    <>
      <LoaderCircle size={18} className="fm-spin" aria-hidden="true" />
      {children}
    </>
  );
}

function Problem({ text }: { text: string }) {
  return text ? (
    <p className="fm-problem" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      {text}
    </p>
  ) : null;
}

const digitsOf = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);
const upTo = (max: number) => (value: string) => digitsOf(value, max);
const inFours = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");
const asExpiry = (digits: string) => (digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
const asBirth = (digits: string) =>
  digits.length > 4
    ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    : asExpiry(digits);

/**
 * US numbers only. No US area code starts with 1, so a leading 1 (or +1) is the country
 * code: "+1 (512) 555-0148" and "15125550148" both keep all ten digits. One digit past a
 * full number is kept, so a slip shows up as an error instead of silently vanishing.
 */
const phoneDigits = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.slice(0, digits.startsWith("1") ? 12 : 11);
};

/** The ten digits Legion keeps for a typed or pasted number. */
export const nationalPhone = (value: string) => phoneDigits(value).replace(/^1/, "");

/** A number as it reads while typing. A country code stays visible until the number is saved. */
export function asPhone(digits: string): string {
  const national = digits.replace(/^1/, "");
  const shown = `${formatPhone(national)}${national.slice(10)}`;
  return digits.startsWith("1") ? `+1 ${shown}`.trimEnd() : shown;
}

/**
 * Formats a digits-only field as the patient types, keeping the caret after the
 * same digit. Deleting a separator deletes the digit beside it, so backspace
 * never feels stuck.
 */
function reformat(
  event: ChangeEvent<HTMLInputElement>,
  previous: string,
  clean: (value: string) => string,
  format: (digits: string) => string,
): string {
  const input = event.currentTarget;
  const raw = input.value;
  let digits = clean(raw);
  let position = raw.slice(0, input.selectionStart ?? raw.length).replace(/\D/g, "").length;
  const kind = (event.nativeEvent as InputEvent).inputType;
  if (clean(previous) === digits && kind === "deleteContentBackward" && position > 0) {
    digits = digits.slice(0, position - 1) + digits.slice(position);
    position -= 1;
  } else if (clean(previous) === digits && kind === "deleteContentForward") {
    digits = digits.slice(0, position) + digits.slice(position + 1);
  }
  const formatted = format(digits);
  let caret = 0;
  for (let seen = 0; caret < formatted.length && seen < position; caret += 1) {
    if (/\d/.test(formatted[caret])) seen += 1;
  }
  requestAnimationFrame(() => {
    if (document.activeElement === input) input.setSelectionRange(caret, caret);
  });
  return formatted;
}

/** The change handler for every phone field: formatted as typed, +1-safe. */
export const typePhone = (event: ChangeEvent<HTMLInputElement>, previous: string) =>
  reformat(event, previous, phoneDigits, asPhone);

const onEnter = (action: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  action();
};

const blurActive = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs a patient action through the shell's single-flight `act` (which reports
 * failures in the dock) and also hands any failure to the sheet that asked.
 */
async function attempt<T>(
  ctx: ChatContext,
  run: () => Promise<T>,
  onProblem: (message: string) => void,
): Promise<T | undefined> {
  const flight = { started: false };
  const result = await ctx.act(async () => {
    flight.started = true;
    try {
      return await run();
    } catch (issue) {
      onProblem(issue instanceof Error ? issue.message : "That didn’t go through. Try again.");
      throw issue;
    }
  });
  if (!flight.started) onProblem(`${ASSISTANT.name} is finishing another step. Try again in a moment.`);
  return result;
}

function useTimers() {
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);
  return (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };
}

/* ============================================================== Agreements */

type AgreementId = "care" | "payment" | "estimate" | "controlled" | "privacy" | "ai";

interface Agreement {
  id: AgreementId;
  title: string;
  /** The document's short name, for the record left in the thread. */
  label: string;
  /** The plain-language summary at the top of the full text. */
  summary: string;
  /** What the agreement row in the dock says, short enough to take in at a glance. */
  short: string;
  /**
   * What checking the box means, read out by screen readers. The estimate and AI items are
   * disclosures (the AI one with an optional switch), so they have none.
   */
  check?: string;
  /** Asked for, never required: booking doesn't wait on it. */
  optional?: boolean;
  Icon: LucideIcon;
}

/** The late-change policy from Legion's Terms, worded the same everywhere it appears. */
const LATE_CHANGE = "Changing a visit within 48 hours, or missing it, costs $100.";
const CHARGE_LINE = `You’re charged after each visit, not before. ${LATE_CHANGE}`;
const ESTIMATE_LINE =
  "You have the right to a Good Faith Estimate of what your care will cost. Your first visit is estimated at $250, and a written estimate comes with your booking confirmation.";

/** Receipts that double as the record of a notice, so the sheet and reloads agree. */
const AGREED = "Recorded your agreements";
const PRIVACY_ACK = "Acknowledged receiving Legion’s Notice of Privacy Practices";
const ESTIMATE_GIVEN = "Shared your Good Faith Estimate: $250 for your first visit";

const selfPay = (s: ChatJourney) => s.coverage === "selfpay" || s.chat.benefitsChoice === "selfpay";

const AGREEMENTS: Record<AgreementId, Agreement> = {
  care: {
    id: "care",
    title: "Video care and treatment",
    label: "Video care",
    summary: "You agree to care by video from licensed Legion clinicians while you’re in Texas.",
    short: "Care by video from licensed Legion clinicians, while you’re in Texas.",
    check: "I agree to video care and treatment",
    Icon: Video,
  },
  payment: {
    id: "payment",
    title: "Payment and cancellations",
    label: "Payment terms",
    summary: CHARGE_LINE,
    // The fee is the term people need at a glance; when they're charged is in the full text.
    short: LATE_CHANGE,
    check: "I agree to the payment and cancellation terms",
    Icon: CreditCard,
  },
  estimate: {
    id: "estimate",
    title: "Your Good Faith Estimate",
    label: "Good Faith Estimate",
    summary: ESTIMATE_LINE,
    short: "Your first visit is estimated at $250. A written estimate comes with your booking.",
    Icon: ReceiptText,
  },
  controlled: {
    id: "controlled",
    title: "Controlled medications",
    label: "Medication rules",
    summary:
      "A prescription is never guaranteed. Legion verifies your ID before prescribing a controlled medication, and you’ll have regular check-ins. Texas requires stimulant prescriptions to come from a physician, so a Legion psychiatrist may be involved.",
    short: "Never guaranteed. Legion verifies your ID first, and you’ll have regular check-ins.",
    check: "I understand the rules for controlled medications",
    Icon: Pill,
  },
  privacy: {
    id: "privacy",
    title: "Notice of Privacy Practices",
    label: "Privacy notice",
    summary: "How Legion uses and protects your health information, and your rights over it.",
    short: "Optional. How Legion uses and protects your health information.",
    check: "I received Legion’s Notice of Privacy Practices",
    // HIPAA asks for a good-faith effort to get this acknowledgment. Care can't depend on it.
    optional: true,
    Icon: LockKeyhole,
  },
  ai: {
    id: "ai",
    title: "How Legion uses AI",
    label: "How Legion uses AI",
    summary: `${ASSISTANT.name} handles setup and drafts notes for your clinician, who reviews everything. Optional: let AI take notes during visits.`,
    short: "Optional. Your clinician reviews every note.",
    Icon: Sparkles,
  },
};

function agreementsFor(s: ChatJourney): Agreement[] {
  return [
    AGREEMENTS.care,
    AGREEMENTS.payment,
    // The No Surprises Act notice is for patients who aren't using insurance.
    ...(selfPay(s) ? [AGREEMENTS.estimate] : []),
    ...(medicationPath(s) ? [AGREEMENTS.controlled] : []),
    AGREEMENTS.privacy,
    AGREEMENTS.ai,
  ];
}

/** Records the estimate notice once, whether it was given with the agreements or with changed terms. */
function recordEstimate(ctx: ChatContext) {
  if (!ctx.get().chat.receipts.some((item) => item.action === ESTIMATE_GIVEN)) receipt(ctx, ESTIMATE_GIVEN, "Legion");
}

const isAgreement = (value?: string): value is AgreementId => !!value && value in AGREEMENTS;

const FULL_TEXT: Record<AgreementId, { sections: { heading: string; body: string }[]; note?: string }> = {
  care: {
    sections: [
      {
        heading: "Who cares for you",
        body: "Your care comes from licensed psychiatric clinicians at Legion Health, PA, a Texas medical practice. You meet them by video.",
      },
      {
        heading: "Being in Texas",
        body: "Your clinician is licensed in Texas, so you need to be in Texas for every visit. You’ll confirm where you are each time you check in.",
      },
      {
        heading: "What video care can do",
        body: "Many conditions can be cared for well by video. If your clinician thinks you need something video can’t offer, like an in-person exam, lab work or more support, they’ll tell you and help you find it.",
      },
      {
        heading: "Your choices",
        body: "You can ask questions, say no to any treatment, or stop care at any time.",
      },
      {
        heading: "In an emergency",
        body: "Legion isn’t an emergency service. If you’re in danger, call 911. In a mental health crisis, call or text 988, any time of day.",
      },
    ],
  },
  payment: {
    sections: [
      {
        heading: "Saving your card doesn’t charge it",
        body: "Your card is saved with Stripe (simulated) so your visit can be booked. You’re charged after each visit, not before.",
      },
      {
        heading: "After each visit",
        body: "Without insurance, a first visit is $250 and follow-ups are $150. With insurance, you pay your plan’s share, like a copay. Your estimate comes from your plan, and the final amount is set when your plan processes the visit.",
      },
      {
        heading: "If your plans change",
        body: `${LATE_CHANGE} That includes cancelling. Rescheduling or cancelling more than 48 hours ahead is free.`,
      },
      {
        heading: "Questions about a charge",
        body: `Ask ${ASSISTANT.name} or the care team at any time. You can change your card whenever you like.`,
      },
    ],
    note: "Preview note: Legion’s Terms say 48 hours and $100, while the live homepage says 24 hours. The window needs confirming before launch.",
  },
  estimate: {
    sections: [
      {
        heading: "Your right to an estimate",
        body: "Because you’re paying for care yourself, the No Surprises Act gives you the right to a Good Faith Estimate: a written estimate of what Legion expects your care to cost.",
      },
      {
        heading: "Your estimate",
        body: "Your first visit is $250. If you and your clinician plan follow-up visits, each is $150. Prescriptions and any lab tests are billed separately by the pharmacy or lab.",
      },
      {
        heading: "In writing",
        body: "A written estimate comes with your booking confirmation. Keep a copy or a screenshot of it.",
      },
      {
        heading: "If your bill is higher",
        body: "If your bill is $400 or more above your estimate, you can dispute it within 120 days of getting the bill.",
      },
      {
        heading: "Questions",
        body: `Ask ${ASSISTANT.name} or the care team. You can also visit cms.gov/nosurprises or call 1-800-985-3059.`,
      },
    ],
    note: "Preview note: a real Good Faith Estimate also lists Legion’s provider details and the expected service and diagnosis codes. This preview shows the price only.",
  },
  controlled: {
    sections: [
      {
        heading: "A prescription is never guaranteed",
        body: "Some ADHD medications, like stimulants, are controlled substances with extra rules. Your clinician decides what’s safe and right for you. That might be a stimulant, a different medication, or no medication at all.",
      },
      {
        heading: "Who prescribes",
        body: "Texas requires stimulant prescriptions to come from a physician. If one is right for you, a Legion psychiatrist may review your care and write the prescription.",
      },
      {
        heading: "Verifying your ID",
        body: "Legion verifies your ID before prescribing a controlled medication. It’s a photo of your ID and a selfie, and you can do it before your first visit or later, if it comes up.",
      },
      {
        heading: "If you’re prescribed one",
        body: "Use one pharmacy and take it only as prescribed. Keep it somewhere safe and never share it. Your pharmacy may also ask for ID at pickup. That’s the pharmacy’s own check.",
      },
      {
        heading: "Regular check-ins",
        body: "Controlled medications need regular visits, so your clinician can see how it’s going and adjust your plan. Missed check-ins can delay refills.",
      },
      {
        heading: "State records",
        body: "Before prescribing, your clinician may check the Texas Prescription Monitoring Program, the state’s record of controlled prescriptions.",
      },
    ],
  },
  privacy: {
    sections: [
      {
        heading: "How Legion uses your information",
        body: "To care for you, including sharing it with your clinicians, pharmacy and labs. To bill for your care, including with your health plan if you use one. And to run Legion’s practice, like checking the quality of care.",
      },
      {
        heading: "When Legion asks first",
        body: "Legion needs your written permission to use your information for marketing, or to share it in ways this notice doesn’t describe. You can take back your permission at any time.",
      },
      {
        heading: "When the law requires sharing",
        body: "Some sharing is required or allowed by law, like reporting abuse, responding to a court order, or preventing a serious threat to someone’s safety.",
      },
      {
        heading: "Your rights",
        body: "You can get a copy of your records, ask Legion to correct them, ask it to limit what it shares, choose how it contacts you, get a list of those it has shared your information with, and get a copy of this notice. If you pay for a visit in full yourself, you can ask Legion not to share it with your health plan, and Legion will agree unless a law requires sharing.",
      },
      {
        heading: "Legion’s duties",
        body: "Legion must keep your information private and secure, follow its notice, and tell you if a breach puts your information at risk.",
      },
      {
        heading: "Questions or concerns",
        body: "Ask Legion’s privacy officer, or file a complaint with the U.S. Department of Health and Human Services. Filing a complaint won’t affect your care.",
      },
    ],
    note: "Preview stand-in: this summary shows what Legion’s Notice of Privacy Practices covers. Legion’s full notice replaces it before launch.",
  },
  ai: {
    sections: [
      {
        heading: `What ${ASSISTANT.name} is`,
        body: `${ASSISTANT.name} is Legion’s virtual assistant. It runs on generative AI and isn’t a person. It helps you get set up: finding clinicians and times, checking coverage, booking, and preparing for visits.`,
      },
      {
        heading: "What it never does",
        body: "It doesn’t diagnose, prescribe or make medical decisions. A licensed clinician makes every medical decision, together with you.",
      },
      {
        heading: "Your clinician reviews its work",
        body: `When ${ASSISTANT.name} drafts something for your care, like a visit brief, your clinician reviews it. Texas law (SB 1188) requires clinicians to review records made with AI.`,
      },
      {
        heading: "AI notes during visits, only if you want them",
        body: "With your permission, AI listens to your video visits and drafts the visit note for your clinician to check and correct. It stays off unless you turn it on, and you can turn it off anytime.",
      },
      {
        heading: "Your answers",
        body: "In this preview, your answers are never used for advertising. You can always ask for a person instead.",
      },
    ],
  },
};

const CENTRAL_STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** When the agreements were recorded, read from the receipt so reloads say the same. */
function agreedAt(s: ChatJourney): string | null {
  const entry = [...s.chat.receipts].reverse().find((item) => item.action === AGREED);
  return entry ? CENTRAL_STAMP.format(new Date(entry.at)) : null;
}

/** The patient's own choices made with the agreements, said only as far as the record shows them. */
function choicesLine(s: ChatJourney): string {
  const acknowledged = s.chat.receipts.some((item) => item.action === PRIVACY_ACK);
  return [
    s.chat.aiNotes ? "AI notes are on for your visits." : "AI notes are off.",
    acknowledged ? "You acknowledged the privacy notice." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * While the dock asks, the agreements live there, so the thread stays quiet. Afterwards the
 * thread keeps the record: when they were agreed, and every document still open to read.
 */
function AgreementsCard({ state, ctx, active }: CardProps) {
  const items = agreementsFor(state);
  const headingId = useId();
  if (active && !state.agreements) return null;
  const when = agreedAt(state);
  return (
    <section className="card-shell fm-agree-card" aria-labelledby={headingId}>
      <header className="fm-agree-card-head">
        <h3 id={headingId}>Your agreements</h3>
        {state.agreements ? (
          <p className="fm-agree-card-when">
            <span className="fm-tick" aria-hidden="true">
              <Check size={11} strokeWidth={3.4} />
            </span>
            {when ? `Agreed ${when}` : "Agreed"}
          </p>
        ) : (
          <p className="fm-agree-card-when">Not agreed yet</p>
        )}
      </header>
      {/* Reading stays available after agreeing: these are the patient's records too. */}
      <ul className="fm-doc-chips" aria-label="Read an agreement">
        {items.map(({ id, title, label }) => (
          <li key={id}>
            <button
              type="button"
              className="fm-doc-chip"
              aria-label={`Read ${title}`}
              onClick={() => ctx.openSheet("read", id)}
            >
              <FileText size={14} strokeWidth={2.1} aria-hidden="true" />
              {label}
            </button>
          </li>
        ))}
      </ul>
      {state.agreements ? <p className="fm-agree-card-foot">{choicesLine(state)}</p> : null}
    </section>
  );
}

/** One agreement in the dock: the whole row checks the box; Read opens the full text. */
function AgreeRow({
  item,
  checked,
  nudge,
  inputRef,
  onChange,
  onRead,
}: {
  item: Agreement & { check: string };
  checked: boolean;
  /** Counts presses of Agree while this row was still unchecked; each one replays the cue. */
  nudge: number;
  inputRef: (element: HTMLInputElement | null) => void;
  onChange: (checked: boolean) => void;
  onRead: () => void;
}) {
  const id = useId();
  return (
    <div
      className={`fm-agree-row ${checked ? "is-checked" : ""} ${nudge && !checked && !item.optional ? "is-nudged" : ""}`}
      data-nudge={nudge % 2}
    >
      <label className="fm-agree-label">
        <input
          ref={inputRef}
          type="checkbox"
          className="fm-check-input"
          checked={checked}
          aria-label={item.check}
          aria-describedby={`${id}-short`}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="fm-box" aria-hidden="true">
          <Check size={14} strokeWidth={3.2} />
        </span>
        <span className="fm-agree-text">
          <span className="fm-agree-title">{item.title}</span>
          <span className="fm-agree-short" id={`${id}-short`}>
            {item.short}
          </span>
        </span>
      </label>
      <button type="button" className="fm-read" aria-label={`Read ${item.title}`} onClick={onRead}>
        Read
      </button>
    </div>
  );
}

/** A notice in the dock that needs no box: it's given, not agreed to. */
function NoticeRow({ item, onRead }: { item: Agreement; onRead: () => void }) {
  return (
    <div className="fm-agree-row is-notice">
      <div className="fm-agree-label">
        <span className="fm-agree-mark" aria-hidden="true">
          <item.Icon size={15} strokeWidth={2.1} />
        </span>
        <span className="fm-agree-text">
          <span className="fm-agree-title">{item.title}</span>
          <span className="fm-agree-short">{item.short}</span>
        </span>
      </div>
      <button type="button" className="fm-read" aria-label={`Read ${item.title}`} onClick={onRead}>
        Read
      </button>
    </div>
  );
}

/**
 * The one on/off control for the conversation's choices. The state is written beside the
 * track, never shown by color alone, and tapping the words toggles it too.
 */
export function Switch({
  label,
  description,
  checked,
  disabled = false,
  onChange,
  extra,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** A link that follows the description, such as the full text behind the choice. */
  extra?: ReactNode;
}) {
  const id = useId();
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };
  return (
    <div className={`fm-switch-row ${checked ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}>
      <span className="fm-switch-copy">
        <span id={`${id}-label`} className="fm-switch-label" onClick={toggle}>
          {label}
        </span>
        <span className="fm-switch-more">
          <span id={`${id}-description`} className="fm-switch-description" onClick={toggle}>
            {description}
          </span>
          {extra ? <> {extra}</> : null}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        className="fm-switch-button"
        disabled={disabled}
        onClick={toggle}
      >
        <span className="fm-switch-state" aria-hidden="true">
          {checked ? "On" : "Off"}
        </span>
        <span className="fm-switch" aria-hidden="true">
          <span className="fm-switch-thumb">
            <Check size={12} strokeWidth={3} />
          </span>
        </span>
      </button>
    </div>
  );
}

function AgreementsWidget({ state, ctx, busy, error }: WidgetProps) {
  const items = agreementsFor(state);
  const checks = items.filter((item): item is Agreement & { check: string } => !!item.check);
  const required = checks.filter((item) => !item.optional);
  // Nothing starts checked, and the optional AI choice starts off.
  const [checked, setChecked] = useState<Partial<Record<AgreementId, boolean>>>({});
  const [aiNotes, setAiNotes] = useState(state.chat.aiNotes);
  const [nudge, setNudge] = useState(0);
  const boxes = useRef<Partial<Record<AgreementId, HTMLInputElement | null>>>({});
  const left = required.filter((item) => !checked[item.id]);
  const ready = left.length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!ready) {
      // Agree stays pressable: it points to what's left instead of doing nothing.
      setNudge((count) => count + 1);
      const box = boxes.current[left[0].id];
      box?.focus({ preventScroll: true });
      box?.closest(".fm-agree-row")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    ctx.update({
      agreements: true,
      financialConsent: true,
      chat: { aiNotes, controlledAck: checks.some((item) => item.id === "controlled") },
    });
    receipt(ctx, AGREED, "You", "You");
    // Either way the notice was given; the acknowledgment is the patient's to make.
    if (checked.privacy) receipt(ctx, PRIVACY_ACK, "You", "You");
    else receipt(ctx, "Shared Legion’s Notice of Privacy Practices", "Legion");
    if (items.some((item) => item.id === "estimate")) recordEstimate(ctx);
    if (aiNotes) receipt(ctx, "Turned on AI notes for your visits", "You", "You");
  };

  const read = (id: AgreementId) => () => ctx.openSheet("read", id);

  return (
    <form className="fm-dock fm-agree-form" onSubmit={submit} noValidate>
      <fieldset className="fm-agree-list">
        <legend className="fm-sr">Agreements</legend>
        {items
          .filter((item) => item.id !== "ai")
          .map((item) =>
            item.check ? (
              <AgreeRow
                key={item.id}
                item={item as Agreement & { check: string }}
                checked={!!checked[item.id]}
                nudge={nudge}
                inputRef={(element) => {
                  boxes.current[item.id] = element;
                }}
                onChange={(value) => setChecked((current) => ({ ...current, [item.id]: value }))}
                onRead={read(item.id)}
              />
            ) : (
              <NoticeRow key={item.id} item={item} onRead={read(item.id)} />
            ),
          )}
      </fieldset>
      <Switch
        label="AI notes during visits"
        description={AGREEMENTS.ai.short}
        checked={aiNotes}
        onChange={setAiNotes}
        extra={
          <button type="button" className="fm-inline-link" onClick={read("ai")}>
            How Legion uses AI
          </button>
        }
      />
      {error ? (
        <p className="fm-dock-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="fm-sticky">
        <p className={`fm-nudge ${nudge && !ready ? "is-shown" : ""}`} role="status">
          {nudge && !ready ? (left.length === 1 ? "Check the last one to continue." : "Check each one to continue.") : ""}
        </p>
        <button
          type="submit"
          className={`fm-primary ${ready ? "" : "is-waiting"}`}
          aria-disabled={!ready || undefined}
          disabled={busy}
        >
          Agree and continue
        </button>
      </div>
    </form>
  );
}

function ReadSheet({ state, data, close }: SheetProps) {
  const id: AgreementId = isAgreement(data) ? data : "care";
  const { title, summary, Icon } = AGREEMENTS[id];
  const { sections, note } = FULL_TEXT[id];
  const headingId = useId();
  return (
    <article className="fm-sheet fm-doc" aria-labelledby={headingId}>
      <header className="fm-doc-head">
        <span className="fm-doc-hero" aria-hidden="true">
          <Icon size={20} strokeWidth={2} />
        </span>
        <h3 id={headingId}>{title}</h3>
      </header>
      <p className="fm-doc-summary">{summary}</p>
      <div className="fm-doc-sections">
        {sections.map((section) => (
          <section key={section.heading} className="fm-doc-section">
            <h4>{section.heading}</h4>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
      {id === "ai" && state.agreements ? (
        <p className="fm-doc-choice">
          <span className="fm-tick" aria-hidden="true">
            <Check size={11} strokeWidth={3.4} />
          </span>
          {state.chat.aiNotes ? "You turned on AI notes for your visits." : "AI notes are off for your visits."}
        </p>
      ) : null}
      {id === "privacy" && state.chat.receipts.some((item) => item.action === PRIVACY_ACK) ? (
        <p className="fm-doc-choice">
          <span className="fm-tick" aria-hidden="true">
            <Check size={11} strokeWidth={3.4} />
          </span>
          You acknowledged receiving this notice.
        </p>
      ) : null}
      {note ? <p className="fm-note fm-doc-note">{note}</p> : null}
      <SheetFoot>
        <button type="button" className="fm-primary" onClick={close}>
          Done
        </button>
      </SheetFoot>
    </article>
  );
}

/* ============================================================== Card on file */

const APPLE_PAY_TOKEN = "pm_mock_applepay";
const PREVIEW_CARD = "4242424242424242";
const CARD_FIELDS = ["number", "expiry", "cvc", "zip"] as const;
type CardField = (typeof CARD_FIELDS)[number];
type CardDraft = Record<CardField, string>;
type CardErrors = Partial<Record<CardField, string>>;

/** The card's own fields share one box, so each message names its field. */
function cardErrors(card: CardDraft, now = new Date()): CardErrors {
  const errors: CardErrors = {};
  const number = card.number.replace(/\D/g, "");
  if (number.length < 16) errors.number = "Enter all 16 digits of the card number.";
  else if (number !== PREVIEW_CARD) errors.number = "This preview only accepts 4242 4242 4242 4242.";
  const expiry = card.expiry.replace(/\D/g, "");
  const month = Number(expiry.slice(0, 2));
  const year = 2000 + Number(expiry.slice(2));
  if (expiry.length !== 4) errors.expiry = "Enter the expiration date as MM/YY.";
  else if (month < 1 || month > 12) errors.expiry = "Check the expiration month.";
  else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1))
    errors.expiry = "Use an expiration date in the future.";
  if (!/^\d{3}$/.test(card.cvc)) errors.cvc = "Enter the 3-digit security code.";
  if (!/^\d{5}$/.test(card.zip)) errors.zip = "Enter a 5-digit ZIP code.";
  return errors;
}

function savedReceipt(ctx: ChatContext) {
  const applePay = ctx.get().paymentSetup.method?.id === APPLE_PAY_TOKEN;
  receipt(
    ctx,
    applePay ? "Saved your Apple Pay card. Nothing was charged" : "Saved your card. Nothing was charged",
    "Stripe (simulated)",
  );
}

function PaymentWidget({ state, ctx, busy, error }: WidgetProps) {
  const [saving, setSaving] = useState(false);

  const applePay = async () => {
    if (busy || saving) return;
    // The sheet explains and repairs a missing payment authorization.
    if (!ctx.get().financialConsent) return ctx.openSheet("payment");
    setSaving(true);
    const zip = state.profile.zip;
    const result = await ctx.act(() =>
      ctx.api.setupPayment({
        token: APPLE_PAY_TOKEN,
        brand: "Visa",
        last4: "4242",
        expMonth: 12,
        expYear: new Date().getFullYear() + 3,
        billingZip: /^\d{5}$/.test(zip) ? zip : "78745",
      }),
    );
    setSaving(false);
    if (result?.status === "requires_action") ctx.openSheet("payment");
    else if (result?.status === "succeeded") savedReceipt(ctx);
  };

  return (
    <div className="fm-dock fm-pay">
      <button
        type="button"
        className={`fm-applepay ${saving ? "is-busy" : ""}`}
        disabled={busy || saving}
        aria-busy={saving || undefined}
        onClick={() => void applePay()}
      >
        {saving ? (
          <Working>Saving with Apple Pay</Working>
        ) : (
          <span>
            Use <strong>Apple Pay</strong>
          </span>
        )}
      </button>
      <button
        type="button"
        className="fm-secondary"
        disabled={busy || saving}
        onClick={() => ctx.openSheet("payment")}
      >
        <CreditCard size={18} aria-hidden="true" />
        Add a card
      </button>
      <p className="fm-dock-note">
        <LockKeyhole size={14} aria-hidden="true" />
        Saving your card doesn’t charge it.
      </p>
      <Status text={saving ? "Saving your Apple Pay card with Stripe (simulated)" : ""} />
      {error && !saving ? (
        <p className="fm-dock-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shown when cost terms changed after the patient agreed, which resets payment authorization. */
function ConsentAgain({ state, ctx }: { state: ChatJourney; ctx: ChatContext }) {
  if (!state.agreements)
    return (
      <p className="fm-callout">
        Review and accept Legion’s agreements in the conversation first. Then you can add your card.
      </p>
    );
  // Switching to paying yourself after agreeing brings the estimate notice with it.
  const estimate = selfPay(state);
  return (
    <section className="fm-callout" aria-label="Confirm the payment terms">
      {/* The terms themselves are in the summary just above. */}
      <p>
        <strong>Please confirm the payment terms again.</strong> Your cost changed after you agreed.
      </p>
      {estimate ? <p>{ESTIMATE_LINE}</p> : null}
      <button
        type="button"
        className="fm-secondary"
        onClick={() => {
          ctx.update({ financialConsent: true });
          receipt(ctx, "Agreed to the updated payment terms", "You", "You");
          if (estimate) recordEstimate(ctx);
        }}
      >
        Agree to the payment terms
      </button>
    </section>
  );
}

function BankCheck({ card }: { card: string }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <section className="fm-bank" aria-labelledby={id}>
      <span className="fm-bank-icon" aria-hidden="true">
        <ShieldCheck size={24} strokeWidth={2} />
      </span>
      <h3 id={id} ref={heading} tabIndex={-1}>
        Your bank wants to confirm
      </h3>
      <p>Approve saving {card}. It’s a $0 check, so nothing is charged.</p>
      <p className="fm-note">Preview: this stands in for your bank’s own screen or text code.</p>
    </section>
  );
}

function PaymentSheet({ state, ctx, close }: SheetProps) {
  // Raw card entry lives only in this component. Only a synthetic token and masked details leave it.
  const [card, setCard] = useState<CardDraft>(() => ({
    number: "",
    expiry: "",
    cvc: "",
    zip: /^\d{5}$/.test(state.profile.zip) ? state.profile.zip : "",
  }));
  // Auto-advancing focus blurs a field inside its own change event, before React re-renders,
  // so validation reads this synchronously updated copy rather than a render's closure.
  const latest = useRef(card);
  const [errors, setErrors] = useState<CardErrors>({});
  const [work, setWork] = useState<"" | "saving" | "approving" | "cancelling">("");
  const [problem, setProblem] = useState("");
  const refs: Record<CardField, InputRef> = {
    number: useRef<HTMLInputElement>(null),
    expiry: useRef<HTMLInputElement>(null),
    cvc: useRef<HTMLInputElement>(null),
    zip: useRef<HTMLInputElement>(null),
  };
  const ids = { number: useId(), expiry: useId(), cvc: useId(), hint: useId() };
  const setup = state.paymentSetup;
  const confirming = setup.status === "requires_action";
  const consent = state.financialConsent;
  const saved = setup.status === "succeeded" ? setup.method : null;
  // If the patient closes this sheet mid-save and opens another, finishing must not close that one.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  const finish = () => {
    savedReceipt(ctx);
    if (open.current) close();
  };

  const edit = (field: CardField, value: string) => {
    latest.current = { ...latest.current, [field]: value };
    setCard(latest.current);
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setProblem("");
  };
  const check = (field: CardField) => {
    const message = cardErrors(latest.current)[field];
    setErrors((current) => ({ ...current, [field]: message }));
    return !message;
  };
  const checkFilled = (field: CardField) => {
    if (latest.current[field]) check(field);
  };
  const advance = (field: CardField) => {
    if (!check(field)) return;
    const next = CARD_FIELDS[CARD_FIELDS.indexOf(field) + 1];
    if (next) refs[next].current?.focus();
    else void save();
  };
  /** A reviewer shortcut, labeled as one: the only card this preview accepts. */
  const fillPreview = () => {
    const year = String((new Date().getFullYear() + 3) % 100).padStart(2, "0");
    latest.current = {
      number: inFours(PREVIEW_CARD),
      expiry: `12/${year}`,
      cvc: "123",
      zip: /^\d{5}$/.test(latest.current.zip) ? latest.current.zip : "78745",
    };
    setCard(latest.current);
    setErrors({});
    setProblem("");
  };

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (work || confirming || !consent) return;
    const draft = latest.current;
    const found = cardErrors(draft);
    setErrors(found);
    const first = CARD_FIELDS.find((field) => found[field]);
    if (first) return refs[first].current?.focus();
    setProblem("");
    setWork("saving");
    blurActive();
    const expiry = draft.expiry.replace(/\D/g, "");
    const result = await attempt(
      ctx,
      () =>
        ctx.api.setupPayment({
          token: `pm_mock_${Date.now()}`,
          brand: "Visa",
          last4: "4242",
          expMonth: Number(expiry.slice(0, 2)),
          expYear: 2000 + Number(expiry.slice(2)),
          billingZip: draft.zip,
        }),
      setProblem,
    );
    setWork("");
    // "requires_action" re-renders this sheet as the bank check, driven by journey state.
    if (result?.status === "succeeded") finish();
  }

  async function decide(approved: boolean) {
    if (work) return;
    setProblem("");
    setWork(approved ? "approving" : "cancelling");
    const result = await attempt(ctx, () => ctx.api.completePaymentAuthentication(approved), setProblem);
    setWork("");
    if (!result) return;
    if (approved && result.status === "succeeded") finish();
    else if (!approved) setProblem(result.error ?? "Bank check cancelled. Your card wasn’t saved.");
  }

  const statusText =
    work === "saving"
      ? "Saving your card with Stripe (simulated)"
      : work === "approving"
        ? "Confirming with your bank"
        : work === "cancelling"
          ? "Cancelling the bank check"
          : "";

  const locked = !consent || !!work;
  const brand = card.number.replace(/\D/g, "").startsWith("4") ? "Visa" : "";
  const shownErrors = (["number", "expiry", "cvc"] as const).filter((field) => errors[field]);
  const described = (field: "number" | "expiry" | "cvc") =>
    [errors[field] ? `${ids[field]}-error` : "", field === "number" ? ids.hint : ""].filter(Boolean).join(" ") ||
    undefined;

  return (
    <form className="fm-sheet" onSubmit={save} noValidate>
      <div className="fm-summary">
        <span className="fm-summary-icon" aria-hidden="true">
          <LockKeyhole size={17} strokeWidth={2.1} />
        </span>
        <div className="fm-summary-copy">
          <p className="fm-summary-title">Saving your card doesn’t charge it</p>
          <p>
            You’ll pay {priceLine(state)}. {LATE_CHANGE}
          </p>
          {saved ? (
            <p>
              Your saved card is {saved.brand} ending {saved.last4}. A new card replaces it.
            </p>
          ) : null}
        </div>
      </div>
      {!consent && !confirming ? <ConsentAgain state={state} ctx={ctx} /> : null}
      {confirming ? (
        <BankCheck card={setup.method ? `${setup.method.brand} ending ${setup.method.last4}` : "your card"} />
      ) : (
        <div className="fm-fields">
          <fieldset className="fm-cardset">
            <legend className="fm-label">Card information</legend>
            <div className={`fm-card ${locked ? "is-locked" : ""}`}>
              <div className={`fm-card-cell is-number ${errors.number ? "is-invalid" : ""}`}>
                <label className="fm-sr" htmlFor={ids.number}>
                  Card number
                </label>
                <input
                  id={ids.number}
                  ref={refs.number}
                  className="fm-card-input"
                  value={card.number}
                  placeholder="Card number"
                  inputMode="numeric"
                  // Never invite autofill of a real card into a simulation.
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  maxLength={19}
                  disabled={locked}
                  aria-invalid={errors.number ? true : undefined}
                  aria-describedby={described("number")}
                  onChange={(event) => {
                    const value = reformat(event, card.number, upTo(16), inFours);
                    edit("number", value);
                    if (digitsOf(value, 16).length === 16 && check("number")) refs.expiry.current?.focus();
                  }}
                  onBlur={() => checkFilled("number")}
                  onKeyDown={onEnter(() => advance("number"))}
                />
                <span className={`fm-card-brand ${brand ? "is-known" : ""}`} aria-hidden="true">
                  {brand ? brand : <CreditCard size={19} strokeWidth={1.9} />}
                </span>
              </div>
              <div className="fm-card-row">
                <div className={`fm-card-cell is-expiry ${errors.expiry ? "is-invalid" : ""}`}>
                  <label className="fm-sr" htmlFor={ids.expiry}>
                    Expiration date
                  </label>
                  <input
                    id={ids.expiry}
                    ref={refs.expiry}
                    className="fm-card-input"
                    value={card.expiry}
                    placeholder="MM/YY"
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="next"
                    maxLength={5}
                    disabled={locked}
                    aria-invalid={errors.expiry ? true : undefined}
                    aria-describedby={described("expiry")}
                    onChange={(event) => {
                      const value = reformat(event, card.expiry, upTo(4), asExpiry);
                      edit("expiry", value);
                      if (digitsOf(value, 4).length === 4 && check("expiry")) refs.cvc.current?.focus();
                    }}
                    onBlur={() => checkFilled("expiry")}
                    onKeyDown={onEnter(() => advance("expiry"))}
                  />
                </div>
                <div className={`fm-card-cell is-cvc ${errors.cvc ? "is-invalid" : ""}`}>
                  <label className="fm-sr" htmlFor={ids.cvc}>
                    Security code
                  </label>
                  <input
                    id={ids.cvc}
                    ref={refs.cvc}
                    className="fm-card-input"
                    value={card.cvc}
                    placeholder="Security code"
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="next"
                    maxLength={3}
                    disabled={locked}
                    aria-invalid={errors.cvc ? true : undefined}
                    aria-describedby={described("cvc")}
                    onChange={(event) => {
                      const value = digitsOf(event.target.value, 3);
                      edit("cvc", value);
                      if (value.length === 3 && !/^\d{5}$/.test(latest.current.zip)) refs.zip.current?.focus();
                    }}
                    onBlur={() => checkFilled("cvc")}
                    onKeyDown={onEnter(() => advance("cvc"))}
                  />
                </div>
              </div>
            </div>
            {shownErrors.map((field) => (
              <p key={field} className="fm-error" id={`${ids[field]}-error`}>
                <CircleAlert size={15} aria-hidden="true" />
                {errors[field]}
              </p>
            ))}
            <p className="fm-hint fm-card-hint" id={ids.hint}>
              <span>Preview: use 4242 4242 4242 4242.</span>
              {/* A reviewer shortcut, so it stays out when the link says ?preview=0. */}
              {PREVIEW ? (
                <button type="button" className="fm-fill" disabled={locked} onClick={fillPreview}>
                  Fill it in
                </button>
              ) : null}
            </p>
          </fieldset>
          <Field
            label="Billing ZIP code"
            inputRef={refs.zip}
            value={card.zip}
            placeholder="78701"
            inputMode="numeric"
            autoComplete="postal-code"
            enterKeyHint="done"
            maxLength={5}
            disabled={locked}
            error={errors.zip}
            onChange={(event) => edit("zip", digitsOf(event.target.value, 5))}
            onBlur={() => checkFilled("zip")}
            onKeyDown={onEnter(() => advance("zip"))}
          />
        </div>
      )}
      <Problem text={problem} />
      <SheetFoot>
        <Status text={statusText} />
        {confirming ? (
          <div className="fm-pair">
            <button
              type="button"
              className="fm-secondary"
              disabled={!!work}
              aria-busy={work === "cancelling" || undefined}
              onClick={() => void decide(false)}
            >
              {work === "cancelling" ? <Working>Cancelling</Working> : "Cancel"}
            </button>
            <button
              type="button"
              className="fm-primary"
              disabled={!!work}
              aria-busy={work === "approving" || undefined}
              onClick={() => void decide(true)}
            >
              {work === "approving" ? <Working>Confirming</Working> : "Approve"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            className="fm-primary"
            disabled={!!work || !consent}
            aria-busy={work === "saving" || undefined}
          >
            {work === "saving" ? (
              <Working>Saving your card</Working>
            ) : (
              <>
                <LockKeyhole size={17} strokeWidth={2.2} aria-hidden="true" />
                Save card
              </>
            )}
          </button>
        )}
        <p className="fm-foot-note">Your card is kept by Stripe (simulated).</p>
      </SheetFoot>
    </form>
  );
}

/* ============================================================== Your details */

const SEXES = ["Female", "Male"] as const;
type Sex = (typeof SEXES)[number];
type DetailsField = "firstName" | "lastName" | "birth" | "address" | "city" | "zip" | "phone" | "sex";
type DetailsDraft = Record<Exclude<DetailsField, "sex">, string>;

/** validateBirth's answer for a birth date under 18. */
const ADULTS_ONLY = "Legion currently cares for adults 18 and older.";

const birthParts = (birth: string) => {
  const [month = "", day = "", year = ""] = birth.split("/");
  return { month, day, year };
};

/** A date in the future is a typo, not a minor, so it's asked again rather than ending the step. */
function birthProblem(birth: string): string {
  const { month, day, year } = birthParts(birth);
  const message = validateBirth({ month, day, year });
  if (message === ADULTS_ONLY && Date.UTC(Number(year), Number(month) - 1, Number(day)) > Date.now())
    return "Check your date of birth.";
  return message;
}

function detailsErrors(
  draft: DetailsDraft,
  sex: Sex | "",
  { birth, phone }: { birth: boolean; phone: boolean },
): Partial<Record<DetailsField, string>> {
  const errors: Partial<Record<DetailsField, string>> = {};
  if (!draft.firstName.trim()) errors.firstName = "Enter your first name.";
  if (!draft.lastName.trim()) errors.lastName = "Enter your last name.";
  if (birth) {
    const message = birthProblem(draft.birth);
    if (message) errors.birth = message;
  }
  if (!draft.address.trim()) errors.address = "Enter your street address.";
  if (!draft.city.trim()) errors.city = "Enter your city.";
  if (!/^\d{5}$/.test(draft.zip)) errors.zip = "Enter 5 digits.";
  if (phone && nationalPhone(draft.phone).length !== 10) errors.phone = "Enter a 10-digit US mobile number.";
  if (!sex) errors.sex = "Choose one to continue.";
  return errors;
}

function DetailsWidget({ ctx, busy, error }: WidgetProps) {
  return (
    <div className="fm-dock">
      <button type="button" className="fm-primary" disabled={busy} onClick={() => ctx.openSheet("details")}>
        <UserRound size={18} strokeWidth={2.1} aria-hidden="true" />
        Add my details
      </button>
      {error ? (
        <p className="fm-dock-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DetailsSheet({ state, ctx, close }: SheetProps) {
  const profile = state.profile;
  // Which fields apply is decided once, so the form never reshapes while it's being filled.
  const [shows] = useState(() => ({
    birth: state.chat.manualDetails || !state.chat.dobEntered || !profile.month,
    phone: state.chat.manualDetails,
  }));
  const [draft, setDraft] = useState<DetailsDraft>(() => ({
    firstName: profile.firstName,
    lastName: profile.lastName,
    birth: profile.month
      ? `${profile.month.padStart(2, "0")}/${profile.day.padStart(2, "0")}/${profile.year}`
      : "",
    address: profile.address,
    city: profile.city,
    zip: profile.zip,
    phone: profile.phone ? asPhone(profile.phone) : "",
  }));
  // Sex assigned at birth is the patient's to state. A lookup's value (often an ID's gender
  // marker) isn't preselected; only an answer the patient already gave is.
  const [sex, setSex] = useState<Sex | "">(state.chat.identity === "found" ? "" : state.chat.sexAtBirth);
  const [errors, setErrors] = useState<Partial<Record<DetailsField, string>>>({});
  const refs: Record<DetailsField, InputRef> = {
    firstName: useRef<HTMLInputElement>(null),
    lastName: useRef<HTMLInputElement>(null),
    birth: useRef<HTMLInputElement>(null),
    address: useRef<HTMLInputElement>(null),
    city: useRef<HTMLInputElement>(null),
    zip: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    sex: useRef<HTMLInputElement>(null),
  };
  const typed: DetailsField[] = [
    "firstName",
    "lastName",
    ...(shows.birth ? (["birth"] as const) : []),
    "address",
    "city",
    "zip",
    ...(shows.phone ? (["phone"] as const) : []),
  ];

  const edit = (field: Exclude<DetailsField, "sex">, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };
  const check = (field: Exclude<DetailsField, "sex">) => {
    if (!draft[field]) return;
    const message = detailsErrors(draft, sex, shows)[field];
    setErrors((current) => ({ ...current, [field]: message }));
  };
  const advance = (field: DetailsField) => {
    const next = typed[typed.indexOf(field) + 1];
    if (next) refs[next].current?.focus();
    else save();
  };

  function save(event?: FormEvent) {
    event?.preventDefault();
    const found = detailsErrors(draft, sex, shows);
    const { month, day, year } = birthParts(draft.birth);
    const birth = { month: String(Number(month)), day: String(Number(day)), year };
    // Under 18 ends the step with the same warm exit as the phone path, so nothing else on
    // the form needs fixing first. Only the birth date is kept; a minor's details are not.
    if (shows.birth && found.birth === ADULTS_ONLY) {
      ctx.update({ profile: { ...ctx.get().profile, ...birth }, chat: { dobEntered: true, ageBlocked: true } });
      close();
      return;
    }
    setErrors(found);
    const first = [...typed, "sex" as const].find((field) => found[field]);
    if (first) return refs[first].current?.focus();
    const current = ctx.get().profile;
    ctx.update({
      profile: {
        ...current,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        address: draft.address.trim(),
        city: draft.city.trim(),
        zip: draft.zip,
        ...(shows.birth ? birth : {}),
        ...(shows.phone ? { phone: nationalPhone(draft.phone), sms: true } : {}),
      },
      chat: {
        identity: "confirmed",
        sexAtBirth: sex || "",
        dobEntered: true,
        ...(shows.birth ? { ageBlocked: false } : {}),
      },
    });
    receipt(ctx, "Confirmed your details", "You", "You");
    // Coverage work starts now and finishes behind the next question.
    void runBenefits(ctx);
    close();
  }

  const text = (field: Exclude<DetailsField, "sex">, label: string, extra: Input & { hint?: string }) => (
    <Field
      label={label}
      inputRef={refs[field]}
      value={draft[field]}
      error={errors[field]}
      enterKeyHint={typed[typed.length - 1] === field ? "done" : "next"}
      onChange={(event) => edit(field, event.target.value)}
      onBlur={() => check(field)}
      onKeyDown={onEnter(() => advance(field))}
      {...extra}
    />
  );

  return (
    <form className="fm-sheet" onSubmit={save} noValidate>
      <p className="fm-lead">
        Use your legal name, as it appears on your ID or insurance card. You can tell your clinician the
        name you go by.
      </p>
      <div className="fm-fields fm-groups">
        <div className="fm-row">
          {text("firstName", "First name", { autoComplete: "given-name", autoCapitalize: "words", spellCheck: false })}
          {text("lastName", "Last name", { autoComplete: "family-name", autoCapitalize: "words", spellCheck: false })}
        </div>
        {shows.birth
          ? text("birth", "Date of birth", {
              placeholder: "MM/DD/YYYY",
              inputMode: "numeric",
              autoComplete: "bday",
              maxLength: 10,
              onChange: (event) => edit("birth", reformat(event, draft.birth, upTo(8), asBirth)),
            })
          : null}
        <div className="fm-group">
          {text("address", "Street address", { autoComplete: "address-line1", autoCapitalize: "words" })}
          <div className="fm-row fm-row-city">
            {text("city", "City", { autoComplete: "address-level2", autoCapitalize: "words" })}
            {text("zip", "ZIP code", {
              inputMode: "numeric",
              autoComplete: "postal-code",
              maxLength: 5,
              onChange: (event) => edit("zip", digitsOf(event.target.value, 5)),
            })}
          </div>
        </div>
        {shows.phone
          ? text("phone", "Mobile number", {
              type: "tel",
              inputMode: "tel",
              autoComplete: "tel-national",
              placeholder: "(512) 555-0148",
              hint: "Visit reminders are texted here. Reply STOP anytime.",
              onChange: (event) => edit("phone", typePhone(event, draft.phone)),
            })
          : null}
        <Choices
          variant="segmented"
          legend="Sex assigned at birth"
          options={SEXES}
          value={sex}
          inputRef={refs.sex}
          error={errors.sex}
          note="Required for Texas medical records. You can share your gender identity with your clinician."
          onChange={(value) => {
            setSex(value);
            setErrors((current) => ({ ...current, sex: undefined }));
          }}
        />
      </div>
      <SheetFoot>
        <button type="submit" className="fm-primary">
          Save details
        </button>
      </SheetFoot>
    </form>
  );
}

/* ============================================================== Another plan */

const payerLabel = (name: string) =>
  name === "Blue Cross Blue Shield of Texas" ? "Blue Cross Blue Shield" : name;

/** The synthetic card a simulated scan reads: always a different plan from the one on file. */
const scannedCard = (current: string) =>
  current === "Aetna"
    ? { payer: "Cigna", memberId: "U604918217" }
    : { payer: "Aetna", memberId: "W604918217" };

function InsuranceSheet({ state, ctx, close }: SheetProps) {
  const [payer, setPayer] = useState("");
  const [memberId, setMemberId] = useState("");
  const [errors, setErrors] = useState<{ payer?: string; memberId?: string }>({});
  const [scan, setScan] = useState<"" | "reading" | "done">("");
  const later = useTimers();
  const payerRef = useRef<HTMLInputElement>(null);
  const memberRef = useRef<HTMLInputElement>(null);

  const readCard = () => {
    if (scan === "reading") return;
    setScan("reading");
    later(1200, () => {
      const found = scannedCard(state.payer);
      setPayer(found.payer);
      setMemberId(found.memberId);
      setErrors({});
      setScan("done");
    });
  };

  function save(event: FormEvent) {
    event.preventDefault();
    const found = {
      payer: payer ? undefined : "Choose your plan.",
      memberId: /^[A-Z0-9-]{3,20}$/.test(memberId) ? undefined : "Enter the member ID from your card.",
    };
    setErrors(found);
    if (found.payer) return payerRef.current?.focus();
    if (found.memberId) return memberRef.current?.focus();
    const jobs = ctx.get().chat.jobs;
    ctx.update({
      payer,
      memberId,
      coverage: "insurance",
      chat: {
        payerChoice: payer,
        benefits: null,
        benefitsAccepted: false,
        benefitsChoice: "",
        jobs: { ...jobs, benefits: undefined },
      },
    });
    receipt(ctx, `Switched to your ${payerLabel(payer)} plan`, "You", "You");
    void runBenefits(ctx);
    close();
  }

  const reading = scan === "reading";
  return (
    <form className="fm-sheet" onSubmit={save} noValidate>
      <p className="fm-lead">
        Choose your plan and add the member ID from your card. {ASSISTANT.name} will check your benefits again.
      </p>
      <button
        type="button"
        className={`fm-scan ${reading ? "is-reading" : ""} ${scan === "done" ? "is-done" : ""}`}
        disabled={reading}
        aria-busy={reading || undefined}
        onClick={readCard}
      >
        <span className="fm-scan-icon" aria-hidden="true">
          {reading ? (
            <LoaderCircle size={19} className="fm-spin" />
          ) : scan === "done" ? (
            <Check size={18} strokeWidth={2.8} />
          ) : (
            <ScanLine size={19} strokeWidth={2} />
          )}
        </span>
        <span className="fm-scan-copy">
          <strong>{reading ? "Reading your card" : scan === "done" ? "Scan again" : "Scan your insurance card"}</strong>
          <span>
            {scan === "done"
              ? "Filled in from your card. Check that it matches."
              : "Fills in your plan and member ID (simulated)"}
          </span>
        </span>
      </button>
      <Status
        text={reading ? "Reading your card" : scan === "done" ? "Filled in from your card. Check that it matches." : ""}
      />
      <Choices
        variant="tiles"
        legend="Your plan"
        options={PAYERS}
        value={payer}
        labelFor={payerLabel}
        inputRef={payerRef}
        error={errors.payer}
        onChange={(value) => {
          setPayer(value);
          setErrors((current) => ({ ...current, payer: undefined }));
        }}
      />
      <Field
        label="Member ID"
        inputRef={memberRef}
        value={memberId}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={20}
        placeholder="W123456789"
        hint="On the front of your insurance card"
        error={errors.memberId}
        onChange={(event) => {
          setMemberId(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""));
          setErrors((current) => ({ ...current, memberId: undefined }));
        }}
      />
      <SheetFoot>
        <button type="submit" className="fm-primary">
          Check my benefits
        </button>
      </SheetFoot>
    </form>
  );
}

/* ============================================================== Photo ID */

type IdStep = "consent" | "id" | "selfie" | "verifying" | "verified";
const CAPTURE_STEPS: Partial<Record<IdStep, number>> = { id: 1, selfie: 2, verifying: 3, verified: 3 };

function IdProgress({ step }: { step: IdStep }) {
  const filled = CAPTURE_STEPS[step] ?? 0;
  return (
    <div className="fm-id-progress" aria-hidden="true">
      {[1, 2, 3].map((index) => (
        <i key={index} className={index <= filled ? "is-filled" : ""} />
      ))}
    </div>
  );
}

function Viewfinder({ face, captured }: { face: boolean; captured: boolean }) {
  return (
    <div className={`fm-frame ${face ? "is-face" : ""} ${captured ? "is-captured" : ""}`} aria-hidden="true">
      {face ? (
        <span className="fm-oval">
          <UserRound size={58} strokeWidth={1.4} />
        </span>
      ) : (
        <>
          {["tl", "tr", "bl", "br"].map((corner) => (
            <span key={corner} className={`fm-corner is-${corner}`} />
          ))}
          <span className="fm-idcard">
            <span className="fm-idcard-photo" />
            <span className="fm-idcard-lines">
              <i />
              <i />
              <i />
            </span>
          </span>
        </>
      )}
      {captured ? null : <span className="fm-scanline" />}
      {captured ? (
        <span className="fm-frame-check">
          <Check size={24} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );
}

function IdCheckSheet({ state, ctx, close }: SheetProps) {
  const [step, setStep] = useState<IdStep>(state.chat.idCheck === "done" ? "verified" : "consent");
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const opened = useRef(true);
  const later = useTimers();

  // Each new step moves focus to its heading, so screen readers hear where they are.
  useEffect(() => {
    if (opened.current) {
      opened.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const agree = () => {
    receipt(ctx, "Agreed to a face scan for ID verification", "You", "You");
    setStep("id");
  };
  const notNow = () => {
    ctx.update({ chat: { idCheck: "later" } });
    close();
  };
  const capture = (next: "selfie" | "verifying") => {
    if (captured) return;
    setCaptured(true);
    setError("");
    later(700, () => {
      setCaptured(false);
      setStep(next);
      if (next !== "verifying") return;
      // An unreadable photo goes back to the ID step to retake it; nothing is marked verified.
      const retake = (message: string) => {
        setError(message);
        setStep("id");
      };
      void ctx.api.verifyPhotoId().then(
        (result) => {
          if (result.status !== "verified")
            return retake("Your ID photo was hard to read. Retake it in good light, with all four corners in the frame.");
          ctx.update({ chat: { idCheck: "done" } });
          receipt(ctx, "Verified your photo ID", "Persona (simulated)");
          setStep("verified");
        },
        () => retake("The ID check didn’t go through. Try again."),
      );
    });
  };

  const title = (text: string, position?: number) => (
    <h3 ref={heading} tabIndex={-1}>
      {text}
      {position ? <span className="fm-sr">, step {position} of 3</span> : null}
    </h3>
  );

  const face = step === "selfie";
  let body: ReactNode;
  let foot: ReactNode = null;
  if (step === "consent") {
    body = (
      <>
        <div className="fm-id-intro">
          <span className="fm-id-hero" aria-hidden="true">
            <ScanFace size={28} strokeWidth={1.8} />
          </span>
          <div className="fm-id-head">
            {title("A photo of your ID and a selfie")}
            <p>
              Legion verifies your ID before prescribing a controlled medication. It takes about a minute. Have
              your driver’s license or state ID ready.
            </p>
          </div>
        </div>
        <ol className="fm-id-steps">
          <li>
            <span className="fm-id-step-icon" aria-hidden="true">
              <IdCard size={18} strokeWidth={2} />
            </span>
            <span>
              <strong>Take a photo of the front of your ID</strong>
              <span>A driver’s license or state ID</span>
            </span>
          </li>
          <li>
            <span className="fm-id-step-icon" aria-hidden="true">
              <ScanFace size={18} strokeWidth={2} />
            </span>
            <span>
              <strong>Take a selfie</strong>
              <span>So it can be matched to your ID</span>
            </span>
          </li>
        </ol>
        <div className="fm-notice">
          <ShieldCheck size={17} strokeWidth={2.1} aria-hidden="true" />
          <div>
            <p>
              To match your face to your ID, Persona (simulated) will create a face scan. It’s used only to
              verify you and deleted within a year.
            </p>
            <p className="fm-note">Texas law asks for your consent before a face scan is made.</p>
          </div>
        </div>
      </>
    );
    foot = (
      <div className="fm-pair">
        <button type="button" className="fm-secondary" onClick={notNow}>
          Not now
        </button>
        <button type="button" className="fm-primary" onClick={agree}>
          I agree
        </button>
      </div>
    );
  } else if (step === "id" || step === "selfie") {
    body = (
      <>
        <div className="fm-id-head">
          {title(face ? "Take a selfie" : "Photo of your ID", face ? 2 : 1)}
          <p>
            {face
              ? "Center your face in the oval and look straight ahead."
              : "Place the front of your driver’s license or state ID inside the frame."}
          </p>
        </div>
        <Viewfinder face={face} captured={captured} />
        {error && !face ? (
          <p className="fm-error" role="alert">
            <CircleAlert size={15} aria-hidden="true" />
            {error}
          </p>
        ) : null}
        <p className="fm-note fm-center">Preview: no camera is used, and nothing is recorded.</p>
      </>
    );
    foot = (
      <button
        type="button"
        className={`fm-primary ${captured ? "is-done" : ""}`}
        disabled={captured}
        onClick={() => capture(face ? "verifying" : "selfie")}
      >
        {captured ? (
          <>
            <Check size={18} strokeWidth={2.6} aria-hidden="true" />
            {face ? "Selfie taken" : "Photo taken"}
          </>
        ) : (
          <>
            <Camera size={18} strokeWidth={2.1} aria-hidden="true" />
            {face ? "Take selfie" : "Take photo"}
          </>
        )}
      </button>
    );
  } else {
    const done = step === "verified";
    body = (
      <div className="fm-id-center">
        <span className={`fm-id-badge ${done ? "is-done" : ""}`} aria-hidden="true">
          {done ? <Check size={32} strokeWidth={2.8} /> : <LoaderCircle size={30} className="fm-spin" />}
        </span>
        {done ? title("Your ID is verified") : title("Verifying your ID", 3)}
        <p>
          {done
            ? "If a controlled medication becomes part of your plan, Legion’s ID check is done. Your pharmacy may still ask for ID at pickup."
            : "Persona (simulated) is matching your selfie to your ID. This takes a few seconds."}
        </p>
        {done ? null : <span className="fm-id-shimmer" aria-hidden="true" />}
      </div>
    );
    if (done)
      foot = (
        <button type="button" className="fm-primary" onClick={close}>
          Done
        </button>
      );
  }

  return (
    <div className="fm-sheet fm-idcheck">
      <div className={`fm-step ${step === "verifying" || step === "verified" ? "is-result" : ""}`} key={step}>
        {step === "consent" ? null : <IdProgress step={step} />}
        {body}
      </div>
      <Status text={captured ? (face ? "Selfie taken" : "Photo of your ID taken") : ""} />
      {foot ? <SheetFoot>{foot}</SheetFoot> : null}
    </div>
  );
}

/* ============================================================== Registry */

export const FORM_CARDS: CardMap = {
  agreements: (props) => <AgreementsCard {...props} />,
  mychart: (props) => <ChartCard {...props} />,
};

/* ============================================================== MyChart */

/** The MyChart offer in the chat: what's shared, then the import's progress and result, in place. */
function ChartCard({ state }: CardProps) {
  const status = state.chat.chart;
  const chart = state.chartImport;
  const organization = chart?.organization ?? chartOrganization(state);
  const doctor = clinicianFirst(state.appointment!.providerId);
  const done = status === "done" && chart ? chart : null;
  const [title, sub] =
    status === "connecting"
      ? ["Connecting to MyChart", `Bringing your chart from ${organization}`]
      : done
        ? ["Chart imported", `From ${done.organization}, shared with ${doctor}`]
        : status === "failed"
          ? ["MyChart didn’t connect", "Nothing was shared. You can try again, or skip it."]
          : status === "later"
            ? ["Your chart from MyChart", "Skipped for now. You can bring it anytime before your visit."]
            : ["Your chart from MyChart", "You sign in to MyChart and choose what to share."];
  const mark =
    status === "connecting" ? (
      <LoaderCircle size={20} className="fm-spin" />
    ) : done ? (
      <Check size={20} strokeWidth={2.6} />
    ) : status === "failed" ? (
      <CircleAlert size={20} strokeWidth={2.2} />
    ) : (
      <FileHeart size={20} strokeWidth={1.9} />
    );
  return (
    <section className={`card-shell fm-chart-card is-${status || "offer"}`} aria-label="Your chart from MyChart">
      <div className="fm-chart-head">
        <span className="fm-chart-mark" aria-hidden="true">
          {mark}
        </span>
        <div>
          <h3 className="card-title">{title}</h3>
          <p className="fm-chart-sub">{sub}</p>
        </div>
      </div>
      {done ? (
        <ul className="fm-chart-facts">
          <li>
            <strong>Conditions</strong>
            {done.conditions.join(", ")}
          </li>
          <li>
            <strong>Medications</strong>
            {done.medications.join(", ")}
          </li>
          <li>
            <strong>Allergies</strong>
            {done.allergies.join(", ")}
          </li>
          <li>
            <strong>Also</strong>
            {counted(done.labResults, "lab result")} and {counted(done.visitNotes, "visit note")}
          </li>
        </ul>
      ) : status === "" || status === "failed" ? (
        <>
          <ul className="fm-chart-items">
            <li>
              <Pill size={16} strokeWidth={2} aria-hidden="true" />
              Conditions, medications and allergies
            </li>
            <li>
              <FlaskConical size={16} strokeWidth={2} aria-hidden="true" />
              Lab results
            </li>
            <li>
              <FileText size={16} strokeWidth={2} aria-hidden="true" />
              Notes from past visits
            </li>
          </ul>
          <p className="fm-chart-note">Preview: no MyChart account is used, and nothing leaves your browser.</p>
        </>
      ) : null}
    </section>
  );
}

type ChartStep = "consent" | "connecting" | "done" | "failed";

const counted = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Bringing the chart from another doctor's MyChart, any time before the visit. Never a required step. */
function ChartSheet({ state, ctx, close, data }: SheetProps) {
  const organization = state.chartImport?.organization ?? chartOrganization(state);
  const first = clinicianFirst(state.appointment!.providerId);
  const [step, setStep] = useState<ChartStep>(state.chartImport ? "done" : "consent");
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const opened = useRef(true);

  // Each new step moves focus to its heading, so screen readers hear where they are.
  useEffect(() => {
    if (opened.current) {
      opened.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const connect = () => {
    setStep("connecting");
    setError("");
    void ctx.api.importChart(organization).then(
      (chart) => {
        ctx.update({ chartImport: { ...chart, afterApproval: ctx.get().chat.briefApproved } });
        receipt(ctx, `Imported your chart from ${chart.organization}`, "Epic MyChart (simulated)", "You");
        addAsk(ctx, data || "ready", {
          question: "",
          answer: `I brought in your chart from ${chart.organization}: ${counted(chart.conditions.length, "condition")}, ${counted(chart.medications.length, "medication")}, ${counted(chart.labResults, "lab result")} and ${counted(chart.visitNotes, "visit note")}. ${first} will see it before your visit.`,
        });
        setStep("done");
      },
      (issue: unknown) => {
        setError(issue instanceof Error ? issue.message : "MyChart didn’t connect. Try again in a moment.");
        setStep("failed");
      },
    );
  };

  const title = (text: string) => (
    <h3 ref={heading} tabIndex={-1}>
      {text}
    </h3>
  );

  const chart = state.chartImport;
  let body: ReactNode;
  let foot: ReactNode;
  if (step === "consent") {
    body = (
      <>
        <div className="fm-id-intro">
          <span className="fm-id-hero" aria-hidden="true">
            <FileHeart size={28} strokeWidth={1.8} />
          </span>
          <div className="fm-id-head">
            {title("Bring your chart from MyChart")}
            <p>
              If {organization} or another doctor’s office uses MyChart, you can share your chart with {first}{" "}
              before your visit. You’ll sign in to MyChart and choose what to share.
            </p>
          </div>
        </div>
        <ul className="fm-id-steps">
          <li>
            <span className="fm-id-step-icon" aria-hidden="true">
              <Pill size={18} strokeWidth={2} />
            </span>
            <span>
              <strong>Conditions, medications and allergies</strong>
              <span>What your other doctors have on file</span>
            </span>
          </li>
          <li>
            <span className="fm-id-step-icon" aria-hidden="true">
              <FlaskConical size={18} strokeWidth={2} />
            </span>
            <span>
              <strong>Lab results</strong>
              <span>Your recent results</span>
            </span>
          </li>
          <li>
            <span className="fm-id-step-icon" aria-hidden="true">
              <FileText size={18} strokeWidth={2} />
            </span>
            <span>
              <strong>Visit notes</strong>
              <span>Summaries from past visits</span>
            </span>
          </li>
        </ul>
        <p className="fm-note fm-center">Preview: no MyChart account is used, and nothing leaves your browser.</p>
      </>
    );
    foot = (
      <div className="fm-pair">
        <button type="button" className="fm-secondary" onClick={close}>
          Not now
        </button>
        <button type="button" className="fm-primary" onClick={connect}>
          Connect MyChart
        </button>
      </div>
    );
  } else if (step === "connecting") {
    body = (
      <div className="fm-id-center">
        <span className="fm-id-badge" aria-hidden="true">
          <LoaderCircle size={30} className="fm-spin" />
        </span>
        {title("Connecting to MyChart")}
        <p>Signing in and sharing your chart from {organization}. This takes a few seconds.</p>
        <span className="fm-id-shimmer" aria-hidden="true" />
      </div>
    );
    foot = null;
  } else if (step === "failed") {
    body = (
      <div className="fm-id-center">
        <span className="fm-id-badge" aria-hidden="true">
          <CircleAlert size={30} strokeWidth={2.2} />
        </span>
        {title("MyChart didn’t connect")}
        <p role="alert">{error}</p>
      </div>
    );
    foot = (
      <div className="fm-pair">
        <button type="button" className="fm-secondary" onClick={close}>
          Not now
        </button>
        <button type="button" className="fm-primary" onClick={connect}>
          Try again
        </button>
      </div>
    );
  } else {
    body = (
      <div className="fm-id-center">
        <span className="fm-id-badge is-done" aria-hidden="true">
          <Check size={32} strokeWidth={2.8} />
        </span>
        {title("Your chart is in")}
        <p>{first} will see it with your visit brief.</p>
        {chart ? (
          <ul className="fm-chart-facts">
            <li>
              <strong>Conditions</strong>
              {chart.conditions.join(", ")}
            </li>
            <li>
              <strong>Medications</strong>
              {chart.medications.join(", ")}
            </li>
            <li>
              <strong>Allergies</strong>
              {chart.allergies.join(", ")}
            </li>
            <li>
              <strong>From {chart.organization}</strong>
              {counted(chart.labResults, "lab result")} and {counted(chart.visitNotes, "visit note")}
            </li>
          </ul>
        ) : null}
      </div>
    );
    foot = (
      <button type="button" className="fm-primary" onClick={close}>
        Done
      </button>
    );
  }

  return (
    <div className="fm-sheet fm-idcheck">
      <div className={`fm-step ${step === "consent" ? "" : "is-result"}`} key={step}>
        {body}
      </div>
      {foot ? <SheetFoot>{foot}</SheetFoot> : null}
    </div>
  );
}

export const FORM_WIDGETS: WidgetMap = {
  agreements: (props) => <AgreementsWidget {...props} />,
  payment: (props) => <PaymentWidget {...props} />,
  details: (props) => <DetailsWidget {...props} />,
};

export const FORM_SHEETS: SheetMap = {
  payment: { title: "Add a card", render: (props) => <PaymentSheet {...props} /> },
  details: { title: "Your details", render: (props) => <DetailsSheet {...props} /> },
  insurance: { title: "Use a different plan", render: (props) => <InsuranceSheet {...props} /> },
  // The shell's title is fixed per sheet, so each agreement names itself in the body.
  read: { title: "Agreements", render: (props) => <ReadSheet {...props} /> },
  idcheck: { title: "Verify your ID", render: (props) => <IdCheckSheet {...props} /> },
  chart: { title: "Bring your chart", render: (props) => <ChartSheet {...props} /> },
};
