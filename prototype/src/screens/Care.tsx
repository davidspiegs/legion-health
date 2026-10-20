import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Headphones,
  Heart,
  Mail,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  Video,
  VideoOff,
  WifiOff,
} from "lucide-react";
import {
  AppointmentContext,
  Button,
  CheckRow,
  Field,
  Notice,
  Page,
  ProviderAvatar,
} from "../components/ui";
import {
  followupSlots,
  formatDate,
  formatPhone,
  formatSlot,
  formatTime,
  getProvider,
} from "../model/fixtures";
import type { Appointment, JourneyState, ScreenProps } from "../model/types";
import "./care.css";

const careSteps = new Set([
  "confirmed",
  "records",
  "brief",
  "visit-home",
  "reminders",
  "device",
  "waiting",
  "visit",
  "complete",
  "followup",
  "feedback",
]);

/** Generates a real local calendar file; no calendar account or external request. */
function downloadCalendar(appointment: Appointment) {
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const start = new Date(appointment.start);
  const end = new Date(
    start.getTime() + (appointment.followup ? 30 : 60) * 60 * 1000,
  );
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Legion Flow Prototype//Demo Visit//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@legion-prototype.local`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    "SUMMARY:Legion Health — demo visit",
    "DESCRIPTION:Prototype appointment only. No real visit has been booked.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = appointment.followup
    ? "legion-demo-followup.ics"
    : "legion-demo-visit.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function costDescription(state: JourneyState, followup = false) {
  if (state.coverage === "selfpay")
    return `$${followup ? "150" : "250"} · self-pay`;
  if (followup) return "Insurance · benefits rechecked before your follow-up";
  return state.eligibility.status === "verified"
    ? `$${state.eligibility.estimate} estimated copay`
    : "Insurance · your cost is still being confirmed";
}

