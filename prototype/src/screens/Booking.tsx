import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  ShieldCheck,
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
  formatDate,
  formatPhone,
  formatSlot,
  formatTime,
  getProvider,
  getSlot,
  normalizeConditions,
  providers,
  slots,
  validateBirth,
} from "../model/fixtures";
import type { ScreenProps, Step } from "../model/types";
import "./booking.css";

type FieldErrors = Record<string, string>;
const payerOptions = [
  "Aetna",
  "Blue Cross Blue Shield",
  "Cigna",
  "UnitedHealthcare",
  "Other insurance",
];

function phoneEdit(
  previous: string,
  raw: string,
  position: number,
  inputType: string,
) {
  const allDigits = raw.replace(/\D/g, "");
  const hasCountryCode = allDigits.length === 11 && allDigits.startsWith("1");
  let digits = (hasCountryCode ? allDigits.slice(1) : allDigits).slice(0, 10);
  let digitPosition = raw.slice(0, position).replace(/\D/g, "").length;
  if (hasCountryCode) digitPosition = Math.max(0, digitPosition - 1);
  // Deleting a formatting character should remove the adjacent digit, not trap
  // the caret behind a parenthesis or hyphen that immediately reappears.
  if (
    digits === previous &&
    inputType === "deleteContentBackward" &&
    digitPosition > 0
  ) {
    digits = digits.slice(0, digitPosition - 1) + digits.slice(digitPosition);
    digitPosition--;
  } else if (digits === previous && inputType === "deleteContentForward") {
    digits = digits.slice(0, digitPosition) + digits.slice(digitPosition + 1);
  }
  const formatted = formatPhone(digits);
  let caret = 0,
    seen = 0;
  while (caret < formatted.length && seen < digitPosition) {
    if (/\d/.test(formatted[caret])) seen++;
    caret++;
  }
  return { digits, caret };
}

