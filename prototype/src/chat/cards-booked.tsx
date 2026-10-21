import { CalendarPlus, CalendarX2, Check, CreditCard, RefreshCw, Video } from "lucide-react";
import { formatDate, formatTime } from "../model/fixtures";
import { lateFees, reminderTimes } from "./agent";
import { FIRST_VISIT_LENGTH } from "./env";
import { clinicianById, formalName } from "./inventory";
import { priceLine } from "./script";
import type { CardMap, CardProps } from "./registry";
import "./cards-booked.css";

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Hands the patient a generated file to keep, such as a calendar invite or a visit summary. */
export function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The invite blocks the longest a first visit runs. */
const VISIT_MINUTES = Math.max(...(FIRST_VISIT_LENGTH.match(/\d+/g) ?? ["45"]).map(Number));

/** Calendars are often shared, so the title names no clinician, credential or specialty. */
export function downloadCalendar(start: string) {
  const begin = new Date(start);
  const end = new Date(begin.getTime() + VISIT_MINUTES * 60_000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Legion Health preview//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(begin)}-legion-preview`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(begin)}`,
    `DTEND:${stamp(end)}`,
    "SUMMARY:Video appointment",
    "DESCRIPTION:Preview only. Join from your Legion conversation 15 minutes before your visit.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  saveFile("video-appointment.ics", ics, "text/calendar");
}

/**
 * The booking confirmation: the midpoint of onboarding, not its end. The moment
 * itself (a check, the day and time large), then who and what it costs, then
 * the steps that lead to the first completed visit.
 */
function Booked({ state, ctx }: CardProps) {
  const appointment = state.appointment;
  if (!appointment) return null;
  // The appointment carries its own start, so a time that has left the inventory still renders.
  const start = appointment.start;
  const clinician = clinicianById(appointment.providerId);
  const name = clinician ? `${clinician.name}, ${clinician.credential}` : "Your clinician";
  const first = clinician ? formalName(clinician) : "your clinician";
  const cancelled = appointment.status === "cancelled";
  const done = state.encounter.status === "completed";
  // Calendar and reschedule belong to a visit that hasn't started; a checked-in visit can't move.
  const upcoming = appointment.status === "confirmed" && state.encounter.status === "not_started";
  const selfPay = state.coverage === "selfpay" || state.chat.benefitsChoice === "selfpay";
  const fees = lateFees(state);
  const prepped =
    state.chat.prep === "later" ||
    (state.chat.prep === "yes" && (state.chat.briefApproved || state.chat.briefSkipped));
  const steps = [
    { label: "Get ready", detail: "Optional, about three minutes", done: prepped },
    { label: "Reminders", detail: upperFirst(reminderTimes(state)), done: state.visitDay },
    { label: "Your video visit", detail: `With ${first}, about ${FIRST_VISIT_LENGTH}`, done },
    { label: `Your plan from ${first}`, detail: "Reviewed and signed by your clinician", done: state.carePlan.status === "published" },
  ];
  const current = cancelled ? -1 : steps.findIndex((step) => !step.done);
  return (
    <section
      className={`card-shell bk-card${cancelled ? " is-cancelled" : ""}`}
      aria-label={cancelled ? "Your first visit was cancelled" : "Your first visit is booked"}
    >
      <div className="bk-hero">
        <span className="bk-seal" aria-hidden="true">
          {cancelled ? (
            <CalendarX2 size={20} strokeWidth={2} />
          ) : (
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M6.6 12.4l3.6 3.6 7.3-7.7" pathLength={1} />
            </svg>
          )}
        </span>
        <p className="bk-status">{cancelled ? "Visit cancelled" : "You’re booked"}</p>
        <p className="bk-when">
          <strong>{formatDate(start)}</strong>
          <span>{formatTime(start)} Central Time</span>
        </p>
      </div>
      <div className="bk-who">
        {clinician?.photo ? (
          <img src={clinician.photo} alt="" />
        ) : (
          <span className="bk-initials" aria-hidden="true">
            {clinician?.initials ?? "LH"}
          </span>
        )}
        <span className="bk-who-text">
          <strong>{name}</strong>
          <small>
            <Video size={14} strokeWidth={2} aria-hidden="true" /> Video visit from anywhere in Texas
          </small>
        </span>
      </div>
      {cancelled ? null : (
        <p className="bk-cost">
          <CreditCard size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            You’ll pay {priceLine(state)}
            {fees === 1 ? ", plus the $100 late-change fee" : fees > 1 ? `, plus $${fees * 100} in late-change fees` : ""}.
            Nothing is charged before then.
            {selfPay ? " Your written Good Faith Estimate, $250 for this first visit, came with your confirmation." : null}
          </span>
        </p>
      )}
      {upcoming ? (
        <div className="bk-actions">
          <button type="button" className="card-button" onClick={() => downloadCalendar(start)}>
            <CalendarPlus size={17} aria-hidden="true" /> Add to calendar
          </button>
          <button type="button" className="card-button" onClick={() => ctx.openSheet("reschedule")}>
            <RefreshCw size={16} aria-hidden="true" /> Reschedule
          </button>
        </div>
      ) : null}
      {cancelled ? null : (
        <div className="bk-next">
          <h4 className="bk-next-title">What happens next</h4>
          <ol>
            {steps.map((step, index) => (
              <li
                key={step.label}
                className={step.done ? "is-done" : index === current ? "is-current" : ""}
                aria-current={index === current ? "step" : undefined}
                style={{ ["--i" as string]: index }}
              >
                <span className="bk-dot" aria-hidden="true">
                  {step.done ? <Check size={12} strokeWidth={3.2} /> : null}
                </span>
                <span className="bk-step-text">
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export const BOOKED_CARDS: CardMap = {
  booked: (props) => <Booked {...props} />,
};
