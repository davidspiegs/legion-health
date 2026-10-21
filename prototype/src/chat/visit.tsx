import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  BadgeCheck,
  CalendarCheck2,
  CalendarPlus,
  Check,
  Download,
  HeartHandshake,
  House,
  Info,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Mic,
  MicOff,
  PenLine,
  Phone,
  PhoneOff,
  Pill,
  Share2,
  Sparkles,
  Video,
  VideoOff,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { formatDate, formatPhone, formatTime } from "../model/fixtures";
import { journeyNow } from "../model/journey-state";
import { addTask, receipt, stamp, track, type ChatContext, type ChatPatch } from "./agent";
import { downloadCalendar, saveFile } from "./cards-booked";
import { STAGES } from "./engine";
import { ASSISTANT, PREVIEW } from "./env";
import { mentionsCrisis } from "./guide-ai";
import { clinicianById, formalName } from "./inventory";
import { AssistantAvatar, LegionMark, markShown } from "./parts";
import { SUPPORT_LINES, flagRisk, screenPatientLines } from "./safety";
import type {
  CardMap,
  CardProps,
  OverlayProps,
  SheetMap,
  SheetProps,
  WidgetMap,
  WidgetProps,
} from "./registry";
import type { ChatJourney } from "./state";
import "./visit.css";

// ------------------------------------------------------------------ helpers

interface Who {
  name: string;
  /** Mid-sentence form. */
  first: string;
  /** Sentence-start form. */
  First: string;
  initials: string;
  credential: string;
  photo?: string;
}

function clinicianFor(s: ChatJourney): Who {
  const c = clinicianById(s.appointment?.providerId ?? s.providerId);
  return c
    ? {
        name: c.name,
        first: formalName(c),
        First: formalName(c),
        initials: c.initials,
        credential: c.credential,
        photo: c.photo,
      }
    : {
        name: "Your clinician",
        first: "your clinician",
        First: "Your clinician",
        initials: "",
        credential: "",
      };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const capitalize = (text: string) => text.replace(/^./, (c) => c.toUpperCase());

/** A number given at check-in is for this visit only; otherwise it's the account's phone. */
const callbackNumber = (state: ChatJourney) => state.chat.callbackPhone || state.profile.phone;

/**
 * A US number as 10 digits. A leading 1 (from +1 or dialing habit) is the country code.
 * Anything else that isn't a 10-digit US number comes back empty, never cut down to fit.
 */
export function usPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(national) ? national : "";
}

/** The number as it's typed: a +1 stays visible, and extra digits are shown rather than dropped. */
function phoneField(digits: string): string {
  if (digits.length > 1 && digits.length <= 11 && digits.startsWith("1"))
    return `+1 ${formatPhone(digits.slice(1))}`;
  return digits.length <= 10 ? formatPhone(digits) : digits;
}

function maskPhone(raw: string): string {
  const d = usPhone(raw);
  return d ? `(${d.slice(0, 3)}) •••-${d.slice(6)}` : formatPhone(raw);
}

/** Postal codes for every state but Texas, plus DC and Puerto Rico. */
const STATE_CODES = new Set(
  [
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT",
    "NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN UT VT VA WA WV WI WY PR",
  ]
    .join(" ")
    .split(" "),
);
const ELSEWHERE = new RegExp(
  `(?:^|[\\s,])(?:${[
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
    "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
    "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
    "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
    "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Utah", "Vermont", "Virginia",
    "Washington", "Wisconsin", "Wyoming", "District of Columbia", "Puerto Rico", "Mexico", "Canada",
  ].join("|")})$`,
  "i",
);
const TEXAS = /[\s,]*\b(?:TX|Tex\.?|Texas)$/i;

/**
 * Reads a place typed at check-in. A place marked with another state (by name or postal
 * code), Mexico or Canada is outside Texas. Anything else is a Texas city, since that's
 * what the field asks for, and an explicit TX always wins. A bare "Texas" has no city.
 */
export function readPlace(text: string): { city: string } | { outside: true } | null {
  const place = text
    .trim()
    .replace(/[\s,]*(?:USA|U\.S\.A\.?|United States(?: of America)?)$/i, "")
    .replace(/[\s,]*\d{5}(?:-\d{4})?$/, "")
    .trim();
  if (TEXAS.test(place)) return { city: place.replace(TEXAS, "").trim() };
  const code = /(?:,\s*|\s)([A-Za-z]{2})\.?$/.exec(place)?.[1].toUpperCase();
  if (ELSEWHERE.test(place) || (code && STATE_CODES.has(code))) return { outside: true };
  const city = place.replace(/[\s,]+$/, "");
  return city.length >= 2 ? { city } : null;
}

/**
 * Encounter timestamps are real time, but the preview runs the visit on the
 * journey clock, so times are shown on that clock to match the appointment.
 */
function onClock(s: ChatJourney, iso?: string): string | null {
  if (!iso) return null;
  const real = Date.parse(iso);
  if (Number.isNaN(real)) return null;
  return new Date(s.clock ? journeyNow(s, real) : real).toISOString();
}

function clockTime(s: ChatJourney, iso?: string): string {
  const value = onClock(s, iso);
  return value ? formatTime(value) : "";
}

function weeks(count: number): string {
  return `${count} ${count === 1 ? "week" : "weeks"}`;
}

function homeLocation(s: ChatJourney): { label: string; value: string } | null {
  const city = s.profile.city.trim();
  if (!city) return null;
  const street = s.profile.address.trim();
  const zip = s.profile.zip.trim();
  return {
    label: `Home in ${city}, TX`,
    value: [street, `${city}, TX${zip ? ` ${zip}` : ""}`].filter(Boolean).join(", "),
  };
}

type RoomView = "waiting" | "late" | "ready" | "call" | "left" | "lost" | "complete" | "closed";

/** Leaving and a dropped connection share one state; the latest video event tells them apart. */
function leftOnPurpose(s: ChatJourney): boolean {
  for (let index = s.events.length - 1; index >= 0; index--) {
    const event = s.events[index];
    if (event.service !== "Video") continue;
    if (event.operation === "room.left" && event.outcome === "success") return true;
    if (event.operation === "connection.interrupted") return false;
  }
  return false;
}

function roomView(s: ChatJourney): RoomView {
  const e = s.encounter;
  if (e.status === "completed" || s.appointment?.status === "completed") return "complete";
  if (e.status === "in_progress")
    return e.connection === "connected" ? "call" : leftOnPurpose(s) ? "left" : "lost";
  if (e.status === "waiting")
    return e.clinicianStatus === "ready"
      ? "ready"
      : e.clinicianStatus === "running_late"
        ? "late"
        : "waiting";
  return "closed";
}

