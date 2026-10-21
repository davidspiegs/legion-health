import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowUp, Check, Pencil, type LucideIcon } from "lucide-react";
import type { ChatInput, ChatOption } from "./engine";
import { ASSISTANT, PREVIEW } from "./env";
import { iconFor } from "./icons";

/** Legion's mark, simplified to its outer heart for small sizes. */
export function LegionMark({ className, tone = "blue" }: { className?: string; tone?: "blue" | "white" }) {
  return (
    <svg className={className} viewBox="0 0 617.68 523.87" aria-hidden="true" focusable="false">
      <path
        fill={tone === "white" ? "#ffffff" : "#3a68e9"}
        d="M401.43,310.15c51.04-51.08,51.04-134.21,0-185.24l-39.64-39.63c48.41-26.64,109.47-18.46,149.25,21.27,23.72,23.77,36.77,55.32,36.77,88.87s-13.05,65.06-36.77,88.72l-149.98,149.93c-28.88,28.83-75.82,28.83-104.65-.05l-149.89-149.83c-48.94-48.94-48.94-128.65,0-177.65,23.72-23.67,55.22-36.71,88.77-36.71,21.43,0,42.17,5.36,60.58,15.53l-39.69,39.54c-51.08,51.04-51.08,134.16,0,185.24Z"
      />
    </svg>
  );
}

/** The assistant's face: Legion's mark on a soft blue disc, the same at every size. */
export function AssistantAvatar({ size = "sm", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span className={`assistant-avatar size-${size} ${className}`} aria-hidden="true">
      <LegionMark tone="white" />
    </span>
  );
}

export function AgentAvatar({ hidden }: { hidden?: boolean }) {
  return <AssistantAvatar className={`msg-avatar ${hidden ? "is-hidden" : ""}`} />;
}

