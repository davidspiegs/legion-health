import { useEffect, useState, type RefObject } from "react";

export interface MobileViewportSample {
  layoutHeight: number;
  layoutWidth: number;
  visualHeight: number;
  offsetTop: number;
  scale: number;
  editing: boolean;
  mobile: boolean;
}

export interface MobileViewportState {
  baselineHeight: number;
  layoutWidth: number;
  phase: "closed" | "open" | "closing" | "zoomed";
  height: number;
  top: number;
  typing: boolean;
}

const positive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Geometry inference, not a claim that browsers expose keyboard visibility.
 * Preserve the last unoccluded height while the keyboard animates. Focus alone
 * is insufficient: Safari's Done key may leave the input focused.
 */
export function nextMobileViewport(
  previous: MobileViewportState | null,
  sample: MobileViewportSample,
): MobileViewportState {
  const layoutHeight = positive(
    sample.layoutHeight,
    previous?.baselineHeight ?? 1,
  );
  const visualHeight = positive(sample.visualHeight, layoutHeight);
  const width = positive(sample.layoutWidth, previous?.layoutWidth ?? 1);
  const rotated = !!previous && Math.abs(width - previous.layoutWidth) > 40;
  let baseline =
    !previous || rotated
      ? sample.editing
        ? Math.max(layoutHeight, visualHeight)
        : visualHeight
      : previous.baselineHeight;
  const atNormalScale = Math.abs(positive(sample.scale, 1) - 1) <= 0.02;

  if (!sample.mobile) {
    return {
      baselineHeight: layoutHeight,
      layoutWidth: width,
      phase: "closed",
      height: layoutHeight,
      top: 0,
      typing: false,
    };
  }
  // Pinch zoom is not a keyboard. Do not reflow the app to the zoomed viewport,
  // cancel user zoom, or counter-transform browser-native panning.
  if (!atNormalScale) {
    return {
      baselineHeight: baseline,
      layoutWidth: width,
      phase: "zoomed",
      height: Math.round(baseline),
      top: 0,
      typing: false,
    };
  }

  const openingThreshold = Math.max(120, baseline * 0.18);
  const closingThreshold = Math.max(64, baseline * 0.1);
  const loss = baseline - visualHeight;
  const wasOpen = !rotated && previous?.phase === "open";
  const wasClosing = !rotated && previous?.phase === "closing";

  if (!sample.editing) {
    const closing = (wasOpen || wasClosing) && loss > closingThreshold;
    // On blur the keyboard geometry can remain stale for an animation frame or
    // several hundred ms. Immediately release its top offset and short height.
    if (!closing) baseline = visualHeight;
    return {
      baselineHeight: baseline,
      layoutWidth: width,
      phase: closing ? "closing" : "closed",
      height: Math.round(baseline),
      top: 0,
      typing: false,
    };
  }

  const keyboardOpen = loss > (wasOpen ? closingThreshold : openingThreshold);
  if (!keyboardOpen) {
    // A larger viewport is a new unoccluded baseline (e.g. browser chrome hid).
    // Keep smaller focused measurements out of the baseline during opening.
    baseline = Math.max(baseline, visualHeight);
    return {
      baselineHeight: baseline,
      layoutWidth: width,
      phase: "closed",
      height: Math.round(visualHeight),
      top: 0,
      typing: false,
    };
  }

  const top = Math.min(
    Math.max(0, Number.isFinite(sample.offsetTop) ? sample.offsetTop : 0),
    Math.max(0, baseline - visualHeight),
  );
  return {
    baselineHeight: baseline,
    layoutWidth: width,
    phase: "open",
    height: Math.round(visualHeight),
    top: Math.round(top),
    typing: true,
  };
}

export function shouldRevealFocusedField(
  previous: MobileViewportState | null,
  current: MobileViewportState,
  focusChanged: boolean,
): boolean {
  return (
    current.phase === "open" &&
    (focusChanged ||
      previous?.phase !== "open" ||
      current.height < previous.height)
  );
}

function editingElement(container: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !container?.contains(active))
    return null;
  if (active instanceof HTMLInputElement) {
    return !active.disabled &&
      !active.readOnly &&
      ![
        "button",
        "checkbox",
        "radio",
        "submit",
        "reset",
        "file",
        "hidden",
        "range",
        "color",
      ].includes(active.type)
      ? active
      : null;
  }
  if (active instanceof HTMLTextAreaElement)
    return !active.disabled && !active.readOnly ? active : null;
  if (active instanceof HTMLSelectElement)
    return !active.disabled ? active : null;
  return active.isContentEditable ? active : null;
}

