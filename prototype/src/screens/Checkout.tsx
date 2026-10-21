import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Check,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  Video,
} from "lucide-react";
import { Button, Field, Notice, Page, ProviderAvatar } from "../components/ui";
import { formatDate, formatTime, getProvider } from "../model/fixtures";
import type { ScreenProps } from "../model/types";
import "./checkout.css";

type CardDraft = { number: string; expiry: string; cvc: string; zip: string };
type CardErrors = Partial<Record<keyof CardDraft, string>>;
const emptyCard: CardDraft = { number: "", expiry: "", cvc: "", zip: "" };
const fieldIds = {
  number: "payment-card-number",
  expiry: "payment-expiry",
  cvc: "payment-cvc",
  zip: "payment-zip",
};

function cardErrors(card: CardDraft): CardErrors {
  const errors: CardErrors = {};
  const digits = card.number.replace(/\D/g, "");
  // These fields simulate a provider-owned Payment Element. Production must use
  // Stripe's hosted element, never our inputs, to collect actual card details.
  if (digits !== "4242424242424242")
    errors.number = "Use the preview card: 4242 4242 4242 4242.";
  const expiry = card.expiry.replace(/\D/g, "");
  const month = Number(expiry.slice(0, 2));
  const year = 2000 + Number(expiry.slice(2));
  if (
    expiry.length !== 4 ||
    month < 1 ||
    month > 12 ||
    new Date(year, month, 1).getTime() <= Date.now()
  ) {
    errors.expiry = "Enter a future date, like 12 / 30.";
  }
  if (!/^\d{3}$/.test(card.cvc)) errors.cvc = "Enter any 3 digits.";
  if (!/^\d{5}$/.test(card.zip)) errors.zip = "Enter a 5-digit ZIP code.";
  return errors;
}

function useCardEntry(zip: string, setError: (message: string) => void) {
  const [card, setCard] = useState<CardDraft>({ ...emptyCard, zip });
  const [errors, setErrors] = useState<CardErrors>({});
  const [activeField, setActiveField] = useState<keyof CardDraft>("number");
  const paymentToken = useRef(`pm_mock_${crypto.randomUUID()}`);
  const editCard = (field: keyof CardDraft, value: string) => {
    paymentToken.current = `pm_mock_${crypto.randomUUID()}`;
    setCard((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  };
  function editFormatted(
    field: "number" | "expiry",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const raw = input.value;
    const max = field === "number" ? 16 : 4;
    let digits = raw.replace(/\D/g, "").slice(0, max);
    let position = raw
      .slice(0, input.selectionStart ?? raw.length)
      .replace(/\D/g, "").length;
    const previousDigits = card[field].replace(/\D/g, "");
    const inputType = (event.nativeEvent as InputEvent).inputType;
    if (
      previousDigits === digits &&
      inputType === "deleteContentBackward" &&
      position > 0
    ) {
      digits = digits.slice(0, position - 1) + digits.slice(position);
      position--;
    } else if (
      previousDigits === digits &&
      inputType === "deleteContentForward"
    ) {
      digits = digits.slice(0, position) + digits.slice(position + 1);
    }
    const formatted =
      field === "number"
        ? digits.replace(/(.{4})/g, "$1 ").trim()
        : digits.length > 2
          ? `${digits.slice(0, 2)} / ${digits.slice(2)}`
          : digits;
    editCard(field, formatted);
    let caret = 0,
      seen = 0;
    while (caret < formatted.length && seen < position) {
      if (/\d/.test(formatted[caret])) seen++;
      caret++;
    }
    requestAnimationFrame(() => {
      if (document.activeElement === input)
        input.setSelectionRange(caret, caret);
    });
  }
  const validateField = (field: keyof CardDraft) => {
    if (!card[field]) return;
    setErrors((current) => ({ ...current, [field]: cardErrors(card)[field] }));
  };
  function nextField(field = activeField) {
    const error = cardErrors(card)[field];
    setErrors((current) => ({ ...current, [field]: error }));
    if (error) {
      const input = document.getElementById(fieldIds[field]);
      input?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        const content = input?.closest<HTMLElement>(".screen-main");
        const control = input?.closest(".field");
        if (content && control)
          content.scrollTop +=
            control.getBoundingClientRect().top -
            content.getBoundingClientRect().top -
            16;
      });
      return;
    }
    const nextId = {
      number: fieldIds.expiry,
      expiry: fieldIds.cvc,
      cvc: fieldIds.zip,
      zip: "payment-financial-consent",
    }[field];
    const next = document.getElementById(nextId);
    // Keep the keyboard open between fields. The final step only focuses the
    // authorization; it never checks a box, saves a card, or books a visit.
    if (field === "zip" && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    next?.focus({ preventScroll: true });
    const content = next?.closest<HTMLElement>(".screen-main");
    if (next && content) {
      const target = next.closest(".field, .check-row") ?? next;
      content.scrollTop +=
        target.getBoundingClientRect().top -
        content.getBoundingClientRect().top -
        16;
    }
  }
  return {
    card,
    setCard,
    errors,
    setErrors,
    paymentToken,
    editCard,
    editFormatted,
    validateField,
    activeField,
    setActiveField,
    nextField,
  };
}

const focusField = (
  event: KeyboardEvent<HTMLInputElement>,
  next: () => void,
) => {
  if (event.key === "Enter") {
    event.preventDefault();
    next();
  }
};

function KeyboardCardAction({
  entry,
  disabled,
}: {
  entry: ReturnType<typeof useCardEntry>;
  disabled: boolean;
}) {
  const label = {
    number: "Next: expiration date",
    expiry: "Next: security code",
    cvc: "Next: billing ZIP code",
    zip: "Review authorization",
  }[entry.activeField];
  return (
    <div className="checkout-keyboard-action">
      <Button
        type="button"
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => entry.nextField()}
      >
        {label}
      </Button>
    </div>
  );
}

