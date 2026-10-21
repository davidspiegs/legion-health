import { useEffect, useRef, useState } from "react";
import type { TranscriptItem } from "./engine";

/**
 * Paces newly derived transcript items so they can be read, without ever
 * delaying something the patient did. Items already seen (including everything
 * restored after a reload) appear immediately, and anything an edit inserts
 * above the newest revealed message appears in place rather than replaying.
 */
export function useReveal(
  items: TranscriptItem[],
  seen: readonly string[],
  onSeen: (keys: string[]) => void,
  /** Changes when the whole conversation is replaced (restart or a preview jump). */
  epoch = 0,
): { visible: TranscriptItem[]; settled: boolean; next: TranscriptItem | undefined } {
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set(seen));
  const [revealedEpoch, setRevealedEpoch] = useState(epoch);
  if (revealedEpoch !== epoch) {
    setRevealedEpoch(epoch);
    setRevealed(new Set(seen));
  }
  const timer = useRef<number | undefined>(undefined);
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;

  let lastRevealed = -1;
  items.forEach((item, index) => {
    if (revealed.has(item.key)) lastRevealed = index;
  });
  const visible = items.filter(
    (item, index) => index <= lastRevealed || revealed.has(item.key),
  );
  const next = items.slice(lastRevealed + 1).find((item) => !revealed.has(item.key));

  useEffect(() => {
    if (!next) {
      const unseen = visible
        .map((item) => item.key)
        .filter((key) => !seen.includes(key));
      if (unseen.length) onSeenRef.current(unseen);
      return;
    }
    const reveal = () => setRevealed((current) => new Set(current).add(next.key));
    if (reduced || next.from === "patient") {
      reveal();
      return;
    }
    const previous = items[items.indexOf(next) - 1];
    const afterPatient = !previous || previous.from === "patient";
    // A messaging rhythm: a beat after the patient's answer, then time in proportion
    // to what was just shown. The thread shows the typing indicator meanwhile.
    const shown = previous?.from === "agent" && previous.block.kind === "text" ? previous.block.text.length : 40;
    const delay = afterPatient ? 520 : Math.min(950, Math.max(420, shown * 13));
    timer.current = window.setTimeout(reveal, delay);
    return () => window.clearTimeout(timer.current);
    // The head of the queue is the only pacing trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.key, reduced]);

  return { visible, settled: !next, next };
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}
