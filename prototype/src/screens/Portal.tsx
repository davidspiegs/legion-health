import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CreditCard,
  FileHeart,
  HeartPulse,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircle,
  Pencil,
  Send,
  ShieldCheck,
  Video,
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
  CONDITION_OPTIONS,
  formatDate,
  formatPhone,
  formatTime,
  getProvider,
  toggleCondition,
} from "../model/fixtures";
import type { Appointment, ScreenProps } from "../model/types";
import { PaymentMethodEditor } from "./Checkout";
import "./portal.css";

const portalSteps = new Set([
  "portal-visits",
  "portal-messages",
  "portal-account",
  "portal-signin",
  "health-details",
]);

function messageTime(at: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

function VisitCard({
  appointment,
  children,
}: {
  appointment: Appointment;
  children?: ReactNode;
}) {
  const provider = getProvider(appointment.providerId);
  return (
    <article
      className={`portal-visit-card ${appointment.status === "cancelled" ? "is-cancelled" : ""}`}
    >
      <div className="portal-visit-topline">
        <span>{appointment.followup ? "Follow-up visit" : "First visit"}</span>
        <span className={`portal-status ${appointment.status}`}>
          {appointment.status === "completed"
            ? "Completed"
            : appointment.status === "cancelled"
              ? "Cancelled"
              : appointment.status === "joined" ||
                  appointment.status === "interrupted"
                ? "In progress"
                : "Confirmed"}
        </span>
      </div>
      <h2>{formatDate(appointment.start, true)}</h2>
      <p className="portal-visit-time">
        {formatTime(appointment.start)} CT{" "}
        <span>· {appointment.followup ? 30 : 60} min</span>
      </p>
      <div className="portal-visit-provider">
        <ProviderAvatar provider={provider} size="small" />
        <span>
          <strong>{provider.name}</strong>
          <small>{provider.title}</small>
        </span>
        <Video size={20} aria-label="Video visit" />
      </div>
      {children ? <div className="portal-visit-actions">{children}</div> : null}
    </article>
  );
}

export function PortalScreens(props: ScreenProps) {
  const {
    state,
    update,
    updateProfile,
    go,
    api,
    act,
    busy,
    setError,
    openHelp,
  } = props;
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [editingPayment, setEditingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const previousPaymentId = useRef<string | null>(null);
  const [contactEmail, setContactEmail] = useState(state.profile.email);
  const [contactPhone, setContactPhone] = useState(state.profile.phone);
  const [contactSaved, setContactSaved] = useState(false);
  const [signInEmail, setSignInEmail] = useState(state.profile.email);
  const [signInCode, setSignInCode] = useState("");
  const [reviewed, setReviewed] = useState(state.healthReviewed);
  const [medicationsOpen, setMedicationsOpen] = useState(
    Boolean(state.medications),
  );
  const [allergiesOpen, setAllergiesOpen] = useState(Boolean(state.allergies));
  const messageEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCancelling(null);
    setEditingContact(false);
    setEditingPayment(false);
    setPaymentSaved(false);
    previousPaymentId.current = null;
    setContactSaved(false);
    setContactEmail(state.profile.email);
    setContactPhone(state.profile.phone);
    setReviewed(state.healthReviewed);
    setMedicationsOpen(Boolean(state.medications));
    setAllergiesOpen(Boolean(state.allergies));
  }, [state.step]);

  useEffect(() => {
    if (
      !editingPayment &&
      previousPaymentId.current !== null &&
      state.paymentSetup.status === "succeeded" &&
      state.paymentSetup.method?.id !== previousPaymentId.current
    ) {
      setPaymentSaved(true);
      previousPaymentId.current = null;
    }
  }, [editingPayment, state.paymentSetup.status, state.paymentSetup.method?.id]);

  useEffect(() => {
    if (state.step !== "portal-messages") return;
    const scroller = messageEnd.current?.closest(".screen-main");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [state.step, state.careMessages?.length]);

  if (!portalSteps.has(state.step)) return null;

  if (state.step === "portal-visits") {
    const appointments = [state.appointment, state.followupAppointment].filter(
      (item): item is Appointment => Boolean(item),
    );
    const upcoming = appointments.filter(
      (item) => item.status !== "completed" && item.status !== "cancelled",
    );
    const previous = appointments.filter(
      (item) => item.status === "completed" || item.status === "cancelled",
    );
    const cancel = async () => {
      if (!cancelling) return;
      const success = await act(async () => {
        await api.cancelAppointment(cancelling.id);
        return true;
      });
      if (success) setCancelling(null);
    };
    return (
      <Page
        className="portal-screen"
        title="Your visits"
        subtitle="Your appointments and next steps, all together."
      >
        {cancelling ? (
          <div
            className="portal-cancel-panel"
            role="alertdialog"
            aria-labelledby="cancel-visit-title"
            aria-describedby="cancel-visit-detail"
          >
            <CalendarDays size={25} />
            <h2 id="cancel-visit-title">Cancel this appointment?</h2>
            <p id="cancel-visit-detail">
              Your {formatDate(cancelling.start, true)} appointment at{" "}
              {formatTime(cancelling.start)} CT will be cancelled and its
              reminders stopped.
            </p>
            <p>You can reschedule instead to keep your care moving.</p>
            <Button loading={busy} variant="danger" onClick={cancel}>
              Cancel appointment
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => setCancelling(null)}
            >
              Keep appointment
            </Button>
          </div>
        ) : null}
        <section className="portal-visit-group" aria-label="Upcoming visits">
          <h2 className="portal-section-title">Upcoming</h2>
          {upcoming.length ? (
            upcoming.map((appointment) => (
              <VisitCard key={appointment.id} appointment={appointment}>
                <Button
                  onClick={() =>
                    go(appointment.followup ? "followup" : "visit-home")
                  }
                >
                  View appointment <ArrowRight size={17} />
                </Button>
                {appointment.status === "confirmed" ? (
                  <div className="portal-inline-actions">
                    <button
                      type="button"
                      onClick={() => {
                        if (appointment.followup) {
                          update({
                            careMessage:
                              "I’d like to reschedule my follow-up appointment.",
                          });
                          go("portal-messages");
                        } else {
                          update({ bookingMode: "reschedule" });
                          go("slots");
                        }
                      }}
                    >
                      {appointment.followup
                        ? "Request a new time"
                        : "Reschedule"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelling(appointment)}
                    >
                      Cancel visit
                    </button>
                  </div>
                ) : null}
              </VisitCard>
            ))
          ) : (
            <div className="portal-empty">
              <CalendarDays size={28} />
              <h3>No upcoming appointments</h3>
              <p>
                {state.appointment?.status === "completed"
                  ? "Keep your care connected with a follow-up when you’re ready."
                  : "Choose a time that works for you when you’re ready to get started."}
              </p>
              <Button
                onClick={() => {
                  update({
                    bookingMode:
                      state.appointment?.status === "completed"
                        ? "followup"
                        : "first",
                  });
                  go(
                    state.appointment?.status === "completed"
                      ? "followup"
                      : "match",
                  );
                }}
              >
                {state.appointment?.status === "completed"
                  ? "Book a follow-up"
                  : "Find an appointment"}
              </Button>
            </div>
          )}
        </section>
        {previous.length ? (
          <section className="portal-visit-group" aria-label="Past visits">
            <h2 className="portal-section-title">Past visits</h2>
            {previous.map((appointment) => (
              <VisitCard key={appointment.id} appointment={appointment}>
                {appointment.status === "completed" ? (
                  <Button variant="secondary" onClick={() => go("complete")}>
                    View visit summary <ChevronRight size={17} />
                  </Button>
                ) : null}
              </VisitCard>
            ))}
          </section>
        ) : null}
      </Page>
    );
  }

  if (state.step === "portal-messages") {
    const send = async (event?: FormEvent) => {
      event?.preventDefault();
      if (!state.careMessage.trim() || busy) return;
      await act(() => api.sendCareMessage());
    };
    const messages = state.careMessages || [];
    return (
      <Page
        className="portal-screen portal-messages"
        title="Your care team"
        subtitle="A place for questions between visits."
        onSubmit={send}
        footer={
          <div className="portal-message-compose">
            <label htmlFor="portal-message">Message your care team</label>
            <div className="portal-compose-row">
              <textarea
                id="portal-message"
                value={state.careMessage}
                onChange={(event) =>
                  update({ careMessage: event.target.value })
                }
                placeholder="How can we help?"
                rows={2}
                maxLength={2000}
              />
              <Button
                type="submit"
                loading={busy}
                disabled={!state.careMessage.trim()}
                aria-label="Send message"
              >
                <Send size={19} />
              </Button>
            </div>
            <p>
              For immediate help, call <a href="tel:988">988</a>. If you’re in
              danger, call <a href="tel:911">911</a>.
            </p>
          </div>
        }
      >
        <div className="portal-team-note">
          <span>
            <MessageCircle size={20} />
          </span>
          <p>
            Your care team can help with scheduling, billing, and questions
            about your care. Messages aren’t monitored for emergencies.
          </p>
        </div>
        {messages.length ? (
          <div
            className="portal-thread"
            role="log"
            aria-label="Care team conversation"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.map((message) => (
              <article
                key={message.id}
                className={`portal-message ${message.sender} ${message.status}`}
              >
                <span className="portal-message-author">
                  {message.sender === "care-team" ? "Legion care team" : "You"}
                </span>
                <p>{message.body}</p>
                <div className="portal-message-meta">
                  <time dateTime={message.at}>{messageTime(message.at)}</time>
                  {message.sender === "patient" ? (
                    <span>
                      {message.status === "delivered" ? (
                        <>
                          <CheckCheck size={13} /> Delivered
                        </>
                      ) : message.status === "sending" ? (
                        "Sending…"
                      ) : (
                        "Not sent"
                      )}
                    </span>
                  ) : null}
                </div>
                {message.status === "failed" ? (
                  <button
                    type="button"
                    className="portal-message-retry"
                    onClick={() => update({ careMessage: message.body })}
                  >
                    Edit and try again
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="portal-message-welcome">
            <p>We’re here when you need us</p>
            <span>
              Send your first message below. Your conversation will stay here.
            </span>
          </div>
        )}
        <div ref={messageEnd} />
      </Page>
    );
  }

  if (state.step === "portal-account") {
    if (editingPayment)
      return (
        <PaymentMethodEditor
          {...props}
          onDone={() => setEditingPayment(false)}
        />
      );
    const saveContact = async (event?: FormEvent) => {
      event?.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
        setError("Enter a valid email address.");
        return;
      }
      if (contactPhone.replace(/\D/g, "").length !== 10) {
        setError("Enter a 10-digit phone number.");
        return;
      }
      const prior = { email: state.profile.email, phone: state.profile.phone };
      updateProfile({
        email: contactEmail.trim(),
        phone: contactPhone.replace(/\D/g, "").slice(0, 10),
      });
      const success = await act(async () => {
        await api.saveDraft("portal-contact");
        return true;
      });
      if (success) {
        setEditingContact(false);
        setContactSaved(true);
      } else updateProfile(prior);
    };
    const method = state.paymentSetup.method;
    if (editingContact)
      return (
        <Page
          className="portal-screen"
          title="Contact information"
          subtitle="Your visit links and care updates will come here."
          onSubmit={saveContact}
          footer={
            <>
              <Button type="submit" loading={busy}>
                Save changes
              </Button>
              <Button
                variant="text"
                disabled={busy}
                onClick={() => setEditingContact(false)}
              >
                Cancel
              </Button>
            </>
          }
        >
          <div className="portal-form-fields">
            <Field
              label="Email address"
              id="account-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="next"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  document.getElementById("account-phone")?.focus();
                }
              }}
            />
            <Field
              label="Phone number"
              id="account-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              enterKeyHint="done"
              value={contactPhone}
              onChange={(event) =>
                setContactPhone(formatPhone(event.target.value))
              }
              hint="A callback number if your video visit disconnects."
            />
          </div>
        </Page>
      );
    return (
      <Page
        className="portal-screen"
        title="Your account"
        subtitle="Keep your details and preferences up to date."
      >
        <div className="portal-account-identity">
          <span>
            {state.profile.firstName.charAt(0)}
            {state.profile.lastName.charAt(0)}
          </span>
          <div>
            <strong>
              {state.profile.firstName} {state.profile.lastName}
            </strong>
            <small>Legion Health patient</small>
          </div>
        </div>
        {contactSaved ? (
          <Notice tone="success">
            Your contact information has been updated.
          </Notice>
        ) : null}
        {paymentSaved ? (
          <Notice tone="success">Your payment method has been updated.</Notice>
        ) : null}
        <section className="portal-account-card">
          <div className="portal-card-title">
            <h2>Contact information</h2>
            <button
              type="button"
              aria-label="Edit contact information"
              onClick={() => {
                setContactEmail(state.profile.email);
                setContactPhone(state.profile.phone);
                setEditingContact(true);
                setContactSaved(false);
              }}
            >
              <Pencil size={17} /> Edit
            </button>
          </div>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{state.profile.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{formatPhone(state.profile.phone)}</dd>
            </div>
          </dl>
        </section>
        <section className="portal-account-card">
          <div className="portal-card-title">
            <h2>Payment method</h2>
            <CreditCard size={20} />
          </div>
          {method ? (
            <div className="portal-saved-card">
              <span>
                <CreditCard size={24} />
              </span>
              <div>
                <strong>
                  {method.brand} ending in {method.last4}
                </strong>
                <small>
                  Expires {String(method.expMonth).padStart(2, "0")}/
                  {String(method.expYear).slice(-2)}
                </small>
              </div>
            </div>
          ) : (
            <p>No payment method is saved.</p>
          )}
          <p className="portal-card-note">
            {method
              ? "Saved for visit payments. No visit fee was charged when you booked."
              : "Your payment method will be saved when you confirm an appointment."}
          </p>
          {method ? (
            <button
              type="button"
              className="portal-text-link"
              onClick={() => {
                previousPaymentId.current = method.id;
                setPaymentSaved(false);
                setContactSaved(false);
                setError("");
                setEditingPayment(true);
              }}
            >
              Change card <ChevronRight size={16} />
            </button>
          ) : null}
        </section>
        <section className="portal-account-card">
          <div className="portal-card-title">
            <h2>Coverage</h2>
            <ShieldCheck size={20} />
          </div>
          <p className="portal-coverage-name">
            {state.coverage === "selfpay"
              ? "Self-pay"
              : state.payer || "Health insurance"}
          </p>
          <p className="portal-card-note">
            {state.coverage === "selfpay"
              ? "$250 for your first visit · $150 for follow-ups"
              : state.eligibility.status === "verified"
                ? "Active coverage confirmed. Your final cost depends on your plan and claim."
                : "Your benefits still need to be confirmed."}
          </p>
          <button
            type="button"
            className="portal-text-link"
            onClick={() => {
              update({ careMessage: "I have a question about my coverage." });
              go("portal-messages");
            }}
          >
            Ask about coverage <ChevronRight size={16} />
          </button>
        </section>
        <button
          type="button"
          className="portal-setting-row"
          onClick={() => go("reminders")}
        >
          <Bell size={21} />
          <span>
            <strong>Reminders</strong>
            <small>Choose how we contact you</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="portal-setting-row" onClick={openHelp}>
          <MessageCircle size={21} />
          <span>
            <strong>Get help</strong>
            <small>Talk to the care team</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="portal-signout"
          onClick={() => {
            api.signOut();
            go("portal-signin");
          }}
        >
          <LogOut size={18} /> Sign out
        </button>
      </Page>
    );
  }

  if (state.step === "portal-signin") {
    const sent = state.portalAuth.status === "code_sent";
    const expired = state.portalAuth.status === "expired";
    const requestCode = async (event?: FormEvent) => {
      event?.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signInEmail.trim())) {
        setError("Enter the email address you used to book.");
        return;
      }
      const success = await act(async () => {
        await api.requestSignIn(signInEmail.trim());
        return true;
      });
      if (success) setSignInCode("");
    };
    const verifyCode = async (event?: FormEvent) => {
      event?.preventDefault();
      if (signInCode.length !== 6) {
        setError("Enter the 6-digit code from your email.");
        return;
      }
      const success = await act(async () => {
        await api.verifySignIn(signInCode);
        return true;
      });
      if (success) go("visit-home");
    };
    return (
      <Page
        className="portal-screen portal-signin"
        title={
          sent
            ? "Check your email"
            : expired
              ? "Let’s get you back in"
              : "Welcome back"
        }
        subtitle={
          sent ? (
            <>
              Enter the code sent to <strong>{signInEmail}</strong>.
            </>
          ) : (
            "Sign in to see your visits, messages, and care plan."
          )
        }
        onSubmit={sent ? verifyCode : requestCode}
        footer={
          <>
            <Button
              type="submit"
              loading={busy}
              disabled={sent && signInCode.length !== 6}
            >
              {sent ? "Sign in" : "Send sign-in code"}
            </Button>
            <p className="portal-secure-note">
              <LockKeyhole size={14} /> Secure access, without a password
            </p>
          </>
        }
      >
        <div className="portal-signin-icon">
          {sent ? <Mail size={28} /> : <LockKeyhole size={28} />}
        </div>
        {expired ? (
          <Notice>
            Your sign-in code expired. Request a new one to continue.
          </Notice>
        ) : null}
        {sent ? (
          <>
            <Field
              label="6-digit code"
              id="signin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="done"
              maxLength={6}
              value={signInCode}
              onChange={(event) =>
                setSignInCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              hint="Your code is valid for 10 minutes."
            />
            <div className="portal-signin-links">
              <button
                type="button"
                disabled={busy}
                onClick={() => requestCode()}
              >
                Send a new code
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  update({
                    portalAuth: { status: "signed_out", codeExpiresAt: null },
                  });
                  setSignInCode("");
                  setError("");
                }}
              >
                Use a different email
              </button>
            </div>
          </>
        ) : (
          <Field
            label="Email address"
            id="signin-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="done"
            value={signInEmail}
            onChange={(event) => setSignInEmail(event.target.value)}
            hint="Use the email address you booked with."
          />
        )}
      </Page>
    );
  }

  if (state.step === "health-details") {
    const save = async (event?: FormEvent) => {
      event?.preventDefault();
      if (!reviewed) {
        setError(
          "Confirm you’ve reviewed your health information to continue.",
        );
        return;
      }
      const success = await act(async () => {
        await api.saveHealthDetails();
        return true;
      });
      if (success)
        go(state.history.at(-1) === "device" ? "device" : "visit-home");
    };
    return (
      <Page
        className="portal-screen portal-health"
        title="Help your provider prepare"
        subtitle="Review what you shared. You can talk through anything you’re unsure about during your visit."
        onSubmit={save}
        footer={
          <Button type="submit" loading={busy} disabled={!reviewed}>
            Save and continue <Check size={18} />
          </Button>
        }
      >
        <section
          className="portal-health-section"
          aria-labelledby="health-conditions-title"
        >
          <div className="portal-health-label">
            <HeartPulse size={20} />
            <h2 id="health-conditions-title">What brings you in</h2>
          </div>
          <p>Select all that apply.</p>
          <div className="portal-condition-pills">
            {CONDITION_OPTIONS.map((condition) => (
              <label
                key={condition}
                className={
                  state.conditions.includes(condition) ? "selected" : ""
                }
              >
                <input
                  type="checkbox"
                  checked={state.conditions.includes(condition)}
                  onChange={() => {
                    update({
                      conditions: toggleCondition(state.conditions, condition),
                      healthReviewed: false,
                    });
                    setReviewed(false);
                  }}
                />
                <span>{condition}</span>
                {state.conditions.includes(condition) ? (
                  <Check size={14} />
                ) : null}
              </label>
            ))}
          </div>
        </section>
        <details
          className="portal-health-optional"
          open={medicationsOpen}
          onToggle={(event) => setMedicationsOpen(event.currentTarget.open)}
        >
          <summary>
            <span>
              Current medications
              <small>Optional · names and doses, if you know them</small>
            </span>
            <Pencil size={17} />
          </summary>
          <div>
            <label
              htmlFor="health-medications"
              className="portal-visually-hidden"
            >
              Current medications
            </label>
            <textarea
              id="health-medications"
              rows={2}
              maxLength={1000}
              value={state.medications}
              onChange={(event) => {
                update({
                  medications: event.target.value,
                  healthReviewed: false,
                });
                setReviewed(false);
              }}
              placeholder="Medications, vitamins, or supplements"
            />
          </div>
        </details>
        <details
          className="portal-health-optional"
          open={allergiesOpen}
          onToggle={(event) => setAllergiesOpen(event.currentTarget.open)}
        >
          <summary>
            <span>
              Allergies
              <small>Optional · helps your provider plan safe treatment</small>
            </span>
            <Pencil size={17} />
          </summary>
          <div>
            <label
              htmlFor="health-allergies"
              className="portal-visually-hidden"
            >
              Allergies
            </label>
            <textarea
              id="health-allergies"
              rows={2}
              maxLength={1000}
              value={state.allergies}
              onChange={(event) => {
                update({
                  allergies: event.target.value,
                  healthReviewed: false,
                });
                setReviewed(false);
              }}
              placeholder="Known allergies, or none"
            />
          </div>
        </details>
        <div className="portal-health-review">
          <FileHeart size={20} />
          <p>
            You don’t need to remember everything. Your provider will review
            this with you.
          </p>
        </div>
        <CheckRow checked={reviewed} onChange={setReviewed}>
          I’ve reviewed my health information
        </CheckRow>
      </Page>
    );
  }

  return null;
}
