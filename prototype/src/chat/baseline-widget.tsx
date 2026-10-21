import { useId, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { BASELINE, FREQUENCY } from "./script";
import type { WidgetMap, WidgetProps } from "./registry";

/**
 * PHQ-2 and GAD-2 in one card: one question at a time, a tap answers and moves on,
 * and the dots show how far along it is. Finishing the fourth answers the step.
 */
function TwoWeekCheckIn({ state, ctx, busy }: WidgetProps) {
  const answers = state.chat.baseline;
  const firstOpen = BASELINE.findIndex((item) => answers[item.id] == null);
  const [index, setIndex] = useState(firstOpen < 0 ? 0 : firstOpen);
  const questionId = useId();
  const item = BASELINE[index];

  const pick = (value: number) => {
    if (busy) return;
    const baseline = { ...ctx.get().chat.baseline, [item.id]: value };
    ctx.update({ chat: { baseline } });
    const open = BASELINE.findIndex((entry) => baseline[entry.id] == null);
    if (open < 0) ctx.answer("done", "baseline-checkin");
    else setIndex(index < BASELINE.length - 1 ? index + 1 : open);
  };

  return (
    <div className="checkin4">
      <div className="checkin4-head">
        <button
          type="button"
          className="icon-button checkin4-back"
          aria-label="Previous question"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <span className="checkin4-steps" role="img" aria-label={`Question ${index + 1} of ${BASELINE.length}`}>
          {BASELINE.map((entry, i) => (
            <i key={entry.id} className={i === index ? "is-current" : answers[entry.id] != null ? "is-done" : ""} />
          ))}
        </span>
        <span className="checkin4-count" aria-hidden="true">
          {index + 1} of {BASELINE.length}
        </span>
      </div>
      <div className="checkin4-body" key={item.id}>
        <p className="checkin4-q" id={questionId}>
          Over the last two weeks, how often have you been bothered by <strong>{item.text}</strong>
        </p>
        <div className="replies stack" role="group" aria-labelledby={questionId}>
          {FREQUENCY.map((option, i) => (
            <button
              type="button"
              key={option.value}
              style={{ ["--i" as string]: i }}
              className={`chip reply ${answers[item.id] === Number(option.value) ? "is-current" : ""}`}
              disabled={busy}
              onClick={() => pick(Number(option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const BASELINE_WIDGETS: WidgetMap = {
  baseline: (props) => <TwoWeekCheckIn {...props} />,
};
