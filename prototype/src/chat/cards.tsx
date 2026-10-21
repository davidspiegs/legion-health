import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  HeartHandshake,
  IdCard,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { addTask, receipt, stamp, track, type ChatContext } from "./agent";
import { Field, asPhone, nationalPhone, typePhone } from "./forms";
import type { CardMap, CardProps } from "./registry";
import { SUPPORT_LINES } from "./safety";
import { SCRIPT } from "./script";
import type { ChatJourney } from "./state";

export type { CardProps };

function Shell({
  children,
  tone = "plain",
  label,
  className = "",
}: {
  children: ReactNode;
  tone?: "plain" | "quiet";
  label?: string;
  className?: string;
}) {
  return (
    <section className={`card-shell tone-${tone}${className ? ` ${className}` : ""}`} aria-label={label}>
      {children}
    </section>
  );
}

const QUICK_ITEMS: { key: "adult" | "texas" | "video"; Icon: LucideIcon; text: string }[] = [
  { key: "adult", Icon: UserRound, text: "I’m 18 or older" },
  { key: "texas", Icon: MapPin, text: "I’ll be in Texas for my visits" },
  { key: "video", Icon: Video, text: "Video visits work for me" },
];

/**
 * The three logistics checks as one list. Once the patient says all three hold,
 * each mark turns into a check; one that doesn't hold is marked as such.
 */
