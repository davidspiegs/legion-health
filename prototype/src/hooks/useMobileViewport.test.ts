import test from "node:test";
import assert from "node:assert/strict";
import {
  nextMobileViewport,
  shouldRevealFocusedField,
  type MobileViewportSample,
  type MobileViewportState,
} from "./useMobileViewport";

const normal: MobileViewportSample = {
  layoutHeight: 744,
  layoutWidth: 390,
  visualHeight: 744,
  offsetTop: 0,
  scale: 1,
  editing: false,
  mobile: true,
};
const step = (
  previous: MobileViewportState | null,
  patch: Partial<MobileViewportSample> = {},
) => nextMobileViewport(previous, { ...normal, ...patch });

test("keyboard opens with a reachable footer, then Safari Done restores full height even when input retains focus and offset is stale", () => {
  let state = step(null);
  state = step(state, { editing: true });
  assert.equal(
    state.typing,
    false,
    "focus alone does not prove a software keyboard",
  );
  state = step(state, { editing: true, visualHeight: 430, offsetTop: 180 });
  assert.equal(state.height, 430);
  assert.equal(state.top, 180);
  assert.equal(state.typing, true);
  assert.equal(
    state.top + state.height,
    610,
    "footer ends inside the visible viewport",
  );
  state = step(state, { editing: true, visualHeight: 744, offsetTop: 240 });
  assert.equal(state.height, 744);
  assert.equal(
    state.top,
    0,
    "late offset must not leave the app 240px down the page",
  );
  assert.equal(state.typing, false);
  state = step(state, { editing: true, offsetTop: 0 });
  assert.equal(state.height, 744);
  assert.equal(state.top, 0);
});

test("blur immediately releases stale keyboard geometry without polluting the baseline during closing animation", () => {
  let state = step(null);
  state = step(state, { editing: true, visualHeight: 400, offsetTop: 240 });
  state = step(state, { editing: false, visualHeight: 400, offsetTop: 240 });
  assert.deepEqual(
    { height: state.height, top: state.top, typing: state.typing },
    { height: 744, top: 0, typing: false },
  );
  state = step(state, { editing: false, visualHeight: 550, offsetTop: 170 });
  assert.equal(state.height, 744);
  assert.equal(state.top, 0);
  state = step(state, { editing: false, visualHeight: 744, offsetTop: 240 });
  assert.equal(state.phase, "closed");
  assert.equal(state.baselineHeight, 744);
  assert.equal(state.top, 0);
});

test("moving to the next focused field while the keyboard remains open preserves the compact usable height", () => {
  let state = step(null);
  state = step(state, { editing: true, visualHeight: 410, offsetTop: 60 });
  state = step(state, { editing: true, visualHeight: 410, offsetTop: 60 });
  assert.equal(state.phase, "open");
  assert.equal(state.height, 410);
  assert.equal(state.typing, true);
});

test("late keyboard shrink and suggestion rows request a debounced reveal, while panning and stable rereads do not", () => {
  let previous = step(null);
  let current = step(previous, {
    editing: true,
    visualHeight: 520,
    offsetTop: 40,
  });
  assert.equal(
    shouldRevealFocusedField(previous, current, false),
    true,
    "initial keyboard opening requests a reveal",
  );
  previous = current;
  current = step(previous, { editing: true, visualHeight: 430, offsetTop: 60 });
  assert.equal(
    shouldRevealFocusedField(previous, current, false),
    true,
    "shrink after the initial reveal restarts its debounce",
  );
  previous = current;
  current = step(previous, { editing: true, visualHeight: 382, offsetTop: 60 });
  assert.equal(
    shouldRevealFocusedField(previous, current, false),
    true,
    "suggestions or dictation height must also be handled",
  );
  previous = current;
  current = step(previous, {
    editing: true,
    visualHeight: 382,
    offsetTop: 140,
  });
  assert.equal(
    shouldRevealFocusedField(previous, current, false),
    false,
    "offset-only panning must not fight scrolling",
  );
  assert.equal(
    shouldRevealFocusedField(current, current, false),
    false,
    "unchanged 300/700ms rereads do not repeat scrolling",
  );
  assert.equal(
    shouldRevealFocusedField(current, current, true),
    true,
    "the next input still gets a reveal",
  );
  const closed = step(current, {
    editing: true,
    visualHeight: 744,
    offsetTop: 140,
  });
  assert.equal(
    shouldRevealFocusedField(current, closed, false),
    false,
    "dismissal does not reposition content",
  );
});

test("browser toolbar changes and a hardware keyboard do not trigger keyboard mode", () => {
  let state = step(null);
  state = step(state, { editing: true, visualHeight: 675, offsetTop: 24 });
  assert.equal(state.typing, false);
  assert.equal(state.height, 675);
  assert.equal(state.top, 0);
  state = step(state, { editing: false, visualHeight: 675 });
  assert.equal(state.baselineHeight, 675);
});

test("pinch zoom does not compact or counter-position the app", () => {
  let state = step(null);
  state = step(state, {
    editing: true,
    visualHeight: 372,
    offsetTop: 240,
    scale: 2,
  });
  assert.equal(state.phase, "zoomed");
  assert.equal(state.height, 744);
  assert.equal(state.top, 0);
  assert.equal(state.typing, false);
  state = step(state, { editing: true });
  assert.equal(state.phase, "closed");
});

test("orientation and desktop transitions discard an incompatible portrait keyboard baseline", () => {
  let state = step(null);
  state = step(state, { editing: true, visualHeight: 410, offsetTop: 80 });
  state = step(state, {
    layoutWidth: 700,
    layoutHeight: 360,
    visualHeight: 360,
    editing: true,
  });
  assert.equal(state.height, 360);
  assert.equal(state.typing, false);
  state = step(state, {
    layoutWidth: 1100,
    layoutHeight: 800,
    visualHeight: 400,
    offsetTop: 200,
    editing: true,
    mobile: false,
  });
  assert.equal(state.height, 800);
  assert.equal(state.top, 0);
  assert.equal(state.typing, false);
});

test("resize-content keyboards retain the pre-keyboard baseline even when innerHeight also shrinks", () => {
  let state = step(null);
  state = step(state, { layoutHeight: 420, visualHeight: 420, editing: true });
  assert.equal(state.phase, "open");
  assert.equal(state.height, 420);
  state = step(state, { layoutHeight: 420, visualHeight: 420, editing: false });
  assert.equal(state.height, 744);
  assert.equal(state.top, 0);
  state = step(state);
  assert.equal(state.phase, "closed");
});

test("overscroll offsets are bounded and invalid transient dimensions do not create a zero-height app", () => {
  let state = step(null);
  state = step(state, { editing: true, visualHeight: 410, offsetTop: 900 });
  assert.equal(state.top + state.height, 744);
  state = step(state, {
    visualHeight: 0,
    layoutHeight: 0,
    offsetTop: Number.NaN,
  });
  assert.equal(state.height, 744);
  assert.equal(state.top, 0);
});
