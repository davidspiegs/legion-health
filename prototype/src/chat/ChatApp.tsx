import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Info, LifeBuoy, ListChecks, SlidersHorizontal, Sparkles, UsersRound, X } from "lucide-react";
import { createMockApi } from "../model/services";
import { applyJourneyPatch, joinAvailability, journeyNow, recoverPaymentSetup } from "../model/journey-state";
import { formatTime } from "../model/fixtures";
import { useMobileViewport } from "../hooks/useMobileViewport";
import { useCareSimulation } from "../hooks/useCareSimulation";
import type { CareMessage, JourneyState, Scenario } from "../model/types";
import { answerEvent, milestoneEvents } from "./analytics";
import { STAGES, deriveTranscript, stageProgress, type TranscriptItem } from "./engine";
import { useReducedMotion, useReveal } from "./useReveal";
import {
  AgentAvatar,
  AskComposer,
  AssistantAvatar,
  ChoiceControls,
  Composer,
  LegionMark,
  PatientBubble,
  QuickActions,
  TypingBubble,
  markShown,
  useDoubleTapShield,
} from "./parts";
import { registerCards, renderCard } from "./cards";
import { SCRIPT, readingStory } from "./script";
import { flagRisk } from "./safety";
import { answerQuestion } from "./guide-ai";
import {
  clinicianFirst,
  matchInputs,
  recordsFor,
  runBenefits,
  runMatch,
  runRecords,
  sendPlanPrescriptions,
  skipToVisitDay,
  stamp,
  track,
  type ChatContext,
  type ChatPatch,
} from "./agent";
import { ASSISTANT, PREVIEW } from "./env";
import {
  addAsk,
  answerTyped,
  billingLine,
  checkInOpensLine,
  quickActions,
  recoverAsks,
  settleAsk,
  urgentQuestion,
  visitWhenLine,
  type QuickId,
} from "./assistant";
import { clinicianById, inventory } from "./inventory";
import { momentState, type Moment } from "./moments";
import { STORAGE_KEY, initialChat, initialChatJourney, type Ask, type AskActionId, type ChatJourney, type ChatState } from "./state";
import { reconcile } from "./reconcile";
import type { SheetMap, SheetProps, WidgetMap } from "./registry";
import { WORK_CARDS } from "./cards-work";
import { CLINICIAN_CARDS, CLINICIAN_SHEETS } from "./clinicians";
import { FORM_CARDS, FORM_SHEETS, FORM_WIDGETS } from "./forms";
import { VISIT_CARDS, VISIT_SHEETS, VISIT_WIDGETS, VisitRoom } from "./visit";
import { INFO_CARDS, INFO_SHEETS } from "./sheets";
import { BOOKED_CARDS, downloadCalendar } from "./cards-booked";
import { ChatBoundary } from "./boundary";
import { CareTeamPanel, type CareTab } from "./careteam";
import { recoverTriage, triageMessage } from "./triage";
import "./chat.css";
import "./cards.css";

registerCards({ ...INFO_CARDS, ...WORK_CARDS, ...CLINICIAN_CARDS, ...FORM_CARDS, ...VISIT_CARDS, ...BOOKED_CARDS });
const SHEETS: SheetMap = { ...INFO_SHEETS, ...CLINICIAN_SHEETS, ...FORM_SHEETS, ...VISIT_SHEETS };
const WIDGETS: WidgetMap = { ...FORM_WIDGETS, ...VISIT_WIDGETS };

const STORAGE = STORAGE_KEY;

let pageviewSent = false;

function restore(): ChatJourney {
  inventory();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (saved?.version === 1 && saved.chat?.version === 1) {
      const base = initialChatJourney();
      const restored: ChatJourney = {
        ...base,
        ...saved,
        profile: { ...base.profile, ...saved.profile },
        // An interrupted benefits check restarts rather than showing a stale spinner.
        eligibility:
          saved.eligibility?.status === "checking"
            ? { status: "unverified", estimate: null }
            : saved.eligibility || base.eligibility,
        paymentSetup: saved.paymentSetup ? recoverPaymentSetup(saved.paymentSetup) : base.paymentSetup,
        careMessages: (saved.careMessages || []).map((message: object) =>
          // A first pass cut off by the reload shows its fallback rather than drafting forever.
          recoverTriage({ sender: "patient", status: "delivered", ...message } as CareMessage),
        ),
        chat: {
          ...initialChat(),
          ...saved.chat,
          // Work that was mid-flight when the page closed is shown as not started.
          jobs: Object.fromEntries(
            Object.entries(saved.chat.jobs || {}).filter(
              ([, job]) => (job as { status?: string })?.status !== "running",
            ),
          ),
          // Events from before the PostHog format are dropped rather than shown half-formed.
          analytics: ((saved.chat.analytics || []) as { uuid?: string }[]).filter((item) => !!item?.uuid) as ChatState["analytics"],
          // A typed question still being answered when the page closed can't finish now.
          asks: recoverAsks((saved.chat.asks || []) as Ask[]),
          // Records saved when they held a single medication are read again as the regimen.
          recordsFound:
            saved.chat.recordsFound && !Array.isArray(saved.chat.recordsFound.medications)
              ? recordsFor({ conditions: saved.conditions ?? [] })
              : (saved.chat.recordsFound ?? null),
        },
      };
      return withKnownSlots(restored);
    }
  } catch {
    /* A fresh conversation is safe when storage is unavailable. */
  }
  return initialChatJourney();
}

