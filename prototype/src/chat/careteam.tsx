import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { CareMessage } from "../model/types";
import { formatTime } from "../model/fixtures";
import type { ChatContext } from "./agent";
import { ASSISTANT } from "./env";
import type { ChatJourney } from "./state";
import { ClinicianView, Section, TaskList } from "./sheets";
import { CATEGORY_LABEL, careReply, fallbackTriage, sendCareReply, triageRoute } from "./triage";
import "./careteam.css";

/*
 * The care team view: what the people behind Wren see, beside the conversation on wide
 * screens. Simulated in the preview; the patient never sees it.
 */

export type CareTab = "inbox" | "clinician";

const TABS: { id: CareTab; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "clinician", label: "Clinician" },
];

const URGENT_SUMMARY = "The crisis check flagged this. The patient saw the crisis lines and was told someone checks in today.";

export function CareTeamPanel({
  state,
  ctx,
  tab,
  onTab,
  onClose,
}: {
  state: ChatJourney;
  ctx: ChatContext;
  tab: CareTab;
  onTab: (tab: CareTab) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const tabsId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const messages = (state.careMessages ?? [])
    .filter((message) => message.sender === "patient")
    .sort((a, b) => b.at.localeCompare(a.at));
  const waiting = messages.filter((message) => !careReply(state, message.id)).length;
  const openTasks = state.chat.tasks.filter((task) => task.status === "open").length;
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  // The rail is one scroller: each view starts at its top, and so does the journey after closing.
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const rail = panel.current?.parentElement;
    rail?.scrollTo({ top: 0 });
    return () => rail?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <section className="ct-panel" aria-labelledby={titleId} ref={panel}>
      <div className="ct-head">
        <div>
          <h2 id={titleId} className="ct-title" ref={heading} tabIndex={-1}>
            Care team view
          </h2>
          <p className="ct-sub">What Legion’s care team sees. Simulated in this preview.</p>
        </div>
        <button type="button" className="icon-button ct-close" aria-label="Close care team view" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="ct-tabs" role="tablist" aria-label="Care team view">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${tabsId}-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`${tabsId}-panel`}
            className="ct-tab"
            onClick={() => onTab(item.id)}
          >
            {item.label}
            {item.id === "inbox" && waiting ? <span className="ct-count">{waiting}</span> : null}
          </button>
        ))}
      </div>
      <div className="ct-body" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === "inbox" ? (
          <div className="sh-sheet ct-inbox">
            {messages.length ? (
              <ol className="ct-messages" aria-label="Patient messages, newest first">
                {messages.map((message) => (
                  <InboxMessage key={message.id} message={message} state={state} ctx={ctx} />
                ))}
              </ol>
            ) : (
              <p className="sh-empty ct-empty">
                No messages yet. When the patient messages the care team from the chat, it lands here with a first
                pass from {ASSISTANT.name}.
              </p>
            )}
            <Section
              title="Care team queue"
              lead="Follow-ups a person owns, soonest due first."
              aside={openTasks ? `${openTasks} open` : undefined}
            >
              <TaskList tasks={state.chat.tasks} empty="Nothing in the queue." />
            </Section>
          </div>
        ) : (
          <ClinicianView state={state} ctx={ctx} />
        )}
      </div>
    </section>
  );
}

/** One patient message: how it was sorted, who owns it, and a reply to edit and send. */
function InboxMessage({ message, state, ctx }: { message: CareMessage; state: ChatJourney; ctx: ChatContext }) {
  const triage = message.urgent ? null : (message.triage ?? fallbackTriage(message.body));
  const drafting = triage?.status === "drafting";
  const route = triageRoute(state, message);
  const reply = careReply(state, message.id);
  const acknowledged = state.careMessages?.some((item) => item.replyTo === message.id && item.id !== reply?.id);
  const draft = triage?.draft ?? "";
  // The draft fills the field when it arrives, unless someone has already started typing.
  const [text, setText] = useState<string | null>(null);
  const value = text ?? draft;
  const edited = text !== null && text.trim() !== draft.trim();
  const fieldId = useId();
  // The field grows with the reply, so the whole draft can be read before it's sent.
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const fit = () => {
      // Measured without a scrollbar, which would narrow the lines while measuring.
      el.style.overflowY = "hidden";
      el.style.height = "auto";
      const height = el.scrollHeight + 2;
      el.style.height = `${Math.min(height, 360)}px`;
      el.style.overflowY = height > 360 ? "auto" : "hidden";
    };
    fit();
    // The rail widens as the view opens, which rewraps the lines.
    if (typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    sendCareReply(ctx, message.id, value);
  };

  return (
    <li className={`ct-msg ${message.urgent ? "is-urgent" : ""}`}>
      <div className="ct-msg-head">
        {drafting ? (
          <span className="ct-reading">{ASSISTANT.name} is reading this…</span>
        ) : (
          <span className="ct-route">
            <span className={`ct-cat is-${route.category}`}>{CATEGORY_LABEL[route.category]}</span>
            <span className="ct-owner">{route.owner}</span>
            <span className={`sh-due ${route.due === "Now" || route.due === "Today" ? "is-today" : ""}`}>
              <span className="sh-vh">Due </span>
              {route.due}
            </span>
          </span>
        )}
        <time className="ct-time" dateTime={message.at}>
          {formatTime(message.at)}
        </time>
      </div>
      {drafting ? null : <p className="ct-summary">{message.urgent ? URGENT_SUMMARY : triage?.summary}</p>}
      <blockquote className="ct-quote">{message.body}</blockquote>
      {acknowledged ? <p className="ct-meta">Automatic acknowledgment sent</p> : null}
      {reply ? (
        <div className="ct-sent">
          <p className="ct-sent-line" role="status">
            <Check size={14} strokeWidth={2.6} aria-hidden="true" />
            Sent{reply.author ? ` as ${reply.author}` : ""}
            <time dateTime={reply.at}>{formatTime(reply.at)}</time>
          </p>
          <p className="ct-sent-body">{reply.body}</p>
        </div>
      ) : (
        <form className="ct-reply" onSubmit={send}>
          <div className="ct-reply-head">
            <label htmlFor={fieldId}>Reply</label>
            {draft && !edited ? (
              <span className="ct-source">
                <Sparkles size={12} aria-hidden="true" />
                Drafted by {ASSISTANT.name}
              </span>
            ) : edited && draft ? (
              <button type="button" className="ct-reset" onClick={() => setText(null)}>
                Use the draft
              </button>
            ) : null}
          </div>
          <textarea
            ref={field}
            id={fieldId}
            className={drafting ? "is-drafting" : ""}
            rows={4}
            maxLength={1000}
            value={value}
            placeholder={drafting ? "Drafting a reply…" : "Write a reply"}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="sh-btn is-primary ct-send" disabled={!value.trim()}>
            Send reply
          </button>
        </form>
      )}
    </li>
  );
}