export function BookingScreens(props: ScreenProps) {
  const { state, update, updateProfile, go, api, busy, act } = props;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [day, setDay] = useState("");
  const [showAgreements, setShowAgreements] = useState(false);
  const [holdExpired, setHoldExpired] = useState(false);
  const directoryRequested = useRef(false);
  const profile = state.profile;
  const provider = getProvider(state.providerId);
  const providerSlots = slots.filter(
    (slot) => slot.providerId === state.providerId,
  );
  const hasAccount = state.events.some(
    (event) =>
      event.service === "Auth" &&
      event.operation === "account.created" &&
      event.outcome === "success",
  );
  const selectedConditions = normalizeConditions(state.conditions);
  const unrepresentedConditions = selectedConditions.filter(
    (condition) =>
      condition !== "I'm not sure" &&
      condition !== "Other" &&
      !providers.some((item) => item.focuses.includes(condition)),
  );
  const isUnavailable = (id: string) =>
    state.faultsUsed.includes(`unavailable-slot:${id}`);
  const selectedTimeAvailable = !!state.slotId && !isUnavailable(state.slotId);

  useEffect(() => {
    setErrors({});
  }, [state.step]);
  useEffect(() => {
    if (
      state.step === "match" &&
      !directoryRequested.current &&
      !state.events.some(
        (event) =>
          event.service === "Scheduling" &&
          event.operation === "directory.loaded" &&
          event.outcome === "success",
      )
    ) {
      directoryRequested.current = true;
      void act(() => api.getProviders());
    }
  }, [state.step, state.events, act, api]);
  useEffect(() => {
    if (state.step === "slots")
      setDay(
        state.slotId
          ? getSlot(state.slotId).start.slice(0, 10)
          : providerSlots[0].start.slice(0, 10),
      );
  }, [state.step, state.providerId]);
  useEffect(() => {
    if (
      (state.step === "slots" || state.step === "match") &&
      state.slotId &&
      state.faultsUsed.includes(`unavailable-slot:${state.slotId}`)
    )
      update({ slotId: "", reservation: null });
  }, [state.step, state.slotId, state.faultsUsed, update]);
  useEffect(() => {
    if (state.step !== "review" || !state.reservation) {
      setHoldExpired(false);
      return;
    }
    const remaining = state.reservation.expiresAt - Date.now();
    setHoldExpired(remaining <= 0);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setHoldExpired(true), remaining + 20);
    return () => window.clearTimeout(timer);
  }, [state.step, state.reservation?.expiresAt]);

  function changePhone(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const { digits, caret } = phoneEdit(
      profile.phone,
      input.value,
      input.selectionStart ?? input.value.length,
      (event.nativeEvent as InputEvent).inputType || "",
    );
    updateProfile({ phone: digits });
    requestAnimationFrame(() => {
      if (document.activeElement === input)
        input.setSelectionRange(caret, caret);
    });
  }

  function invalid(field: string, message: string) {
    setErrors({ [field]: message });
    requestAnimationFrame(() => document.getElementById(field)?.focus());
    return false;
  }
  function nextField(event: KeyboardEvent<HTMLInputElement>, id: string) {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById(id)?.focus();
    }
  }
  async function saveThen(next: Step, stage: string) {
    const saved = await act(async () => {
      await api.saveDraft(stage);
      return true;
    });
    if (saved) go(next);
  }
  const submit =
    (work: () => void | Promise<void>) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!busy) {
        setErrors({});
        void work();
      }
    };
  const context = (
    <AppointmentContext state={state} onEdit={() => go("slots")} />
  );
  const infoFooter = (label = "Continue", hint?: string) => (
    <>
      <Button type="submit" loading={busy}>
        {label}
      </Button>
      {hint ? <p className="footer-note">{hint}</p> : null}
    </>
  );
  const price =
    state.coverage === "selfpay"
      ? "Self-pay · $250 first visit"
      : state.eligibility.status === "verified"
        ? `Estimated copay · $${state.eligibility.estimate}`
        : "Using insurance · cost checked before confirmation";

  async function continueFromSlot() {
    if (!selectedTimeAvailable) {
      props.setError("Choose an available appointment time to continue.");
      return;
    }
    if (state.bookingMode === "reschedule") {
      const changed = await act(async () => {
        await api.reschedule(state.slotId);
        return true;
      });
      if (changed) go("visit-home");
      return;
    }
    if (hasAccount) {
      const reservation = await act(() =>
        api.reserve(state.providerId, state.slotId),
      );
      if (reservation) go("review");
      return;
    }
    go("name");
  }

  if (state.step === "match")
    return (
      <Page
        className="booking-match"
        title="Care that fits you"
        subtitle="Compare their areas of focus and find a time that works for you."
        footer={
          <>
            <Button
              loading={busy}
              onClick={() =>
                selectedTimeAvailable ? void continueFromSlot() : go("slots")
              }
            >
              {selectedTimeAvailable
                ? "Continue with this time"
                : "Choose a time"}
            </Button>
            <p className="footer-note">
              Times in Central Time · 60-minute first visit
            </p>
          </>
        }
      >
        <div className="booking-price">
          <CreditCard size={19} aria-hidden="true" />
          <span>{price}</span>
        </div>
        {unrepresentedConditions.length ? (
          <Notice>
            These profiles don’t list {unrepresentedConditions.join(" or ")}. We
            can help confirm the right experience for you.
            <button
              className="booking-text-button"
              type="button"
              onClick={props.openHelp}
            >
              Ask our care team
            </button>
          </Notice>
        ) : null}
        <div className="provider-list">
          {providers.map((item) => {
            const selected = item.id === state.providerId;
            const sharedFocuses = item.focuses.filter((focus) =>
              selectedConditions.includes(focus),
            );
            const available = slots.filter(
              (slot) => slot.providerId === item.id && !isUnavailable(slot.id),
            );
            const firstDay = available[0].start.slice(0, 10);
            return (
              <article
                className={`provider-card ${selected ? "active" : ""}`}
                key={item.id}
              >
                <button
                  type="button"
                  className="provider-overview"
                  aria-pressed={selected}
                  onClick={() =>
                    update({
                      providerId: item.id,
                      slotId: "",
                      reservation: null,
                    })
                  }
                >
                  <ProviderAvatar
                    provider={item}
                    size={selected ? "large" : "small"}
                  />
                  <span className="provider-text">
                    <strong>{item.name}</strong>
                    <small>{item.title}</small>
                    <span className="provider-location">
                      <MapPin size={12} aria-hidden="true" />
                      Licensed in Texas
                    </span>
                    <span className="provider-focuses">
                      {[...item.focuses]
                        .sort(
                          (a, b) =>
                            Number(selectedConditions.includes(b)) -
                            Number(selectedConditions.includes(a)),
                        )
                        .slice(0, 2)
                        .map((focus) => (
                          <span
                            key={focus}
                            aria-label={
                              selectedConditions.includes(focus)
                                ? `${focus}, one of the areas you selected`
                                : undefined
                            }
                          >
                            {focus}
                          </span>
                        ))}
                    </span>
                  </span>
                  {!selected ? (
                    <ChevronRight size={20} aria-hidden="true" />
                  ) : null}
                </button>
                {selected ? (
                  <>
                    <p className="provider-description">
                      {sharedFocuses.length
                        ? `Experience with ${new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(sharedFocuses)}, from the areas you selected.`
                        : item.description}
                    </p>
                    <p className="provider-next">
                      <CalendarDays size={16} aria-hidden="true" />
                      Next available {formatDate(available[0], true)}
                    </p>
                    <div className="quick-slots">
                      {available
                        .filter((slot) => slot.start.startsWith(firstDay))
                        .slice(0, 3)
                        .map((slot) => (
                          <button
                            type="button"
                            className={`time-choice ${state.slotId === slot.id ? "selected" : ""}`}
                            aria-pressed={state.slotId === slot.id}
                            key={slot.id}
                            onClick={() =>
                              update({ slotId: slot.id, reservation: null })
                            }
                          >
                            {formatTime(slot)}
                          </button>
                        ))}
                    </div>
                    <button
                      type="button"
                      className="booking-text-button"
                      onClick={() => go("slots")}
                    >
                      More times <ChevronRight size={14} />
                    </button>
                  </>
                ) : (
                  <p className="provider-next compact">
                    <CalendarDays size={16} aria-hidden="true" />
                    Next available {formatDate(available[0], true)}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </Page>
    );

  if (state.step === "slots") {
    const days = [
      ...new Set(providerSlots.map((slot) => slot.start.slice(0, 10))),
    ];
    const selectedDay = days.includes(day) ? day : days[0];
    return (
      <Page
        className="booking-slots"
        title={
          state.bookingMode === "reschedule"
            ? "Find a better time"
            : "Make time for you"
        }
        subtitle={
          state.bookingMode === "reschedule"
            ? "Your current visit stays booked until you confirm a new time."
            : "Choose your first 60-minute video visit."
        }
        footer={
          <>
            <Button
              disabled={!selectedTimeAvailable}
              loading={busy}
              onClick={() => void continueFromSlot()}
            >
              {state.bookingMode === "reschedule"
                ? "Confirm new time"
                : "Continue with this time"}
            </Button>
            <p className="footer-note">
              {state.bookingMode === "reschedule"
                ? "Your visit stays with the same clinician"
                : "A selected time is not booked yet"}
            </p>
          </>
        }
      >
        <div className="slot-provider">
          <ProviderAvatar provider={provider} size="small" />
          <span>
            <strong>{provider.name}</strong>
            <small>{provider.title}</small>
          </span>
        </div>
        <div className="slot-timezone">
          <Clock3 size={16} />
          <span>All times in Central Time (CT)</span>
        </div>
        <div className="date-picker" role="group" aria-label="Appointment date">
          {days.map((date) => {
            const sample = providerSlots.find((slot) =>
              slot.start.startsWith(date),
            )!;
            const parsed = new Date(sample.start);
            return (
              <button
                type="button"
                className={`date-choice ${selectedDay === date ? "selected" : ""}`}
                key={date}
                aria-pressed={selectedDay === date}
                onClick={() => setDay(date)}
              >
                <small>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/Chicago",
                    weekday: "short",
                  }).format(parsed)}
                </small>
                <strong>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/Chicago",
                    day: "numeric",
                  }).format(parsed)}
                </strong>
                <small>October</small>
              </button>
            );
          })}
        </div>
        <h2 className="booking-section-title">
          {formatDate(
            providerSlots.find((slot) => slot.start.startsWith(selectedDay))!,
            true,
          )}
        </h2>
        <div className="slot-grid">
          {providerSlots
            .filter((slot) => slot.start.startsWith(selectedDay))
            .map((slot) => (
              <button
                type="button"
                key={slot.id}
                disabled={isUnavailable(slot.id)}
                className={`time-choice ${state.slotId === slot.id && !isUnavailable(slot.id) ? "selected" : ""} ${isUnavailable(slot.id) ? "unavailable" : ""}`}
                aria-pressed={
                  state.slotId === slot.id && !isUnavailable(slot.id)
                }
                onClick={() => update({ slotId: slot.id, reservation: null })}
              >
                {formatTime(slot)}
                {isUnavailable(slot.id) ? (
                  <small>Unavailable</small>
                ) : state.slotId === slot.id ? (
                  <Check size={16} />
                ) : null}
              </button>
            ))}
        </div>
        {providerSlots.some((slot) => isUnavailable(slot.id)) ? (
          <p className="booking-small">
            A time was just taken. Choose another; your details are saved.
          </p>
        ) : null}
        {selectedTimeAvailable ? (
          <div className="selected-time">
            <Check size={17} />
            <span>{formatSlot(state.slotId, { short: true })}</span>
          </div>
        ) : null}
        <p className="booking-small">
          {state.coverage === "selfpay"
            ? "$250 first visit · $150 follow-up visits"
            : "Your estimated visit cost will appear before you confirm."}
        </p>
      </Page>
    );
  }

  if (state.step === "name")
    return (
      <Page
        className="booking-info"
        title="What’s your name?"
        subtitle="Use the name on your ID so we can keep your care records together."
        onSubmit={submit(async () => {
          if (!profile.firstName.trim()) {
            invalid("first-name", "Enter your first name.");
            return;
          }
          if (!profile.lastName.trim()) {
            invalid("last-name", "Enter your last name.");
            return;
          }
          await saveThen("birth", "name");
        })}
        footer={infoFooter()}
      >
        {context}
        <div className="booking-fields">
          <Field
            id="first-name"
            label="First name"
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="next"
            value={profile.firstName}
            error={errors["first-name"]}
            onKeyDown={(event) => nextField(event, "last-name")}
            onChange={(event) =>
              updateProfile({ firstName: event.target.value })
            }
          />
          <Field
            id="last-name"
            label="Last name"
            autoComplete="family-name"
            autoCapitalize="words"
            enterKeyHint="go"
            value={profile.lastName}
            error={errors["last-name"]}
            onChange={(event) =>
              updateProfile({ lastName: event.target.value })
            }
          />
        </div>
      </Page>
    );

  if (state.step === "birth")
    return (
      <Page
        className="booking-info"
        title="When were you born?"
        subtitle="So your clinician and health records match the right person."
        onSubmit={submit(async () => {
          const issue = validateBirth(profile);
          if (issue) {
            invalid("birth-month", issue);
            return;
          }
          await saveThen("address", "date-of-birth");
        })}
        footer={infoFooter()}
      >
        {context}
        <div className="birth-fields">
          <Field
            id="birth-month"
            label="Month"
            placeholder="MM"
            inputMode="numeric"
            autoComplete="bday-month"
            enterKeyHint="next"
            maxLength={2}
            value={profile.month}
            error={errors["birth-month"]}
            onKeyDown={(event) => nextField(event, "birth-day")}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "").slice(0, 2);
              updateProfile({ month: value });
              if (value.length === 2)
                document.getElementById("birth-day")?.focus();
            }}
          />
          <Field
            id="birth-day"
            label="Day"
            placeholder="DD"
            inputMode="numeric"
            autoComplete="bday-day"
            enterKeyHint="next"
            maxLength={2}
            value={profile.day}
            onKeyDown={(event) => nextField(event, "birth-year")}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "").slice(0, 2);
              updateProfile({ day: value });
              if (value.length === 2)
                document.getElementById("birth-year")?.focus();
            }}
          />
          <Field
            id="birth-year"
            label="Year"
            placeholder="YYYY"
            inputMode="numeric"
            autoComplete="bday-year"
            enterKeyHint="go"
            maxLength={4}
            value={profile.year}
            onChange={(event) =>
              updateProfile({
                year: event.target.value.replace(/\D/g, "").slice(0, 4),
              })
            }
          />
        </div>
        <p className="booking-small">Month / day / year</p>
      </Page>
    );

  if (state.step === "address")
    return (
      <Page
        className="booking-info booking-address"
        title="Where do you live?"
        subtitle="Your home address connects your visit to the right care and coverage."
        onSubmit={submit(async () => {
          if (!profile.address.trim()) {
            invalid("street-address", "Enter your street address.");
            return;
          }
          if (!profile.city.trim()) {
            invalid("address-city", "Enter your city.");
            return;
          }
          if (!/^\d{5}$/.test(profile.zip)) {
            invalid("address-zip", "Enter a 5-digit ZIP code.");
            return;
          }
          await saveThen(
            state.coverage === "insurance" ? "insurance" : "email",
            "address",
          );
        })}
        footer={infoFooter()}
      >
        {context}
        <div className="booking-fields">
          <Field
            id="street-address"
            label="Street address"
            placeholder="Street address, apartment or unit"
            autoComplete="street-address"
            enterKeyHint="next"
            value={profile.address}
            error={errors["street-address"]}
            onKeyDown={(event) => nextField(event, "address-city")}
            onChange={(event) => updateProfile({ address: event.target.value })}
          />
          <div className="address-fields">
            <Field
              id="address-city"
              label="City"
              autoComplete="address-level2"
              enterKeyHint="next"
              value={profile.city}
              error={errors["address-city"]}
              onKeyDown={(event) => nextField(event, "address-zip")}
              onChange={(event) => updateProfile({ city: event.target.value })}
            />
            <Field
              id="address-zip"
              label="ZIP code"
              inputMode="numeric"
              autoComplete="postal-code"
              enterKeyHint="go"
              maxLength={5}
              value={profile.zip}
              error={errors["address-zip"]}
              onChange={(event) =>
                updateProfile({
                  zip: event.target.value.replace(/\D/g, "").slice(0, 5),
                })
              }
            />
          </div>
        </div>
        <p className="address-state">
          <MapPin size={14} /> Texas <span>Based on your care location</span>
        </p>
      </Page>
    );

  if (state.step === "insurance")
    return (
      <Page
        className="booking-info booking-insurance"
        title="Let’s check your coverage"
        subtitle="A few details from your insurance card help estimate your visit cost."
        onSubmit={submit(async () => {
          if (state.eligibility.status === "verified") {
            await saveThen("email", "insurance");
            return;
          }
          if (!state.payer) {
            invalid("insurance-payer", "Choose your insurance provider.");
            return;
          }
          if (!state.memberId.trim()) {
            invalid("insurance-member", "Enter your member ID.");
            return;
          }
          await act(() => api.checkEligibility());
        })}
        footer={
          <>
            {infoFooter(
              state.eligibility.status === "verified"
                ? "Continue"
                : state.eligibility.status === "pending"
                  ? "Check again"
                  : "Check my coverage",
            )}
            {state.eligibility.status === "pending" ? (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    update({
                      coverage: "selfpay",
                      eligibility: { status: "unverified", estimate: null },
                    });
                    void saveThen("email", "self-pay-choice");
                  }}
                >
                  Choose self-pay · $250 first visit
                </Button>
                <button
                  className="booking-text-button"
                  type="button"
                  onClick={props.openHelp}
                >
                  Get help with my coverage
                </button>
              </>
            ) : null}
          </>
        }
      >
        {context}
        <div className="booking-fields">
          <div
            className={`field ${errors["insurance-payer"] ? "invalid" : ""}`}
          >
            <label htmlFor="insurance-payer">Insurance provider</label>
            <select
              id="insurance-payer"
              value={state.payer}
              aria-invalid={!!errors["insurance-payer"]}
              aria-describedby={
                errors["insurance-payer"] ? "insurance-payer-error" : undefined
              }
              onChange={(event) =>
                update({
                  payer: event.target.value,
                  eligibility: { status: "unverified", estimate: null },
                })
              }
            >
              <option value="">Choose your insurance</option>
              {payerOptions.map((payer) => (
                <option key={payer}>{payer}</option>
              ))}
            </select>
            {errors["insurance-payer"] ? (
              <p
                className="field-error"
                id="insurance-payer-error"
                role="alert"
              >
                {errors["insurance-payer"]}
              </p>
            ) : null}
          </div>
          <Field
            id="insurance-member"
            label="Member ID"
            placeholder="As shown on your card"
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
            value={state.memberId}
            error={errors["insurance-member"]}
            onChange={(event) =>
              update({
                memberId: event.target.value,
                eligibility: { status: "unverified", estimate: null },
              })
            }
          />
        </div>
        {state.eligibility.status === "verified" ? (
          <Notice tone="success">
            <strong>Estimated copay: ${state.eligibility.estimate}</strong>
            <span>
              An estimate based on your benefits. Final cost depends on your
              plan.
            </span>
          </Notice>
        ) : state.eligibility.status === "pending" ? (
          <Notice tone="warning">
            <strong>Your coverage is still being checked</strong>
            <span>
              We haven’t verified a copay. Try again, get help, or choose
              self-pay. Your answers are saved.
            </span>
          </Notice>
        ) : (
          <p className="booking-small">
            <ShieldCheck size={15} /> Only used to check your health benefits
          </p>
        )}
      </Page>
    );

  if (state.step === "email")
    return (
      <Page
        className="booking-info"
        title="What’s your email?"
        subtitle="Your visit details and a secure way back."
        onSubmit={submit(async () => {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
            invalid("contact-email", "Enter a valid email address.");
            return;
          }
          updateProfile({ email: profile.email.trim() });
          await saveThen("phone", "email");
        })}
        footer={infoFooter("Continue", "Next: phone number")}
      >
        {context}
        <div className="booking-fields">
          <Field
            id="contact-email"
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="you@example.com"
            value={profile.email}
            error={errors["contact-email"]}
            onChange={(event) => updateProfile({ email: event.target.value })}
          />
          <p className="field-hint">
            A secure sign-in link, with no password to remember.
          </p>
        </div>
      </Page>
    );

  if (state.step === "phone")
    return (
      <Page
        className="booking-info"
        title="What’s your phone number?"
        subtitle="So your care team can reach you if a visit needs attention."
        onSubmit={submit(async () => {
          if (profile.phone.replace(/\D/g, "").length !== 10) {
            invalid("contact-phone", "Enter a 10-digit US phone number.");
            return;
          }
          const ready = await act(async () => {
            await api.saveDraft("phone");
            await api.createAccount();
            await api.reserve(state.providerId, state.slotId);
            return true;
          });
          if (ready) go("review");
        })}
        footer={
          <>
            {infoFooter("Review my visit")}
            {hasAccount && props.error ? (
              <button
                className="booking-text-button"
                type="button"
                onClick={() => go("slots")}
              >
                Choose another appointment time
              </button>
            ) : null}
          </>
        }
      >
        {context}
        <div className="booking-fields">
          <Field
            id="contact-phone"
            label="US phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            enterKeyHint="go"
            placeholder="(202) 555-0147"
            value={formatPhone(profile.phone)}
            error={errors["contact-phone"]}
            onChange={changePhone}
          />
          <CheckRow
            checked={profile.sms}
            onChange={(sms) => updateProfile({ sms })}
            detail="Optional. Message and data rates may apply. You can opt out anytime."
          >
            Text me appointment reminders
          </CheckRow>
          <p className="booking-small">
            Email reminders are available either way.
          </p>
        </div>
      </Page>
    );

  if (state.step === "review")
    return (
      <Page
        className="booking-review"
        title="Your first step, all set"
        subtitle="One last look before you book."
        onSubmit={submit(async () => {
          if (
            state.coverage === "insurance" &&
            state.eligibility.status !== "verified"
          ) {
            go("insurance");
            return;
          }
          if (!state.paymentReady) {
            props.setError("Add a payment method before confirming.");
            return;
          }
          if (!state.agreements) {
            invalid(
              "booking-agreements",
              "Review the care and booking details before confirming.",
            );
            return;
          }
          const appointment = await act(() => api.confirm());
          if (appointment) go("confirmed");
        })}
        footer={
          <>
            {!state.reservation || holdExpired ? (
              <>
                <Button
                  loading={busy}
                  onClick={() =>
                    void act(() => api.reserve(state.providerId, state.slotId))
                  }
                >
                  Recheck this time
                </Button>
                <button
                  className="booking-text-button"
                  type="button"
                  onClick={() => go("slots")}
                >
                  Choose another time
                </button>
              </>
            ) : (
              <Button type="submit" loading={busy}>
                Confirm my first visit
              </Button>
            )}
            <p className="footer-note">Test mode · no charge</p>
          </>
        }
      >
        <div className="review-appointment">
          <ProviderAvatar provider={provider} size="small" />
          <div>
            <strong>{provider.name}</strong>
            <span>{formatDate(state.slotId, true)}</span>
            <span>{formatTime(state.slotId)} CT · 60-minute video visit</span>
          </div>
          <button
            className="booking-edit"
            type="button"
            onClick={() => go("slots")}
          >
            Edit
          </button>
        </div>
        {!state.reservation || holdExpired ? (
          <Notice>
            Your temporary hold has ended. Your details are saved—recheck this
            time before confirming.
          </Notice>
        ) : null}
        <div className="review-cost">
          <div>
            <span>
              {state.coverage === "selfpay"
                ? "Your first visit"
                : state.eligibility.status === "verified"
                  ? "Estimated copay"
                  : "Your visit cost"}
            </span>
            <strong>
              {state.coverage === "selfpay"
                ? "$250"
                : state.eligibility.status === "verified"
                  ? `$${state.eligibility.estimate}`
                  : "Pending"}
            </strong>
          </div>
          <p>
            {state.coverage === "selfpay"
              ? "Self-pay · $150 for future follow-up visits"
              : state.eligibility.status === "verified"
                ? `${state.payer} · an estimate, subject to your plan`
                : `${state.payer} · coverage verification is still pending. Your care team will confirm the cost before your visit.`}
          </p>
        </div>
        <button
          type="button"
          className={`demo-payment ${state.paymentReady ? "ready" : ""}`}
          disabled={busy || state.paymentReady}
          onClick={() =>
            void act(async () => {
              await api.setupPayment();
              return true;
            })
          }
        >
          <CreditCard size={22} />
          <span>
            <strong>
              {state.paymentReady
                ? "Visa ending in 4242"
                : "Add payment method"}
            </strong>
            <small>
              {state.paymentReady
                ? "Payment method ready"
                : "Use test Visa ending in 4242"}
            </small>
          </span>
          {state.paymentReady ? (
            <Check size={20} />
          ) : (
            <ChevronRight size={20} />
          )}
        </button>
        <div className="review-policy">
          <Clock3 size={16} />
          <p>
            Please give 48 hours’ notice to cancel or reschedule. A $250 fee
            applies to late cancellations or a missed first visit.
          </p>
        </div>
        <label
          className={`check-row review-agreements ${errors["booking-agreements"] ? "has-error" : ""}`}
        >
          <input
            id="booking-agreements"
            type="checkbox"
            checked={state.agreements}
            aria-invalid={!!errors["booking-agreements"]}
            onChange={(event) => {
              update({ agreements: event.target.checked });
              setErrors({});
            }}
          />
          <span>
            <strong>I’ve reviewed the care and booking details</strong>
            <small>Visit format, costs, and cancellation policy</small>
          </span>
        </label>
        <button
          type="button"
          className="booking-text-button agreement-toggle"
          aria-expanded={showAgreements}
          onClick={() => setShowAgreements((value) => !value)}
        >
          {showAgreements
            ? "Hide care and booking details"
            : "Read care and booking details"}
        </button>
        {showAgreements ? (
          <div className="example-agreements">
            <h2>Your care and booking details</h2>
            <p>
              Your first visit is a 60-minute video conversation. You and your
              clinician decide on next steps together. Medication is only
              prescribed when your clinician considers it appropriate.
            </p>
            <p>
              Review the visit cost above and give at least 48 hours’ notice if
              you need to cancel or reschedule.
            </p>
          </div>
        ) : null}
        {errors["booking-agreements"] ? (
          <p className="field-error" role="alert">
            {errors["booking-agreements"]}
          </p>
        ) : null}
      </Page>
    );

  return null;
}
