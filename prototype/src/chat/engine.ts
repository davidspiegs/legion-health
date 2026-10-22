/**
 * The conversation is a projection of journey state, never a stored log.
 * A script of nodes is walked against the current state: answered nodes render
 * their agent messages plus the patient's answer; the first unanswered node
 * becomes the active question. Editing an earlier answer is a state change, so
 * the transcript below it re-derives: answers that still apply are kept, and
 * anything the change invalidated is asked again.
 */

export type ChatStage = "story" | "clinician" | "booking" | "visit";

export const STAGES: { id: ChatStage; title: string; short: string }[] = [
  { id: "story", title: "Your story", short: "Story" },
  { id: "clinician", title: "Your clinician", short: "Clinician" },
  { id: "booking", title: "Booking", short: "Booking" },
  { id: "visit", title: "Your first visit", short: "First visit" },
];

export interface ChatOption {
  value: string;
  label: string;
  /** Lucide icon key resolved by the renderer. */
  icon?: string;
  /** Short secondary line shown under the label when space allows. */
  detail?: string;
  /** Visually emphasized. Only for invitations, never to nudge a clinical answer. */
  primary?: boolean;
  /** Reviewer-only controls are styled apart from patient answers. */
  tone?: "preview";
}

export type ChatInput =
  | { kind: "single"; options: ChatOption[]; layout?: "stack" | "wrap" | "grid" }
  | {
      kind: "multi";
      options: ChatOption[];
      confirm: string;
      layout?: "wrap" | "grid";
      /** Options that clear every other selection when chosen (e.g. "I'm not sure"). */
      exclusive?: string[];
      alternate?: { label: string; value: string };
      /** Show the alternate as a full-width answer above the options, not a link below. */
      alternateFirst?: boolean;
    }
  | { kind: "confirm-list"; items: string[]; yes: string; no: string }
  | {
      kind: "text";
      /** The field's accessible name ("Date of birth"); the placeholder is only an example. */
      label?: string;
      placeholder: string;
      submit: string;
      skip?: string;
      maxLength?: number;
      /** Small chips that answer for the patient (e.g. a suggested email). */
      suggestions?: string[];
      mode: "text" | "tel" | "otp" | "email" | "date";
      autoComplete?: string;
      alternate?: { label: string; value: string };
      /** Fine print shown under the composer, such as a consent line. */
      footnote?: string;
    }
  | { kind: "widget"; widget: string; label?: string };

export type AgentBlock =
  | { kind: "text"; id: string; text: string }
  /** Structured content rendered by a registered card component. */
  | { kind: "card"; id: string; card: string }
  /** A live card bound to a background job (the agent doing work). */
  | { kind: "work"; id: string; job: string };

export interface ChatAnswer {
  text: string;
  /** Answers that drive bookings or clinical safety may be read-only once acted on. */
  editable: boolean;
}

export interface ChatNode<S, C = unknown> {
  id: string;
  stage: ChatStage;
  /** The journey's finish line: once it's reached, there's nothing left to do. */
  ends?: boolean;
  /** Whether the node belongs to the journey for this state (branching). */
  applies?: (s: S) => boolean;
  say: (s: S) => AgentBlock[];
  input?: (s: S) => ChatInput | null;
  /** Non-null once answered. Nodes without input are answered when their say has run. */
  answer: (s: S) => ChatAnswer | null;
  after?: (s: S) => AgentBlock[];
  /** Exit and crisis nodes stop the conversation after they render. */
  halts?: (s: S) => boolean;
  /** Patient-facing reason for the question, shown on request and in the agent-ready graph. */
  why?: string;
  /** The current answer, used to preselect controls when the patient edits it. */
  value?: (s: S) => string | string[] | undefined;
  /**
   * Applies an answer. Dependent state is invalidated by the journey reducer, not here.
   * Returns false when the value was an action rather than an answer (opening a sheet,
   * switching to typing), so a change in progress stays open.
   */
  submit?: (value: string | string[], ctx: C) => void | false | Promise<void | false>;
  /**
   * When true and the node is unanswered, the walk leaves it out instead of waiting on it.
   * For optional steps whose moment has passed (pre-visit prep on visit day).
   */
  skip?: (s: S) => boolean;
  /** Starts background work when the node becomes the active question. Must be idempotent. */
  enter?: (ctx: C) => void;
  /** Re-runs `enter` when this value changes while the node stays active (defaults to the id). */
  enterKey?: (s: S) => string;
}