function QuickList({ state }: CardProps) {
  const all = state.chat.quickCheck === "all";
  const failed = state.chat.quickCheckFailed;
  // Marks animate only when the answer arrives here, not when a saved thread is restored.
  const [answeredAtMount] = useState(all);
  return (
    <Shell label="Quick checks" className="qc-card">
      <ul className="check-list">
        {QUICK_ITEMS.map(({ key, Icon, text }, index) => {
          const holds = all;
          const fails = !all && failed === key;
          return (
            <li
              key={key}
              className={holds ? "is-true" : fails ? "is-false" : undefined}
              style={{ ["--i" as string]: index }}
            >
              <span
                key={holds ? "true" : fails ? "false" : "open"}
                className={`check-icon${holds && !answeredAtMount ? " is-new" : ""}`}
                aria-hidden="true"
              >
                {holds ? (
                  <Check size={15} strokeWidth={2.8} />
                ) : fails ? (
                  <Minus size={15} strokeWidth={2.6} />
                ) : (
                  <Icon size={16} strokeWidth={2} />
                )}
              </span>
              <span className="check-text">{text}</span>
              {fails ? <span className="check-tag">Not right now</span> : null}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

/* ============================================================== Off-ramps */

/** Every off-ramp carries the same help lines: 988 by call or text, and 911. */
export function SupportLines() {
  const { crisis, emergency } = SUPPORT_LINES;
  return (
    <div className="card-support">
      <p>
        If you need support right now, call or text {crisis}. It’s free and confidential. If you’re in danger, call{" "}
        {emergency}.
      </p>
      <div className="card-pills">
        <a className="card-pill" href={`tel:${crisis}`}>
          <Phone size={14} strokeWidth={2.2} aria-hidden="true" /> Call {crisis}
        </a>
        <a className="card-pill" href={`sms:${crisis}`}>
          <MessageCircle size={14} strokeWidth={2.2} aria-hidden="true" /> Text {crisis}
        </a>
        <a className="card-pill" href={`tel:${emergency}`}>
          <Phone size={14} strokeWidth={2.2} aria-hidden="true" /> Call {emergency}
        </a>
      </div>
    </div>
  );
}

type Step = { Icon: LucideIcon; text: ReactNode; action?: ReactNode };

/** Where to look next, as one quiet list: each a thing the patient can do on their own. */
function Steps({ steps }: { steps: Step[] }) {
  return (
    <ul className="card-steps">
      {steps.map(({ Icon, text, action }, index) => (
        <li key={index}>
          <span className="card-step-icon" aria-hidden="true">
            <Icon size={16} strokeWidth={2} />
          </span>
          <div className="card-step-body">
            <p>{text}</p>
            {action}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** SAMHSA's national locator for mental health and substance use care. */
function FindTreatment() {
  return (
    <a className="card-step-link" href="https://findtreatment.gov/" target="_blank" rel="noreferrer">
      Search FindTreatment.gov
      <span className="card-sr"> (opens in a new tab)</span>
    </a>
  );
}

/** The top of an off-ramp: a calm mark, what's true, and why. */
function ExitHead({ Icon, title, body }: { Icon: LucideIcon; title: string; body: ReactNode }) {
  return (
    <div className="card-exit-head">
      <span className="card-exit-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <h3 className="card-title">{title}</h3>
      <p className="card-lead">{body}</p>
    </div>
  );
}

type FitReason = "age" | "state" | "virtual";
const BY_CHECK = { adult: "age", texas: "state", video: "virtual" } as const;

function fitReason(s: ChatJourney): FitReason {
  if (s.chat.quickCheckFailed) return BY_CHECK[s.chat.quickCheckFailed];
  return s.exitReason === "age" || s.exitReason === "state" ? s.exitReason : "virtual";
}

/** Next steps a patient can take on their own. No promise here depends on contact details Legion doesn't have. */
const EXITS: Record<
  Exclude<FitReason, "age">,
  { Icon: LucideIcon; title: string; body: string; steps: Step[] }
> = {
  state: {
    Icon: MapPin,
    title: "Legion can only see patients in Texas right now",
    body: "Clinicians need to be licensed where you are during a visit, so here’s where to look instead.",
    steps: [
      { Icon: Stethoscope, text: "Your primary care doctor can refer you to a psychiatrist licensed where you live." },
      {
        Icon: Search,
        text: "FindTreatment.gov lists mental health care across the US.",
        action: <FindTreatment />,
      },
    ],
  },
  virtual: {
    Icon: HeartHandshake,
    title: "It’s okay to want in-person care",
    body: "Legion’s visits are by video, so here’s where to find care in person.",
    steps: [
      { Icon: Stethoscope, text: "Your primary care doctor can refer you to a psychiatrist who sees people in person." },
      { Icon: IdCard, text: "If you have insurance, the member services number on your card can tell you who’s in network nearby." },
      {
        Icon: Search,
        text: "FindTreatment.gov lists mental health care near you.",
        action: <FindTreatment />,
      },
    ],
  },
};

const node = (id: string) => SCRIPT.find((item) => item.id === id);

/**
 * The patient says the quick checks hold after all. It's recorded the way the shell records
 * a changed answer, so the clinician sees what was said first.
 */
function confirmAllTrue(ctx: ChatContext) {
  const s = ctx.get();
  const asked = node("quick")?.answer(s)?.text ?? "";
  const which = node("quick-which")?.answer(s)?.text;
  const before = which ? `${asked} (${which})` : asked;
  ctx.update({
    fit: { ...s.fit, "fit-age": "yes", "fit-state": "yes", "fit-virtual": "yes" },
    exitReason: "",
    chat: { quickCheck: "all", quickCheckFailed: "" },
  });
  const now = ctx.get();
  const after = node("quick")?.answer(now)?.text ?? "";
  const at = stamp(now);
  ctx.update({
    chat: {
      answeredAt: { ...now.chat.answeredAt, quick: at },
      history: before ? [...now.chat.history, { node: "quick", from: before, to: after, at }] : now.chat.history,
      edits: { ...now.chat.edits, quick: (now.chat.edits.quick ?? 0) + 1 },
    },
  });
  track(ctx, "answer_changed", { node: "quick" });
  receipt(ctx, "Changed your answer: all three quick checks are true", "You", "You");
}

function AllTrue({ ctx, foot = true }: { ctx: ChatContext; foot?: boolean }) {
  return (
    <div className="card-fix">
      <button type="button" className="card-button" onClick={() => confirmAllTrue(ctx)}>
        Actually, all of these are true
      </button>
      {foot ? <p className="card-foot">Picked the wrong one? Tap your answer above to choose another.</p> : null}
    </div>
  );
}

function FitExit(props: CardProps) {
  const { state, ctx } = props;
  const reason = fitReason(state);
  // Under 18 gets the same youth card as a birth date under 18; it has its own footnote.
  if (reason === "age")
    return (
      <div className="card-stack">
        {renderCard("age-exit", props)}
        <AllTrue ctx={ctx} foot={false} />
      </div>
    );
  const exit = EXITS[reason];
  return (
    <Shell label="Next steps" className="card-exit">
      <ExitHead Icon={exit.Icon} title={exit.title} body={exit.body} />
      <Steps steps={exit.steps} />
      <SupportLines />
      <AllTrue ctx={ctx} />
    </Shell>
  );
}

const CALLBACK = {
  kind: "coordinator-call",
  title: "Call about the right level of care",
  due: "Within 1 business day",
} as const;

/**
 * A hospital stay in the past year, or wanting to talk about one, comes before any phone or
 * email step, so the card asks for a number before it promises a call. The request is a
 * care team task, so the confirmation survives a reload.
 */
function ReviewExit({ state, ctx }: CardProps) {
  const request = state.chat.tasks.find((task) => task.kind === CALLBACK.kind && task.title === CALLBACK.title);
  const [changing, setChanging] = useState(false);
  const [phone, setPhone] = useState(() => asPhone(request?.contact ?? state.profile.phone));
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  // The form and its confirmation replace each other, so focus follows.
  useEffect(() => {
    if (sent) confirmation.current?.focus();
  }, [sent]);
  useEffect(() => {
    if (changing) field.current?.focus();
  }, [changing]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const digits = nationalPhone(phone);
    if (digits.length !== 10) {
      setError("Enter a 10-digit US phone number.");
      field.current?.focus();
      return;
    }
    if (request) {
      // Same request, new number: the coordinator's queue keeps one task.
      if (digits !== request.contact) {
        const tasks = ctx.get().chat.tasks.map((task) => (task.id === request.id ? { ...task, contact: digits } : task));
        ctx.update({ chat: { tasks } });
        receipt(ctx, "Changed the number for your coordinator call", "You", "You");
      }
    } else {
      addTask(ctx, { ...CALLBACK, contact: digits }, "Asked a care coordinator to call you within 1 business day");
      track(ctx, "coordinator_call_requested");
    }
    setChanging(false);
    setSent(true);
  };

  return (
    <Shell label="A care coordinator will help" className="card-exit">
      <ExitHead
        Icon={HeartHandshake}
        title="Let’s get your care right first"
        body="A Legion care coordinator should talk with you before booking, so we can make sure video visits give you enough support. This isn’t a judgment about you."
      />
      {request && !changing ? (
        <div className="card-done">
          <p className="card-confirm" ref={confirmation} tabIndex={-1}>
            <span className="card-confirm-icon" aria-hidden="true">
              <Check size={13} strokeWidth={3} />
            </span>
            <span>
              Requested. A care coordinator will call {asPhone(request.contact ?? "")} {request.due.toLowerCase()}{" "}
              (simulated).
            </span>
          </p>
          <button
            type="button"
            className="card-text-button"
            onClick={() => {
              setSent(false);
              setChanging(true);
            }}
          >
            Change the number
          </button>
        </div>
      ) : (
        <form className="card-form" onSubmit={submit} noValidate>
          <Field
            label="Phone number"
            inputRef={field}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            enterKeyHint="send"
            placeholder="(512) 555-0148"
            value={phone}
            hint={`A care coordinator calls ${CALLBACK.due.toLowerCase()}.`}
            error={error}
            onChange={(event) => {
              setPhone(typePhone(event, phone));
              setError("");
            }}
          />
          <button type="submit" className="card-button is-primary">
            <Phone size={17} aria-hidden="true" />
            {request ? "Save this number" : "Request a call"}
          </button>
        </form>
      )}
      <SupportLines />
      <p className="card-foot">Your answers are saved, so you won’t have to repeat them.</p>
    </Shell>
  );
}

function Unknown({ name }: { name: string }) {
  if (!import.meta.env.DEV) return null;
  return (
    <Shell tone="quiet">
      <p className="card-foot">
        <ShieldCheck size={14} /> Missing card: {name}
      </p>
    </Shell>
  );
}

// "person", "crisis" and "age-exit" come from sheets.tsx, registered over this map.
const CARDS: CardMap = {
  "quick-list": (props) => <QuickList {...props} />,
  "fit-exit": (props) => <FitExit {...props} />,
  "review-exit": (props) => <ReviewExit {...props} />,
};

export function renderCard(name: string, props: CardProps): ReactNode {
  const render = CARDS[name];
  return render ? render(props) : <Unknown name={name} />;
}

export function registerCards(extra: CardMap) {
  Object.assign(CARDS, extra);
}
