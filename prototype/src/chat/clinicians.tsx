import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Check, CircleAlert, Clock3, Info, LoaderCircle } from "lucide-react";
import type { Slot } from "../model/types";
import { formatDate, formatTime } from "../model/fixtures";
import { journeyNow } from "../model/journey-state";
import {
  LATE_FEE,
  clinicianFirst,
  clinicianName,
  payerFor,
  receipt,
  releaseNotice,
  slotLabel,
  type ChatContext,
} from "./agent";
import { CLINICIANS, clinicianById, fitsPreference, inventory, match, type Clinician, type MatchOffer, formalName } from "./inventory";
import type { CardMap, CardProps, SheetMap, SheetProps } from "./registry";
import { medicationPath } from "./script";
import type { ChatJourney } from "./state";
import "./clinicians.css";

/**
 * Choosing a clinician. The live match page lost over a third of its sessions,
 * with the first provider a screen and a half down. Here the best fit and real
 * times come first, every reason traces to an answer, and a time is one tap
 * from a hold.
 */

const ZONE = "America/Chicago";
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric" });
const SPOKEN_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  weekday: "long",
  month: "short",
  day: "numeric",
});
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short" });
const LIST = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" });
const EITHER = new Intl.ListFormat("en-US", { style: "long", type: "disjunction" });

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Matching never offers a time sooner than this, so the full lists don't either. */
const NOTICE = 2 * HOUR;
/** How far ahead the full lists of open times reach. */
const HORIZON = 9 * DAY;
/** The Terms: a change within 48 hours of a visit, or after its time has passed, costs $100. */
const FEE_WINDOW = 48 * HOUR;

const PREF_WORD: Record<string, string> = {
  mornings: "mornings",
  afternoons: "afternoons",
  evenings: "evenings",
  weekends: "weekends",
};

const startOf = (start: string) => new Date(start).getTime();
const dayOf = (ms: number) => DAY_KEY.format(new Date(ms));

function bookable(slot: Slot, now: number): boolean {
  const start = startOf(slot.start);
  return start > now + NOTICE && start < now + HORIZON;
}

function centralDay(now: number, offset: number): string {
  const [year, month, day] = dayOf(now).split("-").map(Number);
  // 18:00 UTC is midday in Central Time all year, so the date never slips at a DST change.
  return dayOf(Date.UTC(year, month - 1, day + offset, 18));
}

/** "Today", "Tomorrow" or the short weekday, with the date beside it. */
function dayName(start: string, now: number): { name: string; date: string } {
  const day = dayOf(startOf(start));
  const date = MONTH_DAY.format(new Date(start));
  if (day === centralDay(now, 0)) return { name: "Today", date };
  if (day === centralDay(now, 1)) return { name: "Tomorrow", date };
  return { name: WEEKDAY.format(new Date(start)), date };
}

function dayLabel(start: string, now: number): string {
  const { name, date } = dayName(start, now);
  return `${name}, ${date}`;
}