function CardPaymentFields({
  entry,
  disabled = false,
}: {
  entry: ReturnType<typeof useCardEntry>;
  disabled?: boolean;
}) {
  const {
    card,
    errors,
    editCard,
    editFormatted,
    validateField,
    setActiveField,
    nextField,
  } = entry;
  return (
    <div className="checkout-card-fields">
      <Field
        id={fieldIds.number}
        label="Card number"
        value={card.number}
        placeholder="4242 4242 4242 4242"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="next"
        maxLength={19}
        disabled={disabled}
        error={errors.number}
        onFocus={() => setActiveField("number")}
        onBlur={() => validateField("number")}
        onKeyDown={(event) => focusField(event, () => nextField("number"))}
        onChange={(event) => editFormatted("number", event)}
      />
      <div className="checkout-card-pair">
        <Field
          id={fieldIds.expiry}
          label="Expiration"
          value={card.expiry}
          placeholder="MM / YY"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={7}
          disabled={disabled}
          error={errors.expiry}
          onFocus={() => setActiveField("expiry")}
          onBlur={() => validateField("expiry")}
          onKeyDown={(event) => focusField(event, () => nextField("expiry"))}
          onChange={(event) => editFormatted("expiry", event)}
        />
        <Field
          id={fieldIds.cvc}
          label="Security code"
          value={card.cvc}
          placeholder="CVC"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={3}
          disabled={disabled}
          error={errors.cvc}
          onFocus={() => setActiveField("cvc")}
          onBlur={() => validateField("cvc")}
          onKeyDown={(event) => focusField(event, () => nextField("cvc"))}
          onChange={(event) =>
            editCard("cvc", event.target.value.replace(/\D/g, "").slice(0, 3))
          }
        />
      </div>
      <Field
        id={fieldIds.zip}
        label="Billing ZIP code"
        value={card.zip}
        placeholder="ZIP code"
        inputMode="numeric"
        autoComplete="postal-code"
        enterKeyHint="done"
        maxLength={5}
        disabled={disabled}
        error={errors.zip}
        onFocus={() => setActiveField("zip")}
        onBlur={() => validateField("zip")}
        onKeyDown={(event) => focusField(event, () => nextField("zip"))}
        onChange={(event) =>
          editCard("zip", event.target.value.replace(/\D/g, "").slice(0, 5))
        }
      />
    </div>
  );
}

