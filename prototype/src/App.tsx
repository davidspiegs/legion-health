import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  GitBranch,
  HeartHandshake,
  Layers3,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { IntakeScreens } from "./screens/Intake";
import { BookingScreens } from "./screens/Booking";
import { CareScreens } from "./screens/Care";
import { Button } from "./components/ui";
import { FLOW, PHASES, type FlowPhase } from "./model/flow";
import {
  initialState,
  sampleProfile,
  slots,
  normalizeConditions,
} from "./model/fixtures";
import { createMockApi } from "./model/services";
import { applyJourneyPatch } from "./model/journey-state";
import { useMobileViewport } from "./hooks/useMobileViewport";
import type {
  JourneyState,
  Profile,
  Scenario,
  ScreenProps,
  Step,
} from "./model/types";

const STORAGE = "legion-first-visit-preview-v1";
const bookingSteps: Step[] = [
  "match",
  "slots",
  "name",
  "birth",
  "address",
  "insurance",
  "email",
  "phone",
  "review",
];
const careSteps: Step[] = [
  "confirmed",
  "records",
  "brief",
  "visit-home",
  "reminders",
  "device",
  "waiting",
  "visit",
  "complete",
  "followup",
  "feedback",
];
const phaseEntry: Record<FlowPhase, Step> = {
  fit: "welcome",
  match: "match",
  details: "name",
  prepare: "confirmed",
  visit: "device",
  continue: "complete",
};
const scenarios: {
  value: Scenario;
  title: string;
  detail: string;
  step: Step;
}[] = [
  {
    value: "standard",
    title: "Everything goes smoothly",
    detail: "The full first-visit journey",
    step: "welcome",
  },
  {
    value: "slot-taken",
    title: "Someone takes the time",
    detail: "Keep the details, choose another slot",
    step: "phone",
  },
  {
    value: "coverage-pending",
    title: "Benefits need more time",
    detail: "No invented copay or silent self-pay",
    step: "insurance",
  },
  {
    value: "coverage-unmatched",
    title: "Insurance details don’t match",
    detail: "Correct the details without assuming coverage was denied",
    step: "insurance",
  },
  {
    value: "records-unavailable",
    title: "Records can’t be found",
    detail: "Continue with the patient’s own story",
    step: "records",
  },
  {
    value: "payment-retry",
    title: "Payment setup needs a retry",
    detail: "Keep the reservation and recover",
    step: "review",
  },
  {
    value: "connection-lost",
    title: "The visit disconnects",
    detail: "Rejoin the same encounter",
    step: "waiting",
  },
  {
    value: "save-retry",
    title: "A detail doesn’t save",
    detail: "Preserve the answer and try again",
    step: "email",
  },
];
function restore(): JourneyState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (saved?.version === 1 && FLOW.some((item) => item.id === saved.step)) {
      const needsConditionReview =
        !Array.isArray(saved.conditions) &&
        !saved.appointment &&
        ["goal", "coverage", ...bookingSteps].includes(saved.step);
      return {
        ...initialState(),
        ...saved,
        conditions: normalizeConditions(saved.conditions),
        eligibility:
          saved.eligibility?.status === "checking"
            ? { status: "unverified", estimate: null }
            : saved.eligibility || initialState().eligibility,
        ...(needsConditionReview ? { step: "needs" as Step, history: [] } : {}),
        profile: { ...initialState().profile, ...saved.profile },
      };
    }
  } catch {
    /* A fresh preview is safe when local storage is unavailable. */
  }
  return initialState();
}
function reviewFixture(step: Step, scenario: Scenario): JourneyState {
  const fresh = initialState();
  if (step === "welcome") return { ...fresh, scenario };
  const s: JourneyState = {
    ...fresh,
    step,
    scenario,
    conditions: ["ADHD"],
    goal: "Understand what’s going on",
    profile: { ...sampleProfile, sms: false },
    providerId: "maya",
    slotId: slots[0].id,
    fit: {
      "fit-state": "yes",
      "fit-age": "yes",
      "fit-coverage": "no",
      "fit-safety": "no",
      "fit-history": "no",
      "fit-virtual": "yes",
    },
    payer: "Aetna",
    memberId: "DEMO12345",
  };
  if (
    scenario === "coverage-pending" ||
    scenario === "coverage-unmatched" ||
    step === "insurance"
  )
    s.coverage = "insurance";
  if (step === "review" || careSteps.includes(step)) {
    s.events = [
      {
        id: "review-fixture",
        at: new Date().toISOString(),
        service: "Auth",
        operation: "account.created",
        outcome: "success",
        detail: "Fictional account loaded with the review controls",
      },
    ];
    s.reservation = {
      id: "demo-review-hold",
      providerId: "maya",
      slotId: slots[0].id,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
  }
  if (careSteps.includes(step)) {
    s.appointment = {
      id: "demo-review-visit",
      providerId: "maya",
      slotId: slots[0].id,
      start: slots[0].start,
      status: "confirmed",
    };
    s.reservation = null;
    s.agreements = true;
    s.paymentReady = true;
    s.events.push({
      id: "review-appointment",
      at: new Date().toISOString(),
      service: "Scheduling",
      operation: "review.fixture",
      outcome: "success",
      detail: "Fictional confirmed appointment loaded for screen review",
    });
  }
  if (
    [
      "brief",
      "visit-home",
      "reminders",
      "device",
      "waiting",
      "visit",
      "complete",
      "followup",
      "feedback",
    ].includes(step)
  ) {
    s.recordsStatus = "declined";
    s.recordsReviewed = true;
    s.briefGoal = s.goal;
    s.briefApproved = step !== "brief";
    s.reminderScheduled = true;
  }
  if (
    ["device", "waiting", "visit", "complete", "followup", "feedback"].includes(
      step,
    )
  )
    s.visitDay = true;
  if (["waiting", "visit", "complete", "followup", "feedback"].includes(step))
    s.deviceReady = true;
  if (step === "visit") s.appointment = { ...s.appointment!, status: "joined" };
  if (["complete", "followup", "feedback"].includes(step)) {
    s.appointment = { ...s.appointment!, status: "completed" };
    s.events.push({
      id: "review-encounter",
      at: new Date().toISOString(),
      service: "Encounter",
      operation: "review.fixture",
      outcome: "success",
      detail: "Fictional completed encounter loaded for screen review",
    });
  }
  return s;
}

export default function App() {
  const reviewMode =
    new URLSearchParams(window.location.search).get("review") === "1";
  const [state, setState] = useState<JourneyState>(restore);
  const stateRef = useRef(state);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<
    "flow" | "scenarios" | "services" | "simulation"
  >("flow");
  const [navigation, setNavigation] = useState<
    "initial" | "forward" | "backward"
  >("initial");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const review = useRef<HTMLDialogElement>(null),
    help = useRef<HTMLDialogElement>(null);
  const app = useRef<HTMLDivElement>(null);
  const typing = useMobileViewport(app);
  const continueTyping = useRef(false);
  const update = useCallback((patch: Partial<JourneyState>) => {
    const next = applyJourneyPatch(stateRef.current, patch);
    stateRef.current = next;
    setState(next);
  }, []);
  const updateProfile = useCallback(
    (patch: Partial<Profile>) =>
      update({ profile: { ...stateRef.current.profile, ...patch } }),
    [update],
  );
  const api = useMemo(
    () => createMockApi({ getState: () => stateRef.current, update }),
    [update],
  );
  const act = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (busyRef.current) return undefined;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        return await fn();
      } catch (issue) {
        setError(
          issue instanceof Error
            ? issue.message
            : "Something didn’t save. Your answers are still here. Try again.",
        );
        return undefined;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );
  const go = useCallback(
    (step: Step) => {
      if (step === stateRef.current.step) return;
      setNavigation("forward");
      continueTyping.current = !!document.activeElement?.matches(
        "input:not([type=checkbox]),textarea,select",
      );
      setError("");
      update({
        step,
        history: [...stateRef.current.history, stateRef.current.step],
      });
    },
    [update],
  );
  const back = useCallback(() => {
    const history = stateRef.current.history;
    if (!history.length) return;
    setNavigation("backward");
    setError("");
    update({
      step: history[history.length - 1],
      history: history.slice(0, -1),
    });
  }, [update]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [state]);
  useLayoutEffect(() => {
    document.title = `${FLOW.find((item) => item.id === state.step)?.title || "Your care"} · Legion Health`;
    const main = app.current?.querySelector(".screen-main");
    if (main) main.scrollTop = 0;
    const field = app.current?.querySelector<HTMLInputElement>(
      "input:not([type=checkbox]),textarea",
    );
    if (continueTyping.current && field) field.focus({ preventScroll: true });
    else
      app.current
        ?.querySelector<HTMLElement>("h1")
        ?.focus({ preventScroll: true });
    continueTyping.current = false;
  }, [state.step]);
  const current = FLOW.find((item) => item.id === state.step)!;
  const phase = PHASES.findIndex((item) => item.id === current.phase);
  const progressGroups: { label: string; steps: Step[] }[] = [
    {
      label: "Fit check",
      steps: [
        "fit-state",
        "fit-age",
        "fit-coverage",
        "fit-safety",
        "fit-history",
        "fit-virtual",
      ],
    },
    { label: "Your care", steps: ["needs", "goal", "coverage"] },
    { label: "Your clinician", steps: ["match", "slots"] },
    {
      label: "Your details",
      steps: [
        "name",
        "birth",
        "address",
        ...(state.coverage === "insurance" ? ["insurance" as Step] : []),
        "email",
        "phone",
        "review",
      ],
    },
  ];
  const progressGroup = progressGroups.find((group) =>
    group.steps.includes(state.step),
  );
  const progressIndex = progressGroup?.steps.indexOf(state.step) ?? 0;
  function openReview(
    tab: "flow" | "scenarios" | "services" | "simulation" = "flow",
  ) {
    setPanel(tab);
    review.current?.showModal();
  }
  function jump(step: Step, scenario: Scenario = "standard") {
    setNavigation("forward");
    const next = reviewFixture(step, scenario);
    stateRef.current = next;
    setState(next);
    setError("");
    review.current?.close();
  }
  function restart() {
    const fresh = initialState();
    stateRef.current = fresh;
    setState(fresh);
    setError("");
    review.current?.close();
  }
  const props: ScreenProps = {
    state,
    update,
    updateProfile,
    go,
    back,
    api,
    busy,
    error,
    setError,
    act,
    openHelp: () => help.current?.showModal(),
  };
  const screen = bookingSteps.includes(state.step) ? (
    <BookingScreens key={state.step} {...props} />
  ) : careSteps.includes(state.step) ? (
    <CareScreens key={state.step} {...props} />
  ) : (
    <IntakeScreens key={state.step} {...props} />
  );
  return (
    <div
      className={`workspace ${reviewMode ? "review-mode" : "patient-mode"} ${typing ? "is-typing" : ""}`}
    >
      {reviewMode ? (
        <aside className="review-rail">
          <a
            className="project-link"
            href="https://github.com/davidspiegs/legion-health-assignment/blob/assignment/journey-audit/docs/redesigned-journey.md"
            target="_blank"
            rel="noreferrer"
          >
            <Layers3 size={18} /> Journey rationale <ArrowUpRight size={15} />
          </a>
          <div className="rail-intro">
            <span className="rail-mark">
              <HeartHandshake size={23} />
            </span>
            <h2>
              From first step
              <br />
              to first visit
            </h2>
            <p>
              A thoughtful path into care.
              <br />
              Made for the phone in your hand.
            </p>
          </div>
          <nav className="chapter-nav" aria-label="Review journey chapters">
            {PHASES.map((item, i) => (
              <button
                disabled={busy}
                className={phase === i ? "active" : ""}
                key={item.id}
                onClick={() => jump(phaseEntry[item.id])}
              >
                <span className="chapter-number">
                  {phase > i ? <Check size={14} /> : i + 1}
                </span>
                <span>{item.title}</span>
                {phase === i ? <ChevronRight size={16} /> : null}
              </button>
            ))}
          </nav>
          <div className="rail-tools">
            <button onClick={() => openReview("flow")}>
              <GitBranch size={17} /> Explore every screen
            </button>
            <button onClick={() => openReview("scenarios")}>
              <SlidersHorizontal size={17} /> Try a recovery scenario
            </button>
          </div>
          <p className="rail-footnote">
            Interactive design prototype
            <br />
            Fictional people, appointments & services
          </p>
        </aside>
      ) : null}
      <main className="preview-stage">
        <div className="patient-app" ref={app} data-navigation={navigation}>
          {reviewMode ? (
            <div className="preview-banner">
              <span>
                <i />
                Interactive preview
              </span>
              <button onClick={() => openReview()}>
                Review flow <Layers3 size={12} />
              </button>
            </div>
          ) : null}
          <header className="app-header">
            <div className="header-left">
              <img
                className="brand-logo"
                src="/brand/legion-logo.svg"
                alt="Legion Health"
                width="132"
                height="35"
              />
            </div>
            <button
              className="help-button"
              onClick={() => help.current?.showModal()}
            >
              <CircleHelp size={16} /> Help
            </button>
          </header>
          {state.step !== "welcome" ? (
            <div className="journey-progress">
              <div className="progress-label">
                <span>
                  {state.history.length > 0 ? (
                    <button
                      className="icon-button back"
                      aria-label="Go back"
                      disabled={busy}
                      onClick={back}
                    >
                      <ArrowLeft size={18} />
                    </button>
                  ) : null}
                  {progressGroup?.label || PHASES[phase].title}
                </span>
                {progressGroup ? (
                  <small>
                    {progressIndex + 1} of {progressGroup.steps.length}
                  </small>
                ) : null}
              </div>
              {progressGroup ? (
                <div
                  className="progress-track"
                  aria-label={`${progressGroup.label}, step ${progressIndex + 1} of ${progressGroup.steps.length}`}
                >
                  {progressGroup.steps.map((step, i) => (
                    <span
                      key={step}
                      className={i <= progressIndex ? "filled" : ""}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <div className="global-error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {!storageAvailable ? (
            <div className="global-error" role="status">
              Progress is available for this session only. Browser storage is
              unavailable.
            </div>
          ) : null}
          {screen}
        </div>
        <div className="stage-note">
          <button onClick={() => openReview("simulation")}>
            Preview controls
          </button>
          <span> · no real appointments or charges</span>
        </div>
      </main>
      {reviewMode ? (
        <aside className="context-rail">
          <span className="context-icon">
            <GitBranch size={20} />
          </span>
          <h3>The intention</h3>
          <p>{current.description}</p>
          <div className="context-service">
            <span>Behind this moment</span>
            <p>{current.integration}</p>
            <button onClick={() => openReview("services")}>
              Inspect mock activity <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="context-milestone">
            <span
              className={
                state.appointment?.status === "completed"
                  ? "milestone-dot complete"
                  : "milestone-dot"
              }
            />
            <p>
              {state.appointment?.status === "completed"
                ? "First visit completed"
                : "The goal is a completed first visit"}
            </p>
            <small>
              {state.appointment?.status === "completed"
                ? "The next step is continuity of care."
                : "Booking is one step along the way."}
            </small>
          </div>
        </aside>
      ) : null}
      <dialog
        ref={review}
        className="review-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) review.current?.close();
        }}
      >
        <div className="dialog-heading">
          <div>
            <h2>
              {panel === "simulation"
                ? "Preview controls"
                : "Explore the journey"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close review"
            onClick={() => review.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <div
          className="review-tabs"
          role="tablist"
          aria-label="Review controls"
        >
          {(reviewMode
            ? (["simulation", "flow", "scenarios", "services"] as const)
            : (["simulation"] as const)
          ).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={panel === tab}
              onClick={() => setPanel(tab)}
            >
              {tab === "simulation"
                ? "Simulation"
                : tab === "flow"
                  ? "The flow"
                  : tab === "scenarios"
                    ? "Recovery"
                    : "Mock activity"}
            </button>
          ))}
        </div>
        <div className="dialog-content">
          {panel === "simulation" ? (
            <section className="simulation-panel">
              <p className="dialog-note">
                This environment uses fictional appointments and local services.
                These controls let you advance time and simulate clinician
                actions while keeping the patient experience intact.
              </p>
              {!state.appointment ? (
                <p>Complete the booking flow to preview appointment day.</p>
              ) : null}
              {state.appointment &&
              ["confirmed", "interrupted"].includes(
                state.appointment.status,
              ) ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    update({ visitDay: true });
                    go("visit-home");
                    review.current?.close();
                  }}
                >
                  Advance to appointment day
                </Button>
              ) : null}
              {state.appointment?.status === "joined" &&
              state.step === "visit" &&
              state.visitPhase < 2 ? (
                <Button
                  onClick={() => {
                    update({ visitPhase: state.visitPhase + 1 });
                    review.current?.close();
                  }}
                >
                  Advance the conversation
                </Button>
              ) : null}
              {state.appointment?.status === "joined" &&
              state.step === "visit" &&
              state.visitPhase >= 2 ? (
                <Button
                  loading={busy}
                  onClick={async () => {
                    const ok = await act(async () => {
                      await api.completeVisit("clinician");
                      return true;
                    });
                    if (ok) {
                      go("complete");
                      review.current?.close();
                    }
                  }}
                >
                  Clinician completes visit
                </Button>
              ) : null}
              {state.appointment?.status === "completed" ? (
                <p>
                  Your first visit is complete. Continue to the care plan and
                  follow-up in the patient flow.
                </p>
              ) : null}
              <a
                className="review-mode-link"
                href={reviewMode ? "/" : "/?review=1"}
              >
                {reviewMode
                  ? "Return to the patient experience"
                  : "Open the full journey review"}
                <ArrowUpRight size={15} />
              </a>
            </section>
          ) : null}
          {panel === "flow" ? (
            <>
              <p className="dialog-note">
                Jump to any screen with fictional sample data. This starts a new
                review path; it doesn’t complete the steps you skipped.
              </p>
              {PHASES.map((item) => (
                <section className="flow-group" key={item.id}>
                  <h3>{item.title}</h3>
                  {FLOW.filter((entry) => entry.phase === item.id).map(
                    (entry) => (
                      <button
                        key={entry.id}
                        disabled={busy}
                        onClick={() => jump(entry.id)}
                      >
                        <span>{entry.title}</span>
                        <ChevronRight size={16} />
                      </button>
                    ),
                  )}
                </section>
              ))}
            </>
          ) : null}
          {panel === "scenarios" ? (
            <>
              <p className="dialog-note">
                Each scenario opens at the relevant screen with sample details.
                Failures are simulated and nothing leaves this browser.
              </p>
              <div className="scenario-list">
                {scenarios.map((item) => (
                  <button
                    disabled={busy}
                    key={item.value}
                    onClick={() => jump(item.step, item.value)}
                  >
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {panel === "services" ? (
            <>
              <p className="dialog-note">
                Local adapters, not live vendor traffic. The ledger deliberately
                excludes names, clinical answers, contact details, and
                credentials.
              </p>
              <div className="service-summary">
                <span>{state.events.length} operations</span>
                <span>
                  Scenario:{" "}
                  {
                    scenarios.find((item) => item.value === state.scenario)
                      ?.title
                  }
                </span>
              </div>
              {state.events.length ? (
                <ol className="service-log">
                  {[...state.events].reverse().map((event) => (
                    <li key={event.id}>
                      <div>
                        <strong>{event.service}</strong>
                        <span className={`event-status ${event.outcome}`}>
                          {event.outcome}
                        </span>
                      </div>
                      <code>{event.operation}</code>
                      <p>{event.detail}</p>
                      <time>
                        {new Date(event.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-log">
                  <GitBranch size={25} />
                  <p>
                    Service activity will appear as you move through the flow.
                  </p>
                </div>
              )}
              <div className="adapter-note">
                <h3>Integration decisions</h3>
                <p>
                  Scheduling, profile/Auth, payment, Sohar, Metriport,
                  reminders, video, and encounter status are simulated. The care
                  brief uses fixed, editable sample content.
                </p>
                <p>
                  DoseSpot belongs to a clinician’s prescribing workflow.
                  Verified and Persona are optional future adapters. This
                  preview does not add identity friction or simulate a
                  prescription to demonstrate them.
                </p>
                <p>
                  No retargeting or third-party analytics runs in this care
                  flow.
                </p>
              </div>
            </>
          ) : null}
        </div>
        <div className="dialog-footer">
          <button
            disabled={busy}
            onClick={() => {
              updateProfile({ ...sampleProfile, sms: state.profile.sms });
              review.current?.close();
            }}
          >
            Use sample details
          </button>
          <button disabled={busy} onClick={restart}>
            <RotateCcw size={14} /> Restart preview
          </button>
        </div>
      </dialog>
      <dialog
        ref={help}
        className="help-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) help.current?.close();
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="dialog-kicker">A little help</span>
            <h2>You can take your time</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close help"
            onClick={() => help.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <div className="dialog-content">
          <p>
            Your progress stays on this browser. You can go back to change an
            answer or return to your visit later.
          </p>
          <h3>Need a hand with care or coverage?</h3>
          <p>
            In the full experience, a care coordinator would help here. This
            preview doesn’t connect to a real support team.
          </p>
          <h3>Need immediate support?</h3>
          <p>
            For immediate danger, call 911. Call or text 988 for the Suicide &
            Crisis Lifeline.
          </p>
          <a
            className="help-resource"
            href="https://988lifeline.org/get-help/what-to-expect/"
            target="_blank"
            rel="noreferrer"
          >
            About 988 support <ArrowUpRight size={16} />
          </a>
          <Button onClick={() => help.current?.close()}>
            Back to my next step
          </Button>
        </div>
      </dialog>
    </div>
  );
}