function AppointmentPanel({
  state,
  appointment,
  onCalendar,
  onReschedule,
  compact = false,
}: {
  state: JourneyState;
  appointment: Appointment;
  onCalendar?: () => void;
  onReschedule?: () => void;
  compact?: boolean;
}) {
  const provider = getProvider(appointment.providerId);
  return (
    <div className={`care-appointment ${compact ? "compact" : ""}`}>
      <p className="care-appointment-date">{formatDate(appointment.start)}</p>
      <div className="care-appointment-time">
        {formatTime(appointment.start)}
      </div>
      <p className="care-appointment-zone">
        Central Time · {appointment.followup ? "30" : "60"} minutes · video
        visit
      </p>
      <div className="care-appointment-provider">
        <ProviderAvatar provider={provider} size="small" />
        <span>
          <strong>{provider.name}</strong>
          <small>{provider.title}</small>
        </span>
      </div>
      <p className="care-appointment-cost">
        {costDescription(state, appointment.followup)}
      </p>
      {onCalendar || onReschedule ? (
        <div className="care-appointment-actions">
          {onCalendar ? (
            <button type="button" onClick={onCalendar}>
              <CalendarDays size={16} />
              Add to calendar
            </button>
          ) : null}
          {onReschedule ? (
            <button type="button" onClick={onReschedule}>
              Reschedule
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CareLink({
  icon,
  title,
  detail,
  onClick,
  done = false,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  done?: boolean;
}) {
  return (
    <button type="button" className="care-link" onClick={onClick}>
      <span className={`care-link-icon ${done ? "done" : ""}`}>
        {done ? <Check size={20} /> : icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}

export function CareScreens(props: ScreenProps) {
  const { state, update, updateProfile, go, api, act, busy, setError } = props;
  const [downloaded, setDownloaded] = useState(false);
  const [audioChecked, setAudioChecked] = useState(false);
  const [videoChecked, setVideoChecked] = useState(false);
  const [inTexas, setInTexas] = useState(false);
  const [callback, setCallback] = useState(state.profile.phone);
  const [followupId, setFollowupId] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [messageOpen, setMessageOpen] = useState(Boolean(state.careMessage));
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => {
    setDownloaded(false);
    setMessageSent(false);
    if (state.step === "device") {
      setCallback(state.profile.phone);
      setInTexas(false);
      setAudioChecked(state.deviceReady);
      setVideoChecked(state.deviceReady);
    }
  }, [state.step]);

  useEffect(() => {
    if (state.step !== "complete" || !messageOpen) return;
    const focus = window.setTimeout(
      () => document.getElementById("care-message")?.focus(),
      0,
    );
    return () => window.clearTimeout(focus);
  }, [state.step, messageOpen]);

  if (!careSteps.has(state.step)) return null;
  const appointment = state.appointment;
  const provider = getProvider(appointment?.providerId || state.providerId);
  const calendar = (item: Appointment) => {
    downloadCalendar(item);
    setDownloaded(true);
  };
  const reschedule = () => {
    update({ bookingMode: "reschedule" });
    go("slots");
  };
  const statusNote = downloaded ? (
    <p className="care-status" role="status">
      Calendar file downloaded
    </p>
  ) : null;
  const returnHome = (
    <Button onClick={() => go("visit-home")}>Back to your visit</Button>
  );

  if (!appointment)
    return (
      <Page
        title="Your visit starts here"
        subtitle="Choose your provider and a time before preparing for your visit."
        footer={<Button onClick={() => go("match")}>Find your provider</Button>}
      >
        <Notice>You haven’t booked a visit yet.</Notice>
      </Page>
    );

  if (state.step === "confirmed") {
    const prepare = async () => {
      const success = await act(async () => {
        await api.scheduleReminders();
        return true;
      });
      if (success) go(state.briefApproved ? "visit-home" : "records");
    };
    return (
      <Page
        className="care-confirmed"
        title={`You’re booked${state.profile.firstName ? `, ${state.profile.firstName}` : ""}`}
        subtitle="Let’s make your first visit feel familiar."
        footer={
          <Button loading={busy} onClick={prepare}>
            Prepare for your visit
          </Button>
        }
      >
        <AppointmentPanel
          state={state}
          appointment={appointment}
          onCalendar={() => calendar(appointment)}
          onReschedule={reschedule}
        />
        {statusNote}
        <div className="care-next">
          <span className="care-next-icon">
            <FileText size={22} />
          </span>
          <div>
            <h2>A little preparation, less repeating</h2>
            <p>
              Share what matters to you, and review it before your clinician
              does.
            </p>
          </div>
        </div>
        <button
          className="care-inline-link"
          type="button"
          onClick={() => go("reminders")}
        >
          <Mail size={16} />
          Reminders 24 hours and 1 hour before
          <ChevronRight size={15} />
        </button>
      </Page>
    );
  }

  if (state.step === "records") {
    const resolved = state.recordsStatus !== "idle";
    const continueWithRecords = async () => {
      const success = await act(async () => {
        if (!resolved) {
          await api.requestRecords(state.recordsPermission);
          return "requested";
        }
        update({ recordsReviewed: true });
        await api.generateBrief();
        return "brief";
      });
      if (success === "brief") go("brief");
    };
    return (
      <Page
        title={
          resolved ? "Your history, with your say" : "Less repeating your story"
        }
        subtitle={
          resolved
            ? "You decide what your clinician should know."
            : "Optional records sharing can give your clinician useful context."
        }
        footer={
          <Button loading={busy} onClick={continueWithRecords}>
            {resolved
              ? "Review my care brief"
              : state.recordsPermission
                ? "Find my records"
                : "Continue without records"}
          </Button>
        }
      >
        {!resolved ? (
          <>
            <div className="care-feature-icon">
              <FileText size={30} />
            </div>
            <div className="care-explanation">
              <h2>Bring your history together</h2>
              <p>
                With your permission, we’ll look for relevant records from past
                care. You can review and correct what comes back.
              </p>
            </div>
            <CheckRow
              checked={state.recordsPermission}
              onChange={(value) => update({ recordsPermission: value })}
              detail="Optional. You can still have your visit without sharing records."
            >
              Allow a records request
            </CheckRow>
          </>
        ) : (
          <>
            {state.recordsStatus === "ready" ? (
              <>
                <div className="care-record">
                  <span className="care-source-label">
                    Sample primary care summary · May 2025
                  </span>
                  <h2>Sleep routine discussed</h2>
                  <p>
                    A previous visit noted a conversation about daily sleep
                    habits. Your clinician will confirm what is still relevant.
                  </p>
                  <p className="care-source">
                    Source: sample primary care record
                  </p>
                </div>
                <CheckRow
                  checked={state.outdatedRecord}
                  onChange={(value) =>
                    update({ outdatedRecord: value, briefApproved: false })
                  }
                  detail="We’ll flag this for your clinician instead of treating it as current."
                >
                  This may be out of date
                </CheckRow>
              </>
            ) : (
              <Notice
                tone={
                  state.recordsStatus === "unavailable" ? "warning" : "info"
                }
              >
                {state.recordsStatus === "unavailable"
                  ? "We couldn’t retrieve records this time. You can share your own context and keep your appointment."
                  : "No records requested. What you tell us is enough to get started."}
              </Notice>
            )}
            <Field
              label="Anything you want your clinician to know?"
              hint="Optional. A short note is plenty."
              value={state.briefNote}
              onChange={(e) =>
                update({ briefNote: e.target.value, briefApproved: false })
              }
              placeholder="For example, what has changed lately"
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void continueWithRecords();
                }
              }}
            />
            <p className="care-quiet">
              This is context for a conversation, not a diagnosis.
            </p>
          </>
        )}
      </Page>
    );
  }

  if (state.step === "brief") {
    const approve = async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!state.briefGoal.trim()) {
        setError("Add one thing you’d like help with.");
        return;
      }
      const success = await act(async () => {
        await api.saveDraft("care-brief");
        await api.scheduleReminders();
        return true;
      });
      if (success) {
        update({ briefApproved: true, recordsReviewed: true });
        go("visit-home");
      }
    };
    return (
      <Page
        title="Your story, ready to share"
        subtitle={`A short care brief for ${provider.firstName}. Change anything that doesn’t feel right.`}
        onSubmit={approve}
        footer={
          <Button type="submit" loading={busy}>
            This reflects me
          </Button>
        }
      >
        <div className="care-ai-label">
          <Sparkles size={16} />
          AI-assisted draft · for your review
        </div>
        <Field
          label="What I’d like help with"
          value={state.briefGoal}
          onChange={(e) =>
            update({ briefGoal: e.target.value, briefApproved: false })
          }
          placeholder="My goal for this visit"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              document.getElementById("brief-note")?.focus();
            }
          }}
        />
        <p className="care-source">Source: your intake goal</p>
        {state.recordsStatus === "ready" ? (
          <div className="care-brief-source">
            <FileText size={18} />
            <div>
              <strong>Sleep routine discussed</strong>
              <small>Sample primary care record · May 2025</small>
              {state.outdatedRecord ? (
                <span className="care-correction">
                  You flagged this as possibly out of date
                </span>
              ) : (
                <span>For your clinician to confirm</span>
              )}
            </div>
          </div>
        ) : (
          <p className="care-no-records">
            Based on your answers. No outside records were added.
          </p>
        )}
        <Field
          id="brief-note"
          label="Anything else to add?"
          hint="Optional. Your clinician will review this with you."
          value={state.briefNote}
          onChange={(e) =>
            update({ briefNote: e.target.value, briefApproved: false })
          }
          enterKeyHint="done"
        />
        <p className="care-quiet">
          No diagnosis or treatment decisions are made by this summary.
        </p>
      </Page>
    );
  }

  if (state.step === "visit-home") {
    if (appointment.status === "completed")
      return (
        <Page
          title="Your care continues here"
          subtitle={`Your first visit with ${provider.firstName} is complete.`}
          footer={
            <Button onClick={() => go("complete")}>View your care plan</Button>
          }
        >
          <div className="care-complete-mark">
            <Check size={35} />
          </div>
          <Notice tone="success">
            Your clinician marked the visit complete.
          </Notice>
          {state.followupAppointment ? (
            <AppointmentPanel
              state={state}
              appointment={state.followupAppointment}
              compact
              onCalendar={() => calendar(state.followupAppointment!)}
            />
          ) : (
            <p className="care-body-copy">
              Your plan, follow-up options, and care team are ready when you
              are.
            </p>
          )}
          {statusNote}
        </Page>
      );
    const interrupted = appointment.status === "interrupted";
    const primaryLabel = interrupted
      ? "Reconnect to your visit"
      : state.visitDay
        ? "Get ready to join"
        : state.briefApproved
          ? "Review your care brief"
          : "Prepare for your visit";
    const primaryAction = () =>
      go(
        interrupted
          ? "visit"
          : state.visitDay
            ? "device"
            : state.briefApproved
              ? "brief"
              : "records",
      );
    return (
      <Page
        title={
          state.visitDay
            ? "Today is your first visit"
            : "A good start, together"
        }
        subtitle={
          state.visitDay
            ? `A little space in your day for you and ${provider.firstName}.`
            : "Everything you need, in one place."
        }
        footer={<Button onClick={primaryAction}>{primaryLabel}</Button>}
      >
        <AppointmentPanel
          state={state}
          appointment={appointment}
          compact
          onCalendar={() => calendar(appointment)}
          onReschedule={
            appointment.status === "confirmed" ? reschedule : undefined
          }
        />
        {statusNote}
        {interrupted ? (
          <Notice tone="warning">
            Your visit was interrupted. Your room and care brief are still here.
          </Notice>
        ) : null}
        <div className="care-link-group">
          <CareLink
            icon={<ClipboardList size={21} />}
            title={
              state.briefApproved
                ? "Your care brief is ready"
                : "Prepare your care brief"
            }
            detail={
              state.briefApproved
                ? "Reviewed by you · editable anytime"
                : "Your goals and the context that matters"
            }
            done={state.briefApproved}
            onClick={() =>
              go(state.recordsStatus === "idle" ? "records" : "brief")
            }
          />
          <CareLink
            icon={<Mail size={21} />}
            title="Your reminders"
            detail={`${state.emailReminder ? "Email" : "Email off"}${state.profile.sms ? " + text" : ""} · 24 hours and 1 hour before`}
            onClick={() => go("reminders")}
          />
        </div>
      </Page>
    );
  }

  if (state.step === "reminders") {
    const reminderAppointment =
      appointment.status === "completed"
        ? state.followupAppointment
        : appointment;
    if (!reminderAppointment)
      return (
        <Page
          title="No upcoming reminders"
          subtitle="Your first visit is complete. When you book a follow-up, its reminders will appear here."
          footer={
            <Button onClick={() => go("complete")}>
              Back to your care plan
            </Button>
          }
        >
          <div className="care-feature-icon">
            <CalendarDays size={30} />
          </div>
        </Page>
      );
    const invalidateSchedule = () =>
      update(
        reminderAppointment.followup
          ? { followupReminderScheduled: false }
          : { reminderScheduled: false },
      );
    const save = async () => {
      const success = await act(async () => {
        await api.scheduleReminders(reminderAppointment.id);
        return true;
      });
      if (success) go(reminderAppointment.followup ? "followup" : "visit-home");
    };
    return (
      <Page
        title="A little nudge, right on time"
        subtitle="Choose how we remind you. Your visit details stay easy to find."
        footer={
          <Button loading={busy} onClick={save}>
            Save reminders
          </Button>
        }
      >
        <p className="care-reminder-context">
          {reminderAppointment.followup ? "Follow-up" : "First visit"} ·{" "}
          {formatSlot(reminderAppointment.slotId, { short: true })}
        </p>
        <CheckRow
          checked={state.emailReminder}
          onChange={(value) => {
            update({ emailReminder: value });
            invalidateSchedule();
          }}
        >
          Email reminders
        </CheckRow>
        <CheckRow
          checked={state.profile.sms}
          onChange={(value) => {
            updateProfile({ sms: value });
            invalidateSchedule();
          }}
          detail="Optional. You can turn texts off anytime."
        >
          Text message reminders
        </CheckRow>
        <div className="care-reminder-timeline">
          <h2>A preview of your reminders</h2>
          <div className="care-reminder">
            <span>24 hours before</span>
            <p>
              Your Legion Health visit is tomorrow at{" "}
              {formatTime(reminderAppointment.start)} Central Time. Review your
              visit details and get ready.
            </p>
          </div>
          <div className="care-reminder">
            <span>1 hour before</span>
            <p>
              Your Legion Health visit starts in 1 hour. Open your visit page to
              check your setup and join.
            </p>
          </div>
        </div>
        {!state.emailReminder && !state.profile.sms ? (
          <Notice>
            You’ve turned reminders off. Your visit details remain available
            here.
          </Notice>
        ) : null}
      </Page>
    );
  }

  if (state.step === "device") {
    const ready = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!videoChecked || !audioChecked) {
        setError("Check your camera and sound before continuing.");
        return;
      }
      if (!inTexas) {
        setError("Confirm you’re in Texas for this visit.");
        return;
      }
      if (callback.replace(/\D/g, "").length !== 10) {
        setError("Enter a 10-digit callback number.");
        return;
      }
      updateProfile({ phone: callback.replace(/\D/g, "") });
      update({ deviceReady: true });
      go("waiting");
    };
    return (
      <Page
        title="Let’s get you settled"
        subtitle="A quiet spot, a charged device, and a way to reach you."
        onSubmit={ready}
        footer={<Button type="submit">Enter waiting room</Button>}
      >
        <div className="care-device-checks">
          <button
            type="button"
            className={videoChecked ? "checked" : ""}
            onClick={() => setVideoChecked(true)}
          >
            {videoChecked ? <Check size={22} /> : <Video size={22} />}
            <strong>{videoChecked ? "Camera ready" : "Check camera"}</strong>
          </button>
          <button
            type="button"
            className={audioChecked ? "checked" : ""}
            onClick={() => setAudioChecked(true)}
          >
            {audioChecked ? <Check size={22} /> : <Headphones size={22} />}
            <strong>{audioChecked ? "Sound ready" : "Check sound"}</strong>
          </button>
        </div>
        <CheckRow
          checked={inTexas}
          onChange={setInTexas}
          detail="Your clinician must be licensed where you are during the visit."
        >
          I’m in Texas right now
        </CheckRow>
        <Field
          label="If we get disconnected"
          hint="We’ll use this number to call you back."
          value={formatPhone(callback)}
          onChange={(e) =>
            setCallback(e.target.value.replace(/\D/g, "").slice(0, 10))
          }
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="done"
          placeholder="(202) 555-0147"
        />
        <p className="care-quiet">
          Your camera and microphone aren’t activated in this preview
        </p>
      </Page>
    );
  }

  if (state.step === "waiting") {
    const join = async () => {
      const success = await act(async () => {
        await api.joinVisit();
        return true;
      });
      if (success) go("visit");
    };
    return (
      <Page
        className="care-waiting"
        title="You’re in the right place"
        subtitle={`${provider.firstName} has your visit details. Take a moment to get comfortable.`}
        footer={
          <Button loading={busy} onClick={join}>
            Join your visit
          </Button>
        }
      >
        <div className="care-waiting-portrait">
          <ProviderAvatar provider={provider} size="large" />
          <span className="care-ready-dot" />
        </div>
        <h2 className="care-waiting-name">{provider.name}</h2>
        <p className="care-waiting-time">
          {formatSlot(appointment.slotId, { short: true })}
        </p>
        <div className="care-ready-status">
          <CheckCheck size={19} />
          <span>Camera and sound checked</span>
        </div>
        <Notice>
          {state.briefApproved
            ? "Your care brief is ready. You can start with what matters most to you."
            : "You can share your story with your clinician. A care brief is optional."}
        </Notice>
      </Page>
    );
  }

  if (state.step === "visit") {
    const interrupted = appointment.status === "interrupted";
    const leave = () => {
      if (appointment.status === "joined")
        update({ appointment: { ...appointment, status: "interrupted" } });
      go("visit-home");
    };
    const reconnect = async () => {
      await act(async () => {
        await api.reconnect();
        return true;
      });
    };
    const phrases = [
      {
        title: "Start with what matters to you",
        text: state.briefApproved
          ? "“I’ve read your care brief. What would make today feel useful for you?”"
          : "“What would you like us to focus on together today?”",
      },
      {
        title: "Make room for the full story",
        text: "“We can talk through what you’ve noticed, what you’ve tried, and any questions you have.”",
      },
      {
        title: "Leave with a shared next step",
        text: "“Before we finish, let’s review what we discussed and how we’ll stay in touch.”",
      },
    ];
    const conversation = phrases[Math.min(state.visitPhase, 2)];
    if (appointment.status === "completed")
      return (
        <Page
          title="Your visit is complete"
          subtitle="Your care plan is ready."
          footer={
            <Button onClick={() => go("complete")}>View your care plan</Button>
          }
        >
          <div className="care-complete-mark">
            <Check size={35} />
          </div>
        </Page>
      );
    if (appointment.status === "confirmed")
      return (
        <Page
          title="Your room is ready"
          subtitle="Check your setup before joining the visit."
          footer={<Button onClick={() => go("device")}>Check my setup</Button>}
        >
          <AppointmentContext state={state} />
        </Page>
      );
    return (
      <Page
        className="care-visit"
        title={
          interrupted ? "Let’s reconnect" : `You’re with ${provider.firstName}`
        }
        subtitle={
          <span className="care-connection">
            <span className={interrupted ? "offline" : ""} />
            {interrupted ? "Connection interrupted" : "Connected"}
          </span>
        }
        footer={
          interrupted ? (
            <Button loading={busy} onClick={reconnect}>
              Reconnect to your visit
            </Button>
          ) : undefined
        }
      >
        <div className={`care-video ${interrupted ? "interrupted" : ""}`}>
          {provider.photo ? (
            <img src={provider.photo} alt={provider.name} />
          ) : (
            <div className="care-video-monogram">{provider.initials}</div>
          )}
          <div className="care-self-preview">
            {state.cameraOn ? (
              <span>{state.profile.firstName?.[0] || "Y"}</span>
            ) : (
              <VideoOff size={22} />
            )}
            <small>You</small>
          </div>
          {interrupted ? (
            <div className="care-video-overlay">
              <WifiOff size={30} />
              <strong>Your room is still here</strong>
              <p>No need to start over</p>
            </div>
          ) : null}
        </div>
        <div className="care-conversation" aria-live="polite">
          <h2>
            {interrupted ? "Your visit hasn’t ended" : conversation.title}
          </h2>
          <p>
            {interrupted
              ? "Try reconnecting. If it doesn’t work, your clinician can use your callback number."
              : conversation.text}
          </p>
        </div>
        <div className="care-video-controls">
          <button
            type="button"
            aria-pressed={!state.micOn}
            aria-label={state.micOn ? "Mute microphone" : "Unmute microphone"}
            onClick={() => update({ micOn: !state.micOn })}
          >
            {state.micOn ? <Mic size={23} /> : <MicOff size={23} />}
            <small>{state.micOn ? "Mute" : "Unmute"}</small>
          </button>
          <button
            type="button"
            aria-pressed={!state.cameraOn}
            aria-label={state.cameraOn ? "Turn camera off" : "Turn camera on"}
            onClick={() => update({ cameraOn: !state.cameraOn })}
          >
            {state.cameraOn ? <Video size={23} /> : <VideoOff size={23} />}
            <small>Camera</small>
          </button>
          <button type="button" className="care-end-call" onClick={leave}>
            <PhoneOff size={23} />
            <small>Leave</small>
          </button>
        </div>
      </Page>
    );
  }

  if (state.step === "complete") {
    if (appointment.status !== "completed")
      return (
        <Page
          title="Your visit is still open"
          subtitle="Your care plan arrives after your clinician completes the visit."
          footer={returnHome}
        >
          <Notice>
            Joining or leaving the room doesn’t mark a visit complete.
          </Notice>
        </Page>
      );
    const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const success = await act(async () => {
        await api.sendCareMessage();
        return true;
      });
      if (success) setMessageSent(true);
    };
    const latestMessage = state.careMessages?.at(-1);
    return (
      <Page
        className="care-complete"
        title="Your first visit, complete"
        subtitle="A plan you can come back to."
        footer={
          <Button onClick={() => go("followup")}>
            {state.followupAppointment
              ? "View your next visit"
              : "Find a follow-up time"}
          </Button>
        }
      >
        <div className="care-complete-mark">
          <Check size={32} />
        </div>
        <p className="care-completion-proof">Visit completed</p>
        <div className="care-plan">
          <h2>Your care plan</h2>
          <p>Your next steps</p>
          <button
            type="button"
            className="care-plan-summary"
            onClick={() => setShowPlan((value) => !value)}
            aria-expanded={showPlan}
          >
            <FileText size={22} />
            <span>
              <strong>Keep the conversation going</strong>
              <small>What to bring to your next visit</small>
            </span>
            {showPlan ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          {showPlan ? (
            <div className="care-plan-detail">
              <p>
                Bring questions or observations you’d like to discuss. Review
                what felt useful and what you want to focus on next.
              </p>
            </div>
          ) : null}
        </div>
        <div className="care-followup-invitation">
          <CalendarDays size={23} />
          <div>
            <h2>
              {state.followupAppointment
                ? "Your next visit is booked"
                : "Keep building on today"}
            </h2>
            <p>
              {state.followupAppointment
                ? formatSlot(state.followupAppointment.slotId, { short: true })
                : `Your next visit with ${provider.firstName} can be in 2 weeks.`}
            </p>
            <small>{costDescription(state, true)}</small>
          </div>
        </div>
        <div className="care-postvisit-actions">
          <button type="button" onClick={() => go("feedback")}>
            <Heart size={19} />
            {state.feedbackSaved
              ? "Your feedback is saved"
              : "How was your visit?"}
            <ChevronRight size={17} />
          </button>
        </div>
        <details
          className="care-message"
          open={messageOpen}
          onToggle={(event) => setMessageOpen(event.currentTarget.open)}
        >
          <summary>
            <MessageCircle size={19} />
            <span>Ask your care team</span>
            <ChevronRight size={17} />
          </summary>
          {latestMessage ? (
            <div
              className="care-saved-message"
              role={messageSent ? "status" : undefined}
            >
              <span>
                <Check size={15} />
                Saved on this device
              </span>
              <p>{latestMessage.body}</p>
              <small>
                Not delivered ·{" "}
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(latestMessage.at))}
              </small>
            </div>
          ) : null}
          <form onSubmit={sendMessage}>
            <label htmlFor="care-message">What would you like to ask?</label>
            <textarea
              id="care-message"
              rows={3}
              value={state.careMessage}
              onChange={(e) => {
                update({ careMessage: e.target.value });
                setMessageSent(false);
              }}
              placeholder="A question about your next step"
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <p>For non-urgent questions. Save a draft to come back to later.</p>
            <Button type="submit" variant="secondary" loading={busy}>
              Save draft
            </Button>
          </form>
        </details>
      </Page>
    );
  }

  if (state.step === "followup") {
    if (appointment.status !== "completed")
      return (
        <Page
          title="One visit at a time"
          subtitle="You and your clinician can discuss follow-up at your first visit."
          footer={returnHome}
        >
          <AppointmentContext state={state} />
        </Page>
      );
    if (state.followupAppointment)
      return (
        <Page
          title="Your next step is in place"
          subtitle={`More time with ${provider.firstName}, when you need it.`}
          footer={
            <Button onClick={() => go("complete")}>
              Back to your care plan
            </Button>
          }
        >
          <AppointmentPanel
            state={state}
            appointment={state.followupAppointment}
            onCalendar={() => calendar(state.followupAppointment!)}
          />
          {statusNote}
          <Notice tone="success">Your follow-up is confirmed.</Notice>
          <CareLink
            icon={<Mail size={21} />}
            title="Your follow-up reminders"
            detail={
              state.followupReminderScheduled
                ? "24 hours and 1 hour before"
                : "Choose your reminder preferences"
            }
            onClick={() => go("reminders")}
          />
        </Page>
      );
    const options = followupSlots.filter(
      (slot) => slot.providerId === appointment.providerId,
    );
    const book = async () => {
      if (!followupId) {
        setError("Choose a time for your follow-up.");
        return;
      }
      await act(async () => {
        const followup = await api.bookFollowup(followupId);
        await api.scheduleReminders(followup.id);
        return true;
      });
    };
    return (
      <Page
        title="Keep the same connection"
        subtitle={`A follow-up with ${provider.firstName}. A little time to see how things are going.`}
        footer={
          <>
            <Button disabled={!followupId} loading={busy} onClick={book}>
              Confirm follow-up
            </Button>
            <button
              type="button"
              className="care-footer-link"
              onClick={() => go("complete")}
            >
              I’ll decide later
            </button>
          </>
        }
      >
        <div className="care-followup-provider">
          <ProviderAvatar provider={provider} size="small" />
          <span>
            <strong>{provider.name}</strong>
            <small>30 minutes · video visit</small>
          </span>
        </div>
        <p className="care-followup-cost">{costDescription(state, true)}</p>
        <div
          className="care-followup-times"
          role="group"
          aria-label="Follow-up appointment times"
        >
          {options.map((slot) => (
            <button
              type="button"
              key={slot.id}
              aria-pressed={followupId === slot.id}
              className={followupId === slot.id ? "selected" : ""}
              onClick={() => setFollowupId(slot.id)}
            >
              <span>{formatDate(slot, true)}</span>
              <strong>{formatTime(slot)} CT</strong>
              {followupId === slot.id ? <Check size={18} /> : null}
            </button>
          ))}
        </div>
        <p className="care-quiet">
          All times in Central Time. Follow-up is your choice.
        </p>
      </Page>
    );
  }

  if (state.step === "feedback") {
    if (appointment.status !== "completed")
      return (
        <Page
          title="We’ll ask after your visit"
          subtitle="For now, everything you need for your appointment is ready."
          footer={returnHome}
        >
          <Notice>Your clinician hasn’t completed this visit yet.</Notice>
        </Page>
      );
    const save = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!state.rating) {
        setError("Choose how your visit felt, or skip for now.");
        return;
      }
      const success = await act(async () => {
        await api.saveDraft("visit-feedback");
        return true;
      });
      if (success) {
        update({ feedbackSaved: true });
        go("complete");
      }
    };
    const discussExperience = async (changeProvider = false) => {
      const success = await act(async () => {
        await api.saveDraft("visit-feedback");
        return true;
      });
      if (success) {
        update({
          feedbackSaved: true,
          careMessage:
            state.careMessage ||
            (changeProvider
              ? "I’d like to discuss finding a different provider for my next visit."
              : "I’d like to talk about my first visit and what could feel better next time."),
        });
        setMessageOpen(true);
        go("complete");
      }
    };
    return (
      <Page
        title="How did your visit feel?"
        subtitle="A moment to tell us what worked, and what could feel better."
        onSubmit={save}
        footer={
          <>
            <Button type="submit" loading={busy}>
              Save feedback
            </Button>
            <button
              type="button"
              className="care-footer-link"
              onClick={() => go("complete")}
            >
              Skip for now
            </button>
          </>
        }
      >
        <div
          className="care-rating"
          role="group"
          aria-label="Rate your visit from 1 to 5"
        >
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              type="button"
              key={rating}
              className={state.rating === rating ? "selected" : ""}
              aria-label={`${rating} out of 5`}
              aria-pressed={state.rating === rating}
              onClick={() => update({ rating })}
            >
              {rating}
            </button>
          ))}
        </div>
        <div className="care-rating-labels">
          <span>Could be better</span>
          <span>Felt great</span>
        </div>
        {state.rating > 0 && state.rating <= 2 ? (
          <div className="care-feedback-recovery">
            <h2>Let’s make the next step better</h2>
            <p>You can draft a question or ask about a different provider.</p>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={() => discussExperience(false)}
              >
                Ask the care team
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => discussExperience(true)}
              >
                Discuss another provider
              </button>
            </div>
            <small>Start a draft. Nothing changes until you decide.</small>
          </div>
        ) : null}
        <Field
          label="Anything you’d like us to know?"
          hint="Optional. Your feedback helps shape the experience."
          value={state.feedback}
          onChange={(e) => update({ feedback: e.target.value })}
          placeholder="What stood out for you?"
          enterKeyHint="done"
        />
      </Page>
    );
  }
  return null;
}