function CardAuthentication({
  active,
  onDecision,
  label,
}: {
  active: boolean;
  onDecision: (approved: boolean) => Promise<void>;
  label: string;
}) {
  const authenticationDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    authenticationDialog.current?.showModal();
    requestAnimationFrame(() =>
      document
        .getElementById("payment-auth-heading")
        ?.focus({ preventScroll: true }),
    );
  }, []);
  return (
    <dialog
      ref={authenticationDialog}
      className="checkout-auth"
      aria-labelledby="payment-auth-heading"
      aria-describedby="payment-auth-copy"
      onCancel={(event) => {
        event.preventDefault();
        if (!active) void onDecision(false);
      }}
    >
      <span className="checkout-auth-icon">
        <ShieldCheck size={30} />
      </span>
      <h2 id="payment-auth-heading" tabIndex={-1}>
        Verify your card
      </h2>
      <p id="payment-auth-copy">
        Your bank needs one more confirmation before this card can be saved.
      </p>
      <div className="checkout-auth-card">
        <CreditCard size={20} />
        <span>Visa ending in 4242</span>
        <span>$0</span>
      </div>
      <p className="checkout-auth-note">
        This simulates your bank’s verification screen. No code or real banking
        details are needed.
      </p>
      <Button loading={active} onClick={() => void onDecision(true)}>
        <Check size={17} /> {label}
      </Button>
      <Button
        variant="text"
        disabled={active}
        onClick={() => void onDecision(false)}
      >
        Cancel verification
      </Button>
    </dialog>
  );
}