export type TranscriptItem =
  | { key: string; nodeId: string; stage: ChatStage; from: "agent"; block: AgentBlock }
  | {
      key: string;
      nodeId: string;
      stage: ChatStage;
      from: "patient";
      answer: ChatAnswer;
    };

export interface Transcript<S, C = unknown> {
  items: TranscriptItem[];
  active: { node: ChatNode<S, C>; input: ChatInput | null } | null;
  /** Stage of the active node, or of the last rendered node when the walk halted/ended. */
  stage: ChatStage;
  halted: boolean;
  /** Node ids in order, with whether each has been answered. Drives progress and the journey sheet. */
  path: { id: string; stage: ChatStage; answered: boolean }[];
}

/** Content keys include the node so identical copy in two places animates independently. */
export function itemKey(nodeId: string, part: string): string {
  return `${nodeId}::${part}`;
}

export function deriveTranscript<S, C = unknown>(
  script: ChatNode<S, C>[],
  state: S,
): Transcript<S, C> {
  const items: TranscriptItem[] = [];
  const path: Transcript<S, C>["path"] = [];
  let active: Transcript<S, C>["active"] = null;
  let stage: ChatStage = script[0]?.stage ?? "story";
  let halted = false;
  const waiting = (node: ChatNode<S, C>) => !node.answer(state) && !!node.skip?.(state);
  for (const node of script) {
    if (node.applies && !node.applies(state)) continue;
    if (waiting(node)) continue;
    stage = node.stage;
    for (const block of node.say(state)) {
      items.push({
        key: itemKey(node.id, block.id),
        nodeId: node.id,
        stage: node.stage,
        from: "agent",
        block,
      });
    }
    const answer = node.answer(state);
    if (!answer) {
      // Remaining applicable nodes are still part of the path for progress estimates.
      path.push({ id: node.id, stage: node.stage, answered: false });
      active = { node, input: node.input ? node.input(state) : null };
      const rest = script.slice(script.indexOf(node) + 1);
      for (const next of rest) {
        if (next.applies && !next.applies(state)) continue;
        if (waiting(next)) continue;
        path.push({ id: next.id, stage: next.stage, answered: false });
      }
      break;
    }
    path.push({ id: node.id, stage: node.stage, answered: true });
    if (node.input) {
      items.push({
        key: itemKey(node.id, "answer"),
        nodeId: node.id,
        stage: node.stage,
        from: "patient",
        answer,
      });
    }
    for (const block of node.after?.(state) ?? []) {
      items.push({
        key: itemKey(node.id, block.id),
        nodeId: node.id,
        stage: node.stage,
        from: "agent",
        block,
      });
    }
    if (node.halts?.(state)) {
      halted = true;
      break;
    }
  }
  return { items, active, stage, halted, path };
}

/** Progress within the whole journey, weighted by stage so later stages do not look endless. */
export function stageProgress<S, C>(transcript: Transcript<S, C>): {
  stage: ChatStage;
  index: number;
  fraction: number;
  remaining: number;
} {
  const index = STAGES.findIndex((item) => item.id === transcript.stage);
  const inStage = transcript.path.filter(
    (step) => step.stage === transcript.stage,
  );
  // The finish line has nothing to answer; reaching it completes the stage.
  const finished = transcript.active?.node.ends ? transcript.active.node.id : "";
  const done = inStage.filter((step) => step.answered || step.id === finished).length;
  const fraction = inStage.length ? done / inStage.length : 1;
  const remaining = transcript.path.filter(
    (step) => !step.answered && step.stage !== "visit",
  ).length;
  return { stage: transcript.stage, index: Math.max(0, index), fraction, remaining };
}
