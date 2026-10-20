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
  Pause,
  Play,
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
const quotes = [
  "I love my provider!",
  "She leaves no questions unanswered.",
  "Friendly staff, very helpful!",
];
export function Testimonial() {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [reduce, setReduce] = useState(false),
    [hover, setHover] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || reduce || hover) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % quotes.length);
    }, 7500);
    return () => window.clearInterval(timer);
  }, [paused, reduce, hover]);
  return (
    <aside
      className="testimonial"
      aria-label="Excerpts from a Legion patient testimonial"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setPaused(true)}
    >
      <div className="quote-line">
        <p key={index}>“{quotes[index]}”</p>
        <button
          type="button"
          className="icon-button quote-pause"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setPaused((p) => !p)}
          aria-label={
            paused || reduce ? "Play testimonials" : "Pause testimonials"
          }
          disabled={reduce}
        >
          {paused || reduce ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>
      <div className="quote-bottom">
        <span>Legion Health patient · excerpt</span>
      </div>
    </aside>
  );
}
