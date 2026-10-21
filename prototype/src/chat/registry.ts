import type { ReactNode } from "react";
import type { ChatContext } from "./agent";
import type { ChatJourney } from "./state";

/**
 * Contracts between the conversation shell and its visual parts. The shell owns
 * state, pacing and focus; parts render state and call the context to act.
 */

/** Cards render inside the thread, indented to the message column. */
export interface CardProps {
  state: ChatJourney;
  ctx: ChatContext;
  /** True when the card belongs to the question being answered now, so it may be interactive. */
  active: boolean;
}

/** Widgets render inside the docked answer area when a node's input is `{ kind: "widget" }`. */
export interface WidgetProps {
  state: ChatJourney;
  ctx: ChatContext;
  busy: boolean;
  error: string;
}

/** Sheets render in a bottom sheet (centered dialog on wide screens) owned by the shell. */
export interface SheetProps {
  state: ChatJourney;
  ctx: ChatContext;
  close: () => void;
  /** Optional argument passed to ctx.openSheet(name, data). */
  data?: string;
}

/** Shown full screen over the conversation while a visit is in progress. */
export interface OverlayProps {
  state: ChatJourney;
  ctx: ChatContext;
  close: () => void;
}

export type CardMap = Record<string, (props: CardProps) => ReactNode>;
export type WidgetMap = Record<string, (props: WidgetProps) => ReactNode>;
export type SheetMap = Record<string, { title: string; render: (props: SheetProps) => ReactNode }>;
