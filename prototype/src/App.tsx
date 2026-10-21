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
  Home,
  CalendarDays,
  MessageCircle,
  UserRound,
  Mail,
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
  reviewIntakeAnswers,
} from "./model/fixtures";
import { createMockApi } from "./model/services";
import {
  applyJourneyPatch,
  journeyNow,
  recoverPaymentSetup,
} from "./model/journey-state";
import { useMobileViewport } from "./hooks/useMobileViewport";
import { useCareSimulation } from "./hooks/useCareSimulation";
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
  "portal-visits",
  "portal-messages",
  "portal-account",
  "portal-signin",
  "health-details",
];
const portalRoutes: Partial<Record<Step, string>> = {
  "visit-home": "/portal/home",
  "portal-visits": "/portal/visits",
  "portal-messages": "/portal/messages",
  "portal-account": "/portal/account",
  "portal-signin": "/portal/sign-in",
  "health-details": "/portal/preparation/health",
  records: "/portal/preparation/records",
  brief: "/portal/preparation/brief",
  reminders: "/portal/reminders",
  device: "/portal/visit/check-in",
  waiting: "/portal/visit/waiting",
  visit: "/portal/visit/room",
  complete: "/portal/visit/summary",
  followup: "/portal/visit/follow-up",
  feedback: "/portal/visit/feedback",
  confirmed: "/booking/confirmation",
};
const portalRoots: Step[] = [
  "visit-home",
  "portal-visits",
  "portal-messages",
  "portal-account",
];
function routeStep(): Step | undefined {
  const path = window.location.hash.slice(1);
  return Object.entries(portalRoutes).find(
    ([, route]) => route === path,
  )?.[0] as Step | undefined;
}
function setRoute(step: Step, replace = false) {
  const hash = portalRoutes[step] || `/intake/${step}`;
  const url = `${window.location.pathname}${window.location.search}#${hash}`;
  if (window.location.hash !== `#${hash}`)
    window.history[replace ? "replaceState" : "pushState"]({ step }, "", url);
}
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
  {
    value: "payment-authentication",
    title: "Your bank needs confirmation",
    detail: "Approve or cancel a simulated card authentication",
    step: "review",
  },
  {
    value: "clinician-late",
    title: "Your clinician is running late",
    detail: "Stay informed in the waiting room",
    step: "device",
  },
  {
    value: "care-plan-delayed",
    title: "Your care plan is being prepared",
    detail: "Visit completion and plan publication are separate",
    step: "waiting",
  },
  {
    value: "signin-expired",
    title: "A sign-in code expires",
    detail: "Request a fresh code and return to the same visit",
    step: "portal-signin",
  },
  {
    value: "reminder-failed",
    title: "A reminder cannot be delivered",
    detail: "The appointment remains confirmed",
    step: "confirmed",
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
      const base = initialState();
      const restored: JourneyState = {
        ...initialState(),
        ...saved,
        conditions: normalizeConditions(saved.conditions),
        eligibility:
          saved.eligibility?.status === "checking"
            ? { status: "unverified", estimate: null }
            : saved.eligibility || initialState().eligibility,
        ...(needsConditionReview ? { step: "needs" as Step, history: [] } : {}),
        profile: { ...initialState().profile, ...saved.profile },
        paymentReady: saved.paymentSetup
          ? recoverPaymentSetup(saved.paymentSetup).status === "succeeded"
          : !!saved.appointment,
        paymentSetup: saved.paymentSetup
          ? recoverPaymentSetup(saved.paymentSetup)
          : saved.appointment
            ? {
                id: "seti_restored_preview",
                status: "succeeded",
                method: {
                  id: "pm_restored_preview",
                  brand: "Visa",
                  last4: "4242",
                  expMonth: 12,
                  expYear: 2030,
                },
              }
            : base.paymentSetup,
        portalAuth: saved.portalAuth || {
          status: saved.events?.some(
            (event: { operation: string }) =>
              event.operation === "account.created",
          )
            ? "signed_in"
            : "signed_out",
          codeExpiresAt: null,
        },
        encounter:
          saved.encounter ||
          (saved.appointment?.status === "completed"
            ? {
                ...base.encounter,
                status: "completed",
                completedAt: new Date().toISOString(),
              }
            : ["joined", "interrupted"].includes(saved.appointment?.status)
              ? {
                  ...base.encounter,
                  status: "in_progress",
                  connection:
                    saved.appointment.status === "joined"
                      ? "connected"
                      : "interrupted",
                  joinedAt: new Date().toISOString(),
                }
              : base.encounter),
        carePlan: saved.carePlan || {
          ...base.carePlan,
          status:
            saved.appointment?.status === "completed"
              ? "pending"
              : "unavailable",
        },
        clock:
          saved.clock ||
          (saved.appointment
            ? {
                virtualStart:
                  new Date(saved.appointment.start).getTime() - 45 * 60_000,
                realStart: Date.now(),
                rate: 60,
              }
            : null),
        careMessages: (saved.careMessages || []).map((message: object) => ({
          sender: "patient",
          status: "delivered",
          ...message,
        })),
      };
      const linkedStep = routeStep();
      if (
        linkedStep &&
        (restored.appointment || linkedStep === "portal-signin")
      )
        restored.step = linkedStep;
      if (
        careSteps.includes(restored.step) &&
        restored.portalAuth.status !== "signed_in"
      )
        restored.step = "portal-signin";
      return restored;
    }
  } catch {
    /* A fresh preview is safe when local storage is unavailable. */
  }
  const fresh = initialState();
  if (routeStep() === "portal-signin") fresh.step = "portal-signin";
  return fresh;
}
function reviewFixture(step: Step, scenario: Scenario): JourneyState {
  const fresh = initialState();
  if (step === "welcome") return { ...fresh, scenario };
  const s: JourneyState = {
    ...fresh,
    step,
    scenario,
    ...reviewIntakeAnswers(step),
    profile: { ...sampleProfile, sms: false },
    providerId: "maya",
    slotId: slots[0].id,
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
    s.portalAuth = { status: "signed_in", codeExpiresAt: null };
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
    s.financialConsent = true;
    s.paymentSetup = {
      id: "seti_review_fixture",
      status: "succeeded",
      method: {
        id: "pm_review_fixture",
        brand: "Visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2030,
      },
    };
    s.clock = {
      virtualStart: new Date(s.appointment.start).getTime() - 5 * 60_000,
      realStart: Date.now(),
      rate: 1,
    };
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
  if (
    ["device", "waiting", "visit", "complete", "followup", "feedback"].includes(
      step,
    )
  ) {
    s.healthReviewed = true;
    s.currentLocation = "Texas";
    s.callbackConfirmed = true;
  }
  if (step === "waiting")
    s.encounter = {
      ...s.encounter,
      status: "waiting",
      checkedInAt: new Date().toISOString(),
      clinicianStatus:
        scenario === "clinician-late" ? "running_late" : "not_present",
    };
  if (step === "visit") {
    s.appointment = { ...s.appointment!, status: "joined" };
    s.encounter = {
      status: "in_progress",
      connection: "connected",
      clinicianStatus: "ready",
      joinedAt: new Date().toISOString(),
    };
  }
  if (["complete", "followup", "feedback"].includes(step)) {
    s.appointment = { ...s.appointment!, status: "completed" };
    s.encounter = {
      status: "completed",
      connection: "disconnected",
      clinicianStatus: "ready",
      completedAt: new Date().toISOString(),
    };
    s.carePlan = {
      status: "published",
      publishedAt: new Date().toISOString(),
      followupWeeks: 2,
    };
    s.events.push({
      id: "review-encounter",
      at: new Date().toISOString(),
      service: "Encounter",
      operation: "review.fixture",
      outcome: "success",
      detail: "Fictional completed encounter loaded for screen review",
    });
  }
  if (step === "portal-signin")
    s.portalAuth = { status: "signed_out", codeExpiresAt: null };
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
    "flow" | "scenarios" | "services" | "simulation" | "inbox"
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
  useCareSimulation(stateRef, api, update);
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
      if (
        careSteps.includes(step) &&
        step !== "portal-signin" &&
        stateRef.current.portalAuth.status !== "signed_in"
      )
        step = "portal-signin";
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
      setRoute(step);
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
    setRoute(history[history.length - 1]);
  }, [update]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [state]);
  useEffect(() => {
    setRoute(stateRef.current.step, true);
    const navigate = () => {
      const route =
        routeStep() || (window.history.state?.step as Step | undefined);
      if (!route || !FLOW.some((entry) => entry.id === route)) return;
      const step =
        careSteps.includes(route) &&
        route !== "portal-signin" &&
        stateRef.current.portalAuth.status !== "signed_in"
          ? "portal-signin"
          : route;
      setNavigation("backward");
      setError("");
      update({ step });
    };
    window.addEventListener("popstate", navigate);
    window.addEventListener("hashchange", navigate);
    return () => {
      window.removeEventListener("popstate", navigate);
      window.removeEventListener("hashchange", navigate);
    };
  }, [update]);
  useEffect(() => {
    if (
      careSteps.includes(state.step) &&
      state.step !== "portal-signin" &&
      state.portalAuth.status !== "signed_in"
    )
      go("portal-signin");
  }, [state.step, state.portalAuth.status, go]);
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
  const current = FLOW.find((item) => item.id === state.step) || FLOW[0];
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
    tab: "flow" | "scenarios" | "services" | "simulation" | "inbox" = "flow",
  ) {
    setPanel(tab);
    review.current?.showModal();
  }
  function jump(step: Step, scenario: Scenario = "standard") {
    setNavigation("forward");
    const next = reviewFixture(step, scenario);
    stateRef.current = next;
    setState(next);
    setRoute(step, true);
    setError("");
    review.current?.close();
  }
  function restart() {
    const fresh = initialState();
    stateRef.current = fresh;
    setState(fresh);
    setRoute("welcome", true);
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
  const portal = careSteps.includes(state.step) && state.step !== "confirmed";
  const showPortalNav =
    portal &&
    !["portal-signin", "device", "waiting", "visit"].includes(state.step) &&
    state.portalAuth.status === "signed_in";
  const portalTab: Step =
    state.step === "portal-messages"
      ? "portal-messages"
      : ["portal-account", "reminders"].includes(state.step)
        ? "portal-account"
        : ["portal-visits", "complete", "followup", "feedback"].includes(
              state.step,
            )
          ? "portal-visits"
          : "visit-home";
  const portalNavigation: { step: Step; label: string; icon: typeof Home }[] = [
    { step: "visit-home", label: "Home", icon: Home },
    { step: "portal-visits", label: "Visits", icon: CalendarDays },
    { step: "portal-messages", label: "Messages", icon: MessageCircle },
    { step: "portal-account", label: "Account", icon: UserRound },
  ];
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
        <div
          className={`patient-app ${portal ? "portal-app" : ""}`}
          ref={app}
          data-navigation={navigation}
        >
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
              {portal && state.portalAuth.status === "signed_in" ? (
                <button
                  className="portal-brand"
                  aria-label="Legion Health portal home"
                  onClick={() => go("visit-home")}
                >
                  <img
                    className="brand-logo"
                    src="/brand/legion-logo.svg"
                    alt="Legion Health"
                    width="132"
                    height="35"
                  />
                </button>
              ) : (
                <img
                  className="brand-logo"
                  src="/brand/legion-logo.svg"
                  alt="Legion Health"
                  width="132"
                  height="35"
                />
              )}
            </div>
            <div className="header-actions">
              {state.step === "welcome" &&
              state.events.some(
                (event) => event.operation === "account.created",
              ) ? (
                <button
                  className="help-button"
                  onClick={() =>
                    go(
                      state.portalAuth.status === "signed_in"
                        ? "visit-home"
                        : "portal-signin",
                    )
                  }
                >
                  Your portal
                </button>
              ) : null}
              <button
                className="help-button"
                onClick={() => help.current?.showModal()}
              >
                <CircleHelp size={16} /> Help
              </button>
            </div>
          </header>
          {portal &&
          !portalRoots.includes(state.step) &&
          state.step !== "portal-signin" &&
          state.step !== "visit" ? (
            <div className="portal-back">
              <button onClick={() => go("visit-home")} disabled={busy}>
                <ArrowLeft size={17} /> Back to home
              </button>
            </div>
          ) : null}
          {state.step !== "welcome" && !portal && state.step !== "confirmed" ? (
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
          {showPortalNav ? (
            <nav className="portal-navigation" aria-label="Patient portal">
              {portalNavigation.map(({ step, label, icon: Icon }) => (
                <button
                  key={step}
                  disabled={busy}
                  aria-current={portalTab === step ? "page" : undefined}
                  onClick={() => go(step)}
                >
                  <span>
                    <Icon size={21} strokeWidth={1.7} />
                  </span>
                  <small>{label}</small>
                </button>
              ))}
            </nav>
          ) : null}
        </div>
        <div className="stage-note">
          {state.appointment ||
          state.portalAuth.status === "code_sent" ||
          state.portalAuth.status === "expired" ? (
            <>
              <button onClick={() => openReview("inbox")}>
                <Mail size={11} /> Preview inbox
              </button>
              <span> · </span>
            </>
          ) : null}
          <button onClick={() => openReview("simulation")}>
            Preview controls
          </button>
          <span> · simulated care</span>
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
              {panel === "inbox"
                ? "Preview inbox"
                : panel === "simulation"
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
            ? ([
                "simulation",
                "inbox",
                "flow",
                "scenarios",
                "services",
              ] as const)
            : (["simulation", "inbox"] as const)
          ).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={panel === tab}
              onClick={() => setPanel(tab)}
            >
              {tab === "inbox"
                ? "Inbox"
                : tab === "simulation"
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
          {panel === "inbox" ? (
            <section className="preview-inbox">
              <p className="dialog-note">
                These messages are generated by the simulated email and text
                services. Nothing is sent to a real address or phone.
              </p>
              {["code_sent", "expired"].includes(state.portalAuth.status) ? (
                <article className="preview-message">
                  <span>Legion Health · Sign in</span>
                  <h3>Your sign-in code</h3>
                  <p>Use this code to return to your patient portal.</p>
                  <strong className="preview-code">246810</strong>
                  <small>
                    {state.portalAuth.status === "expired"
                      ? "This code has expired. Request a new one."
                      : "Valid for 10 minutes in this preview."}
                  </small>
                </article>
              ) : null}
              {[...state.notifications]
                .reverse()
                .filter((item) => item.status !== "cancelled")
                .map((item) => (
                  <article className="preview-message" key={item.id}>
                    <span>
                      {item.channel === "sms" ? "Text message" : "Email"} ·{" "}
                      {item.status}
                    </span>
                    <h3>
                      {item.kind === "confirmation"
                        ? "Your appointment is confirmed"
                        : item.kind === "rescheduled"
                          ? "Your appointment time has changed"
                          : item.kind === "cancelled"
                            ? "Your appointment is cancelled"
                            : item.kind === "care-plan"
                              ? "Your visit summary is ready"
                              : "Your visit is coming up"}
                    </h3>
                    <p>
                      {item.status === "failed"
                        ? "Delivery was unsuccessful. Your appointment details are still available in the portal."
                        : "Open your portal for appointment details, preparation, and the link to join."}
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        go(
                          state.portalAuth.status === "signed_in"
                            ? "visit-home"
                            : "portal-signin",
                        );
                        review.current?.close();
                      }}
                    >
                      Open your portal
                    </button>
                  </article>
                ))}
              {!state.notifications.length &&
              !["code_sent", "expired"].includes(state.portalAuth.status) ? (
                <p className="dialog-note">
                  Sign-in messages and appointment notifications will appear
                  here.
                </p>
              ) : null}
            </section>
          ) : null}
          {panel === "simulation" ? (
            <section className="simulation-panel">
              <p className="dialog-note">
                This environment uses fictional appointments and local services.
                Time moves faster before your visit. Your clinician joins,
                completes the conversation, and publishes a care plan
                automatically. No real appointments, card charges, messages, or
                video calls occur.
              </p>
              {state.clock ? (
                <p className="dialog-note">
                  Simulated appointment clock:{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/Chicago",
                  }).format(journeyNow(state))}{" "}
                  Central Time.
                </p>
              ) : null}
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
                    update({
                      visitDay: true,
                      clock: {
                        virtualStart:
                          new Date(state.appointment!.start).getTime() -
                          5 * 60_000,
                        realStart: Date.now(),
                        rate: 1,
                      },
                    });
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
                href={reviewMode ? "/?experience=classic" : "/?review=1"}
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
            Your care team can help with appointment times, billing questions,
            and getting ready for your visit.
          </p>
          {state.portalAuth.status === "signed_in" && state.appointment ? (
            <Button
              variant="secondary"
              onClick={() => {
                help.current?.close();
                go("portal-messages");
              }}
            >
              Message your care team
            </Button>
          ) : (
            <p>
              You can review pricing before confirming. After booking, your
              portal keeps your appointment, join link, and care-team messages
              together.
            </p>
          )}
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
