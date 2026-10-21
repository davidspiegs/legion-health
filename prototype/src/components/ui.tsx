import {
  useEffect,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type FormEvent,
} from "react";
import {
  Check,
  ChevronRight,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import type { JourneyState, Provider } from "../model/types";
import { getProvider, formatSlot } from "../model/fixtures";

export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`button ${variant} ${className}`}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
    >
      <span>{children}</span>
    </button>
  );
}
export function Page({
  title,
  subtitle,
  children,
  footer,
  className = "",
  onSubmit,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const content = (
    <>
      <div className="screen-main">
        <div className="screen-heading">
          <h1 tabIndex={-1}>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        {children}
      </div>
      {footer ? <div className="screen-footer">{footer}</div> : null}
    </>
  );
  return onSubmit ? (
    <form className={`screen ${className}`} onSubmit={onSubmit} noValidate>
      {content}
    </form>
  ) : (
    <section className={`screen ${className}`}>{content}</section>
  );
}
export function Choice({
  label,
  detail,
  selected,
  onClick,
  icon: Icon,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      className={`choice ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {Icon ? (
        <Icon className="choice-icon" size={23} aria-hidden="true" />
      ) : null}
      <span className="choice-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className="choice-indicator" aria-hidden="true">
        {selected ? <Check size={13} /> : null}
      </span>
    </button>
  );
}
export function Field({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const fieldId =
    id || props.name || label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <label htmlFor={fieldId}>{label}</label>
      <input
        {...props}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
        }
      />
      {hint ? (
        <p id={`${fieldId}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "success";
}) {
  return <div className={`notice ${tone}`}>{children}</div>;
}
export function CheckRow({
  checked,
  onChange,
  children,
  detail,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  detail?: string;
}) {
  return (
    <label className="check-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <strong>{children}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </label>
  );
}
export function ProviderAvatar({
  provider,
  size = "normal",
}: {
  provider: Provider;
  size?: "small" | "normal" | "large";
}) {
  return provider.photo ? (
    <img
      className={`avatar ${size}`}
      src={provider.photo}
      alt={provider.name}
    />
  ) : (
    <span className={`avatar monogram ${size}`} aria-label={provider.name}>
      {provider.initials}
    </span>
  );
}
export function AppointmentContext({
  state,
  onEdit,
}: {
  state: JourneyState;
  onEdit?: () => void;
}) {
  const provider = getProvider(state.providerId);
  return (
    <div className="appointment-context">
      <CalendarDays size={18} aria-hidden="true" />
      <span>
        <strong>{provider.name}</strong>
        <small>
          {state.slotId
            ? formatSlot(state.slotId, { short: true })
            : "Choose a time that works for you"}
        </small>
      </span>
      {onEdit ? (
        <button
          type="button"
          className="icon-button"
          onClick={onEdit}
          aria-label="Change selected appointment"
        >
          <ChevronRight size={20} />
        </button>
      ) : null}
    </div>
  );
}
// Three distinct patient testimonials captured from Legion's current intake.
// Sources: desktop-patient.jpg, desktop-fit-1.jpg, desktop-insurance-options.jpg in canvas/assets.
const testimonials = [
  {
    quote:
      "This has been the easiest healthcare I've ever had and I've had therapists for 20+ years.",
    excerpt: false,
  },
  {
    quote:
      "I love my provider! She is great to work with, very informative about treatments and medications. She leaves no questions unanswered.",
    excerpt: true,
  },
  {
    quote:
      "My symptoms and how they affect my day-to-day life have really been validated.",
    excerpt: true,
  },
];
export function Testimonial() {
  const [index, setIndex] = useState(0),
    [manuallySelected, setManuallySelected] = useState(false),
    [reduce, setReduce] = useState(false),
    [hover, setHover] = useState(false),
    [focused, setFocused] = useState(false),
    [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (reduce || hover || focused || hidden || manuallySelected) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % testimonials.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [reduce, hover, focused, hidden, manuallySelected]);
  const testimonial = testimonials[index];
  return (
    <aside
      className="testimonial"
      aria-label="Legion patient experiences"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      <div className="quote-line">
        <p key={index}>“{testimonial.quote}”</p>
      </div>
      <div className="quote-bottom">
        <span>
          Legion Health patient{testimonial.excerpt ? " · excerpt" : ""}
        </span>
        <div
          className="quote-dots"
          role="group"
          aria-label="Choose a patient testimonial"
        >
          {testimonials.map((_, item) => (
            <button
              type="button"
              key={item}
              aria-label={`Show testimonial ${item + 1} of ${testimonials.length}`}
              aria-pressed={item === index}
              onClick={() => {
                setManuallySelected(true);
                setIndex(item);
              }}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