/** Read aloud in full, for example "Thursday, Oct 22, 6:30 PM", led by today or tomorrow as it's shown. */
function spoken(slot: Slot, now: number, midSentence = false): string {
  const day = dayOf(startOf(slot.start));
  const lead = day === centralDay(now, 0) ? "Today, " : day === centralDay(now, 1) ? "Tomorrow, " : "";
  const text = `${lead}${SPOKEN_DAY.format(new Date(slot.start))}, ${formatTime(slot)}`;
  return midSentence && lead ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** For a sentence: "5:30 PM today", "5:30 PM tomorrow" or "5:30 PM on Fri, Oct 23". */
function timePhrase(slot: Slot, now: number): string {
  const day = dayOf(startOf(slot.start));
  const when =
    day === centralDay(now, 0) ? "today" : day === centralDay(now, 1) ? "tomorrow" : `on ${formatDate(slot, true)}`;
  return `${formatTime(slot)} ${when}`;
}

/** A time that isn't grouped under a day carries its own: today, tomorrow, the weekday this week, the date after. */
function chipDay(slot: Slot, now: number): string {
  const date = new Date(slot.start);
  const day = dayOf(startOf(slot.start));
  if (day === centralDay(now, 0)) return "Today";
  if (day === centralDay(now, 1)) return "Tomorrow";
  return startOf(slot.start) - now < 6 * DAY ? WEEKDAY.format(date) : MONTH_DAY.format(date);
}

interface DayGroup {
  key: string;
  name: string;
  date: string;
  slots: Slot[];
}

function byDay(slots: Slot[], now: number): DayGroup[] {
  const days: DayGroup[] = [];
  for (const slot of slots) {
    const key = dayOf(startOf(slot.start));
    const last = days[days.length - 1];
    if (last?.key === key) last.slots.push(slot);
    else days.push({ key, ...dayName(slot.start, now), slots: [slot] });
  }
  return days;
}

const findSlot = (id: string | undefined) =>
  id ? inventory().slots.find((slot) => slot.id === id) : undefined;

const TAKEN_MARK = "unavailable-slot:";

/** Times scheduling refused: the mock marks each one, and a failed hold names the time it tried. */
function takenSlots(s: ChatJourney): Set<string> {
  const ids = new Set(
    s.faultsUsed.filter((mark) => mark.startsWith(TAKEN_MARK)).map((mark) => mark.slice(TAKEN_MARK.length)),
  );
  const hold = s.chat.jobs.hold;
  if (s.chat.holdNotice === "taken" && hold?.status === "failed" && hold.inputs) ids.add(hold.inputs);
  return ids;
}

/**
 * A moved visit starts its countdown again: the preview clock returns to real time,
 * reminders follow the new time, and the visit-day steps wait for the new day.
 */
export async function settleMove(ctx: ChatContext, slotId: string, fee: boolean) {
  receipt(
    ctx,
    `Moved your visit to ${slotLabel(slotId)}${fee ? `, with the ${LATE_FEE} you agreed to` : ""}`,
    "Legion scheduling",
  );
  const now = Date.now();
  ctx.update({
    clock: { virtualStart: now, realStart: now, rate: 1 },
    visitDay: false,
    // Where the patient will be is asked again at the new check-in.
    currentLocation: "",
    chat: { reminderReply: "", outsideTexas: false },
  });
  const appointment = ctx.get().appointment;
  if (!appointment) return;
  // A move asked for in the conversation is confirmed there, once: on the newest request.
  // Older requests the patient walked away from stop waiting and keep what they said.
  const asks = ctx.get().chat.asks;
  const newest = asks.map((ask) => ask.awaiting).lastIndexOf("move");
  if (newest >= 0)
    ctx.update({
      chat: {
        asks: asks.map((ask, index) =>
          ask.awaiting !== "move"
            ? ask
            : index !== newest
              ? { ...ask, awaiting: undefined }
              : {
                ...ask,
                awaiting: undefined,
                answer: `Done. Your visit with ${clinicianFirst(appointment.providerId)} is now ${slotLabel(slotId)} Central.`,
                actions: ["calendar"],
              },
        ),
      },
    });
  const queued = await ctx.api.scheduleReminders(appointment.id).then(
    () => true,
    () => false,
  );
  if (queued) receipt(ctx, "Moved your reminders to the new time", "Legion messaging (simulated)");
}

/** Matching is deterministic for a page load, so the card recomputes reasons and times from the saved inputs. */
function useOffers(s: ChatJourney, prefs: string[] = s.chat.availability): Map<string, MatchOffer> {
  const payer = payerFor(s);
  const { conditions, coverage } = s;
  return useMemo(
    () =>
      new Map(
        match(conditions, payer, prefs, new Date(), coverage).ranked.map((offer) => [offer.clinician.id, offer]),
      ),
    [conditions, payer, prefs, coverage],
  );
}

const ANY_TIME: string[] = [];

function offerFor(
  offers: Map<string, MatchOffer>,
  wider: Map<string, MatchOffer>,
  id: string,
  prefs: string[],
): MatchOffer | null {
  // Someone chosen from outside the patient's hours still shows why they fit.
  const offer = offers.get(id) ?? wider.get(id);
  if (offer) return offer;
  const clinician = clinicianById(id);
  if (!clinician) return null;
  // Openings move as days pass; someone already offered still shows, with their current times.
  return {
    clinician,
    reasons: [],
    times: inventory().slots.filter((slot) => slot.providerId === id && fitsPreference(slot, prefs)),
  };
}

/** A short line for a quieter row: what they focus on, and any language besides English. */
function summary(offer: MatchOffer): string {
  const [focus] = offer.reasons;
  const others = offer.clinician.languages.filter((language) => language !== "English");
  const line = [focus, others.length ? `speaks ${LIST.format(others)}` : ""].filter(Boolean).join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The next `count` open times, plus any time the patient holds or tried, so the card stays a true record. */
function nextTimes(offer: MatchOffer, count: number, now: number, taken: Set<string>, keep: string[]): Slot[] {
  const picked: Slot[] = [];
  let open = 0;
  for (const slot of offer.times) {
    if (open === count) break;
    if (!bookable(slot, now)) continue;
    picked.push(slot);
    if (!taken.has(slot.id)) open += 1;
  }
  for (const id of keep) {
    const slot = findSlot(id);
    if (slot && slot.providerId === offer.clinician.id && !picked.some((item) => item.id === id))
      picked.push(slot);
  }
  return picked.sort((a, b) => startOf(a.start) - startOf(b.start));
}

// ------------------------------------------------------------------ parts

/** Where clinicians are compared everyone gets initials, so a photo never reads as more established. */
function Avatar({
  clinician,
  size,
  photo = true,
}: {
  clinician: Clinician;
  size: "lg" | "md" | "sm";
  photo?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (photo && clinician.photo && !broken)
    return (
      <img
        className={`cl-avatar cl-${size}`}
        src={clinician.photo}
        alt=""
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  const tint = Math.max(0, CLINICIANS.findIndex((item) => item.id === clinician.id)) % 5;
  return (
    <span className={`cl-avatar cl-${size} cl-tint-${tint}`} aria-hidden="true">
      {clinician.initials}
    </span>
  );
}

function Name({ clinician }: { clinician: Clinician }) {
  return (
    <>
      {clinician.name}
      <span className="cl-cred">
        , <span className="cl-keep">{clinician.credential}</span>
      </span>
    </>
  );
}

type Mode = "open" | "busy" | "chosen" | "taken" | "quiet";

function TimeChip({
  slot,
  name,
  mode,
  day,
  busyLabel = "holding",
  onPick,
}: {
  slot: Slot;
  /** The full spoken name, for example "Thursday, Oct 22, 6:30 PM with Maya Chen". */
  name: string;
  mode: Mode;
  /** Shown before the time when the chip isn't grouped under a day. */
  day?: string;
  busyLabel?: string;
  onPick: (slotId: string) => void;
}) {
  const state =
    mode === "chosen"
      ? ", selected"
      : mode === "taken"
        ? ", just booked by someone else"
        : mode === "busy"
          ? `, ${busyLabel}`
          : "";
  return (
    <button
      type="button"
      className={`cl-time cl-${mode}${day ? " cl-dated" : ""}`}
      aria-label={`${name}${state}`}
      disabled={mode === "chosen" || mode === "taken" || mode === "quiet"}
      aria-disabled={mode === "busy" ? true : undefined}
      onClick={mode === "open" ? () => onPick(slot.id) : undefined}
    >
      {day ? <span className="cl-time-day">{day}</span> : null}
      <span className="cl-time-at">{formatTime(slot)}</span>
      {mode === "chosen" || mode === "busy" ? (
        <span className="cl-tick" aria-hidden="true">
          {mode === "busy" ? (
            <LoaderCircle size={13} strokeWidth={2.6} className="cl-spin" />
          ) : (
            <Check size={12} strokeWidth={3.2} />
          )}
        </span>
      ) : null}
    </button>
  );
}

/** Days of times. Narrow, each day's label sits above its times; with room, beside them like an agenda. */
function DayList({
  days,
  name,
  mode,
  onPick,
  busyLabel,
  after,
}: {
  days: DayGroup[];
  name: (slot: Slot) => string;
  mode: (slot: Slot) => Mode;
  onPick: (slotId: string) => void;
  busyLabel?: string;
  /** Shown under a day's times, such as a confirmation for one of them. */
  after?: (day: DayGroup) => ReactNode;
}) {
  return (
    <div className="cl-days">
      {days.map((day) => (
        <div className="cl-day" key={day.key}>
          <p className="cl-day-label">
            <span>{day.name}</span>
            <span className="cl-day-sep">, </span>
            <span className="cl-day-date">{day.date}</span>
          </p>
          <div className="cl-grid">
            {day.slots.map((slot) => (
              <TimeChip
                key={slot.id}
                slot={slot}
                name={name(slot)}
                mode={mode(slot)}
                busyLabel={busyLabel}
                onPick={onPick}
              />
            ))}
          </div>
          {after?.(day)}
        </div>
      ))}
    </div>
  );
}

function Switch({
  on,
  onChange,
  label,
  detail,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  detail: string;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-detail`}
      className="cl-switch"
      onClick={() => onChange(!on)}
    >
      <span className="cl-switch-text">
        <span className="cl-switch-label" id={`${id}-label`}>
          {label}
        </span>
        <span className="cl-switch-detail" id={`${id}-detail`}>
          {detail}
        </span>
      </span>
      <span className="cl-track" aria-hidden="true">
        <span className="cl-thumb">{on ? <Check size={12} strokeWidth={3.2} /> : null}</span>
      </span>
    </button>
  );
}

function TimeZoneNote({ short = false }: { short?: boolean }) {
  return (
    <p className="cl-tz">
      <Clock3 size={13} strokeWidth={2.2} aria-hidden="true" /> {short ? "Central Time" : "Times in Central Time"}
    </p>
  );
}

/** No times to offer is never a dead end. */
function Empty({ ctx, children }: { ctx: ChatContext; children: ReactNode }) {
  return (
    <div className="cl-empty-wrap">
      <p className="cl-empty">{children}</p>
      <button type="button" className="cl-link" onClick={() => ctx.openSheet("help")}>
        Ask the care team
      </button>
    </div>
  );
}

/** Sits beside the times it explains; the card's live region announces the same words. */
function Notice({ text }: { text: string }) {
  return (
    <p className="cl-notice" aria-hidden="true">
      <CircleAlert size={16} />
      <span>{text}</span>
    </p>
  );
}

// ------------------------------------------------------------------ card

function BestFit({
  offer,
  times,
  now,
  mode,
  onPick,
  notice,
  prescribing,
  choosing,
}: {
  offer: MatchOffer;
  times: Slot[];
  now: number;
  mode: (slot: Slot) => Mode;
  onPick: (slotId: string) => void;
  notice: string;
  /** On the ADHD medication path, say who writes a stimulant prescription before any time is held. */
  prescribing: boolean;
  /** A time can be picked right now, so the card says what a tap does. */
  choosing: boolean;
}) {
  const { clinician } = offer;
  const titleId = useId();
  const timesId = useId();
  const reasons = offer.reasons.slice(0, 3);
  // Who, what they're like, why they fit, then the times: one tap from a hold.
  return (
    <article className="card-shell cl-best" aria-labelledby={titleId}>
      <div className="cl-head">
        <Avatar clinician={clinician} size="lg" photo={false} />
        <div className="cl-id">
          <span className="cl-pill">Best fit</span>
          <h3 className="cl-name" id={titleId}>
            <Name clinician={clinician} />
          </h3>
          <p className="cl-role">{clinician.title}, licensed in Texas</p>
          {clinician.languages.length > 1 ? (
            <p className="cl-role">Speaks {LIST.format(clinician.languages)}</p>
          ) : null}
        </div>
      </div>
      <blockquote className="cl-quote">
        <p>“{clinician.intro}”</p>
      </blockquote>
      {reasons.length ? (
        <ul className="cl-reasons" aria-label={`Why ${formalName(clinician)} fits`}>
          {reasons.map((reason) => (
            <li key={reason}>
              <Check size={16} strokeWidth={2.5} className="cl-check" aria-hidden="true" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {times.length ? (
        <div className="cl-times">
          <div className="cl-times-head">
            <p className="cl-times-label" id={timesId}>
              {choosing ? "Pick a time" : "Next open times"}
            </p>
            <TimeZoneNote short />
          </div>
          <div className="cl-grid is-dated" role="group" aria-label={`${formalName(clinician)}’s next open times`}>
            {times.map((slot) => (
              <TimeChip
                key={slot.id}
                slot={slot}
                name={`${spoken(slot, now)} with ${clinician.name}`}
                mode={mode(slot)}
                day={chipDay(slot, now)}
                onPick={onPick}
              />
            ))}
          </div>
          {choosing && !notice ? (
            <p className="cl-hint">I’ll hold it for 15 minutes. Nothing is booked yet.</p>
          ) : null}
        </div>
      ) : null}
      {notice ? <Notice text={notice} /> : null}
      {prescribing ? (
        <p className="cl-rx">
          <Info size={15} aria-hidden="true" />
          <span>
            In Texas, stimulant prescriptions have to come from a physician. If one is right for you, a
            Legion psychiatrist reviews and writes it.
          </span>
        </p>
      ) : null}
    </article>
  );
}

function OtherFit({
  offer,
  times,
  now,
  mode,
  onPick,
  entering,
  notice,
}: {
  offer: MatchOffer;
  times: Slot[];
  now: number;
  mode: (slot: Slot) => Mode;
  onPick: (slotId: string) => void;
  entering: boolean;
  notice: string;
}) {
  const { clinician } = offer;
  const why = summary(offer);
  return (
    <li className={`cl-other${entering ? " cl-entering" : ""}`}>
      <div className="cl-head">
        <Avatar clinician={clinician} size="md" photo={false} />
        <div className="cl-id">
          <p className="cl-other-name">
            <Name clinician={clinician} />
          </p>
          {why ? <p className="cl-other-why">{why}</p> : null}
        </div>
      </div>
      {times.length ? (
        <div className="cl-grid is-dated" role="group" aria-label={`${formalName(clinician)}’s next open times`}>
          {times.map((slot) => (
            <TimeChip
              key={slot.id}
              slot={slot}
              name={`${spoken(slot, now)} with ${clinician.name}`}
              mode={mode(slot)}
              day={chipDay(slot, now)}
              onPick={onPick}
            />
          ))}
        </div>
      ) : null}
      {notice ? <Notice text={notice} /> : null}
    </li>
  );
}

function ClinicianChoice({ state, ctx, active }: CardProps) {
  const offers = useOffers(state);
  const wider = useOffers(state, ANY_TIME);
  const trayId = useId();
  const [tap, setTap] = useState<{ id: string; at: number } | null>(null);
  // Rows present when the card first renders are simply there; rows added later rise in.
  const firstIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!tap) return;
    // A tap that never becomes a hold stops looking busy.
    const timer = window.setTimeout(() => setTap(null), 2500);
    return () => window.clearTimeout(timer);
  }, [tap]);

  const found = state.chat.match;
  if (!found?.offerIds.length) return null;

  const now = journeyNow(state);
  const prefs = state.chat.availability;
  const taken = takenSlots(state);
  const hold = state.chat.jobs.hold;
  const chosen = state.chat.slotChosen ? state.slotId : "";
  const busy =
    hold?.status === "running"
      ? (hold.inputs ?? "")
      : tap && (hold?.startedAt ?? 0) < tap.at
        ? tap.id
        : "";
  const failed =
    active && state.chat.holdNotice === "taken" && hold?.status === "failed"
      ? findSlot(hold.inputs)
      : undefined;
  const keep = [busy, chosen, failed?.id ?? ""].filter(Boolean);

  const ids = [
    ...found.offerIds,
    ...(state.chat.showMore ? found.rankedIds.filter((id) => !found.offerIds.includes(id)) : []),
  ];
  // A time picked from the full list stays visible here, even with someone not shown by default.
  for (const id of keep) {
    const owner = findSlot(id)?.providerId;
    if (owner && !ids.includes(owner)) ids.push(owner);
  }
  firstIds.current ??= new Set(ids);
  const shown = ids.flatMap((id) => {
    const offer = offerFor(offers, wider, id, prefs);
    return offer ? [offer] : [];
  });
  const [best, ...others] = shown;
  if (!best) return null;

  const mode = (slot: Slot): Mode =>
    slot.id === busy
      ? "busy"
      : slot.id === chosen
        ? "chosen"
        : taken.has(slot.id)
          ? "taken"
          : active && !busy
            ? "open"
            : "quiet";

  const pick = (slotId: string) => {
    if (!active || busy) return;
    setTap({ id: slotId, at: Date.now() });
    ctx.answer(slotId, "choose");
  };

  const busySlot = findSlot(busy);
  const released = state.chat.holdNotice === "released" || state.chat.holdNotice === "not-covered";
  // A re-match that let the held time go explains the whole list, so it leads the card.
  const lead = active && released ? releaseNotice(state) : "";
  const notice = !active
    ? ""
    : failed
      ? `Someone just booked ${timePhrase(failed, now)}. Pick another time and I’ll hold it.`
      : state.chat.holdNotice === "expired"
        ? "Your hold ran out, so that time went back on the calendar. Pick a time and I’ll hold it again."
        : "";
  // The explanation appears under whoever's time it concerns.
  const noticeFor = failed?.providerId ?? best.clinician.id;
  const bestTimes = nextTimes(best, 3, now, taken, keep);
  return (
    <div className="cl-choice">
      {lead ? <Notice text={lead} /> : null}
      <BestFit
        offer={best}
        times={bestTimes}
        now={now}
        mode={mode}
        onPick={pick}
        notice={noticeFor === best.clinician.id ? notice : ""}
        prescribing={medicationPath(state)}
        choosing={active && !busy}
      />
      {others.length ? (
        <section className="cl-tray" aria-labelledby={trayId}>
          <h4 className="cl-tray-title" id={trayId}>
            {others.length === 1 ? "Another good fit" : "Other good fits"}
          </h4>
          <ul className="cl-others">
            {others.map((offer) => (
              <OtherFit
                key={offer.clinician.id}
                offer={offer}
                times={nextTimes(offer, 3, now, taken, keep)}
                now={now}
                mode={mode}
                onPick={pick}
                entering={!firstIds.current?.has(offer.clinician.id)}
                notice={noticeFor === offer.clinician.id ? notice : ""}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <p className="cl-sr" role="status">
        {lead ||
          notice ||
          (busySlot ? `Holding ${spoken(busySlot, now, true)} with ${clinicianName(busySlot.providerId)}` : "")}
      </p>
      {/* The best fit's times name the time zone; without them, the alternates' times still need it. */}
      {bestTimes.length ? null : <TimeZoneNote />}
    </div>
  );
}

// ------------------------------------------------------------------ sheets

function AllTimes({ state, ctx, close, data }: SheetProps) {
  const offers = useOffers(state);
  const wider = useOffers(state, ANY_TIME);
  const sectionId = useId();
  const [outside, setOutside] = useState(false);
  const [picked, setPicked] = useState("");

  const prefs = state.chat.availability.filter((pref) => PREF_WORD[pref]);
  const narrowed = prefs.length > 0 && !state.chat.availability.includes("soonest");
  const ranked = state.chat.match?.rankedIds ?? [];
  // Outside their preferences, clinicians who fit everything but the hours join the list too.
  const ids = [...ranked, ...(outside ? [...wider.keys()].filter((id) => !ranked.includes(id)) : [])];
  const now = journeyNow(state);
  const taken = takenSlots(state);
  const chosen = state.chat.slotChosen ? state.slotId : "";
  // Only the clinician question takes a time as its answer. The shell can pass "choose" while it's being changed.
  const choosable = !state.chat.slotChosen || data === "choose";

  const sections = ids.flatMap((id) => {
    const clinician = clinicianById(id);
    if (!clinician) return [];
    const slots = inventory().slots.filter(
      (slot) =>
        slot.providerId === id &&
        bookable(slot, now) &&
        (!narrowed || outside || fitsPreference(slot, prefs)),
    );
    if (!slots.length) return [];
    const offer = offers.get(id) ?? wider.get(id);
    return [{ clinician, why: offer?.reasons[0] ?? "", days: byDay(slots, now) }];
  });

  const mode = (slot: Slot): Mode =>
    slot.id === picked
      ? "busy"
      : slot.id === chosen
        ? "chosen"
        : taken.has(slot.id)
          ? "taken"
          : choosable && !picked
            ? "open"
            : "quiet";

  const pick = (slotId: string) => {
    if (picked) return;
    if (ctx.get().chat.slotChosen && data !== "choose") return;
    setPicked(slotId);
    ctx.answer(slotId, "choose");
    close();
  };

  const held = findSlot(chosen);
  return (
    <div className="cl-sheet">
      <div className="cl-sheet-top">
        {narrowed ? (
          <Switch
            on={outside}
            onChange={setOutside}
            label="Show times outside my preferences"
            detail={`You said ${LIST.format(prefs.map((pref) => PREF_WORD[pref]))} work best.`}
          />
        ) : null}
        <TimeZoneNote />
        {held && !choosable ? (
          <p className="cl-sheet-note">
            You’re holding {slotLabel(held.id)} with {clinicianName(held.providerId)}.
          </p>
        ) : null}
      </div>
      {sections.length ? (
        sections.map(({ clinician, why, days }) => (
          <section
            className="cl-section"
            key={clinician.id}
            aria-labelledby={`${sectionId}-${clinician.id}`}
          >
            <div className="cl-head">
              <Avatar clinician={clinician} size="sm" photo={false} />
              <div className="cl-id">
                <h3 className="cl-section-name" id={`${sectionId}-${clinician.id}`}>
                  <Name clinician={clinician} />
                </h3>
                {why ? <p className="cl-section-why">{why}</p> : null}
              </div>
              {clinician.id === ranked[0] ? <span className="cl-pill cl-end">Best fit</span> : null}
            </div>
            <DayList
              days={days}
              name={(slot) => `${spoken(slot, now)} with ${clinician.name}`}
              mode={mode}
              onPick={pick}
            />
          </section>
        ))
      ) : narrowed && !outside ? (
        <p className="cl-empty">No open times fit your preferences in the next 9 days.</p>
      ) : (
        <Empty ctx={ctx}>No open times in the next 9 days. The care team can help find one.</Empty>
      )}
      <Switch
        on={state.chat.watchOpenings}
        onChange={(on) => ctx.update({ chat: { watchOpenings: on } })}
        label="Watch for earlier openings"
        detail="I’ll text you if an earlier time opens with these clinicians (simulated)."
      />
    </div>
  );
}

/** A change inside the fee window takes a second, explicit tap, and the question names the fee first. */
function LateConfirm({
  slot,
  passed,
  moving,
  onMove,
  onKeep,
  focusRef,
}: {
  slot: Slot;
  /** The visit's time has already passed, rather than being under 48 hours away. */
  passed: boolean;
  moving: boolean;
  onMove: () => void;
  onKeep: () => void;
  focusRef: RefObject<HTMLParagraphElement | null>;
}) {
  const id = useId();
  return (
    <div className="cl-confirm" role="group" aria-labelledby={id}>
      <p className="cl-confirm-text" id={id} ref={focusRef} tabIndex={-1}>
        <strong className="cl-confirm-when">Move to {slotLabel(slot.id)}?</strong>{" "}
        {passed ? "Because your visit time has passed" : "Because your visit is within 48 hours"}, a{" "}
        <strong>{LATE_FEE}</strong> applies.
      </p>
      <div className="cl-confirm-actions">
        <button type="button" className="cl-action" disabled={moving} onClick={onKeep}>
          Keep my time
        </button>
        <button type="button" className="cl-action is-primary" disabled={moving} onClick={onMove}>
          {moving ? <LoaderCircle size={16} strokeWidth={2.6} className="cl-spin" aria-hidden="true" /> : null}
          Move my visit
        </button>
      </div>
    </div>
  );
}

function NewTime({ state, ctx, close }: SheetProps) {
  const [moving, setMoving] = useState("");
  // A time picked inside the fee window, waiting on the patient's confirmation.
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const alert = useRef<HTMLParagraphElement>(null);
  const question = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) alert.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  useEffect(() => {
    // Focus lands on the question, so the fee is read before either answer.
    if (!pending) return;
    question.current?.scrollIntoView({ block: "nearest" });
    question.current?.focus({ preventScroll: true });
  }, [pending]);

  const appointment = state.appointment;
  const encounter = state.encounter.status;
  const over = appointment?.status === "cancelled" || appointment?.status === "completed" || encounter === "completed";
  if (!appointment || over) return <p className="cl-empty">There’s no upcoming visit to move right now.</p>;
  // Moving a visit from the waiting room would strand the check-in on the old time.
  if (encounter !== "not_started")
    return (
      <Empty ctx={ctx}>
        {encounter === "waiting"
          ? "You’re checked in, so this visit can’t be moved now."
          : "Your visit is underway, so it can’t be moved now."}{" "}
        If something came up, the care team can help.
      </Empty>
    );

  const clinician = clinicianById(appointment.providerId);
  const who = clinician?.name ?? clinicianName(appointment.providerId);
  const now = journeyNow(state);
  const start = startOf(appointment.start);
  const late = start - now < FEE_WINDOW;
  const passed = start <= now;
  const freeUntil = new Date(start - FEE_WINDOW).toISOString();
  const policy = !late
    ? `Moving your visit is free until ${formatDate(freeUntil, true)}, ${formatTime(freeUntil)}. After that, a change costs $100.`
    : passed
      ? `Your visit time has passed, so moving it has a ${LATE_FEE}.`
      : `Your visit is less than 48 hours away, so moving it has a ${LATE_FEE}.`;
  const taken = takenSlots(state);
  const slots = inventory().slots.filter(
    (slot) =>
      slot.providerId === appointment.providerId && slot.id !== appointment.slotId && bookable(slot, now),
  );
  const waiting = slots.find((slot) => slot.id === pending);

  const mode = (slot: Slot): Mode =>
    slot.id === moving
      ? "busy"
      : slot.id === pending
        ? "chosen"
        : taken.has(slot.id)
          ? "taken"
          : moving
            ? "quiet"
            : "open";

  const move = async (slotId: string) => {
    if (moving) return;
    setMoving(slotId);
    setError("");
    // Errors stay in this sheet, beside the times, rather than in the dock behind it.
    const result = await ctx.act(async () => {
      try {
        await ctx.api.reschedule(slotId);
        return "moved";
      } catch (issue) {
        return issue instanceof Error
          ? issue.message
          : "That didn’t go through. Your visit is still booked, so try another time.";
      }
    });
    if (result === "moved") {
      void settleMove(ctx, slotId, late);
      close();
      return;
    }
    setMoving("");
    setPending("");
    if (result) setError(result);
  };

  // More than 48 hours out a time moves on one tap; inside the window it waits for the fee to be accepted.
  const pick = (slotId: string) => {
    if (moving) return;
    setError("");
    if (late) setPending(slotId);
    else void move(slotId);
  };

  return (
    <div className="cl-sheet">
      <div className="cl-now">
        {clinician ? <Avatar clinician={clinician} size="sm" /> : null}
        <div className="cl-id">
          <p className="cl-now-label">Your visit with {who}</p>
          <p className="cl-now-when">
            {dayLabel(appointment.start, now)}, {formatTime(appointment.start)}
          </p>
        </div>
      </div>
      <div className="cl-sheet-top">
        <p className="cl-policy">{policy}</p>
        <TimeZoneNote />
      </div>
      {error ? (
        <p className="cl-error" role="alert" ref={alert}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      {slots.length ? (
        <DayList
          days={byDay(slots, now)}
          name={(slot) => `Move your visit to ${spoken(slot, now, true)}`}
          mode={mode}
          onPick={pick}
          busyLabel="moving"
          after={(day) =>
            waiting && day.slots.includes(waiting) ? (
              <LateConfirm
                slot={waiting}
                passed={passed}
                moving={!!moving}
                onMove={() => void move(waiting.id)}
                onKeep={close}
                focusRef={question}
              />
            ) : null
          }
        />
      ) : (
        <Empty ctx={ctx}>
          {clinician ? formalName(clinician) : "Your clinician"} has no other open times in the next 9 days. The care
          team can help find one.
        </Empty>
      )}
    </div>
  );
}

export const CLINICIAN_CARDS: CardMap = {
  clinicians: (props) => <ClinicianChoice {...props} />,
};

export const CLINICIAN_SHEETS: SheetMap = {
  times: { title: "All open times", render: (props) => <AllTimes {...props} /> },
  reschedule: { title: "Pick a new time", render: (props) => <NewTime {...props} /> },
};