/**
 * The fixed mobile shell consumes --app-height / --viewport-top. The footer
 * remains inside that shell; only .screen-main is scrolled to reveal a field.
 *
 * References:
 * https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
 * https://bugs.webkit.org/show_bug.cgi?id=265578 (late keyboard geometry)
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus
 */
export function useMobileViewport(
  container: RefObject<HTMLElement | null>,
): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const properties = ["--app-height", "--viewport-top"] as const;
    const original = properties.map((name) => ({
      name,
      value: root.style.getPropertyValue(name),
      priority: root.style.getPropertyPriority(name),
    }));
    const viewport = window.visualViewport;
    const media = window.matchMedia("(max-width: 760px)");
    let state: MobileViewportState | null = null;
    let frame = 0;
    let revealTimer = 0;
    let followupTimers: number[] = [];
    let lastFocused: HTMLElement | null = null;
    let stopped = false;

    const write = (name: string, value: string) => {
      if (root.style.getPropertyValue(name) !== value)
        root.style.setProperty(name, value);
    };

    const revealInsideContent = (field: HTMLElement) => {
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        if (
          stopped ||
          document.activeElement !== field ||
          state?.phase !== "open"
        )
          return;
        const content = field.closest<HTMLElement>(".screen-main");
        if (!content || !container.current?.contains(content)) return;
        const fieldBounds = field.getBoundingClientRect();
        const contentBounds = content.getBoundingClientRect();
        const inset = 12;
        const above = fieldBounds.top - contentBounds.top - inset;
        const below = fieldBounds.bottom - contentBounds.bottom + inset;
        // Never scroll the document/visual viewport. Adjust this owned pane after
        // focus/opening or a debounced height reduction, not offset-only panning.
        if (above < 0) content.scrollTop += above;
        else if (below > 0) content.scrollTop += below;
      }, 120);
    };

    const readAndPaint = () => {
      frame = 0;
      if (stopped) return;
      const focused = editingElement(container.current);
      const previous = state;
      state = nextMobileViewport(state, {
        layoutHeight: window.innerHeight,
        layoutWidth: window.innerWidth,
        visualHeight: viewport?.height ?? window.innerHeight,
        offsetTop: viewport?.offsetTop ?? 0,
        scale: viewport?.scale ?? 1,
        editing: !!focused,
        mobile: media.matches,
      });
      write("--app-height", media.matches ? `${state.height}px` : "100dvh");
      write("--viewport-top", `${state.top}px`);
      setTyping((current) =>
        current === state!.typing ? current : state!.typing,
      );
      // Animation, suggestions, or dictation can reduce height after the first
      // reveal. Restart the one-shot timer on each actual reduction: its final
      // bounds check runs 120ms after the last reduction we observed.
      if (
        focused &&
        shouldRevealFocusedField(previous, state, focused !== lastFocused)
      )
        revealInsideContent(focused);
      if (!focused || state.phase !== "open") window.clearTimeout(revealTimer);
      lastFocused = focused;
    };
    const scheduleFrame = () => {
      if (!frame && !stopped)
        frame = window.requestAnimationFrame(readAndPaint);
    };
    const observe = () => {
      scheduleFrame();
      // Safari can publish its final keyboard geometry late. Bounded rechecks
      // read actual values; they do not guess a keyboard height or trigger scroll.
      followupTimers.forEach(window.clearTimeout);
      followupTimers = [80, 300, 700].map((delay) =>
        window.setTimeout(scheduleFrame, delay),
      );
    };

    observe();
    viewport?.addEventListener("resize", observe);
    viewport?.addEventListener("scroll", observe, { passive: true });
    window.addEventListener("resize", observe);
    window.addEventListener("orientationchange", observe);
    window.addEventListener("pageshow", observe);
    document.addEventListener("visibilitychange", observe);
    document.addEventListener("focusin", observe);
    document.addEventListener("focusout", observe);
    media.addEventListener("change", observe);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(revealTimer);
      followupTimers.forEach(window.clearTimeout);
      viewport?.removeEventListener("resize", observe);
      viewport?.removeEventListener("scroll", observe);
      window.removeEventListener("resize", observe);
      window.removeEventListener("orientationchange", observe);
      window.removeEventListener("pageshow", observe);
      document.removeEventListener("visibilitychange", observe);
      document.removeEventListener("focusin", observe);
      document.removeEventListener("focusout", observe);
      media.removeEventListener("change", observe);
      original.forEach(({ name, value, priority }) =>
        value
          ? root.style.setProperty(name, value, priority)
          : root.style.removeProperty(name),
      );
    };
  }, [container]);

  return typing;
}