/** A held time that rolled out of the regenerated inventory is let go; booked visits keep their own start. */
function withKnownSlots(s: ChatJourney): ChatJourney {
  const { slots, followups } = inventory();
  const known = (id: string) => slots.some((slot) => slot.id === id) || followups.some((slot) => slot.id === id);
  if (s.appointment || !s.slotId || known(s.slotId)) return s;
  return { ...s, slotId: "", reservation: null, chat: { ...s.chat, slotChosen: false } };
}

function ChatApp() {
  const [state, setState] = useState<ChatJourney>(restore);
  const stateRef = useRef(state);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ name: string; data?: string } | null>(null);
  const [visitOpen, setVisitOpen] = useState(false);
  // After booking, the dock can switch from the current question to "something else".
  const [homeOpen, setHomeOpen] = useState(false);
  const [askBusy, setAskBusy] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [epoch, setEpoch] = useState(0);
  // Restart and jump start a new generation; work from an older one can't write into it.
  const epochRef = useRef(0);
  const [notice, setNotice] = useState("");
  // The care team view takes the rail's place on wide screens (Preview only).
  const [careOpen, setCareOpen] = useState(false);
  const [careTab, setCareTab] = useState<CareTab>("inbox");
  const careButton = useRef<HTMLButtonElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const pinned = useRef(true);
  const autoScrollUntil = useRef(0);
  const typing = useMobileViewport(app);

  const replace = useCallback((next: ChatJourney) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const update = useCallback(
    (patch: ChatPatch) => {
      const { chat, ...journey } = patch;
      const previous = stateRef.current;
      let next = applyJourneyPatch(previous, journey as Partial<JourneyState>) as ChatJourney;
      next = { ...next, chat: chat ? { ...previous.chat, ...chat } : previous.chat };
      replace(reconcile(previous, next));
    },
    [replace],
  );

  const api = useMemo(() => {
    const generation = epoch;
    return createMockApi({
      getState: () => stateRef.current,
      update: (patch) => {
        if (epochRef.current === generation) update(patch);
      },
    });
  }, [update, epoch]);
  useCareSimulation(stateRef, api, update);

  const act = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : "That didn’t go through. Your answers are still here, so try again.",
      );
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const transcript = useMemo(() => deriveTranscript(SCRIPT, state), [state]);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const answerRef = useRef<(value: string | string[], target?: string) => void>(() => {});
  const seenAtMount = useRef(new Set(state.chat.seen));
  const entered = useRef<string | null>(null);

  const ctx: ChatContext = useMemo(() => {
    // Work started before a restart or jump finishes into nothing, not into the new conversation.
    const generation = epoch;
    const live = (patch: ChatPatch) => {
      if (epochRef.current === generation) update(patch);
    };
    return {
      get: () => stateRef.current,
      update: live,
      api,
      act,
      openSheet: (name, data) => setSheet({ name, data }),
      closeSheet: () => setSheet(null),
      answer: (value, nodeId) => answerRef.current(value, nodeId),
      edit: (nodeId) => {
        setError("");
        setEditing(nodeId);
      },
      setVisitOpen,
      preview: {
        restart: () => {
          setEditing(null);
          setSheet(null);
          setVisitOpen(false);
          seenAtMount.current = new Set();
          entered.current = null;
          epochRef.current += 1;
          setEpoch(epochRef.current);
          replace(initialChatJourney());
        },
        jump: (moment) => {
          setEditing(null);
          setSheet(null);
          setVisitOpen(false);
          const next = momentState(moment as Moment, stateRef.current.scenario);
          // Everything before the moment appears in place rather than replaying.
          seenAtMount.current = new Set(next.chat.seen);
          entered.current = null;
          epochRef.current += 1;
          setEpoch(epochRef.current);
          replace(next);
        },
        setScenario: (scenario) => update({ scenario: scenario as Scenario, faultsUsed: [] }),
      },
    };
  }, [update, api, act, replace, epoch]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      /* Progress stays in memory for this session. */
    }
  }, [state]);

  const markSeen = useCallback(
    (keys: string[]) => {
      const seen = new Set(stateRef.current.chat.seen);
      const fresh = keys.filter((key) => !seen.has(key));
      if (fresh.length) update({ chat: { seen: [...stateRef.current.chat.seen, ...fresh] } });
    },
    [update],
  );
  const { visible, settled, next } = useReveal(transcript.items, state.chat.seen, markSeen, epoch);

  const activeNode = transcript.active?.node ?? null;
  const editingNode = editing ? SCRIPT.find((node) => node.id === editing) ?? null : null;
  const dockNode = editingNode ?? activeNode;
  const dockInput = dockNode?.input?.(state) ?? null;
  useEffect(() => setHomeOpen(false), [dockNode?.id]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Background work starts when its question becomes current, and again if its inputs change.
  const enterKey = activeNode ? `${activeNode.id}:${activeNode.enterKey?.(state) ?? ""}` : null;
  useEffect(() => {
    if (!settled || !activeNode || !enterKey || editing) return;
    if (entered.current === enterKey) return;
    entered.current = enterKey;
    activeNode.enter?.(ctx);
  }, [settled, activeNode, enterKey, editing, ctx]);

  // An edit upstream re-runs work that depended on it, even after it was answered.
  const matchKey = matchInputs(state);
  const booked = !!state.appointment;
  useEffect(() => {
    const s = stateRef.current;
    if (booked || editing) return;
    const job = s.chat.jobs.match;
    if (s.chat.match && job?.status === "done" && job.inputs !== matchKey) void runMatch(ctx);
  }, [matchKey, booked, editing, ctx]);
  const needsBenefits =
    !booked &&
    !editing &&
    state.coverage === "insurance" &&
    state.chat.identity === "confirmed" &&
    state.chat.benefitsChoice !== "selfpay" &&
    // Coverage is checked for a held time; after a release it waits for the next pick.
    !!state.slotId &&
    state.chat.slotChosen &&
    !state.chat.benefits &&
    !state.chat.jobs.benefits;
  useEffect(() => {
    if (needsBenefits) void runBenefits(ctx);
  }, [needsBenefits, ctx]);

  // A records search interrupted by a reload starts again instead of spinning forever.
  const resumeRecords =
    booked && state.chat.records === "yes" && !state.chat.recordsFound && !state.chat.jobs.records;
  useEffect(() => {
    if (resumeRecords) void runRecords(ctx);
  }, [resumeRecords, ctx]);

  // Visit day arrives an hour before the visit, with the hour-before reminder, not only through the preview's skip.
  useEffect(() => {
    const centralDay = (time: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(time);
    const check = () => {
      const s = stateRef.current;
      if (!s.appointment || s.appointment.status !== "confirmed" || s.visitDay) return;
      const start = new Date(s.appointment.start).getTime();
      const now = journeyNow(s);
      if (centralDay(now) === centralDay(start) && now >= start - 60 * 60_000) update({ visitDay: true });
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [update, epoch]);

  // Journey milestones as PostHog events: what changed since the last state of this same conversation.
  // A restart or preview jump replaces the conversation, so it starts a fresh baseline instead.
  const watched = useRef<{ epoch: number; state: ChatJourney } | null>(null);
  useEffect(() => {
    const last = watched.current;
    watched.current = { epoch, state };
    if (!last || last.epoch !== epoch) return;
    for (const [event, props] of milestoneEvents(last.state, state)) track(ctx, event, props);
  }, [state, epoch, ctx]);

  // One $pageview per page load, as posthog-js sends (development mode runs this effect twice).
  useEffect(() => {
    if (pageviewSent) return;
    pageviewSent = true;
    track(ctx, "$pageview", { $pathname: window.location.pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = useCallback(
    async (value: string | string[], target?: string) => {
      const node = editingNode ?? transcriptRef.current.active?.node;
      if (!node?.submit) return;
      // A card or sheet answers its own question, never whichever one is current by then.
      if (target && node.id !== target) return;
      setError("");
      pinned.current = true;
      const wasEditing = !!editingNode;
      const before = answerText(node, stateRef.current);
      // The options as they were offered, so the event records only a choice that was one of them.
      const input = node.input?.(stateRef.current);
      setPending(true);
      let answered = false;
      try {
        answered = (await node.submit(value, ctx)) !== false;
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "That didn’t go through. Try again.");
      } finally {
        setPending(false);
      }
      // An action inside a change (opening all times, switching to typing) keeps it open.
      if (!answered) return;
      const now = stateRef.current;
      const after = answerText(node, now);
      const changed = !!after && after !== before;
      // The clinician's view shows when each answer was given and how it changed.
      if (changed || (after && !now.chat.answeredAt[node.id])) {
        const at = stamp(now);
        update({
          chat: {
            answeredAt: { ...now.chat.answeredAt, [node.id]: at },
            ...(wasEditing && changed && before
              ? { history: [...now.chat.history, { node: node.id, from: before, to: after, at }] }
              : {}),
          },
        });
      }
      if (changed) {
        const [event, props] = answerEvent(node, input, value, stateRef.current, wasEditing);
        track(ctx, event, props);
      }
      if (!wasEditing) return;
      pinned.current = true;
      setEditing(null);
      // Choosing the same answer again just closes the change; nothing is marked as edited.
      if (!changed) return;
      const edits = stateRef.current.chat.edits;
      update({ chat: { edits: { ...edits, [node.id]: (edits[node.id] ?? 0) + 1 } } });
      setNotice("Updated. I re-checked anything that depended on that answer.");
    },
    [ctx, editingNode, update],
  );
  answerRef.current = answer;

  // A new question means the patient just acted, even when a card or sheet finished the step.
  const activeId = activeNode?.id;
  useLayoutEffect(() => {
    pinned.current = true;
  }, [activeId]);

  // Asks and care-team replies grow the thread outside the script, so they count toward "something new",
  // including an answer rewritten in place, such as a move being confirmed.
  const askSize = state.chat.asks.reduce(
    (size, ask) => size + (ask.status === "done" ? 1 + ask.answer.length + (ask.actions?.length ?? 0) : 0),
    0,
  );
  const threadTail = `${state.chat.asks.length}:${askSize}:${(state.careMessages ?? []).length}`;

  // Keep the newest message in view unless the patient has scrolled up to reread.
  useEffect(() => {
    const el = thread.current;
    if (!el) return;
    const onScroll = () => {
      // The header lifts off the thread once there's something under it.
      setScrolled(el.scrollTop > 6);
      // Our own smooth scrolling fires scroll events too; only the reader's scrolling unpins.
      if (Date.now() < autoScrollUntil.current) return;
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const el = thread.current;
    // While an answer is being changed, the thread stays on that answer.
    if (!el || !pinned.current || editing) return;
    const items = el.querySelectorAll<HTMLElement>(".thread-item");
    const last = items[items.length - 1];
    autoScrollUntil.current = Date.now() + 700;
    // Tall cards are shown from their top; otherwise the newest line stays in view.
    if (last && last.offsetHeight > el.clientHeight * 0.7) {
      el.scrollTo({ top: last.offsetTop - 12, behavior: reduced ? "auto" : "smooth" });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: typing || reduced ? "auto" : "smooth" });
    }
  }, [visible.length, settled, editing, typing, dockInput?.kind, reduced, threadTail]);

  // When the dock grows (a panel opens, a field appears), the newest line stays in view.
  useEffect(() => {
    const el = dock.current;
    const list = thread.current;
    if (!el || !list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!pinned.current || editing) return;
      autoScrollUntil.current = Date.now() + 300;
      list.scrollTo({ top: list.scrollHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [dockNode?.id, editing, homeOpen]);

  // Turning the phone reflows the thread; the current question stays in view.
  useEffect(() => {
    const follow = () => {
      const el = thread.current;
      if (!el || !pinned.current || editing) return;
      const items = [...el.querySelectorAll<HTMLElement>(".thread-item")];
      const active = transcriptRef.current.active?.node.id;
      const bottom = el.scrollHeight - el.clientHeight;
      autoScrollUntil.current = Date.now() + 300;
      // Anything newer than the question, like a typed question and its answer, keeps the bottom in view.
      if (!active || items[items.length - 1]?.dataset.node !== active) return el.scrollTo({ top: bottom });
      // Otherwise all of the question when it fits, or from its own text, since a card can come before it.
      const own = items.filter((item) => item.dataset.node === active);
      const question = [...own].reverse().find((item) => item.querySelector(".msg.from-agent:not(.is-card)")) ?? own[0];
      el.scrollTo({ top: Math.min(bottom, question.offsetTop - 12) });
    };
    // Only a change of width moves the view; the keyboard changes only the height. The shell takes
    // its new size a frame later (useMobileViewport), and the reflow moves the scroll position, which
    // isn't the reader scrolling away, so whether the thread was following is read first.
    let width = window.innerWidth;
    let timer = 0;
    let wasPinned = false;
    const onResize = () => {
      if (window.innerWidth === width) return;
      if (!timer) wasPinned = pinned.current;
      autoScrollUntil.current = Date.now() + 600;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        width = window.innerWidth;
        if (!wasPinned) return;
        pinned.current = true;
        follow();
      }, 180);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [editing]);

  // Changing an answer brings it into view and moves focus to the controls that change it.
  useEffect(() => {
    if (!editing) return;
    autoScrollUntil.current = Date.now() + 700;
    thread.current
      ?.querySelector<HTMLElement>(`[data-answer="${editing}"]`)
      ?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    const frame = requestAnimationFrame(() =>
      dock.current
        ?.querySelector<HTMLElement>("button:not([disabled]), textarea, input")
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [editing, reduced]);

  // Once the plan is signed, the simulated clinician continues the patient's regimen through
  // DoseSpot, one prescription per medication. Anything new is decided in the visit itself.
  useEffect(() => {
    if (state.carePlan.status === "published") void sendPlanPrescriptions(ctx);
  }, [state.carePlan.status, ctx]);

  // Leaving the visit room: when whatever opened it is gone, focus goes to what's next in the dock.
  const roomWasOpen = useRef(false);
  useEffect(() => {
    if (visitOpen) {
      roomWasOpen.current = true;
      return;
    }
    if (!roomWasOpen.current) return;
    roomWasOpen.current = false;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      dock.current
        ?.querySelector<HTMLElement>("button:not([disabled]), textarea, input")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [visitOpen]);

  // After a reload, a patient who'd checked in goes back to the waiting room.
  useEffect(() => {
    if (stateRef.current.encounter.status === "waiting") setVisitOpen(true);
  }, []);

  useEffect(() => {
    // The room reopens itself if the visit is live after a reload.
    if (state.encounter.status === "in_progress" && state.encounter.connection === "connected") setVisitOpen(true);
  }, [state.encounter.status, state.encounter.connection]);

  const progress = stageProgress(transcript);
  // Stage reach, the chat's equivalent of the page reach the brief's August funnel counts. Once per stage.
  useEffect(() => {
    const stage = progress.stage;
    if (stateRef.current.chat.analytics.some((item) => item.event === "portal.onboarding.stage_entered" && item.properties.stage === stage)) return;
    track(ctx, "portal.onboarding.stage_entered", { stage });
  }, [progress.stage, epoch, ctx]);
  const stageTitle = STAGES[progress.index]?.title ?? "";
  const remainingLabel = transcript.halted
    ? "Paused"
    : progress.stage === "visit"
      ? state.appointment?.status === "completed"
        ? "First visit complete"
        : "Through your first visit"
      : progress.remaining <= 2
        ? "Almost booked"
        : `About ${Math.max(1, Math.round((progress.remaining * 12) / 60))} min to booking`;

  // While earlier messages are still arriving, a typed question keeps its composer.
  const showDock = !!dockNode && !!dockInput && (settled || !!editingNode || dockInput.kind === "text");
  const sheetEntry = sheet
    ? sheet.name === "message"
      ? {
          title: `Message ${state.appointment ? clinicianFirst(state.appointment.providerId) : "your care team"}`,
          render: (props: SheetProps) => <MessageSheet {...props} />,
        }
      : SHEETS[sheet.name]
    : null;
  const dockValue = dockNode?.value?.(state);
  const editingQuestion = editingNode ? askText(editingNode, state) : "";

  // ---------------------------------------------------------------- after booking
  const homeActions = quickActions(state);
  // Keeping an answer drops the error its change raised, so it doesn't sit under the next question.
  const keepAnswer = () => {
    pinned.current = true;
    setEditing(null);
    setError("");
  };
  const anchorNow = () => transcriptRef.current.active?.node.id ?? visible[visible.length - 1]?.nodeId ?? "hello";
  const scrollToNode = (nodeId: string) =>
    thread.current
      ?.querySelector<HTMLElement>(`[data-node="${nodeId}"]`)
      ?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });

  const runQuick = (id: QuickId) => {
    const s = stateRef.current;
    track(ctx, "portal.assistant.quick_action", { action: id });
    const first = s.appointment ? clinicianFirst(s.appointment.providerId) : "your clinician";
    pinned.current = true;
    switch (id) {
      case "when":
        addAsk(ctx, anchorNow(), { question: "When is my visit?", answer: visitWhenLine(s), actions: ["calendar"] });
        break;
      case "join":
        if (joinAvailability(s) === "open") setHomeOpen(false);
        else
          addAsk(ctx, anchorNow(), {
            question: "When can I join?",
            answer: checkInOpensLine(s),
            actions: PREVIEW ? ["checkin-skip"] : [],
          });
        break;
      case "prep":
        setHomeOpen(false);
        ctx.edit("prep");
        break;
      case "reschedule":
        addAsk(ctx, anchorNow(), {
          question: "I need to reschedule",
          answer: `Here are ${first}’s open times. Pick one and I’ll move your visit.`,
          awaiting: "move",
        });
        setSheet({ name: "reschedule" });
        break;
      case "message":
        setSheet({ name: "message" });
        break;
      case "chart":
        setSheet({ name: "chart", data: anchorNow() });
        break;
      case "rx":
        setSheet({ name: "message", data: "rx" });
        break;
      case "billing":
        addAsk(ctx, anchorNow(), { question: "What will I pay?", answer: billingLine(s), actions: ["message"] });
        break;
      case "support":
        setSheet({ name: "help" });
        break;
      case "plan":
        scrollToNode("plan");
        break;
      case "followup":
        openFollowup();
        break;
      case "preview-day":
        setSheet({ name: "skip" });
        break;
      case "preview-checkin":
        skipToVisitDay(ctx);
        break;
    }
  };

  // The follow-up question is shown while it's still open; once answered, it opens to change.
  const openFollowup = () => {
    setHomeOpen(false);
    if (transcriptRef.current.active?.node.id !== "followup") ctx.edit("followup");
  };

  const runAskAction = (action: AskActionId, askId?: string) => {
    const s = stateRef.current;
    if (action === "calendar" && s.appointment) downloadCalendar(s.appointment.start);
    if (action === "reschedule") {
      // The exchange that offered the move waits for it, so the conversation can confirm it.
      if (askId)
        ctx.update({ chat: { asks: s.chat.asks.map((ask) => (ask.id === askId ? { ...ask, awaiting: "move" } : ask)) } });
      setSheet({ name: "reschedule" });
    }
    if (action === "message") setSheet({ name: "message" });
    if (action === "support") setSheet({ name: "help" });
    if (action === "checkin-skip") skipToVisitDay(ctx);
    if (action === "followup") openFollowup();
    if (action === "join") setHomeOpen(false);
  };

  const sendTyped = async (text: string) => {
    pinned.current = true;
    setAskBusy(true);
    const id = addAsk(ctx, anchorNow(), { question: text, status: "thinking" });
    // Crisis lines show at once. Other replies wait a beat, so the question settles on screen first.
    const reply = urgentQuestion(text)
      ? await answerTyped(ctx, text)
      : (await Promise.all([answerTyped(ctx, text), new Promise((resolve) => setTimeout(resolve, 650))]))[0];
    settleAsk(ctx, id, { answer: reply.answer, actions: reply.actions, status: "done", source: reply.source });
    track(ctx, "portal.assistant.question_answered", { source: reply.source, actions: reply.actions.length });
    setAskBusy(false);
  };

  // Asks stay after the step they were asked at, so they keep their place as the thread grows.
  const rows: ({ kind: "item"; item: TranscriptItem; index: number } | { kind: "ask"; ask: Ask })[] = [];
  const placed = new Set<string>();
  visible.forEach((item, index) => {
    rows.push({ kind: "item", item, index });
    if (visible[index + 1]?.nodeId === item.nodeId) return;
    for (const ask of state.chat.asks)
      if (ask.anchor === item.nodeId && !placed.has(ask.id)) {
        placed.add(ask.id);
        rows.push({ kind: "ask", ask });
      }
  });
  if (settled) for (const ask of state.chat.asks) if (!placed.has(ask.id)) rows.push({ kind: "ask", ask });

  // Only the newest answer shows its pencil; "Why I ask" sits under the current question.
  const latestAnswer = [...visible].reverse().find((item) => item.from === "patient" && item.answer.editable)?.key;
  const whyKey =
    !editing && activeNode?.why
      ? [...visible]
          .reverse()
          .find((item) => item.nodeId === activeNode.id && item.from === "agent" && item.block.kind === "text")?.key
      : undefined;
  // Wren types while the next message is paced in, and while Claude reads the patient's words.
  const typingNow = settled ? readingStory(state) : next?.from === "agent";
  const showHome = booked && settled && !editingNode && homeActions.length > 0 && (!dockInput || homeOpen);
  // While a sheet or the visit room is up, the conversation behind it is out of reach, for screen readers too.
  const covered = visitOpen || !!(sheet && sheetEntry);
  const dockKey = showHome
    ? "home"
    : showDock && dockNode && dockInput
      ? dockInput.kind === "text"
        ? "composer"
        : `${dockNode.id}:${editing ? "edit" : "ask"}`
      : "";
  // Answers that just appeared under a finger don't take the second tap of a double tap.
  useDoubleTapShield();
  useLayoutEffect(() => markShown(dock.current), [dockKey]);

  return (
    <div className={`chat-app ${typing ? "is-typing" : ""} ${careOpen ? "is-care-open" : ""}`} ref={app}>
      <header className={`chat-header ${scrolled ? "is-scrolled" : ""}`} inert={covered}>
        <button
          type="button"
          className="chat-who"
          onClick={() => setSheet({ name: "journey" })}
          aria-label={`${ASSISTANT.name}, ${ASSISTANT.role}. ${stageTitle}, part ${progress.index + 1} of 4, ${remainingLabel.toLowerCase()}. Open your journey and answers.`}
        >
          <AssistantAvatar size="md" />
          <span className="chat-who-text">
            <strong>{ASSISTANT.name}</strong>
            <span>{ASSISTANT.role}</span>
          </span>
        </button>
        <div className="chat-header-actions">
          {PREVIEW ? (
            <button
              type="button"
              ref={careButton}
              className="care-view-toggle"
              aria-pressed={careOpen}
              onClick={() => setCareOpen((open) => !open)}
            >
              <UsersRound size={16} strokeWidth={2} aria-hidden="true" />
              Care team view
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-label="Your journey and answers"
            onClick={() => setSheet({ name: "journey" })}
          >
            <ListChecks size={21} strokeWidth={1.9} />
          </button>
          <button type="button" className="icon-button" aria-label="Help" onClick={() => setSheet({ name: "help" })}>
            <LifeBuoy size={21} strokeWidth={1.9} />
          </button>
        </div>
        <div className="chat-progress" aria-hidden="true">
          {STAGES.map((stage, index) => (
            <i key={stage.id}>
              <b
                style={{
                  ["--fill" as string]: `${
                    index < progress.index ? 100 : index === progress.index ? Math.max(6, progress.fraction * 100) : 0
                  }%`,
                }}
              />
            </i>
          ))}
        </div>
      </header>
      <div className="chat-body" inert={covered}>
        <main className="chat-main">
          <div className="chat-thread" ref={thread} role="log" aria-label={`Conversation with ${ASSISTANT.name}`}>
            <ThreadIntro />
            <p className="thread-time">{startedLabel(state)}</p>
            {rows.map((row) =>
              row.kind === "item" ? (
                <ThreadItem
                  key={row.item.key}
                  item={row.item}
                  previous={visible[row.index - 1]}
                  next={visible[row.index + 1]}
                  enter={!seenAtMount.current.has(row.item.key)}
                  state={state}
                  ctx={ctx}
                  active={editing ? editing === row.item.nodeId : transcript.active?.node.id === row.item.nodeId}
                  changing={editing === row.item.nodeId}
                  edited={(state.chat.edits[row.item.nodeId] ?? 0) > 0}
                  latest={row.item.key === latestAnswer}
                  why={row.item.key === whyKey ? activeNode?.why : undefined}
                  onEdit={() => ctx.edit(row.item.nodeId)}
                />
              ) : (
                <AskRow key={row.ask.id} ask={row.ask} state={state} onAction={runAskAction} />
              ),
            )}
            {typingNow ? <TypingBubble /> : null}
          </div>
          {showHome ? (
            <div ref={dock} className="chat-dock home enter" key="home">
              {notice ? (
                <p className="dock-notice" role="status">
                  {notice}
                </p>
              ) : null}
              <QuickActions actions={homeActions} onPick={(id) => runQuick(id as QuickId)} busy={askBusy} />
              <AskComposer onSend={(text) => void sendTyped(text)} busy={askBusy} />
              {homeOpen && dockInput ? (
                <div className="dock-links">
                  <button type="button" className="dock-link" onClick={() => setHomeOpen(false)}>
                    Back to my question
                  </button>
                </div>
              ) : null}
            </div>
          ) : showDock && dockNode && dockInput ? (
            <div
              ref={dock}
              className="chat-dock enter"
              key={dockKey}
            >
              {editingNode ? (
                <p className="dock-context">
                  {editingQuestion ? (
                    <>
                      Changing: <strong>{editingQuestion}</strong>
                    </>
                  ) : (
                    "Change your answer"
                  )}
                </p>
              ) : null}
              {notice && !editingNode ? (
                <p className="dock-notice" role="status">
                  {notice}
                </p>
              ) : null}
              {dockInput.kind === "text" ? (
                <Composer
                  nodeId={dockNode.id}
                  labelledBy={`ask-${dockNode.id}`}
                  input={dockInput}
                  initial={editingNode && typeof dockValue === "string" ? dockValue : ""}
                  pending={pending || busy || (!settled && !editingNode)}
                  error={error || (dockNode.id === "code" ? state.chat.codeError : "") || undefined}
                  onSubmit={(value) => void answer(value)}
                  onCancel={editingNode ? keepAnswer : undefined}
                />
              ) : dockInput.kind === "widget" ? (
                <div className="dock-inner dock-widget">
                  {WIDGETS[dockInput.widget]?.({ state, ctx, busy: busy || pending, error }) ?? (
                    <button type="button" className="chip primary" onClick={() => void answer(dockInput.widget)}>
                      {dockInput.label ?? "Continue"}
                    </button>
                  )}
                  {editingNode ? (
                    <button type="button" className="dock-link" onClick={keepAnswer}>
                      Keep my answer
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <ChoiceControls
                    input={dockInput}
                    labelledBy={`ask-${dockNode.id}`}
                    initial={dockValue}
                    busy={busy || pending}
                    onAnswer={(value) => void answer(value)}
                    onCancel={editingNode ? keepAnswer : undefined}
                  />
                  {error ? (
                    <p className="composer-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                </>
              )}
              {booked && !editingNode && homeActions.length ? (
                <div className="dock-links">
                  <button type="button" className="dock-link" onClick={() => setHomeOpen(true)}>
                    Something else?
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="chat-dock is-empty" aria-hidden="true" />
          )}
        </main>
        <aside className="chat-rail" aria-label={careOpen ? "Care team view" : "Your first visit"}>
          {careOpen ? (
            <CareTeamPanel
              state={state}
              ctx={ctx}
              tab={careTab}
              onTab={setCareTab}
              onClose={() => {
                setCareOpen(false);
                careButton.current?.focus({ preventScroll: true });
              }}
            />
          ) : (
            <>
              {PREVIEW ? (
                <button type="button" className="preview-pill in-rail" onClick={() => setSheet({ name: "preview" })}>
                  <SlidersHorizontal size={14} /> Preview tools
                </button>
              ) : null}
              {INFO_SHEETS.journey?.render({ state, ctx, close: () => undefined, data: "rail" })}
            </>
          )}
        </aside>
      </div>
      {sheet && sheetEntry ? (
        <SheetDialog key={sheet.name} title={sheetEntry.title} onClose={() => setSheet(null)}>
          {sheetEntry.render({ state, ctx, close: () => setSheet(null), data: sheet.data })}
        </SheetDialog>
      ) : null}
      {visitOpen && state.appointment ? <VisitRoom state={state} ctx={ctx} close={() => setVisitOpen(false)} /> : null}
    </div>
  );
}

/**
 * Writing to the clinician and care team. The message goes to the care team's
 * thread (simulated); it shows in the conversation, and so does their reply.
 */
function MessageSheet({ state, ctx, close, data }: SheetProps) {
  const first = state.appointment ? clinicianFirst(state.appointment.providerId) : "your clinician";
  const [text, setText] = useState(data === "rx" ? "About my prescription: " : "");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setProblem("");
    try {
      ctx.update({ careMessage: body });
      await ctx.api.sendCareMessage();
      // Crisis words get the crisis lines now, the same as anywhere else; the message still reaches the team.
      const urgent = urgentQuestion(body);
      const sent = [...(ctx.get().careMessages ?? [])].reverse().find((message) => message.sender === "patient");
      if (urgent) {
        flagRisk(ctx, "message", body);
        track(ctx, "portal.support.crisis_resources_shown", { source: "message" });
        ctx.update({
          careMessages: (ctx.get().careMessages ?? []).map((message) =>
            message.id === sent?.id ? { ...message, urgent: true } : message,
          ),
        });
      }
      // The care team inbox gets a first pass in the background; urgent messages skip it.
      if (sent && !urgent) void triageMessage(ctx, sent.id);
      const anchor = deriveTranscript(SCRIPT, ctx.get()).active?.node.id ?? "complete";
      addAsk(ctx, anchor, {
        question: body,
        answer: urgent
          ? `${answerQuestion(body).text} I’ve also sent your message to ${first} and the care team, and someone will check in with you today.`
          : `Sent to ${first} and the care team. They usually reply within one business day, and their reply shows up here.`,
        actions: urgent ? ["support"] : undefined,
        messageId: sent?.id,
      });
      close();
    } catch (issue) {
      setProblem(issue instanceof Error ? issue.message : "That didn’t send. Try again.");
      setSending(false);
    }
  };
  return (
    <form className="message-sheet" onSubmit={send} noValidate>
      <p className="message-lead">
        Scheduling and visit questions get answered by the care team. Anything medical goes to {first} to review.
      </p>
      <label className="message-field">
        <span>Your message</span>
        <textarea
          ref={field}
          rows={5}
          value={text}
          maxLength={1000}
          placeholder={`What would you like ${first} to know?`}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {problem ? (
        <p className="composer-error" role="alert">
          {problem}
        </p>
      ) : null}
      <p className="message-note">For anything urgent, call or text 988, or call 911 in an emergency.</p>
      <button type="submit" className="chip primary message-send" disabled={!text.trim() || sending}>
        {sending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

/** "Today 5:14 AM", like the start of a message thread. */
function startedLabel(state: ChatJourney): string {
  const at = state.chat.analytics[0]?.timestamp ?? new Date().toISOString();
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));
  const today = day(new Date().toISOString()) === day(at);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(at),
  );
  return `${today ? "Today" : date} ${formatTime(at)}`;
}

/** A question asked after onboarding: the patient's words, the reply, and anything the reply can do. */
function AskRow({
  ask,
  state,
  onAction,
}: {
  ask: Ask;
  state: ChatJourney;
  onAction: (action: AskActionId, askId: string) => void;
}) {
  const replies = ask.messageId
    ? (state.careMessages ?? []).filter((message) => message.replyTo === ask.messageId)
    : [];
  return (
    <div className="thread-item ask-item">
      {ask.question ? (
        <div className="msg from-patient enter">
          <div className="bubble">{ask.question}</div>
        </div>
      ) : null}
      {ask.status === "thinking" ? (
        <TypingBubble />
      ) : ask.answer ? (
        <>
          <div className="msg from-agent enter ask-reply">
            <AgentAvatar />
            <div className="bubble">{ask.answer}</div>
          </div>
          {ask.source === "model" ? (
            <p className="ask-ai-note">
              <Sparkles size={12} aria-hidden="true" />
              AI answer
            </p>
          ) : null}
          {ask.actions?.length ? (
            <div className="ask-actions">
              {ask.actions.map((action) => (
                <button type="button" key={action} className="ask-action" onClick={() => onAction(action, ask.id)}>
                  {ASK_ACTION_LABEL[action]}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {replies.map((reply) => (
        <CareReply key={reply.id} reply={reply} state={state} />
      ))}
    </div>
  );
}

/** A reply from the care team, signed by the clinician when they wrote it. */
function CareReply({ reply, state }: { reply: CareMessage; state: ChatJourney }) {
  const clinician = reply.author && state.appointment ? clinicianById(state.appointment.providerId) : undefined;
  return (
    <>
      <p className="msg-sender">{reply.author ?? "Legion care team"}</p>
      <div className="msg from-agent from-care enter">
        <span className={`care-avatar ${clinician?.photo ? "has-photo" : ""}`} aria-hidden="true">
          {clinician?.photo ? <img src={clinician.photo} alt="" /> : (clinician?.initials ?? "LC")}
        </span>
        <div className="bubble">{reply.body}</div>
      </div>
    </>
  );
}

const ASK_ACTION_LABEL: Record<AskActionId, string> = {
  calendar: "Add to calendar",
  reschedule: "Pick a new time",
  message: "Message the care team",
  support: "Get support",
  "checkin-skip": "Preview: skip to check-in",
  followup: "Book a follow-up",
  join: "Check in",
};

/** The question a node asks, for the change-mode header. */
function askText(node: (typeof SCRIPT)[number], state: ChatJourney): string {
  try {
    const blocks = node.say(state).filter((block) => block.kind === "text");
    const ask = blocks.find((block) => block.id === "ask") ?? blocks[blocks.length - 1];
    return ask && ask.kind === "text" ? ask.text : "";
  } catch {
    return "";
  }
}

function answerText(node: (typeof SCRIPT)[number], state: ChatJourney): string {
  try {
    return node.answer(state)?.text ?? "";
  } catch {
    return "";
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A sheet takes focus while it's open, keeps Tab inside, closes on Escape, and gives focus back. */
function SheetDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useLayoutEffect(() => markShown(dialog.current), []);
  // Read while the sheet first renders: once it's up, the conversation behind it is inert and has lost focus.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    // A sheet that focuses its own field keeps it; otherwise the dialog takes focus.
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.getClientRects().length);
      if (!items.length) return event.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === el || !el.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !el.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);
  // On a phone, tapping above the sheet is how people put the keyboard away; it shouldn't discard typing.
  const dismiss = () => {
    const field = document.activeElement;
    if (field instanceof HTMLElement && dialog.current?.contains(field) && field.matches("input, textarea, select")) {
      field.blur();
      return;
    }
    onClose();
  };
  return (
    <div className="sheet-scrim" onClick={dismiss}>
      <div
        ref={dialog}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Like the top of a new message thread: who you're talking to, stated plainly. */
function ThreadIntro() {
  return (
    <div className="thread-intro">
      <AssistantAvatar size="lg" />
      <strong>{ASSISTANT.name}</strong>
      <span className="thread-intro-sub">
        {ASSISTANT.role}
        <br />
        Psychiatric care by video in Texas
      </span>
      <small>Preview with fictional data. Nothing is sent or charged.</small>
    </div>
  );
}

/** The reason for the current question, opened under it on request. */
function WhyAsk({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="why-ask">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Info size={14} strokeWidth={2.2} aria-hidden="true" />
        Why I ask
      </button>
      {open ? <p id={id}>{text}</p> : null}
    </div>
  );
}

const ThreadItem = memo(function ThreadItem({
  item,
  previous,
  next,
  enter,
  state,
  ctx,
  active,
  changing,
  edited,
  latest,
  why,
  onEdit,
}: {
  item: TranscriptItem;
  previous?: TranscriptItem;
  next?: TranscriptItem;
  enter: boolean;
  state: ChatJourney;
  ctx: ChatContext;
  active: boolean;
  changing: boolean;
  edited: boolean;
  latest: boolean;
  /** The current question's reason, shown under its last line. */
  why?: string;
  onEdit: () => void;
}) {
  const stageChange = !!previous && previous.stage !== item.stage;
  // A chapter heading, so screen readers can move between parts of the journey.
  const divider = stageChange ? (
    <div className="stage-divider">
      <h2>{STAGES.find((stage) => stage.id === item.stage)?.title}</h2>
    </div>
  ) : null;
  if (item.from === "patient") {
    if (!item.answer.text) return divider ? <div className="thread-item">{divider}</div> : null;
    return (
      <div className={`thread-item ${changing ? "is-changing" : ""}`} data-answer={item.nodeId}>
        {divider}
        <PatientBubble
          text={item.answer.text}
          editable={item.answer.editable}
          edited={edited}
          latest={latest}
          onEdit={onEdit}
          enter={enter}
        />
      </div>
    );
  }
  const continued = !stageChange && previous?.from === "agent" && previous.block.kind === "text";
  // As in messaging apps, the speaker's mark sits beside the last message in a run.
  const continues = !!next && next.from === "agent" && next.block.kind === "text" && next.stage === item.stage;
  if (item.block.kind === "text") {
    return (
      <div className="thread-item" data-node={item.nodeId}>
        {divider}
        <div className={`msg from-agent ${continued ? "is-continued" : ""} ${enter ? "enter" : ""}`}>
          <AgentAvatar hidden={continues} />
          <div className="bubble" id={item.block.id === "ask" ? `ask-${item.nodeId}` : undefined}>
            {item.block.text}
          </div>
        </div>
        {why ? <WhyAsk text={why} /> : null}
      </div>
    );
  }
  return (
    <div className="thread-item" data-node={item.nodeId}>
      {divider}
      <div className={`msg from-agent is-card ${enter ? "enter" : ""}`}>
        {renderCard(item.block.kind === "card" ? item.block.card : `work:${item.block.job}`, { state, ctx, active })}
      </div>
    </div>
  );
});

export default function ChatAppWithBoundary() {
  return (
    <ChatBoundary>
      <ChatApp />
    </ChatBoundary>
  );
}