export function Checkout({
  state,
  update,
  go,
  api,
  busy,
  act,
  error,
  setError,
}: ScreenProps) {
  // Raw entry remains only in this mounted component, never journey state,
  // browser storage, API arguments, analytics, or the service ledger.
  const entry = useCardEntry(state.profile.zip, setError);
  const { card, setCard, setErrors, paymentToken } = entry;
  const [editing, setEditing] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [holdExpired, setHoldExpired] = useState(false);
  const [stage, setStage] = useState<"idle" | "saving" | "confirming">("idle");
  const submitting = useRef(false);
  const provider = getProvider(state.providerId);
  const payment = state.paymentSetup;
  const method = payment.method;
  const saved = payment.status === "succeeded" && !!method;
  const needsCard = !saved || editing;
  const authenticating = payment.status === "requires_action";
  const active = busy || stage !== "idle";
  const missingCard = needsCard && Object.keys(cardErrors(card)).length > 0;
  const coverageReady =
    state.coverage === "selfpay" || state.eligibility.status === "verified";
  const consentReady = state.financialConsent && state.agreements;
  const canSubmit =
    !missingCard &&
    consentReady &&
    coverageReady &&
    !!state.reservation &&
    !holdExpired;

  useEffect(() => {
    if (!state.reservation) {
      setHoldExpired(true);
      return;
    }
    const remaining = state.reservation.expiresAt - Date.now();
    setHoldExpired(remaining <= 0);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setHoldExpired(true), remaining + 20);
    return () => window.clearTimeout(timer);
  }, [state.reservation?.expiresAt]);

  async function finishBooking() {
    setStage("confirming");
    const appointment = await api.confirm();
    if (appointment) go("confirmed");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || active || authenticating) return;
    if (needsCard) {
      const invalid = cardErrors(card);
      setErrors(invalid);
      const first = Object.keys(invalid)[0] as keyof CardDraft | undefined;
      if (first) {
        document.getElementById(fieldIds[first])?.focus();
        return;
      }
    }
    if (!canSubmit) return;
    submitting.current = true;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await act(async () => {
      try {
        if (needsCard) {
          setStage("saving");
          const digits = card.expiry.replace(/\D/g, "");
          const result = await api.setupPayment({
            token: paymentToken.current,
            brand: "Visa",
            last4: "4242",
            expMonth: Number(digits.slice(0, 2)),
            expYear: 2000 + Number(digits.slice(2)),
            billingZip: card.zip,
          });
          setCard({ ...emptyCard, zip: state.profile.zip });
          setEditing(false);
          if (result.status === "requires_action") return;
          if (result.status !== "succeeded") return;
        }
        await finishBooking();
      } finally {
        setStage("idle");
        submitting.current = false;
      }
    });
  }

  async function authenticate(approved: boolean) {
    if (submitting.current || active) return;
    submitting.current = true;
    await act(async () => {
      try {
        setStage("saving");
        const result = await api.completePaymentAuthentication(approved);
        if (approved && result.status === "succeeded") await finishBooking();
      } finally {
        setStage("idle");
        submitting.current = false;
      }
    });
  }

  const hint = active
    ? stage === "confirming"
      ? "Confirming your time with your provider"
      : stage === "saving"
        ? "Saving your payment method securely"
        : "Checking appointment availability"
    : !coverageReady
      ? "Confirm your coverage and cost before booking"
      : !state.reservation || holdExpired
        ? "Your appointment is not confirmed yet"
        : missingCard
          ? "Add your payment details to continue"
          : !consentReady
            ? "Review both acknowledgments below to continue"
            : "No visit fee is charged today";

  return (
    <>
      <Page
        className="booking-review checkout-screen"
        title="Review and confirm"
        subtitle="Your appointment, your cost, and what happens next."
        onSubmit={submit}
        footer={
          <>
            <KeyboardCardAction
              entry={entry}
              disabled={active || authenticating}
            />
            <div className="checkout-default-actions">
              {!coverageReady ? (
                <Button onClick={() => go("insurance")}>
                  Review insurance coverage
                </Button>
              ) : !state.reservation || holdExpired ? (
                <>
                  <Button
                    loading={busy}
                    onClick={() =>
                      void act(() =>
                        api.reserve(state.providerId, state.slotId),
                      )
                    }
                  >
                    Recheck this appointment time
                  </Button>
                  <button
                    type="button"
                    className="checkout-link checkout-other-time"
                    onClick={() => go("slots")}
                  >
                    Choose another time
                  </button>
                </>
              ) : (
                <Button
                  type="submit"
                  loading={active}
                  disabled={!canSubmit || authenticating}
                  className={active ? "checkout-submitting" : ""}
                >
                  {active ? (
                    <>
                      <span className="checkout-spinner" aria-hidden="true" />
                      {stage === "confirming"
                        ? "Confirming appointment"
                        : "Saving payment method"}
                    </>
                  ) : (
                    "Confirm appointment"
                  )}
                </Button>
              )}
              <p className="footer-note" aria-live="polite">
                {hint}
              </p>
            </div>
          </>
        }
      >
        <div className="checkout-appointment">
          <ProviderAvatar provider={provider} size="small" />
          <div>
            <strong>{provider.name}</strong>
            <span>
              {formatDate(state.slotId, true)} · {formatTime(state.slotId)} CT
            </span>
            <small>
              <Video size={13} aria-hidden="true" />
              60-minute video visit
            </small>
          </div>
          <button
            type="button"
            className="checkout-link"
            disabled={active}
            onClick={() => go("slots")}
          >
            Edit
          </button>
        </div>

        {!state.reservation || holdExpired ? (
          <Notice>
            Your appointment has not been booked yet. Recheck availability to
            continue.{" "}
            {saved
              ? "Your saved payment method is ready to use."
              : "Your details are saved."}
          </Notice>
        ) : null}

        <section className="checkout-cost" aria-label="Visit cost">
          <div>
            <span>
              {state.coverage === "selfpay"
                ? "First visit"
                : "Estimated visit cost"}
            </span>
            <strong>
              {state.coverage === "selfpay"
                ? "$250"
                : coverageReady
                  ? `$${state.eligibility.estimate}`
                  : "Pending"}
            </strong>
          </div>
          <p>
            {state.coverage === "selfpay"
              ? "Self-pay · billed after your visit"
              : `${state.payer} · billed after your insurer processes the claim`}
          </p>
          {state.coverage === "insurance" ? (
            <p className="checkout-estimate-note">
              Your plan determines the final amount. We’ll share your balance
              before charging your saved card.
            </p>
          ) : null}
          <div className="checkout-today">
            <span>
              <ShieldCheck size={17} aria-hidden="true" />
              Due today
            </span>
            <strong>$0</strong>
          </div>
        </section>

        <section
          className="checkout-payment-section"
          aria-labelledby="payment-heading"
        >
          <div className="checkout-section-heading">
            <h2 id="payment-heading">Payment method</h2>
            <LockKeyhole size={16} aria-hidden="true" />
          </div>
          <p className="checkout-section-copy">
            Keep a card on file for your visit. Nothing is charged when you
            book.
          </p>
          {payment.error && !error ? (
            <Notice tone="warning">{payment.error}</Notice>
          ) : null}
          {saved && !editing ? (
            <div className="checkout-saved-method">
              <span className="checkout-card-icon">
                <CreditCard size={24} />
              </span>
              <div>
                <strong>
                  {method.brand} ending in {method.last4}
                </strong>
                <span>
                  Expires {String(method.expMonth).padStart(2, "0")} /{" "}
                  {String(method.expYear).slice(-2)}
                </span>
                <small>
                  <CheckCircle2 size={13} /> Saved for your visit
                </small>
              </div>
              <button
                type="button"
                className="checkout-link"
                disabled={active}
                onClick={() => {
                  setEditing(true);
                  update({ financialConsent: false });
                  setError("");
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <CardPaymentFields
                entry={entry}
                disabled={active || authenticating}
              />
              {saved && editing ? (
                <button
                  className="checkout-link checkout-keep-card"
                  type="button"
                  disabled={active}
                  onClick={() => {
                    setEditing(false);
                    setCard({ ...emptyCard, zip: state.profile.zip });
                    setErrors({});
                  }}
                >
                  Keep {method.brand} ending in {method.last4}
                </button>
              ) : null}
              <p className="checkout-preview-note">
                Simulated payments · use 4242 4242 4242 4242, a future date, and
                any 3-digit code. Please don’t enter a real card.
              </p>
            </>
          )}
        </section>

        <div className="checkout-consents">
          <label className="check-row">
            <input
              id="payment-financial-consent"
              type="checkbox"
              checked={state.financialConsent}
              disabled={active}
              onChange={(event) =>
                update({ financialConsent: event.target.checked })
              }
            />
            <span>
              <strong>I authorize saving this card for my care</strong>
              <small>
                {state.coverage === "selfpay"
                  ? "I authorize the $250 first-visit fee after my appointment."
                  : "I authorize my final patient balance after insurance and after receiving my bill."}
              </small>
            </span>
          </label>
          <label className="check-row">
            <input
              id="payment-care-consent"
              type="checkbox"
              checked={state.agreements}
              disabled={active}
              onChange={(event) => update({ agreements: event.target.checked })}
            />
            <span>
              <strong>I consent to care by video</strong>
              <small>
                I understand the visit format and how to get urgent help.
              </small>
            </span>
          </label>
          <button
            type="button"
            className="checkout-link checkout-terms-toggle"
            aria-expanded={showTerms}
            onClick={() => setShowTerms((value) => !value)}
          >
            {showTerms ? "Hide telehealth details" : "Read telehealth details"}
          </button>
          {showTerms ? (
            <div className="checkout-terms">
              <p>
                Your first visit is a conversation with a licensed clinician.
                You’ll discuss your history, concerns, and treatment options
                together. Prescriptions are based on the clinician’s judgment
                and are not guaranteed.
              </p>
              <p>
                Video care is not emergency care. If you are in immediate
                danger, call 911. Call or text 988 for crisis support. If your
                connection drops, you can rejoin from your portal or use the
                callback number you provide at check-in.
              </p>
            </div>
          ) : null}
        </div>
        <p className="checkout-return-note">
          After confirming, you’ll find your appointment, preparation, and join
          link in your patient portal.
        </p>
      </Page>

      {authenticating ? (
        <CardAuthentication
          active={active}
          onDecision={authenticate}
          label="Verify and confirm appointment"
        />
      ) : null}
    </>
  );
}

export function PaymentMethodEditor({
  state,
  update,
  api,
  busy,
  act,
  error,
  setError,
  onDone,
}: ScreenProps & { onDone: () => void }) {
  const entry = useCardEntry(state.profile.zip, setError);
  const { card, setCard, setErrors, paymentToken } = entry;
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const active = busy || saving;
  const payment = state.paymentSetup;
  const authenticating = payment.status === "requires_action";
  const valid = Object.keys(cardErrors(card)).length === 0 && consent;

  useEffect(() => {
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".payment-editor h1")
        ?.focus({ preventScroll: true }),
    );
  }, []);

  function finishEditing() {
    setError("");
    onDone();
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".portal-screen h1")
        ?.focus({ preventScroll: true }),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || active || authenticating) return;
    const invalid = cardErrors(card);
    setErrors(invalid);
    const first = Object.keys(invalid)[0] as keyof CardDraft | undefined;
    if (first) {
      document.getElementById(fieldIds[first])?.focus();
      return;
    }
    if (!consent) return;
    submitting.current = true;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    await act(async () => {
      try {
        setSaving(true);
        update({ financialConsent: true });
        const digits = card.expiry.replace(/\D/g, "");
        const result = await api.setupPayment({
          token: paymentToken.current,
          brand: "Visa",
          last4: "4242",
          expMonth: Number(digits.slice(0, 2)),
          expYear: 2000 + Number(digits.slice(2)),
          billingZip: card.zip,
        });
        setCard({ ...emptyCard, zip: state.profile.zip });
        if (result.status === "succeeded" && !result.error) finishEditing();
      } finally {
        setSaving(false);
        submitting.current = false;
      }
    });
  }

  async function authenticate(approved: boolean) {
    if (submitting.current || active) return;
    submitting.current = true;
    await act(async () => {
      try {
        setSaving(true);
        const result = await api.completePaymentAuthentication(approved);
        if (approved && result.status === "succeeded" && !result.error)
          finishEditing();
      } finally {
        setSaving(false);
        submitting.current = false;
      }
    });
  }

  return (
    <>
      <Page
        className="checkout-screen payment-editor"
        title="Update payment method"
        subtitle="Save a card for your care. Your current card stays in place until the new one is ready."
        onSubmit={submit}
        footer={
          <>
            <KeyboardCardAction
              entry={entry}
              disabled={active || authenticating}
            />
            <div className="checkout-default-actions">
              <Button
                type="submit"
                loading={active}
                disabled={!valid || authenticating}
                className={active ? "checkout-submitting" : ""}
              >
                {active ? (
                  <>
                    <span className="checkout-spinner" aria-hidden="true" />
                    Saving payment method
                  </>
                ) : (
                  "Save payment method"
                )}
              </Button>
              <Button
                variant="text"
                disabled={active || authenticating}
                onClick={finishEditing}
              >
                Cancel
              </Button>
            </div>
          </>
        }
      >
        <p className="payment-editor-assurance">
          <ShieldCheck size={18} />
          No payment is taken when you update your card
        </p>
        {payment.error && !error ? (
          <Notice tone="warning">{payment.error}</Notice>
        ) : null}
        <CardPaymentFields entry={entry} disabled={active || authenticating} />
        <p className="checkout-preview-note">
          Simulated payments · use 4242 4242 4242 4242, a future date, and any
          3-digit code. Please don’t enter a real card.
        </p>
        <div className="checkout-consents">
          <label className="check-row">
            <input
              id="payment-financial-consent"
              type="checkbox"
              checked={consent}
              disabled={active}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              <strong>I authorize saving this card for my care</strong>
              <small>
                Use it for visit fees I’ve agreed to and patient balances after
                I receive my bill.
              </small>
            </span>
          </label>
        </div>
      </Page>
      {authenticating ? (
        <CardAuthentication
          active={active}
          onDecision={authenticate}
          label="Verify and save card"
        />
      ) : null}
    </>
  );
}
