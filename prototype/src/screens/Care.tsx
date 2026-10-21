import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Headphones,
  Heart,
  Mail,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  Video,
  VideoOff,
  WifiOff,
} from "lucide-react";
import {
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
import { joinAvailability } from "../model/journey-state";
import type { Appointment, JourneyState, ScreenProps } from "../model/types";
import { PortalScreens } from "./Portal";
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
  "portal-visits",
  "portal-messages",
  "portal-account",
  "portal-signin",
  "health-details",
]);

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
    : "Insurance · cost being confirmed";
}

function AppointmentPanel({
  state,
  appointment,
  onCalendar,
  onReschedule,
  children,
}: {
  state: JourneyState;
  appointment: Appointment;
  onCalendar?: () => void;
  onReschedule?: () => void;
  children?: ReactNode;
}) {
  const provider = getProvider(appointment.providerId);
  return (
    <div className="care-appointment">
      <div className="care-appointment-provider">
        <ProviderAvatar provider={provider} size="small" />
        <span>
          <strong>{provider.name}</strong>
          <small>{provider.title}</small>
        </span>
      </div>
      <div className="care-appointment-schedule">
        <p className="care-appointment-date">{formatDate(appointment.start)}</p>
        <div className="care-appointment-time">
          {formatTime(appointment.start)} <span>CT</span>
        </div>
      </div>
      <p className="care-appointment-zone">
        <Video size={15} /> {appointment.followup ? "30" : "60"} minutes · video
        visit <span>·</span> {costDescription(state, appointment.followup)}
      </p>
      {children}
      {(onCalendar || onReschedule) && (
        <div className="care-appointment-actions">
          {onCalendar && (
            <button type="button" onClick={onCalendar}>
              <CalendarDays size={15} /> Add to calendar
            </button>
          )}
          {onReschedule && (
            <button type="button" onClick={onReschedule}>
              Reschedule
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CareLink({
  icon,
  title,
  detail,
  onClick,
  done = false,
  optional = false,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  done?: boolean;
  optional?: boolean;
}) {
  return (
    <button type="button" className="care-link" onClick={onClick}>
      <span className={`care-link-icon ${done ? "done" : ""}`}>
        {done ? <Check size={19} /> : icon}
      </span>
      <span>
        <strong>
          {title}
          {optional && <em>Optional</em>}
        </strong>
        <small>{detail}</small>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}

export function CareScreens(props: ScreenProps) {
  const { state, update, updateProfile, go, api, act, busy, setError } = props;
  const [downloaded, setDownloaded] = useState(false);
  const [audioCheck, setAudioCheck] = useState<"idle" | "checking" | "ready">(
    "idle",
  );
  const [videoCheck, setVideoCheck] = useState<"idle" | "checking" | "ready">(
    "idle",
  );
  const [callback, setCallback] = useState(state.profile.phone);
  const [location, setLocation] = useState(state.currentLocation || "");
  const [inTexas, setInTexas] = useState(false);
  const [followupId, setFollowupId] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  useEffect(() => {
    setDownloaded(false);
    if (state.step === "device") {
      setCallback(state.profile.phone);
      setLocation(state.currentLocation || "");
      setInTexas(false);
      setAudioCheck(state.deviceReady ? "ready" : "idle");
      setVideoCheck(state.deviceReady ? "ready" : "idle");
    }
  }, [state.step]);
  useEffect(() => {
    if (audioCheck !== "checking") return;
    const timer = window.setTimeout(() => setAudioCheck("ready"), 1200);
    return () => window.clearTimeout(timer);
  }, [audioCheck]);
  useEffect(() => {
    if (videoCheck !== "checking") return;
    const timer = window.setTimeout(() => setVideoCheck("ready"), 1000);
    return () => window.clearTimeout(timer);
  }, [videoCheck]);
  useEffect(() => {
    if (state.step === "visit" && state.appointment?.status === "completed")
      go("complete");
  }, [state.step, state.appointment?.status]);

  if (!careSteps.has(state.step)) return null;
  if (state.step.startsWith("portal-") || state.step === "health-details")
    return <PortalScreens {...props} />;
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
    <Button onClick={() => go("visit-home")}>Back to Home</Button>
  );
  if (!appointment)
    return (
      <Page
        title="Your care starts here"
        subtitle="Choose a provider and a time that works for you."
        footer={<Button onClick={() => go("match")}>Find your provider</Button>}
      >
        <Notice>You haven’t booked a visit yet.</Notice>
      </Page>
    );
  const joinState = joinAvailability(state);
  const failedNotification = state.notifications.some(
    (item) => item.appointmentId === appointment.id && item.status === "failed",
  );

  if (state.step === "confirmed")
    return (
      <Page
        className="care-confirmed"
        title={`You’re booked${state.profile.firstName ? `, ${state.profile.firstName}` : ""}`}
        subtitle="Your first step is in place. We’ll take it from here, together."
        footer={
          <Button onClick={() => go("visit-home")}>Go to your portal</Button>
        }
      >
        <span className="care-confirmed-mark">
          <Check size={24} />
        </span>
        <AppointmentPanel
          state={state}
          appointment={appointment}
          onCalendar={() => calendar(appointment)}
        />
        {statusNote}
        <div className="care-next">
          <span className="care-next-icon">
            <ShieldCheck size={23} />
          </span>
          <div>
            <h2>One place for everything ahead</h2>
            <p>
              Prepare for your visit, join your appointment, and stay in touch
              with your care team.
            </p>
          </div>
        </div>
        <p className="care-confirmation-delivery">
          <Mail size={16} /> Confirmation and reminders are set up for you.
        </p>
      </Page>
    );

  if (state.step === "visit-home") {
    const completed = appointment.status === "completed";
    const cancelled = appointment.status === "cancelled";
    const interrupted = appointment.status === "interrupted";
    const connected = appointment.status === "joined";
    const waiting = state.encounter.status === "waiting";
    const planReady = state.carePlan.status === "published";
    const joinOpens = new Date(
      new Date(appointment.start).getTime() - 15 * 60 * 1000,
    ).toISOString();
    const action =
      interrupted || connected
        ? () => go("visit")
        : waiting
          ? () => go("waiting")
          : () => go(state.healthReviewed ? "device" : "health-details");
    return (
      <Page
        className="portal-home"
        title={
          state.profile.firstName
            ? `Hi, ${state.profile.firstName}`
            : "Welcome back"
        }
        subtitle={
          completed
            ? "A good beginning. Your care continues here."
            : "Your care, in one place."
        }
      >
        {cancelled ? (
          <div className="care-home-empty">
            <CalendarDays size={30} />
            <h2>Your visit was cancelled</h2>
            <p>When you’re ready, choose another time with your provider.</p>
            <Button
              onClick={() => {
                update({ bookingMode: "first", reservation: null });
                go("slots");
              }}
            >
              Find another time
            </Button>
          </div>
        ) : completed ? (
          <>
            <div className="care-home-completed">
              <span className="care-complete-mark">
                <Check size={27} />
              </span>
              <div>
                <h2>Your first visit is complete</h2>
                <p>
                  {formatDate(appointment.start)} with {provider.firstName}
                </p>
              </div>
            </div>
            <div className="care-home-plan">
              <FileText size={23} />
              <h2>
                {planReady
                  ? "Your care plan is ready"
                  : `${provider.firstName} is preparing your care plan`}
              </h2>
              <p>
                {planReady
                  ? "Your visit summary and next steps, all together."
                  : "We’ll let you know when it’s available. You can still message your care team."}
              </p>
              <Button
                onClick={() => go("complete")}
                variant={planReady ? "primary" : "secondary"}
              >
                {planReady ? "View care plan" : "View visit details"}
              </Button>
            </div>
            {state.followupAppointment &&
              state.followupAppointment.status !== "cancelled" && (
                <AppointmentPanel
                  state={state}
                  appointment={state.followupAppointment}
                  onCalendar={() => calendar(state.followupAppointment!)}
                />
              )}
            <CareLink
              icon={<MessageCircle size={21} />}
              title="Your care team"
              detail="Questions and support between visits"
              onClick={() => go("portal-messages")}
            />
            <CareLink
              icon={<Heart size={21} />}
              title={
                state.feedbackSaved
                  ? "Thank you for your feedback"
                  : "How did your visit feel?"
              }
              detail={
                state.feedbackSaved
                  ? "Your experience helps us improve"
                  : "Share a little about your experience"
              }
              done={state.feedbackSaved}
              onClick={() => go("feedback")}
            />
          </>
        ) : (
          <>
            <AppointmentPanel state={state} appointment={appointment}>
              <div className="care-join-status">
                {interrupted ? <WifiOff size={16} /> : <Clock3 size={16} />}
                <span>
                  {interrupted
                    ? "Your visit is still open"
                    : connected
                      ? "Your provider is in the room"
                      : waiting
                        ? `${provider.firstName} knows you’re here`
                        : joinState === "open"
                          ? "Your waiting room is open"
                          : joinState === "closed"
                            ? "Your appointment time has passed"
                            : `Join opens at ${formatTime(joinOpens)} CT`}
                </span>
              </div>
              {interrupted || connected || waiting || joinState === "open" ? (
                <Button className="care-card-button" onClick={action}>
                  {interrupted
                    ? "Reconnect to visit"
                    : connected
                      ? "Return to visit"
                      : waiting
                        ? "Return to waiting room"
                        : "Join visit"}
                </Button>
              ) : joinState === "closed" ? (
                <Button
                  className="care-card-button"
                  onClick={() => go("portal-messages")}
                >
                  Contact your care team
                </Button>
              ) : (
                <p className="care-join-hint">
                  Come back here when it’s time. We’ll send a reminder, too.
                </p>
              )}
            </AppointmentPanel>
            {failedNotification && (
              <div className="care-reminder-problem">
                <Mail size={18} />
                <span>
                  A reminder couldn’t be delivered. Your visit is still
                  confirmed.
                </span>
                <button type="button" onClick={() => go("portal-account")}>
                  Check details
                </button>
              </div>
            )}
            <div className="care-preparation-heading">
              <h2>
                {state.healthReviewed
                  ? "You’re ready for your visit"
                  : "Before we meet"}
              </h2>
              {state.healthReviewed ? (
                <span>
                  <Check size={14} /> Required details complete
                </span>
              ) : (
                <span>One quick check, then you’re ready</span>
              )}
            </div>
            <div className="care-preparation-list">
              <CareLink
                icon={<ClipboardList size={20} />}
                title="Your health details"
                detail={
                  state.healthReviewed
                    ? "Reviewed · view or edit"
                    : "Confirm medications and allergies"
                }
                done={state.healthReviewed}
                onClick={() => go("health-details")}
              />
              <CareLink
                icon={<FileText size={20} />}
                title="Outside records"
                detail={
                  state.recordsReviewed
                    ? state.recordsStatus === "declined"
                      ? "Skipped · change your choice"
                      : state.recordsStatus === "unavailable"
                        ? "Unavailable · you can still join"
                        : "Reviewed · view or edit"
                    : "Share useful history from past care"
                }
                done={state.recordsReviewed}
                optional
                onClick={() => go("records")}
              />
              <CareLink
                icon={<Sparkles size={20} />}
                title="Your care brief"
                detail={
                  state.briefApproved
                    ? "Reviewed · view or edit"
                    : "A short introduction, in your words"
                }
                done={state.briefApproved}
                optional
                onClick={() => {
                  if (state.briefGoal) go("brief");
                  else
                    void act(async () => {
                      await api.generateBrief();
                      go("brief");
                    });
                }}
              />
            </div>
            <div className="care-home-tools">
              <button type="button" onClick={() => go("device")}>
                <Video size={16} /> Check your setup
              </button>
              <button type="button" onClick={() => go("portal-visits")}>
                <CalendarDays size={16} /> Manage visit
              </button>
            </div>
          </>
        )}
        {statusNote}
      </Page>
    );
  }

  if (state.step === "records") {
    const resolved = state.recordsStatus !== "idle";
    const finish = async () => {
      const success = await act(async () => {
        if (!resolved && state.recordsPermission) {
          await api.requestRecords(true);
          return "review";
        }
        if (!resolved) await api.requestRecords(false);
        update({ recordsReviewed: true });
        await api.saveDraft("records-reviewed");
        return "done";
      });
      if (success === "done") go("visit-home");
    };
    return (
      <Page
        title={
          resolved ? "Your history, with your say" : "Less repeating your story"
        }
        subtitle={
          resolved
            ? "Review what came back. Your clinician will confirm what’s relevant."
            : "Optional records sharing can give your clinician useful context."
        }
        footer={
          <Button loading={busy} onClick={finish}>
            {resolved
              ? "Done reviewing"
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
              detail="You can still have your visit without sharing records."
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
                  detail="This will be flagged for your clinician, not treated as current."
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
                  ? "We couldn’t retrieve records this time. Your visit can go ahead, and you can share your own context."
                  : "No records requested. You can share your history with your clinician."}
              </Notice>
            )}
            <Field
              label="Anything you want to clarify?"
              hint="Optional. A short note is plenty."
              value={state.briefNote}
              onChange={(e) =>
                update({ briefNote: e.target.value, briefApproved: false })
              }
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void finish();
                }
              }}
            />
            {state.recordsStatus !== "ready" && (
              <button
                className="care-inline-link"
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api.requestRecords(true);
                    update({ recordsPermission: true, recordsReviewed: false });
                  })
                }
              >
                Request records{" "}
                {state.recordsStatus === "unavailable" ? "again" : "now"}
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </Page>
    );
  }

  if (state.step === "brief") {
    const approve = async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!state.briefGoal.trim()) {
        setError("Add one thing you’d like help with, or come back later.");
        return;
      }
      const success = await act(async () => {
        await api.saveDraft("care-brief");
        update({ briefApproved: true });
        return true;
      });
      if (success) go("visit-home");
    };
    return (
      <Page
        title="Your story, ready to share"
        subtitle={`A short introduction for ${provider.firstName}. Change anything that doesn’t feel right.`}
        onSubmit={approve}
        footer={
          <Button type="submit" loading={busy}>
            Save my care brief
          </Button>
        }
      >
        <p className="care-ai-label">
          <Sparkles size={16} /> AI-assisted draft · reviewed by you
        </p>
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
              <span
                className={state.outdatedRecord ? "care-correction" : undefined}
              >
                {state.outdatedRecord
                  ? "You flagged this as possibly out of date"
                  : "For your clinician to confirm"}
              </span>
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
          This is a starting point for your conversation. It doesn’t make a
          diagnosis or treatment decision.
        </p>
      </Page>
    );
  }

  if (state.step === "reminders") {
    const upcoming =
      appointment.status === "completed"
        ? state.followupAppointment
        : appointment.status === "cancelled"
          ? null
          : appointment;
    const save = async () => {
      const success = await act(async () => {
        if (upcoming) await api.scheduleReminders(upcoming.id);
        return true;
      });
      if (success) go("portal-account");
    };
    return (
      <Page
        title="Your reminders"
        subtitle="A little nudge, right on time. Choose how we reach you."
        footer={
          <Button loading={busy} onClick={save}>
            Save preferences
          </Button>
        }
      >
        <CheckRow
          checked={state.emailReminder}
          onChange={(value) => update({ emailReminder: value })}
          detail={state.profile.email}
        >
          Email reminders
        </CheckRow>
        <CheckRow
          checked={state.profile.sms}
          onChange={(value) => updateProfile({ sms: value })}
          detail={`Optional · ${formatPhone(state.profile.phone)}`}
        >
          Text message reminders
        </CheckRow>
        {upcoming ? (
          <div className="care-reminder-timeline">
            <h2>For your visit on {formatDate(upcoming.start, true)}</h2>
            <div className="care-reminder">
              <span>24 hours before</span>
              <p>
                A reminder with your appointment details and a secure link to
                your portal.
              </p>
            </div>
            <div className="care-reminder">
              <span>1 hour before</span>
              <p>
                A link to check your setup. Your waiting room opens 15 minutes
                before your visit.
              </p>
            </div>
          </div>
        ) : (
          <Notice>
            No upcoming visits. We’ll use these preferences when you book again.
          </Notice>
        )}
        {!state.emailReminder && !state.profile.sms && (
          <Notice>
            Your reminders are off. You can still find and join your visit from
            Home.
          </Notice>
        )}
        {failedNotification && (
          <Notice tone="warning">
            A reminder couldn’t be delivered. Check your contact information in
            Account. You can always join from Home.
          </Notice>
        )}
        <p className="care-quiet">
          Changes to your appointment update its reminders automatically.
        </p>
      </Page>
    );
  }

  if (state.step === "device") {
    const checkOnly = joinState !== "open";
    const ready = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (videoCheck !== "ready" || audioCheck !== "ready") {
        setError("Check your camera and sound before continuing.");
        return;
      }
      if (checkOnly) {
        update({ deviceReady: true });
        go("visit-home");
        return;
      }
      if (!state.healthReviewed) {
        go("health-details");
        return;
      }
      if (!inTexas || !location.trim()) {
        setError("Confirm you’re in Texas and add your current location.");
        return;
      }
      if (callback.replace(/\D/g, "").length !== 10) {
        setError("Enter a 10-digit callback number.");
        return;
      }
      updateProfile({ phone: callback.replace(/\D/g, "") });
      update({
        deviceReady: true,
        currentLocation: location.trim(),
        callbackConfirmed: true,
      });
      const success = await act(async () => {
        await api.checkIn();
        return true;
      });
      if (success) go("waiting");
    };
    return (
      <Page
        className="care-device"
        title={checkOnly ? "Check your setup" : "Let’s get you settled"}
        subtitle={
          checkOnly
            ? "Make sure everything is ready before your appointment."
            : "A quiet spot and a way to reach you if we get disconnected."
        }
        onSubmit={ready}
        footer={
          <Button
            type="submit"
            loading={busy}
            disabled={videoCheck !== "ready" || audioCheck !== "ready"}
          >
            {checkOnly ? "Save setup check" : "Enter waiting room"}
          </Button>
        }
      >
        <div className="care-device-checks">
          <button
            type="button"
            className={videoCheck === "ready" ? "checked" : ""}
            disabled={videoCheck === "checking"}
            onClick={() => setVideoCheck("checking")}
          >
            {videoCheck === "ready" ? (
              <Check size={23} />
            ) : (
              <Video
                size={23}
                className={
                  videoCheck === "checking" ? "care-checking-icon" : undefined
                }
              />
            )}
            <strong>
              {videoCheck === "ready"
                ? "Camera ready"
                : videoCheck === "checking"
                  ? "Checking camera…"
                  : "Check camera"}
            </strong>
            <small>
              {videoCheck === "ready"
                ? "Connection checked"
                : "Video connection"}
            </small>
          </button>
          <button
            type="button"
            className={audioCheck === "ready" ? "checked" : ""}
            disabled={audioCheck === "checking"}
            onClick={() => setAudioCheck("checking")}
          >
            {audioCheck === "ready" ? (
              <Check size={23} />
            ) : (
              <Headphones
                size={23}
                className={
                  audioCheck === "checking" ? "care-checking-icon" : undefined
                }
              />
            )}
            <strong>
              {audioCheck === "ready"
                ? "Sound ready"
                : audioCheck === "checking"
                  ? "Checking sound…"
                  : "Check sound"}
            </strong>
            <small>
              {audioCheck === "ready"
                ? "Connection checked"
                : "Microphone and audio"}
            </small>
          </button>
        </div>
        <p className="care-simulation-note">
          Device checks are simulated. Your camera and microphone stay off.
        </p>
        {!checkOnly && !state.healthReviewed && (
          <CareLink
            icon={<ClipboardList size={20} />}
            title="Review your health details first"
            detail="A quick check before joining your visit"
            onClick={() => go("health-details")}
          />
        )}
        {!checkOnly ? (
          <>
            <CheckRow
              checked={inTexas}
              onChange={setInTexas}
              detail="Your clinician must be licensed where you are during the visit."
            >
              I’m in Texas right now
            </CheckRow>
            <Field
              label="Where are you joining from?"
              hint="Your current address, in case you need urgent help."
              placeholder="Street address, city, ZIP"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              autoComplete="street-address"
              enterKeyHint="next"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("visit-callback")?.focus();
                }
              }}
            />
            <Field
              id="visit-callback"
              label="Callback number"
              hint="We’ll use this number if we lose the connection."
              value={formatPhone(callback)}
              onChange={(e) =>
                setCallback(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              enterKeyHint="done"
            />
          </>
        ) : (
          <Notice>
            Your waiting room opens 15 minutes before your appointment. Your
            completed setup check will be saved.
          </Notice>
        )}
      </Page>
    );
  }

  if (state.step === "waiting") {
    const ready = state.encounter.clinicianStatus === "ready";
    const late = state.encounter.clinicianStatus === "running_late";
    const join = async () => {
      const success = await act(async () => {
        await api.admitToVisit();
        return true;
      });
      if (success) go("visit");
    };
    return (
      <Page
        className="care-waiting"
        title={
          ready ? `${provider.firstName} is ready for you` : "You’re checked in"
        }
        subtitle={
          ready
            ? "Your clinician is in the room. Join whenever you’re ready."
            : "Your clinician knows you’re here. You can take a moment to settle in."
        }
        footer={
          <Button loading={busy} disabled={!ready} onClick={join}>
            {ready ? "Join your visit" : "Waiting for your clinician"}
          </Button>
        }
      >
        <div className="care-waiting-portrait">
          <ProviderAvatar provider={provider} size="large" />
          <span className={`care-ready-dot ${ready ? "" : "waiting"}`} />
        </div>
        <h2 className="care-waiting-name">{provider.name}</h2>
        <p className="care-waiting-time">
          {formatSlot(appointment.slotId, { short: true })}
        </p>
        <div
          className={`care-ready-status ${ready ? "" : "waiting"}`}
          role="status"
        >
          {ready ? <CheckCheck size={19} /> : <Clock3 size={19} />}
          <span>
            {ready
              ? "Your clinician has joined"
              : late
                ? "Your clinician is running a little late"
                : "Waiting for your clinician"}
          </span>
        </div>
        {late ? (
          <Notice>
            We’re sorry for the wait. You’ll see an update here when your
            clinician is ready. Your place is saved.
          </Notice>
        ) : (
          <Notice>
            {state.briefApproved
              ? "Your care brief is ready for your clinician. Start with what matters most to you."
              : "You can share your story directly with your clinician. A care brief is optional."}
          </Notice>
        )}
        <button
          type="button"
          className="care-footer-link"
          onClick={() => go("portal-messages")}
        >
          <MessageCircle size={16} /> Need help? Message your care team
        </button>
      </Page>
    );
  }

  if (state.step === "visit") {
    const interrupted = appointment.status === "interrupted";
    const leave = async () => {
      const success = await act(async () => {
        await api.leaveVisit();
        return true;
      });
      if (success) go("visit-home");
    };
    const reconnect = () => void act(() => api.reconnect());
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
    if (appointment.status !== "joined" && !interrupted)
      return (
        <Page
          title="Your visit room"
          subtitle={
            appointment.status === "completed"
              ? "Your clinician has completed your visit."
              : "Check your setup before joining."
          }
          footer={
            <Button
              onClick={() =>
                go(appointment.status === "completed" ? "complete" : "device")
              }
            >
              {appointment.status === "completed"
                ? "View visit details"
                : "Check my setup"}
            </Button>
          }
        >
          <AppointmentPanel state={state} appointment={appointment} />
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
            {interrupted
              ? "Connection interrupted"
              : "Connected · simulated visit"}
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
          <div className="care-video-name">{provider.name}</div>
          <div className="care-self-preview">
            {state.cameraOn ? (
              <span>{state.profile.firstName?.[0] || "Y"}</span>
            ) : (
              <VideoOff size={22} />
            )}
            <small>You</small>
          </div>
          {interrupted && (
            <div className="care-video-overlay">
              <WifiOff size={30} />
              <strong>Your room is still here</strong>
              <p>No need to start over</p>
            </div>
          )}
        </div>
        <div className="care-conversation" aria-live="polite">
          <h2>
            {interrupted ? "Your visit hasn’t ended" : conversation.title}
          </h2>
          <p>
            {interrupted
              ? "Try reconnecting. Your clinician can use your callback number if the connection doesn’t return."
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
          <button
            type="button"
            className="care-end-call"
            onClick={leave}
            disabled={busy}
          >
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
          <Notice>Leaving the room doesn’t mark a visit complete.</Notice>
        </Page>
      );
    const published = state.carePlan.status === "published";
    return (
      <Page
        className="care-complete"
        title="Your first visit, complete"
        subtitle={`Time for you, with ${provider.firstName}. A good beginning.`}
        footer={
          published ? (
            <Button onClick={() => go("followup")}>
              {state.followupAppointment &&
              state.followupAppointment.status !== "cancelled"
                ? "View your next visit"
                : "Choose a follow-up time"}
            </Button>
          ) : (
            returnHome
          )
        }
      >
        <div className="care-complete-mark">
          <Check size={31} />
        </div>
        <p className="care-completion-proof">
          {formatDate(appointment.start)} · {provider.name}
        </p>
        {published ? (
          <>
            <div className="care-plan">
              <h2>Your care plan</h2>
              <p>Published by {provider.firstName}</p>
              <button
                type="button"
                className="care-plan-summary"
                onClick={() => setShowPlan((value) => !value)}
                aria-expanded={showPlan}
              >
                <FileText size={22} />
                <span>
                  <strong>Your visit summary</strong>
                  <small>What we discussed and what’s next</small>
                </span>
                {showPlan ? (
                  <ChevronDown size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </button>
              {showPlan && (
                <div className="care-plan-detail">
                  <p>
                    You made space to talk about what brought you here, your
                    goals, and the questions you want to explore.
                  </p>
                  <p>
                    For your next conversation, bring any observations or
                    questions you’d like to discuss. Your care team is available
                    through Messages.
                  </p>
                </div>
              )}
            </div>
            <div className="care-followup-invitation">
              <CalendarDays size={23} />
              <div>
                <h2>
                  {state.followupAppointment &&
                  state.followupAppointment.status !== "cancelled"
                    ? "Your next visit is booked"
                    : "Keep the same connection"}
                </h2>
                <p>
                  {state.followupAppointment &&
                  state.followupAppointment.status !== "cancelled"
                    ? formatSlot(state.followupAppointment.slotId, {
                        short: true,
                      })
                    : `${provider.firstName} recommends a follow-up in ${state.carePlan.followupWeeks} weeks.`}
                </p>
                <small>{costDescription(state, true)}</small>
              </div>
            </div>
          </>
        ) : (
          <div className="care-plan-pending" role="status">
            <FileText size={27} />
            <h2>Your care plan is on its way</h2>
            <p>
              {provider.firstName} is finishing your visit summary. We’ll let
              you know when it’s ready; it will always be here in your portal.
            </p>
          </div>
        )}
        <CareLink
          icon={<MessageCircle size={20} />}
          title="Ask your care team"
          detail="Questions about your visit or next steps"
          onClick={() => go("portal-messages")}
        />
        <CareLink
          icon={<Heart size={20} />}
          title={
            state.feedbackSaved
              ? "Your feedback is saved"
              : "How did your visit feel?"
          }
          detail={
            state.feedbackSaved
              ? "Thank you for sharing your experience"
              : "A quick, optional check-in"
          }
          done={state.feedbackSaved}
          onClick={() => go("feedback")}
        />
      </Page>
    );
  }

  if (state.step === "followup") {
    if (
      appointment.status !== "completed" ||
      state.carePlan.status !== "published"
    )
      return (
        <Page
          title="Your next step, together"
          subtitle="Your clinician’s follow-up recommendation will appear with your care plan."
          footer={returnHome}
        >
          <Notice>
            Your visit and care plan stay available in your portal.
          </Notice>
        </Page>
      );
    if (
      state.followupAppointment &&
      state.followupAppointment.status !== "cancelled"
    )
      return (
        <Page
          title="Your next step is in place"
          subtitle={`More time with ${provider.firstName}, when you need it.`}
          footer={returnHome}
        >
          <AppointmentPanel
            state={state}
            appointment={state.followupAppointment}
            onCalendar={() => calendar(state.followupAppointment!)}
          />
          {statusNote}
          <Notice tone="success">
            Your follow-up is confirmed. Your reminders are scheduled.
          </Notice>
          <CareLink
            icon={<CalendarDays size={20} />}
            title="Manage your visits"
            detail="All your appointments in one place"
            onClick={() => go("portal-visits")}
          />
        </Page>
      );
    const options = followupSlots.filter(
      (slot) => slot.providerId === appointment.providerId,
    );
    const book = () =>
      void act(async () => {
        if (!followupId) throw new Error("Choose a time for your follow-up.");
        await api.bookFollowup(followupId);
        return true;
      });
    return (
      <Page
        title="Keep the same connection"
        subtitle={`${provider.firstName} recommends meeting again in ${state.carePlan.followupWeeks} weeks.`}
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
              {followupId === slot.id && <Check size={18} />}
            </button>
          ))}
        </div>
        <p className="care-quiet">
          All times in Central Time. No charge today; your saved payment method
          stays on file.
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
        update({ feedbackSaved: true });
        return true;
      });
      if (success) go("complete");
    };
    const contact = (changeProvider: boolean) => {
      update({
        careMessage: changeProvider
          ? "I’d like to discuss finding a different provider for my next visit."
          : "I’d like to talk about my first visit and what could feel better next time.",
      });
      go("portal-messages");
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
        {state.rating > 0 && state.rating <= 2 && (
          <div className="care-feedback-recovery">
            <h2>Let’s make the next step better</h2>
            <p>
              Your care team can help with a concern or a different provider.
            </p>
            <div>
              <button type="button" onClick={() => contact(false)}>
                Ask the care team
              </button>
              <button type="button" onClick={() => contact(true)}>
                Discuss another provider
              </button>
            </div>
          </div>
        )}
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