function elapsedMs(s: ChatJourney, now: number): number {
  const e = s.encounter;
  if (!e.joinedAt) return 0;
  const end = e.pausedAt ? Date.parse(e.pausedAt) : now;
  return Math.max(0, end - Date.parse(e.joinedAt) - (e.pausedDurationMs ?? 0));
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function Avatar({ who, size }: { who: Who; size: number }) {
  return who.photo ? (
    <img className="vs-avatar" src={who.photo} alt="" width={size} height={size} />
  ) : (
    <span className="vs-avatar is-initials" aria-hidden="true" style={{ width: size, height: size }}>
      {who.initials}
    </span>
  );
}

// ---------------------------------------------------------------- check-in

type StepId = "where" | "callback" | "device";
type StepStatus = "todo" | "open" | "warn" | "done";
const STEP_ORDER: StepId[] = ["where", "callback", "device"];

/**
 * One line of the check-in list. Only the step being answered is open. Finished steps
 * fold into one confirmed line and the ones still to come wait below it, so the whole
 * list fits a phone's dock with the Check in button in reach.
 */
function Step({
  id,
  icon: Icon,
  status,
  label,
  value,
  question,
  questionId,
  changeLabel,
  onChange,
  disabled,
  children,
}: {
  id: StepId;
  icon: LucideIcon;
  status: StepStatus;
  label: string;
  value: string;
  question: string;
  questionId: string;
  changeLabel?: string;
  onChange?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const open = status === "open" || status === "warn";
  return (
    <li className={`vs-ci-step is-${status}`} data-step={id}>
      <div className="vs-ci-head">
        <span className="vs-ci-icon" aria-hidden="true">
          {status === "done" ? (
            <Check className="vs-pop" size={16} strokeWidth={3} />
          ) : (
            <Icon size={17} strokeWidth={2.1} />
          )}
        </span>
        {open ? (
          <p className="vs-ci-q vs-settle" id={questionId} key="question">
            {question}
          </p>
        ) : (
          <p className="vs-ci-text vs-settle" key={status}>
            <span className="vs-ci-label">
              {status === "done" ? <span className="vs-sr">Done. </span> : null}
              {label}
            </span>
            <span className="vs-ci-value">{value}</span>
          </p>
        )}
        {status === "done" && onChange ? (
          <button
            type="button"
            className="vs-change"
            aria-label={changeLabel}
            disabled={disabled}
            onClick={onChange}
          >
            Change
          </button>
        ) : null}
      </div>
      {/* Every step stays mounted so it can fold and unfold; closed ones can't be reached. */}
      <div className="vs-ci-body" inert={!open}>
        <div className="vs-ci-clip">
          <div className="vs-ci-pad">{children}</div>
        </div>
      </div>
    </li>
  );
}

function CheckIn({ state, ctx, busy, error }: WidgetProps) {
  const home = homeLocation(state);
  const phone = usPhone(callbackNumber(state));
  const [where, setWhere] = useState<"choose" | "city">(home ? "choose" : "city");
  const [city, setCity] = useState("");
  // A typed place that turned out to be outside Texas, said back in the explanation.
  const [elsewhere, setElsewhere] = useState("");
  const [callback, setCallback] = useState<"choose" | "number">(phone ? "choose" : "number");
  // Digits as typed or pasted, a leading 1 included; saving turns them into a 10-digit number.
  const [number, setNumber] = useState("");
  // The simulated device test checks the camera, then the microphone.
  const [test, setTest] = useState<"idle" | "camera" | "mic" | "done">("idle");
  const [checkingIn, setCheckingIn] = useState(false);
  const [announce, setAnnounce] = useState("");
  const timers = useRef<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const cityField = useRef<HTMLInputElement>(null);
  const numberField = useRef<HTMLInputElement>(null);
  const awayText = useRef<HTMLParagraphElement>(null);
  const placeChips = useRef<HTMLDivElement>(null);
  const goButton = useRef<HTMLButtonElement>(null);
  // Set when the patient changes the Texas answer, so focus follows the control that replaced it.
  const refocus = useRef(false);
  // Set when a step finishes or reopens, so focus moves on to whatever is open next.
  const moveOn = useRef(false);
  const whereId = useId();
  const awayId = useId();
  const callId = useId();
  const deviceId = useId();
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const away = state.chat.outsideTexas;
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (away) awayText.current?.focus();
    else (cityField.current ?? placeChips.current?.querySelector("button"))?.focus();
  }, [away]);

  const done: Record<StepId, boolean> = {
    where: !!state.currentLocation.trim(),
    callback: state.callbackConfirmed,
    device: state.deviceReady,
  };
  const current = STEP_ORDER.find((step) => !done[step]) ?? null;
  const ready = current === null;
  const status = (step: StepId): StepStatus =>
    done[step] ? "done" : step !== current ? "todo" : step === "where" && away ? "warn" : "open";

  useEffect(() => {
    if (!moveOn.current) return;
    moveOn.current = false;
    const next = current
      ? root.current?.querySelector<HTMLElement>(
          `[data-step="${current}"] .vs-ci-body :is(button, input):not(:disabled)`,
        )
      : goButton.current;
    next?.focus({ preventScroll: true });
  }, [current]);

  const place = home && state.currentLocation === home.value ? home.label : state.currentLocation;
  const visitTime = state.appointment ? formatTime(state.appointment.start) : "your visit time";
  const typedNumber = usPhone(number);
  // Ten digits starting with 1 are probably a +1 number still being typed, so they wait.
  const wrongNumber = number.length >= 10 && !typedNumber && !(number.length === 10 && number.startsWith("1"));

  const finish = (patch: ChatPatch) => {
    moveOn.current = true;
    ctx.update(patch);
  };
  // Rendering synchronously keeps focus inside the tap, so iOS opens the keyboard.
  const chooseCity = () => {
    flushSync(() => setWhere("city"));
    cityField.current?.focus();
  };
  // Clinicians can see a patient only while they're in Texas, so this never counts as a location.
  const leftTexas = (typed: string) => {
    setElsewhere(typed);
    refocus.current = true;
    ctx.update({ currentLocation: "", chat: { outsideTexas: true } });
  };
  const backInTexas = () => {
    setElsewhere("");
    setWhere(home ? "choose" : "city");
    refocus.current = true;
    ctx.update({ chat: { outsideTexas: false } });
  };
  const saveCity = (event: FormEvent) => {
    event.preventDefault();
    const typed = readPlace(city);
    if (!typed) return;
    if ("outside" in typed) return leftTexas(city.trim());
    finish({ currentLocation: typed.city ? `${typed.city}, TX` : "Texas" });
  };
  const otherNumber = () => {
    flushSync(() => setCallback("number"));
    numberField.current?.focus();
  };
  const saveNumber = (event: FormEvent) => {
    event.preventDefault();
    if (!typedNumber) return;
    finish({ callbackConfirmed: true, chat: { callbackPhone: typedNumber } });
  };
  const runTest = () => {
    setTest("camera");
    setAnnounce("Checking your camera and mic");
    // Simulated: the preview never asks the browser for camera or microphone access.
    timers.current.push(
      window.setTimeout(() => setTest("mic"), 550),
      window.setTimeout(() => setTest("done"), 1050),
      window.setTimeout(() => {
        setTest("idle");
        setAnnounce("Camera and mic ready");
        // Focus moves on only if the patient is still here, not somewhere else on the page.
        const active = document.activeElement;
        moveOn.current = !active || active === document.body || !!root.current?.contains(active);
        ctx.update({ deviceReady: true });
      }, 1400),
    );
  };
  const checkIn = async () => {
    setCheckingIn(true);
    const ok = await ctx.act(async () => {
      await ctx.api.checkIn();
      return true;
    });
    setCheckingIn(false);
    if (!ok) return;
    ctx.setVisitOpen(true);
    receipt(ctx, "Checked you in for your visit", "Legion video (simulated)");
  };

  return (
    <div className={`vs-checkin ${ready ? "is-ready" : ""}`} ref={root}>
      <ol className="vs-ci-list" aria-label="Before you check in">
        <Step
          id="where"
          icon={MapPin}
          status={status("where")}
          label="Joining from"
          value={place}
          question={`Where will you be at ${visitTime}?`}
          questionId={whereId}
          changeLabel="Change where you’re joining from"
          disabled={busy}
          onChange={() => {
            moveOn.current = true;
            setWhere(home ? "choose" : "city");
            ctx.update({ currentLocation: "" });
          }}
        >
          {away ? (
            <div className="vs-away" role="group" aria-labelledby={awayId}>
              <p className="vs-away-text" id={awayId} ref={awayText} tabIndex={-1}>
                {elsewhere ? `${elsewhere} is outside Texas. ` : ""}Legion clinicians can see you only
                while you’re in Texas. If you won’t be in Texas at {visitTime}, pick a new time.
              </p>
              <div className="vs-opts">
                <button
                  type="button"
                  className="chip reply primary"
                  disabled={busy}
                  onClick={() => ctx.openSheet("reschedule")}
                >
                  Pick a new time
                </button>
                <button type="button" className="chip reply" disabled={busy} onClick={backInTexas}>
                  I’ll be in Texas by then
                </button>
              </div>
            </div>
          ) : where === "city" ? (
            <form className="vs-inline" onSubmit={saveCity} noValidate>
              <input
                ref={cityField}
                className="vs-field"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                aria-labelledby={whereId}
                aria-describedby={`${whereId}-hint`}
                placeholder="City in Texas"
                autoComplete="address-level2"
                autoCapitalize="words"
                inputMode="text"
                enterKeyHint="done"
                maxLength={60}
              />
              <button type="submit" className="chip primary vs-save" disabled={city.trim().length < 2 || busy}>
                Save
              </button>
              <p className="vs-ci-hint" id={`${whereId}-hint`}>
                Your clinician can see you only while you’re in Texas.
              </p>
              {home ? (
                <button type="button" className="vs-text-button" onClick={() => setWhere("choose")}>
                  Use my home in {state.profile.city.trim()}
                </button>
              ) : (
                <button type="button" className="vs-text-button" onClick={() => leftTexas("")}>
                  I’m outside Texas right now
                </button>
              )}
            </form>
          ) : (
            <div className="vs-opts" role="group" aria-labelledby={whereId} ref={placeChips}>
              {home ? (
                <button
                  type="button"
                  className="chip reply"
                  disabled={busy}
                  onClick={() => finish({ currentLocation: home.value })}
                >
                  <House size={18} strokeWidth={2} aria-hidden="true" />
                  {home.label}
                </button>
              ) : null}
              <div className="vs-opts-pair is-fit">
                <button type="button" className="chip reply" disabled={busy} onClick={chooseCity}>
                  Elsewhere in Texas
                </button>
                <button type="button" className="chip reply" disabled={busy} onClick={() => leftTexas("")}>
                  Outside Texas
                </button>
              </div>
            </div>
          )}
        </Step>

        <Step
          id="callback"
          icon={Phone}
          status={status("callback")}
          label="If video drops"
          value={done.callback ? `We’ll call ${maskPhone(phone)}` : "A number we can call"}
          question={
            phone && callback === "choose"
              ? `Can we call ${maskPhone(phone)} if video drops?`
              : "What number can we call if video drops?"
          }
          questionId={callId}
          changeLabel="Change your callback number"
          disabled={busy}
          onChange={() => {
            moveOn.current = true;
            setCallback(phone ? "choose" : "number");
            ctx.update({ callbackConfirmed: false });
          }}
        >
          {callback === "number" ? (
            <form className="vs-inline" onSubmit={saveNumber} noValidate>
              <input
                ref={numberField}
                className="vs-field"
                type="tel"
                value={phoneField(number)}
                onChange={(event) => setNumber(event.target.value.replace(/\D/g, "").slice(0, 15))}
                aria-labelledby={callId}
                aria-invalid={wrongNumber || undefined}
                aria-describedby={wrongNumber ? `${callId}-error` : undefined}
                placeholder="(512) 555-0123"
                autoComplete="tel-national"
                inputMode="tel"
                enterKeyHint="done"
              />
              <button type="submit" className="chip primary vs-save" disabled={!typedNumber || busy}>
                Save
              </button>
              {wrongNumber ? (
                <p className="vs-ci-hint is-error" id={`${callId}-error`}>
                  Use a 10-digit US number, like (512) 555-0123.
                </p>
              ) : null}
              {phone ? (
                <button type="button" className="vs-text-button" onClick={() => setCallback("choose")}>
                  Keep {maskPhone(phone)}
                </button>
              ) : null}
            </form>
          ) : (
            <div className="vs-opts-pair" role="group" aria-labelledby={callId}>
              <button
                type="button"
                className="chip reply primary"
                disabled={busy}
                onClick={() => finish({ callbackConfirmed: true })}
              >
                Yes
              </button>
              <button type="button" className="chip reply" disabled={busy} onClick={otherNumber}>
                Another number
              </button>
            </div>
          )}
        </Step>

        <Step
          id="device"
          icon={Video}
          status={status("device")}
          label="Camera and mic"
          value={done.device ? "Ready" : "A quick test"}
          question="Test your camera and mic"
          questionId={deviceId}
        >
          {test === "idle" ? (
            <button
              type="button"
              className="chip reply"
              aria-describedby={`${deviceId}-hint`}
              disabled={busy}
              onClick={runTest}
            >
              <Video size={18} strokeWidth={2} aria-hidden="true" />
              Start test
            </button>
          ) : (
            <div className="vs-testing" aria-hidden="true">
              <span className={`vs-test is-${test === "camera" ? "running" : "done"}`}>
                <Video size={17} strokeWidth={2} />
                Camera
                {test === "camera" ? <LoaderCircle className="vs-spin" size={16} /> : <Check className="vs-pop" size={16} strokeWidth={3} />}
              </span>
              <span className={`vs-test is-${test === "mic" ? "running" : test === "done" ? "done" : "waiting"}`}>
                <Mic size={17} strokeWidth={2} />
                Microphone
                {test === "mic" ? (
                  <LoaderCircle className="vs-spin" size={16} />
                ) : test === "done" ? (
                  <Check className="vs-pop" size={16} strokeWidth={3} />
                ) : null}
              </span>
            </div>
          )}
          <p className="vs-ci-hint" id={`${deviceId}-hint`}>
            A simulated check. Your camera and mic stay off.
          </p>
        </Step>
      </ol>

      {/* Sticks to the bottom of the dock, so checking in is always in reach. */}
      <div className="vs-ci-foot">
        <button
          ref={goButton}
          type="button"
          className={`vs-primary vs-go ${ready ? "is-ready" : ""}`}
          disabled={!ready || busy}
          onClick={() => void checkIn()}
        >
          {checkingIn ? (
            <>
              <LoaderCircle className="vs-spin" size={18} aria-hidden="true" /> Checking you in
            </>
          ) : (
            "Check in"
          )}
        </button>
        {error ? (
          <p className="composer-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <p className="vs-sr" role="status">
        {announce}
      </p>
    </div>
  );
}

/** The dock's one action while a visit is under way: it always says where it takes you. */
function Rejoin({ state, ctx, busy, error }: WidgetProps) {
  const who = clinicianFor(state);
  const view = roomView(state);
  const interrupted = state.appointment?.status === "interrupted";
  const [working, setWorking] = useState(false);
  const label = interrupted
    ? "Rejoin your visit"
    : view === "ready"
      ? `Join ${who.first} now`
      : view === "call"
        ? "Return to your visit"
        : "Return to the waiting room";
  const go = async () => {
    // Joining from the chat is one tap: the room opens already in the visit.
    const operation = interrupted
      ? () => ctx.api.reconnect()
      : view === "ready"
        ? () => ctx.api.admitToVisit()
        : null;
    if (operation) {
      setWorking(true);
      const ok = await ctx.act(async () => {
        await operation();
        return true;
      });
      setWorking(false);
      if (!ok) return;
    }
    ctx.setVisitOpen(true);
  };
  return (
    <div className="vs-rejoin">
      <button
        type="button"
        className={`vs-primary ${view === "ready" ? "is-ready" : ""}`}
        disabled={busy || working}
        onClick={() => void go()}
      >
        {working ? (
          <LoaderCircle className="vs-spin" size={18} aria-hidden="true" />
        ) : (
          <Video size={18} aria-hidden="true" />
        )}
        {label}
      </button>
      {error ? (
        <p className="composer-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------- visit room

const PHASES = [
  "Getting to know you and what brought you here",
  "Talking through what you’ve noticed and what you want to change",
  "Agreeing on next steps together",
];

function useRoomAction(ctx: ChatContext) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const run = async (operation: () => Promise<unknown>) => {
    setPending(true);
    setError("");
    // The dock is hidden behind the room, so failures are shown here instead.
    await ctx.act(async () => {
      try {
        await operation();
      } catch (issue) {
        setError(
          issue instanceof Error ? issue.message : "That didn’t go through. Try again in a moment.",
        );
      }
    });
    setPending(false);
  };
  return { pending, error, setError, run };
}

type RoomAction = ReturnType<typeof useRoomAction>;

function RoomButton({
  icon: Icon,
  label,
  tone,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tone?: "off" | "leave";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`vs-ctl ${tone ? `is-${tone}` : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="vs-ctl-dot" aria-hidden="true">
        <Icon size={22} strokeWidth={2} />
      </span>
      <span className="vs-ctl-label">{label}</span>
    </button>
  );
}

function MediaControls({
  state,
  ctx,
  onLeave,
  leaving,
  compact,
}: {
  state: ChatJourney;
  ctx: ChatContext;
  onLeave?: () => void;
  leaving?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`vs-controls ${compact ? "is-compact" : ""}`} role="group" aria-label="Microphone and camera">
      <RoomButton
        icon={state.micOn ? Mic : MicOff}
        label={state.micOn ? "Mute" : "Unmute"}
        tone={state.micOn ? undefined : "off"}
        onClick={() => ctx.update({ micOn: !ctx.get().micOn })}
      />
      <RoomButton
        icon={state.cameraOn ? Video : VideoOff}
        label={state.cameraOn ? "Stop video" : "Start video"}
        tone={state.cameraOn ? undefined : "off"}
        onClick={() => ctx.update({ cameraOn: !ctx.get().cameraOn })}
      />
      {onLeave ? (
        <RoomButton icon={PhoneOff} label="Leave" tone="leave" disabled={leaving} onClick={onLeave} />
      ) : null}
    </div>
  );
}

/** Never a real camera: a placeholder that reflects the camera and mic toggles. */
function SelfTile({ state, floating }: { state: ChatJourney; floating?: boolean }) {
  const initial = state.profile.firstName.trim().charAt(0).toUpperCase() || "Y";
  return (
    <div
      className={`vs-self ${floating ? "is-floating" : ""} ${state.cameraOn ? "" : "is-off"}`}
      role="img"
      aria-label={state.cameraOn ? "Your video preview, simulated" : "Your camera is off"}
    >
      {state.cameraOn ? (
        <span className="vs-self-face" aria-hidden="true">
          {initial}
        </span>
      ) : (
        <VideoOff size={20} aria-hidden="true" />
      )}
      <span className="vs-self-label" aria-hidden="true">
        You
      </span>
      {state.micOn ? null : (
        <span className="vs-self-muted" aria-hidden="true">
          <MicOff size={12} strokeWidth={2.4} />
        </span>
      )}
    </div>
  );
}

function Portrait({ who, view }: { who: Who; view: RoomView }) {
  return (
    <div className={`vs-portrait is-${view}`}>
      {who.photo ? (
        <img src={who.photo} alt="" />
      ) : (
        <span className="vs-portrait-initials" aria-hidden="true">
          {who.initials}
        </span>
      )}
      {view === "ready" || view === "complete" ? (
        <span className="vs-presence" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      ) : null}
    </div>
  );
}

/** A tap target, not a hover tooltip, so it works the same on a phone. */
function AiNotes({ first }: { first: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const tipId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <div
      ref={wrap}
      className="vs-ai"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="vs-ai-pill"
        aria-expanded={open}
        aria-controls={tipId}
        aria-describedby={tipId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <Sparkles size={14} aria-hidden="true" /> AI notes on
        </span>
      </button>
      <p id={tipId} className={`vs-ai-tip ${open ? "is-open" : ""}`}>
        Draft notes for your clinician to review. You can ask {first} to pause them anytime.
      </p>
    </div>
  );
}

function RoomNote() {
  return <p className="vs-note">Simulated visit. No camera or microphone is used.</p>;
}

function Waiting({
  state,
  ctx,
  who,
  view,
  action,
  close,
}: {
  state: ChatJourney;
  ctx: ChatContext;
  who: Who;
  view: RoomView;
  action: RoomAction;
  close: () => void;
}) {
  const ready = view === "ready";
  const title = ready
    ? `${who.First} is ready for you`
    : view === "late"
      ? `${who.First} is running a few minutes late`
      : `${who.First} will let you in soon`;
  const lead = ready
    ? "Take your time. Join when you’re settled."
    : view === "late"
      ? "Your place is saved. You don’t need to do anything."
      : "You’re checked in. Take a breath and settle in.";
  return (
    <section className={`vs-view vs-wait is-${view}`}>
      <div className="vs-stage">
        <div className="vs-center">
          <Portrait who={who} view={view} />
          {who.credential ? (
            <p className="vs-who">
              {who.name}, {who.credential}
            </p>
          ) : null}
          <h2 className="vs-title vs-settle" key={view}>
            {title}
          </h2>
          <p className="vs-lead">{lead}</p>
          <div className="vs-precheck">
            <SelfTile state={state} />
            <MediaControls state={state} ctx={ctx} compact />
          </div>
          <ul className="vs-facts">
            {state.briefApproved ? (
              <li>
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                {who.First} has your visit brief
              </li>
            ) : null}
            <li>
              <Phone size={16} aria-hidden="true" />
              If video drops, {who.first} will call {maskPhone(callbackNumber(state))}
            </li>
          </ul>
        </div>
      </div>
      <div className="vs-foot">
        {ready ? (
          <button
            type="button"
            className="vs-primary vs-join"
            disabled={action.pending}
            onClick={() => void action.run(() => ctx.api.admitToVisit())}
          >
            {action.pending ? (
              <LoaderCircle className="vs-spin" size={18} aria-hidden="true" />
            ) : (
              <Video size={19} aria-hidden="true" />
            )}
            {action.pending ? "Joining" : "Join now"}
          </button>
        ) : (
          // The room's status line already announces this; it holds the place the Join button takes.
          <p className="vs-waitbar" aria-hidden="true">
            <i />
            Waiting for {who.first} to let you in
          </p>
        )}
        <button type="button" className="vs-text" onClick={close}>
          Back to chat
        </button>
        {action.error ? (
          <p className="vs-error" role="alert">
            {action.error}
          </p>
        ) : null}
        <RoomNote />
      </div>
    </section>
  );
}

function Call({
  state,
  ctx,
  who,
  action,
}: {
  state: ChatJourney;
  ctx: ChatContext;
  who: Who;
  action: RoomAction;
}) {
  const phase = Math.min(PHASES.length - 1, Math.max(0, state.visitPhase));
  // Preview only: a reviewer can do what the clinician's side does at the end of the visit.
  const endAsClinician = () =>
    void action.run(async () => {
      ctx.update({ visitPhase: Math.max(PHASES.length - 1, ctx.get().visitPhase) });
      await ctx.api.completeVisit("clinician");
      receipt(ctx, "Ended the visit as the clinician", "Preview tools", "You");
    });
  return (
    <section className="vs-view vs-call" aria-label={`Video visit with ${who.name}`}>
      <div className="vs-stage">
        <div className="vs-feed">
          {who.photo ? (
            <img src={who.photo} alt={`${who.name} on video, simulated`} />
          ) : (
            <span className="vs-feed-initials" role="img" aria-label={`${who.name} on video, simulated`}>
              {who.initials}
            </span>
          )}
          <span className="vs-conn">
            <i aria-hidden="true" />
            Connected
          </span>
          <span className="vs-feed-name" aria-hidden="true">
            {who.name}
          </span>
          <SelfTile state={state} floating />
        </div>
        <div className="vs-caption">
          <div className="vs-phases" aria-hidden="true">
            {PHASES.map((text, index) => (
              <i key={text} className={index < phase ? "is-done" : index === phase ? "is-now" : ""} />
            ))}
          </div>
          <p className="vs-caption-text" aria-live="polite">
            <span className="vs-caption-step">
              Part {phase + 1} of {PHASES.length}
            </span>
            <span key={phase} className="vs-caption-line vs-settle">
              {PHASES[phase]}
            </span>
          </p>
        </div>
      </div>
      <div className="vs-foot">
        <MediaControls
          state={state}
          ctx={ctx}
          leaving={action.pending}
          onLeave={() => void action.run(() => ctx.api.leaveVisit())}
        />
        {PREVIEW ? (
          <button type="button" className="vs-preview-end" disabled={action.pending} onClick={endAsClinician}>
            Preview: end the visit as the clinician
          </button>
        ) : null}
        {action.error ? (
          <p className="vs-error" role="alert">
            {action.error}
          </p>
        ) : null}
        <RoomNote />
      </div>
    </section>
  );
}

function Paused({
  state,
  ctx,
  who,
  view,
  action,
  close,
}: {
  state: ChatJourney;
  ctx: ChatContext;
  who: Who;
  view: RoomView;
  action: RoomAction;
  close: () => void;
}) {
  const left = view === "left";
  return (
    <section className="vs-view vs-paused">
      <div className="vs-stage">
        <div className="vs-feed is-paused">
          {who.photo ? <img src={who.photo} alt="" /> : null}
          <div className="vs-feed-overlay">
            <span className="vs-paused-icon" aria-hidden="true">
              {left ? <LogOut size={22} /> : <WifiOff size={22} />}
            </span>
            <h2 className="vs-title">{left ? "You left the visit" : "Connection lost"}</h2>
            <p className="vs-lead">
              {left
                ? `Your visit hasn’t ended. ${who.First} is still in the room.`
                : `Your visit hasn’t ended. If video doesn’t come back, ${who.first} will call ${maskPhone(callbackNumber(state))}.`}
            </p>
          </div>
        </div>
      </div>
      <div className="vs-foot">
        <button
          type="button"
          className="vs-primary"
          disabled={action.pending}
          onClick={() => void action.run(() => ctx.api.reconnect())}
        >
          {action.pending ? (
            <LoaderCircle className="vs-spin" size={18} aria-hidden="true" />
          ) : (
            <Video size={19} aria-hidden="true" />
          )}
          Rejoin
        </button>
        <button type="button" className="vs-text" onClick={close}>
          Back to chat
        </button>
        {action.error ? (
          <p className="vs-error" role="alert">
            {action.error}
          </p>
        ) : null}
        <RoomNote />
      </div>
    </section>
  );
}

function Finished({ state, who, close }: { state: ChatJourney; who: Who; close: () => void }) {
  const shared = state.carePlan.status === "published";
  return (
    <section className="vs-view vs-wait vs-finished">
      <div className="vs-stage">
        <div className="vs-center">
          <Portrait who={who} view="complete" />
          <h2 className="vs-title">Visit complete</h2>
          <p className="vs-lead">Thanks for meeting with {who.first}.</p>
          <p className="vs-guide-line" key={shared ? "shared" : "pending"}>
            <AssistantAvatar />
            <span>
              {shared
                ? `${who.First} signed your plan. It’s waiting for you in the chat.`
                : `${who.First} is finishing your plan. I’ll share it in the chat.`}
            </span>
          </p>
        </div>
      </div>
      <div className="vs-foot">
        <button type="button" className="vs-primary" onClick={close}>
          Back to chat
        </button>
        <RoomNote />
      </div>
    </section>
  );
}

export function VisitRoom({ state, ctx, close }: OverlayProps) {
  const who = clinicianFor(state);
  const view = roomView(state);
  const action = useRoomAction(ctx);
  const room = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const now = useNow(view === "call");
  const { setError } = action;

  // Back in the chat, focus returns to whatever opened the room. It's read while the room
  // first renders, before the conversation behind it goes inert.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  // The room opens under the finger that checked in; a double tap shouldn't land inside it.
  useLayoutEffect(() => markShown(room.current), []);
  useEffect(() => {
    room.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [opener]);
  useEffect(() => {
    setError("");
    // A state change can remove the focused control; keep focus inside the room.
    const active = document.activeElement;
    if (!active || !room.current?.contains(active)) room.current?.focus({ preventScroll: true });
  }, [view, setError]);

  const announcement: Record<RoomView, string> = {
    waiting: `${who.First} will let you in soon`,
    late: `${who.First} is running a few minutes late`,
    ready: `${who.First} is ready for you`,
    call: `You’re in your visit with ${who.first}`,
    left: "You left the visit",
    lost: "Connection lost. Your visit hasn’t ended.",
    complete: "Visit complete",
    closed: "",
  };
  const paused = view === "left" || view === "lost";
  const subtitle =
    view === "call"
      ? formatElapsed(elapsedMs(state, now))
      : paused
        ? `Paused at ${formatElapsed(elapsedMs(state, now))}`
        : view === "complete"
          ? "Ended"
          : state.appointment
            ? `Video visit at ${formatTime(state.appointment.start)}`
            : "Video visit";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Escape never ends a live visit by accident.
    if (event.key === "Escape" && view !== "call") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab" || !room.current) return;
    const focusable = Array.from(
      room.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)"),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === room.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={room}
      className={`vs-room is-${view}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <header className="vs-top">
        <span className="vs-top-mark" aria-hidden="true">
          <LegionMark tone="white" />
        </span>
        <div className="vs-top-text">
          <h1 className="vs-top-title" id={titleId}>
            Visit with {who.name}
          </h1>
          <p className={`vs-top-sub ${view === "call" ? "is-live" : paused ? "is-paused" : ""}`}>
            {view === "call" || paused ? <i aria-hidden="true" /> : null}
            {subtitle}
          </p>
        </div>
        {view === "call" && state.chat.aiNotes ? <AiNotes first={who.first} /> : null}
      </header>
      <p className="vs-sr" role="status">
        {announcement[view]}
      </p>
      <div className="vs-body">
        {view === "call" ? (
          <Call state={state} ctx={ctx} who={who} action={action} />
        ) : paused ? (
          <Paused state={state} ctx={ctx} who={who} view={view} action={action} close={close} />
        ) : view === "complete" ? (
          <Finished state={state} who={who} close={close} />
        ) : view === "closed" ? (
          <section className="vs-view vs-wait">
            <div className="vs-stage">
              <div className="vs-center">
                <h2 className="vs-title">Your visit room isn’t open yet</h2>
                <p className="vs-lead">Check in from the chat when it’s time, and I’ll bring you here.</p>
              </div>
            </div>
            <div className="vs-foot">
              <button type="button" className="vs-primary" onClick={close}>
                Back to chat
              </button>
              <RoomNote />
            </div>
          </section>
        ) : (
          <Waiting state={state} ctx={ctx} who={who} view={view} action={action} close={close} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ thread cards

/** One line in the thread that follows the encounter from check-in to the end. */
function VisitStatus({ state }: CardProps) {
  const who = clinicianFor(state);
  const view = roomView(state);
  const e = state.encounter;
  const checkedIn = clockTime(state, e.checkedInAt);
  const copy: { title: string; detail: string; tone: string } =
    view === "complete"
      ? {
          tone: "done",
          title: "Visit complete",
          detail: state.appointment
            ? `${formatDate(state.appointment.start, true)} at ${formatTime(state.appointment.start)} with ${who.name}`
            : `With ${who.name}`,
        }
      : view === "call"
        ? {
            tone: "live",
            title: "In your visit",
            detail: `With ${who.name}${e.joinedAt ? ` since ${clockTime(state, e.joinedAt)}` : ""}`,
          }
        : view === "left"
          ? { tone: "paused", title: "You left the visit", detail: "It hasn’t ended. You can rejoin anytime." }
          : view === "lost"
            ? { tone: "paused", title: "Connection lost", detail: "Your visit hasn’t ended. You can rejoin anytime." }
            : view === "ready"
              ? {
                  tone: "ready",
                  title: `${who.First} is ready for you`,
                  detail: checkedIn ? `You checked in at ${checkedIn}.` : "You’re checked in.",
                }
              : {
                  tone: view === "late" ? "late" : "waiting",
                  title: checkedIn ? `Checked in at ${checkedIn}` : "Checked in",
                  detail:
                    view === "late"
                      ? `${who.First} is running a few minutes late. Your place is saved.`
                      : `${who.First} will let you in soon.`,
                };
  return (
    <section className={`card-shell vs-status is-${copy.tone}`} aria-label="Visit status">
      <span className="vs-face">
        <Avatar who={who} size={42} />
        <span className="vs-face-badge" aria-hidden="true">
          {copy.tone === "done" ? <Check size={10} strokeWidth={3.6} /> : null}
        </span>
      </span>
      <div className="vs-status-text" role="status">
        <p className="vs-status-title vs-settle" key={copy.title}>
          {copy.title}
        </p>
        <p className="vs-status-detail">{copy.detail}</p>
      </div>
      {copy.tone === "live" ? (
        <span className="vs-live-pill" aria-hidden="true">
          <i />
          Live
        </span>
      ) : null}
    </section>
  );
}

function PlanPending({ state }: CardProps) {
  const who = clinicianFor(state);
  return (
    <section className="card-shell vs-pending" aria-label="Your plan is on its way">
      <div className="vs-pending-head">
        <span className="vs-face">
          <Avatar who={who} size={42} />
          <span className="vs-face-badge is-writing" aria-hidden="true">
            <PenLine size={10} strokeWidth={2.6} />
          </span>
        </span>
        <div role="status">
          <h3 className="vs-card-title">{who.First} is finishing your plan</h3>
          <p className="vs-meta">I’ll share it here as soon as {who.first} signs it.</p>
        </div>
      </div>
      <div className="vs-skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}

const TOPIC: Record<string, string> = {
  ADHD: "focus",
  Anxiety: "worry",
  Depression: "low mood",
  "Bipolar Disorder": "shifts in mood",
  PTSD: "stress after hard experiences",
};

const GOAL_TOPIC: Record<string, string> = {
  "Understand what’s going on": "making sense of what’s been happening",
  "Talk about medication": "your questions about medication",
  "Continue my care": "continuing the care you already have",
};

/** Plain-language topics, never a diagnosis. */
function talkedAbout(s: ChatJourney): string {
  const topics = s.conditions.flatMap((condition) => {
    if (TOPIC[condition]) return [TOPIC[condition]];
    const other = s.chat.otherText.trim();
    return condition === "Other" && other ? [other.replace(/^./, (c) => c.toLowerCase())] : [];
  });
  const head = topics.length ? capitalize(joinList(Array.from(new Set(topics)))) : "What’s been going on";
  return `${head}, and ${GOAL_TOPIC[s.goal] ?? "what you want from treatment"}.`;
}

/** Next steps a patient can take on their own; none promises a test or a message Legion doesn't send. */
function planSteps(s: ChatJourney): string[] {
  return [
    s.conditions.includes("ADHD")
      ? "Notice when focus is hardest this week, and bring examples to your follow-up"
      : "Notice what helps and what doesn’t this week, and bring notes to your follow-up",
    "Message your care team with questions",
  ];
}

const followupOf = (s: ChatJourney) =>
  s.followupAppointment && s.followupAppointment.status !== "cancelled" ? s.followupAppointment : null;

/** The clinician's signed plan, laid out like a short letter: who signed it, what you discussed, what's next. */
function Plan({ state }: CardProps) {
  const who = clinicianFor(state);
  const signed = onClock(state, state.carePlan.publishedAt) ?? state.appointment?.start ?? null;
  const followup = followupOf(state);
  const steps = planSteps(state);
  const rx = state.prescriptions?.[0];
  return (
    <article className="card-shell vs-plan" aria-label="Your care plan">
      <header className="vs-plan-head">
        <Avatar who={who} size={44} />
        <div className="vs-plan-who">
          <h3 className="vs-card-title">Your care plan</h3>
          <p className="vs-signed">
            {who.name}
            {who.credential ? `, ${who.credential}` : ""}
            <BadgeCheck className="vs-signed-check" size={15} strokeWidth={2.2} aria-hidden="true" />
          </p>
          <p className="vs-meta">{signed ? `Signed ${formatDate(signed)}` : "Signed by your clinician"}</p>
        </div>
      </header>

      <section className="vs-sec">
        <h4>What we talked about</h4>
        <p>{talkedAbout(state)}</p>
      </section>

      <section className="vs-sec">
        <h4>Next steps</h4>
        <ol className="vs-next-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <ul className="vs-plan-facts">
        <li>
          <span className="vs-fact-icon" aria-hidden="true">
            <CalendarCheck2 size={17} strokeWidth={2} />
          </span>
          <span className="vs-fact-text">
            <span className="vs-fact-label">Follow-up</span>
            <span className="vs-fact-value">In about {weeks(state.carePlan.followupWeeks)}</span>
            {followup ? (
              <span className="vs-fact-note">
                Booked for {formatDate(followup.start, true)}, {formatTime(followup.start)}
              </span>
            ) : null}
          </span>
        </li>
        <li>
          <span className="vs-fact-icon" aria-hidden="true">
            <Pill size={17} strokeWidth={2} />
          </span>
          <span className="vs-fact-text">
            <span className="vs-fact-label">Prescriptions</span>
            {rx ? (
              <>
                <span className="vs-fact-value">
                  {rx.medication}, {rx.supply}
                </span>
                <span className="vs-fact-note">
                  {rx.status === "sent"
                    ? `Sent to ${rx.pharmacy} through DoseSpot, simulated`
                    : `Didn’t reach ${rx.pharmacy} yet. Your care team is resending it today.`}
                </span>
              </>
            ) : (
              <>
                <span className="vs-fact-value">None today</span>
                <span className="vs-fact-note">Any medication decision is made with your clinician.</span>
              </>
            )}
          </span>
        </li>
      </ul>

      {state.chat.aiNotes ? (
        <p className="vs-plan-note">
          <Sparkles size={14} aria-hidden="true" />
          <span>Drafted from AI notes of your visit. Only {who.first} can sign it.</span>
        </p>
      ) : null}
      <p className="vs-plan-note">
        <HeartHandshake size={14} aria-hidden="true" />
        <span>If things get harder before then, message your care team. In a crisis, call or text 988.</span>
      </p>
    </article>
  );
}

const SHARED = "your visit summary";

/**
 * Where "Share with my doctor" sends the summary, following the patient's answer about a
 * primary care doctor. "No doctor" and "don't share" mean no button at all. A named doctor
 * comes first; a clinic from records stands in only when no name was given.
 */
function shareTarget(s: ChatJourney): { to: string; network: string; fromRecords: boolean } | null {
  if (s.chat.pcp === "none" || s.chat.pcp === "keep") return null;
  const named = s.chat.pcp === "share" ? s.chat.pcpName.trim() : "";
  const clinic = s.chat.recordsFound?.sources.find((source) => source.kind === "clinic")?.name ?? "";
  // A practice the health network already knows is sent to directly; for anyone else, a person sends it.
  if (named) {
    const known = !!clinic && named.toLowerCase().includes(clinic.toLowerCase());
    return { to: named, network: known ? clinic : "", fromRecords: false };
  }
  return { to: clinic, network: clinic, fromRecords: !!clinic };
}

/** A plain-text copy of the visit summary for the patient to keep. */
function summaryText(s: ChatJourney): string {
  const who = clinicianFor(s);
  const followup = followupOf(s);
  const appointment = s.appointment;
  return [
    "Your first visit with Legion Health",
    "Preview only: this visit was simulated, and this file isn't a medical record.",
    "",
    appointment ? `When: ${formatDate(appointment.start)}, ${formatTime(appointment.start)} Central Time` : "",
    `Clinician: ${who.name}${who.credential ? `, ${who.credential}` : ""}`,
    "",
    "What we talked about",
    talkedAbout(s),
    "",
    "Next steps",
    ...planSteps(s).map((step, index) => `${index + 1}. ${step}`),
    "",
    `Follow-up: in about ${weeks(s.carePlan.followupWeeks)}${
      followup ? `, booked for ${formatDate(followup.start, true)}, ${formatTime(followup.start)}` : ""
    }`,
    "Prescriptions: none today. Any medication decision is made with your clinician.",
    "",
    `If things get harder before then, message your care team. In a crisis, call or text ${SUPPORT_LINES.crisis}.`,
    "",
  ].join("\n");
}

/** The finish line of onboarding: the milestone, the next visit, and what the patient can do now. */
function Complete({ state, ctx }: CardProps) {
  const who = clinicianFor(state);
  const [arriving] = useState(() => !state.chat.completeSeen);
  const [downloaded, setDownloaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const target = shareTarget(state);
  const shared = state.chat.receipts.some((item) => item.action.includes(SHARED));
  const followup = followupOf(state);
  const date = state.appointment ? formatDate(state.appointment.start) : "";
  const file = `visit-summary-${(state.appointment?.start ?? "").slice(0, 10) || "legion"}.txt`;

  useEffect(() => {
    // The arrival plays once; after that the milestone is simply here.
    if (!ctx.get().chat.completeSeen) ctx.update({ chat: { completeSeen: true } });
  }, [ctx]);

  const download = () => {
    saveFile(file, summaryText(ctx.get()), "text/plain;charset=utf-8");
    setDownloaded(true);
  };

  // Receipts never carry what the patient typed, so a named doctor is "the doctor you named" there.
  const share = () => {
    if (shared || sharing || !target) return;
    const network = target.network;
    if (network) {
      setSharing(true);
      setShareError("");
      void ctx.api
        .shareVisitSummary()
        .then(
          () => receipt(ctx, `Sent ${SHARED} to ${network}`, "Metriport health network (simulated)"),
          (issue: unknown) => setShareError(issue instanceof Error ? issue.message : "That didn’t send. Try again."),
        )
        .finally(() => setSharing(false));
      return;
    }
    addTask(
      ctx,
      {
        kind: "care-team",
        title: target.to
          ? `Send the visit summary to ${target.to}`
          : "Find the patient’s primary care doctor and send the visit summary",
        due: "Within 1 business day",
      },
      `Asked the care team to send ${SHARED} to ${target.to ? "the doctor you named" : "your doctor"}`,
    );
  };
  const shareLine = !target
    ? null
    : shared
      ? {
          title: target.network ? `Sent to ${target.to}` : "Asked your care team to send it",
          detail: target.network
            ? "Through the health network, simulated"
            : target.to
              ? `To ${target.to}, simulated`
              : "They’ll ask where to send it, simulated",
        }
      : {
          title: "Share with my doctor",
          detail: target.fromRecords
            ? `You didn’t name a doctor, so it goes to ${target.to} from your records, simulated`
            : target.network
              ? `${target.to}, through the health network, simulated`
              : target.to
                ? `Your care team sends it to ${target.to}, simulated`
                : "Your care team will ask where to send it, simulated",
        };

  return (
    <section
      className={`card-shell vs-complete ${arriving ? "is-arriving" : ""}`}
      aria-label="First visit complete"
    >
      <div className="vs-complete-hero">
        <span className="vs-arrive-mark" aria-hidden="true">
          <Check size={26} strokeWidth={2.6} />
        </span>
        <h3 className="vs-complete-title">First visit complete</h3>
        <p className="vs-meta">{date ? `${date} with ${who.name}` : `With ${who.name}`}</p>
        <ol className="vs-journey" aria-label="Your journey">
          {STAGES.map((stage, index) => (
            <li key={stage.id} style={{ ["--i" as string]: index }}>
              <span className="vs-journey-dot" aria-hidden="true">
                <Check size={11} strokeWidth={3.2} />
              </span>
              <span className="vs-journey-label" aria-hidden="true">
                {stage.short}
              </span>
              <span className="vs-sr">{`${stage.short}, done`}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="vs-complete-body">
        {followup ? (
          <div className="vs-next">
            <span className="vs-next-icon" aria-hidden="true">
              <CalendarCheck2 size={18} strokeWidth={2} />
            </span>
            <div className="vs-next-text">
              <p className="vs-next-label">Next visit</p>
              <p className="vs-next-when">
                {formatDate(followup.start, true)} at {formatTime(followup.start)}
              </p>
              <p className="vs-next-who">Follow-up with {who.first}, by video</p>
              <div className="vs-next-links">
                <button type="button" className="vs-link" onClick={() => downloadCalendar(followup.start)}>
                  Add to calendar
                </button>
                <button type="button" className="vs-link" onClick={() => ctx.edit("followup")}>
                  Change time
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="vs-primary vs-book" onClick={() => ctx.edit("followup")}>
            <CalendarPlus size={18} aria-hidden="true" />
            Book a follow-up
          </button>
        )}

        <div className="vs-acts">
          <button type="button" className="vs-act" onClick={() => ctx.openSheet("message")}>
            <span className="vs-act-icon" aria-hidden="true">
              <MessageSquareText size={17} strokeWidth={2} />
            </span>
            <span className="vs-act-text">
              Message {who.first}
              <small>Questions about your plan</small>
            </span>
          </button>
          <button type="button" className={`vs-act ${downloaded ? "is-done" : ""}`} onClick={download}>
            <span className="vs-act-icon" aria-hidden="true">
              {downloaded ? (
                <Check className="vs-pop" size={17} strokeWidth={2.6} />
              ) : (
                <Download size={17} strokeWidth={2} />
              )}
            </span>
            <span className="vs-act-text">
              {downloaded ? "Summary downloaded" : "Download summary"}
              <small>{downloaded ? file : "A text file to keep or print"}</small>
            </span>
          </button>
          {shareLine ? (
            <button
              type="button"
              className={`vs-act ${shared ? "is-done" : ""}`}
              disabled={shared || sharing}
              onClick={share}
            >
              <span className="vs-act-icon" aria-hidden="true">
                {shared ? (
                  <Check className="vs-pop" size={17} strokeWidth={2.6} />
                ) : (
                  <Share2 size={17} strokeWidth={2} />
                )}
              </span>
              <span className="vs-act-text">
                {shareLine.title}
                <small className={shareError && !sharing ? "is-error" : undefined}>
                  {sharing ? "Sending through the health network, simulated" : shareError || shareLine.detail}
                </small>
              </span>
            </button>
          ) : null}
        </div>
        <p className="vs-sr" role="status">
          {[
            downloaded ? "Summary downloaded" : "",
            shareLine && shared ? "Summary shared" : "",
            shareError ? "The summary didn’t send" : "",
          ]
            .filter(Boolean)
            .join(". ")}
        </p>
      </div>

      <div className="vs-guide">
        <AssistantAvatar />
        <p>
          Between visits, I can help with scheduling, questions for {who.first}, and refill requests for{" "}
          {who.first} to review.
        </p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ visit brief

const CONDITION_WORD: Record<string, string> = {
  ADHD: "ADHD",
  PTSD: "PTSD",
  Anxiety: "anxiety",
  Depression: "depression",
  "Bipolar Disorder": "bipolar disorder",
};

const GOAL_LABEL: Record<string, string> = {
  "Understand what’s going on": "Understand what’s going on",
  "Talk about medication": "Talk about medication",
  "Continue my care": "Continue care I already have",
};

/** generateBrief seeds briefGoal with the intake goal, so only a different value is the patient's edit. */
function editedReason(s: ChatJourney): string {
  const text = s.briefGoal.trim();
  return text && text !== s.goal ? text : "";
}

function storyReason(s: ChatJourney): string {
  if (s.chat.storyMode === "words" && s.chat.storyText.trim()) return s.chat.storyText.trim();
  const named = s.conditions.flatMap((condition) => {
    if (CONDITION_WORD[condition]) return [CONDITION_WORD[condition]];
    const other = s.chat.otherText.trim();
    return condition === "Other" && other ? [other.replace(/^./, (c) => c.toLowerCase())] : [];
  });
  return named.length ? `Help with ${joinList(named)}` : "Not sure yet what to call it";
}

interface BriefRow {
  label: string;
  value: ReactNode;
  source: string;
}

function medicationRow(s: ChatJourney, who: Who): BriefRow | null {
  const c = s.chat;
  const med = c.recordsFound?.medication;
  const label = "Medications";
  if (med && (c.medication === "taking" || c.medication === "stopped" || c.medication === "changed")) {
    const name = `${med.name} ${med.dose}`;
    if (c.medication === "taking") return { label, value: name, source: "Pharmacy, you confirmed" };
    return {
      label,
      value:
        c.medication === "stopped"
          ? `${name}. You’ve stopped taking it.`
          : `${name}. You take a different dose now.`,
      source: "Pharmacy, you updated",
    };
  }
  if (c.medicationNote.trim()) return { label, value: c.medicationNote.trim(), source: "You said" };
  if (c.medication === "none") return { label, value: "None", source: "You said" };
  if (c.medication === "other")
    return { label, value: `You’ll go over them with ${who.first}`, source: "You said" };
  return null;
}

function allergyRow(s: ChatJourney, who: Who): BriefRow | null {
  const c = s.chat;
  const label = "Allergies";
  const onRecord = c.recordsFound?.allergy;
  if (onRecord && (c.allergy === "yes" || c.allergy === "no" || c.allergy === "unsure")) {
    if (c.allergy === "yes") return { label, value: onRecord, source: "Records, you confirmed" };
    return {
      label,
      value:
        c.allergy === "no"
          ? `${onRecord} is on record. You said it isn’t right.`
          : `${onRecord} is on record. You’re not sure.`,
      source: c.allergy === "no" ? "Records, you flagged" : "Records",
    };
  }
  if (c.allergyNote.trim()) return { label, value: c.allergyNote.trim(), source: "You said" };
  if (c.allergy === "none") return { label, value: "None that you know of", source: "You said" };
  if (c.allergy === "unsure")
    return { label, value: `You’ll go over these with ${who.first}`, source: "You said" };
  return null;
}

/** A chart the patient shared from MyChart before the visit. */
function chartRow(s: ChatJourney): BriefRow | null {
  const chart = s.chartImport;
  if (!chart) return null;
  return {
    label: "Records from MyChart",
    value: `${chart.organization}: ${chart.conditions.join(", ")}, with ${chart.labResults} lab results and ${chart.visitNotes} visit notes`,
    source: "You shared",
  };
}

function briefRows(s: ChatJourney, who: Who): BriefRow[] {
  const edited = editedReason(s);
  const story = storyReason(s);
  const note = (s.chat.note || s.briefNote).trim();
  const rows: (BriefRow | null)[] = [
    {
      label: "Reason for visit",
      value: edited || (s.chat.storyMode === "words" ? `“${story}”` : story),
      source: edited ? "Edited by you" : "You said",
    },
    s.goal
      ? { label: "What you want from the visit", value: GOAL_LABEL[s.goal] ?? s.goal, source: "You said" }
      : null,
    medicationRow(s, who),
    allergyRow(s, who),
    chartRow(s),
    note ? { label: "Your note", value: `“${note}”`, source: "You wrote" } : null,
  ];
  return rows.filter((row): row is BriefRow => row !== null);
}

/** The answer the patient tapped to "Are you safe right now?", word for word. */
const SAFE_NOW_SAID = { safe: "I’m safe right now", unsafe: "I’m not safe right now" } as const;

/** What the patient told the assistant about their safety, in the screener's own words. */
function safetyLines(s: ChatJourney): string[] {
  const lines = screenPatientLines(s.chat.screen).map((line) => `${capitalize(line)}.`);
  const answers = Object.values(s.chat.safeNow);
  // An unsafe answer is never hidden behind a safe one given elsewhere.
  const said = answers.includes("unsafe") ? "unsafe" : answers.includes("safe") ? "safe" : null;
  if (said) lines.push(`When I asked if you were safe, you said “${SAFE_NOW_SAID[said]}.”`);
  return lines;
}

function Brief({ state }: CardProps) {
  const who = clinicianFor(state);
  const safety = safetyLines(state);
  return (
    <section className="card-shell vs-brief" aria-label={`Visit brief for ${who.first}`}>
      <h3 className="card-title">Visit brief for {who.first}</h3>
      <p className="vs-ai-line">
        <AssistantAvatar className="vs-mini" />
        Drafted by {ASSISTANT.name} from your answers. {who.First} reviews it.
      </p>
      <dl className="vs-rows">
        {briefRows(state, who).map((row) => (
          <div className="vs-row" key={row.label}>
            <dt>
              <span>{row.label}</span>
              <span className="vs-src">
                <span className="vs-sr">Source: </span>
                {row.source}
              </span>
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        {safety.length ? (
          <div className="vs-row is-safety">
            <dt>
              <span>
                <HeartHandshake size={15} aria-hidden="true" /> Your safety
              </span>
              <span className="vs-src">
                <span className="vs-sr">Source: </span>You said
              </span>
            </dt>
            <dd>
              <ul className="vs-said">
                {safety.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="vs-said-next">{who.First} will talk with you about it at your visit.</p>
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="vs-brief-foot">
        <Info size={14} aria-hidden="true" /> Not a diagnosis
      </p>
    </section>
  );
}

function BriefSheet({ state, ctx, close }: SheetProps) {
  const who = clinicianFor(state);
  const [initialReason] = useState(() => editedReason(state) || storyReason(state));
  const [initialNote] = useState(() => (state.chat.note || state.briefNote).trim());
  const [reason, setReason] = useState(initialReason);
  const [note, setNote] = useState(initialNote);
  // Risk language in a saved edit turns the sheet into support lines; the visit stays on.
  const [care, setCare] = useState(false);
  const careLead = useRef<HTMLParagraphElement>(null);
  const reasonId = useId();
  const noteId = useId();

  useEffect(() => {
    if (care) careLead.current?.focus();
  }, [care]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const nextReason = reason.trim();
    if (!nextReason) return;
    const nextNote = note.trim();
    const current = ctx.get();
    const reasonChanged = nextReason !== initialReason;
    const noteChanged = nextNote !== initialNote;
    // Nothing changed, so there is nothing new to approve.
    if (!reasonChanged && !noteChanged) return close();
    const at = stamp(current);
    // The thread shows a skipped note as "Skipped", so the change history does too.
    const asAnswered = (text: string) => text || "Skipped";
    ctx.update({
      ...(reasonChanged ? { briefGoal: nextReason } : {}),
      briefNote: nextNote,
      // Any edit sends the brief back for approval before it's shared.
      briefApproved: false,
      chat: {
        note: nextNote,
        briefApproved: false,
        // The note is also an earlier answer in the thread, so it shows as edited there too.
        ...(noteChanged
          ? {
              edits: { ...current.chat.edits, note: (current.chat.edits.note ?? 0) + 1 },
              answeredAt: { ...current.chat.answeredAt, note: at },
              history: [
                ...current.chat.history,
                { node: "note", from: asAnswered(current.chat.note), to: asAnswered(nextNote), at },
              ],
            }
          : {}),
      },
    });
    track(ctx, "brief_edited", { reason: reasonChanged, note: noteChanged });
    // Both fields are the patient's own words, so both get the crisis check. A match never halts.
    const risky = [reasonChanged ? nextReason : "", noteChanged ? nextNote : ""].filter(
      (text) => text && mentionsCrisis(text),
    );
    for (const text of risky) flagRisk(ctx, "brief", text);
    if (risky.length) setCare(true);
    else close();
  };

  if (care)
    return (
      <div className="vs-sheet">
        <p className="vs-sheet-lead vs-care-lead" ref={careLead} tabIndex={-1}>
          Your changes are saved. Thank you for telling me. I’ve asked your care team to check in with
          you today, and your visit is still on. If you’re in danger right now, call{" "}
          {SUPPORT_LINES.emergency}.
        </p>
        <div className="vs-lines">
          <a className="vs-line is-first" href={`tel:${SUPPORT_LINES.crisis}`}>
            <Phone size={17} aria-hidden="true" /> Call {SUPPORT_LINES.crisis}
          </a>
          <a className="vs-line" href={`sms:${SUPPORT_LINES.crisis}`}>
            <MessageCircle size={17} aria-hidden="true" /> Text {SUPPORT_LINES.crisis}
          </a>
          <a className="vs-line" href={`tel:${SUPPORT_LINES.emergency}`}>
            <Phone size={17} aria-hidden="true" /> Call {SUPPORT_LINES.emergency}
          </a>
        </div>
        <p className="vs-sheet-fine">
          {SUPPORT_LINES.crisis} is free and confidential, any time.{" "}
          <span lang="es">En español: llama al 988 y marca 2, o envía AYUDA al 988.</span>
        </p>
        <div className="vs-sheet-actions">
          <button type="button" className="chip primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    );

  return (
    <form className="vs-sheet" onSubmit={save} noValidate>
      <p className="vs-sheet-lead">
        Change anything that doesn’t sound like you. {who.First} will see your edits marked as yours,
        not {ASSISTANT.name}’s.
      </p>
      <div className="vs-sheet-field">
        <label htmlFor={reasonId}>Reason for visit</label>
        <textarea
          id={reasonId}
          className="vs-textarea"
          rows={3}
          maxLength={600}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What you’d like help with"
          autoComplete="off"
          inputMode="text"
          enterKeyHint="enter"
          aria-invalid={!reason.trim()}
          aria-describedby={!reason.trim() ? `${reasonId}-error` : undefined}
        />
        {!reason.trim() ? (
          <p className="vs-sheet-error" id={`${reasonId}-error`}>
            Add a few words so {who.first} knows where to start.
          </p>
        ) : null}
      </div>
      <div className="vs-sheet-field">
        <label htmlFor={noteId}>
          Anything else <span className="vs-optional">Optional</span>
        </label>
        <textarea
          id={noteId}
          className="vs-textarea"
          rows={3}
          maxLength={600}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={`Anything you’d like ${who.first} to know`}
          autoComplete="off"
          inputMode="text"
          enterKeyHint="enter"
        />
      </div>
      <p className="vs-sheet-fine">You’ll approve the brief again before it’s shared with {who.first}.</p>
      <div className="vs-sheet-actions">
        <button type="button" className="chip" onClick={close}>
          Cancel
        </button>
        <button type="submit" className="chip primary" disabled={!reason.trim()}>
          Save changes
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- registry

export const VISIT_WIDGETS: WidgetMap = {
  checkin: (props) => <CheckIn {...props} />,
  rejoin: (props) => <Rejoin {...props} />,
};

export const VISIT_CARDS: CardMap = {
  brief: (props) => <Brief {...props} />,
  "visit-status": (props) => <VisitStatus {...props} />,
  "plan-pending": (props) => <PlanPending {...props} />,
  plan: (props) => <Plan {...props} />,
  complete: (props) => <Complete {...props} />,
};

export const VISIT_SHEETS: SheetMap = {
  brief: { title: "Edit your brief", render: (props) => <BriefSheet {...props} /> },
};