/** Shown while the next message is on its way, as in any messaging app. */
export function TypingBubble() {
  return (
    <div className="msg from-agent typing-row enter" aria-hidden="true">
      <AgentAvatar />
      <div className="typing">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

/** Things the patient can always ask for once they're booked: one tap each. */
export function QuickActions({
  actions,
  onPick,
  busy,
}: {
  actions: { id: string; label: string; icon: LucideIcon; tone?: "preview" }[];
  onPick: (id: string) => void;
  busy?: boolean;
}) {
  return (
    <div className="quick-actions" role="group" aria-label={`Ask ${ASSISTANT.name}`}>
      {actions.map(({ id, label, icon: Icon, tone }, index) => (
        <button
          type="button"
          key={id}
          className={`quick-action ${tone === "preview" ? "preview" : ""}`}
          style={{ ["--i" as string]: index }}
          disabled={busy}
          onClick={() => onPick(id)}
        >
          <Icon size={16} strokeWidth={2} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function PatientBubble({
  text,
  editable,
  edited,
  latest,
  onEdit,
  enter,
}: {
  text: string;
  editable: boolean;
  edited: boolean;
  /** Only the newest answer shows its pencil; older ones show it on hover or focus. */
  latest?: boolean;
  onEdit: () => void;
  enter: boolean;
}) {
  return (
    <div className={`msg from-patient ${enter ? "enter" : ""}`}>
      {editable ? (
        <button
          type="button"
          className={`bubble ${latest ? "is-latest" : ""}`}
          onClick={onEdit}
          aria-label={`Change your answer: ${text}`}
        >
          <span>{text}</span>
          <span className="bubble-edit" aria-hidden="true">
            <Pencil size={12} strokeWidth={2.4} />
          </span>
        </button>
      ) : (
        <div className="bubble">{text}</div>
      )}
      {edited ? <span className="edited-tag">Edited</span> : null}
    </div>
  );
}

/**
 * Answers fill the dock's width, so every option is easy to reach with a thumb and
 * nothing hangs off to one side: two short answers sit side by side, a few very
 * short ones share a row, and anything longer stacks as full-width rows.
 */
function layoutFor(input: Exclude<ChatInput, { kind: "text" } | { kind: "widget" }>): string {
  if (input.kind === "multi") return "grid";
  if (input.kind === "confirm-list") return "pair";
  if (input.layout === "stack") return "stack";
  if (input.layout === "grid") return "grid";
  const plain = input.options.every((option) => !option.detail && !option.icon);
  if (plain && input.options.length === 2 && input.options.every((option) => option.label.length <= 18)) return "pair";
  if (plain && input.options.length === 3 && input.options.every((option) => option.label.length <= 9)) return "row";
  return "stack";
}

function OptionLabel({ option }: { option: ChatOption }) {
  const Icon = option.icon ? iconFor(option.icon) : null;
  return (
    <>
      {Icon ? <Icon className="reply-icon" size={18} strokeWidth={1.9} aria-hidden="true" /> : null}
      <span className="reply-text">
        {option.label}
        {option.detail ? <span className="chip-detail">{option.detail}</span> : null}
      </span>
    </>
  );
}

/**
 * The active question's answer controls. Single choices answer on tap; multiple
 * choices toggle and confirm. Text questions are handled by `Composer`, which the
 * shell keeps mounted across consecutive typed questions so the keyboard stays up.
 */
export function ChoiceControls({
  input,
  initial,
  busy,
  onAnswer,
  onCancel,
  labelledBy,
}: {
  input: Exclude<ChatInput, { kind: "text" } | { kind: "widget" }>;
  initial?: string | string[];
  busy: boolean;
  onAnswer: (value: string | string[]) => void;
  /** Present while editing a previous answer. */
  onCancel?: () => void;
  /** The question's bubble in the thread, which names the answer group. */
  labelledBy?: string;
}) {
  const [chosen, setChosen] = useState("");
  const [selected, setSelected] = useState<string[]>(Array.isArray(initial) ? initial : []);
  const lock = useRef(false);
  useEffect(() => {
    lock.current = false;
    setChosen("");
  }, [input]);

  const answerOnce = (value: string | string[]) => {
    if (busy || lock.current) return;
    lock.current = true;
    onAnswer(value);
    window.setTimeout(() => (lock.current = false), 450);
  };
  const tap = (value: string) => {
    if (busy || lock.current || chosen) return;
    setChosen(value);
    // A brief acknowledgment, then the answer becomes a message.
    window.setTimeout(() => answerOnce(value), 140);
  };

  const cancel = onCancel ? (
    <button type="button" className="dock-link" onClick={onCancel}>
      Keep my answer
    </button>
  ) : null;
  // The answers are named by the question they answer. The generic name is only
  // used when that bubble isn't in the thread (a question without an "ask" line).
  const group = (fallback: string) => ({
    role: "group",
    "aria-labelledby": labelledBy,
    "aria-label": fallback,
  });

  const layout = layoutFor(input);

  if (input.kind === "single") {
    return (
      <div className="dock-inner">
        <div className={`replies ${layout}`} {...group("Choose an answer")}>
          {input.options.map((option, index) => (
            <button
              type="button"
              key={option.value}
              style={{ ["--i" as string]: index }}
              className={[
                "chip reply",
                option.primary ? "primary" : "",
                option.tone === "preview" ? "preview" : "",
                chosen === option.value ? "is-chosen" : "",
                onCancel && initial === option.value ? "is-current" : "",
              ].join(" ")}
              disabled={busy && chosen !== option.value}
              onClick={() => tap(option.value)}
            >
              <OptionLabel option={option} />
              {onCancel && initial === option.value ? (
                <Check className="reply-check" size={16} strokeWidth={2.4} aria-label="Current answer" />
              ) : null}
            </button>
          ))}
        </div>
        {cancel}
      </div>
    );
  }

  if (input.kind === "multi") {
    const toggle = (value: string) =>
      setSelected((current) => {
        if (current.includes(value)) return current.filter((v) => v !== value);
        if (input.exclusive?.includes(value)) return [value];
        return [...current.filter((v) => !input.exclusive?.includes(v)), value];
      });
    return (
      <div className="dock-inner">
        <div className="replies grid" {...group("Choose all that apply")}>
          {input.options.map((option, index) => (
            <button
              type="button"
              key={option.value}
              style={{ ["--i" as string]: index }}
              className="chip reply"
              aria-pressed={selected.includes(option.value)}
              disabled={busy}
              onClick={() => toggle(option.value)}
            >
              <OptionLabel option={option} />
              <span className="reply-tick" aria-hidden="true">
                <Check size={13} strokeWidth={3} />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chip primary reply-confirm"
          disabled={!selected.length || busy}
          onClick={() => answerOnce(selected)}
        >
          {selected.length > 1 ? `${input.confirm} with ${selected.length}` : input.confirm}
        </button>
        {input.alternate || cancel ? (
          <div className="dock-links">
            {input.alternate ? (
              <button type="button" className="dock-link" onClick={() => answerOnce(input.alternate!.value)}>
                {input.alternate.label}
              </button>
            ) : null}
            {cancel}
          </div>
        ) : null}
      </div>
    );
  }

  // confirm-list
  return (
    <div className="dock-inner">
      <div className="replies pair" {...group("Choose an answer")}>
        <button
          type="button"
          style={{ ["--i" as string]: 0 }}
          className={`chip reply ${chosen === "no" ? "is-chosen" : ""}`}
          onClick={() => tap("no")}
        >
          {input.no}
        </button>
        <button
          type="button"
          style={{ ["--i" as string]: 1 }}
          className={`chip reply primary ${chosen === "yes" ? "is-chosen" : ""}`}
          onClick={() => tap("yes")}
        >
          {input.yes}
        </button>
      </div>
      {cancel}
    </div>
  );
}

/**
 * Reads a US mobile number. No US area code starts with 0 or 1, so a leading 1
 * is the country code, and anything else that can't be a US number is a problem
 * to show, never digits to quietly drop.
 */
export function phoneParts(raw: string): { national: string; country: boolean; problem: boolean } {
  const digits = raw.replace(/\D/g, "");
  const country = digits.startsWith("1");
  const national = country ? digits.slice(1) : digits;
  const foreign = /^\s*\+/.test(raw) && !!digits && !country;
  return { national, country, problem: foreign || national.length > 10 || /^[01]/.test(national) };
}

function formatNational(d: string): string {
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * "+1 (512) 555-0148" and "15125550148" both become (512) 555-0148. While such a
 * number is still being typed, the 1 stays in front ("1 (512) 555-01"), so the
 * field never shows a wrong area code. A number that can't be a US mobile stays as typed.
 */
export function formatPhone(raw: string): string {
  const { national, country, problem } = phoneParts(raw);
  const plus = /^\s*\+/.test(raw);
  if (problem) return raw.replace(/[^\d\s()+.-]/g, "");
  if (!country) return national ? formatNational(national) : plus ? "+" : "";
  if (national.length === 10) return formatNational(national);
  const code = plus ? "+1" : "1";
  return national ? `${code} ${formatNational(national)}` : code;
}

function formatInput(mode: string, raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (mode === "tel") return formatPhone(raw);
  if (mode === "otp") return digits.slice(0, 6);
  if (mode === "date") {
    const d = digits.slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  }
  return raw;
}

function ready(mode: string, value: string): boolean {
  if (mode === "tel") {
    const phone = phoneParts(value);
    return !phone.problem && phone.national.length === 10;
  }
  if (mode === "otp") return value.length === 6;
  if (mode === "date") return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
  if (mode === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  return value.trim().length > 0;
}

/**
 * A messaging-style composer. The element stays mounted while the patient moves
 * between typed questions (phone, code, birth date), so iOS keeps the keyboard up;
 * only its mode, placeholder and value change.
 */
export function Composer({
  nodeId,
  input,
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
  labelledBy,
}: {
  nodeId: string;
  input: Extract<ChatInput, { kind: "text" }>;
  initial: string;
  /** The previous answer is still being processed; keep focus, block resubmission. */
  pending: boolean;
  error?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  /** The question's bubble in the thread, which describes the field. */
  labelledBy?: string;
}) {
  const [value, setValue] = useState(formatInput(input.mode, initial));
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const ids = useId();
  const lastNode = useRef(nodeId);
  useLayoutEffect(() => {
    if (lastNode.current !== nodeId) {
      lastNode.current = nodeId;
      setValue(formatInput(input.mode, initial));
    }
    field.current?.focus({ preventScroll: true });
  }, [nodeId, input.mode, initial]);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el || input.mode !== "text") return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    // Only show a scrollbar once the note is taller than the composer allows.
    el.style.overflowY = el.scrollHeight > 132 ? "auto" : "hidden";
  }, [value, input.mode]);

  const canSend = ready(input.mode, value) && !pending;
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSubmit(input.mode === "tel" ? phoneParts(value).national : value.trim());
  };
  const message = error || (input.mode === "tel" && phoneParts(value).problem ? "US mobile numbers only" : "");
  const messageId = `${ids}-message`;
  const noteId = `${ids}-note`;
  const common = {
    ref: field,
    value,
    placeholder: input.placeholder,
    "aria-label": input.label ?? input.placeholder,
    "aria-describedby":
      [labelledBy, message ? messageId : "", input.footnote ? noteId : ""].filter(Boolean).join(" ") || undefined,
    "aria-invalid": message ? true : undefined,
    maxLength: input.maxLength,
    onChange: (event: { target: { value: string } }) => setValue(formatInput(input.mode, event.target.value)),
  };
  // The code helper is a reviewer shortcut, so it reads as one and never imitates the phone's own suggestion.
  const suggestions = input.mode === "otp" && !PREVIEW ? [] : (input.suggestions ?? []);
  const footer: ReactNode[] = [];
  if (input.alternate)
    footer.push(
      <button
        key="alt"
        type="button"
        className="dock-link"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onSubmit(input.alternate!.value)}
      >
        {input.alternate.label}
      </button>,
    );
  if (onCancel)
    footer.push(
      <button key="cancel" type="button" className="dock-link" onClick={onCancel}>
        Keep my answer
      </button>,
    );
  if (input.skip)
    footer.push(
      <button key="skip" type="button" className="dock-link" onClick={() => onSubmit("")}>
        {input.skip}
      </button>,
    );
  return (
    <form className="dock-inner composer-wrap" onSubmit={submit} noValidate>
      {suggestions.length ? (
        <div className="suggestions">
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              className={`chip suggestion ${input.mode === "otp" ? "preview" : ""}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setValue(formatInput(input.mode, suggestion))}
            >
              {input.mode === "otp" ? `Preview code: ${suggestion}` : suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`composer ${message ? "has-error" : ""}`}>
        {input.mode === "text" ? (
          <textarea
            {...common}
            rows={1}
            enterKeyHint="send"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
        ) : (
          <input
            {...common}
            type={input.mode === "email" ? "email" : "text"}
            inputMode={input.mode === "email" ? "email" : input.mode === "tel" ? "tel" : "numeric"}
            autoComplete={
              input.autoComplete ??
              (input.mode === "tel"
                ? "tel-national"
                : input.mode === "otp"
                  ? "one-time-code"
                  : input.mode === "email"
                    ? "email"
                    : "off")
            }
            enterKeyHint={input.mode === "email" ? "go" : "next"}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        )}
        <button
          type="submit"
          className="composer-send"
          disabled={!canSend}
          aria-label={input.submit}
          onPointerDown={(e) => e.preventDefault()}
        >
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      </div>
      {message ? (
        <p className="composer-error" id={messageId} role="alert">
          {message}
        </p>
      ) : null}
      {input.footnote ? (
        <p className="composer-hint" id={noteId}>
          {input.footnote}
        </p>
      ) : null}
      {footer.length ? <div className="dock-links">{footer}</div> : null}
    </form>
  );
}

/** The open composer once the onboarding questions are done: anything else goes to the assistant. */
export function AskComposer({
  onSend,
  busy,
  placeholder = `Message ${ASSISTANT.name}`,
}: {
  onSend: (text: string) => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    el.style.overflowY = el.scrollHeight > 120 ? "auto" : "hidden";
  }, [value]);
  const send = (event?: FormEvent) => {
    event?.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    onSend(text.slice(0, 600));
    setValue("");
  };
  return (
    <form className="composer ask" onSubmit={send} noValidate>
      <textarea
        ref={field}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={600}
        enterKeyHint="send"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <button
        type="submit"
        className="composer-send"
        disabled={!value.trim() || busy}
        aria-label="Send"
        onPointerDown={(e) => e.preventDefault()}
      >
        <ArrowUp size={19} strokeWidth={2.4} />
      </button>
    </form>
  );
}
