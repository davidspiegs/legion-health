import { useRef } from "react";
import {
  HeartHandshake,
  MapPin,
  Monitor,
  ShieldCheck,
  CreditCard,
  ArrowUpRight,
  ChevronRight,
  Brain,
  CloudRain,
  Activity,
  Scale,
  Shield,
  CircleHelp,
  Ellipsis,
  type LucideIcon,
} from "lucide-react";
import { Button, Choice, Notice, Page, Testimonial } from "../components/ui";
import { CONDITION_OPTIONS, toggleCondition } from "../model/fixtures";
import type { JourneyState, ScreenProps, Step } from "../model/types";

const conditionIcons: Record<(typeof CONDITION_OPTIONS)[number], LucideIcon> = {
  ADHD: Brain,
  Depression: CloudRain,
  Anxiety: Activity,
  "Bipolar Disorder": Scale,
  PTSD: Shield,
  "I'm not sure": CircleHelp,
  Other: Ellipsis,
};

const fitQuestions: {
  id: Step;
  title: string;
  sub: string;
  options: { value: string; label: string }[];
  next: Step;
  exit?: string;
  positive?: string;
}[] = [
  {
    id: "fit-state",
    title: "Will you be in Texas for your visits?",
    sub: "Your clinician needs to be licensed where you receive care.",
    options: [
      { value: "yes", label: "Yes, in Texas" },
      { value: "no", label: "I’ll be in another state" },
    ],
    next: "fit-age",
    exit: "state",
    positive: "yes",
  },
  {
    id: "fit-age",
    title: "Are you 18 or older?",
    sub: "This service is designed for adults.",
    options: [
      { value: "yes", label: "Yes, I’m 18 or older" },
      { value: "no", label: "No, I’m under 18" },
    ],
    next: "fit-coverage",
    exit: "age",
    positive: "yes",
  },
  {
    id: "fit-coverage",
    title: "Do you have Medicare or Medicaid?",
    sub: "Legion’s current service does not support these plans.",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "unsure", label: "I’m not sure" },
    ],
    next: "fit-safety",
    exit: "coverage",
    positive: "no",
  },
  {
    id: "fit-safety",
    title: "Do you need immediate help to stay safe?",
    sub: "Are you in immediate danger of harming yourself or someone else?",
    options: [
      { value: "no", label: "No, I’m safe right now" },
      { value: "yes", label: "Yes, or I’m not sure" },
    ],
    next: "fit-history",
    exit: "safety",
    positive: "no",
  },
  {
    id: "fit-history",
    title: "Have you had an inpatient stay in the past year?",
    sub: "For mental health or substance use. This helps identify the right level of support.",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "unsure", label: "I’d like to discuss this" },
    ],
    next: "fit-virtual",
    exit: "review",
    positive: "no",
  },
  {
    id: "fit-virtual",
    title: "Does care by video work for you?",
    sub: "Your visits happen online, in a private space you choose.",
    options: [
      { value: "yes", label: "Yes, video works for me" },
      { value: "no", label: "I need in-person care" },
    ],
    next: "needs",
    exit: "virtual",
    positive: "yes",
  },
];

export function IntakeScreens(p: ScreenProps) {
  const { state, update, go, api, act, busy, setError, openHelp } = p;
  const choicePending = useRef(false);
  const advance = async (next: Step, stage: string = state.step) => {
    const ok = await act(async () => {
      await api.saveDraft(stage);
      return true;
    });
    if (ok) go(next);
  };
  const chooseAndAdvance = async (patch: Partial<JourneyState>, next: Step) => {
    // Lock before updating state so rapid taps cannot overwrite an answer in flight.
    if (busy || choicePending.current) return;
    choicePending.current = true;
    setError("");
    update(patch);
    try {
      if (next === "fit-exit" && patch.exitReason === "safety") {
        // Show urgent resources immediately; saving an answer must never gate access to help.
        go(next);
        await api.saveDraft(state.step).catch(() => {
          // The service records the failure. The answer stays local and support remains available.
        });
        return;
      }
      await advance(next);
    } finally {
      choicePending.current = false;
    }
  };
  if (state.step === "welcome")
    return (
      <Page
        title="Find care that feels right"
        subtitle="Find a psychiatric clinician, choose a time, and meet online."
        className="welcome-screen"
        footer={
          <>
            <Button onClick={() => go("fit-state")}>Find my care</Button>
            <p className="footer-note">
              Start with a few questions. No commitment.
            </p>
          </>
        }
      >
        <div className="welcome-scene">
          <div>
            <span className="welcome-scene-icon">
              <HeartHandshake size={25} />
            </span>
            <h2>
              Real connection
              <br />
              From wherever
              <br />
              you feel at home
            </h2>
            <p>Psychiatric care by video</p>
          </div>
          <img
            src="/images/maya-chen.png"
            alt="Maya Chen, a fictional clinician in this preview"
          />
        </div>
        <div className="welcome-path">
          <span>
            <MapPin size={17} />
            Find your fit
          </span>
          <span>
            <Monitor size={17} />
            Meet your clinician
          </span>
        </div>
        <Testimonial />
      </Page>
    );
  const fit = fitQuestions.find((q) => q.id === state.step);
  if (fit) {
    const selected = state.fit[fit.id];
    return (
      <Page title={fit.title} subtitle={fit.sub} className="fit-screen">
        <p className="answer-instruction">Choose an answer to continue</p>
        <div className="choices">
          {fit.options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`fit-answer ${selected === option.value ? "selected" : ""}`}
              disabled={busy}
              aria-busy={busy && selected === option.value}
              onClick={() => {
                const eligible = option.value === fit.positive;
                void chooseAndAdvance(
                  {
                    fit: { ...state.fit, [fit.id]: option.value },
                    exitReason: eligible ? "" : fit.exit || "review",
                  },
                  eligible ? fit.next : "fit-exit",
                );
              }}
            >
              <span className="choice-copy">
                <strong>{option.label}</strong>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
        {fit.id === "fit-safety" ? (
          <div className="gentle-note">
            <ShieldCheck size={18} />
            <p>Your safety matters more than finishing a form.</p>
          </div>
        ) : (
          <Testimonial />
        )}
      </Page>
    );
  }
  if (state.step === "fit-exit") {
    const urgent = state.exitReason === "safety";
    const messages: Record<string, { title: string; body: string }> = {
      state: {
        title: "Care should meet you where you are",
        body: "This service is currently for visits received in Texas. A care coordinator can help you explore another option.",
      },
      age: {
        title: "Let’s find support for your age",
        body: "This adult service may not be the right fit. A trusted adult or local clinician can help you find youth-focused care.",
      },
      coverage: {
        title: "Let’s clarify your coverage first",
        body: "Legion does not currently accept Medicare or Medicaid. A care coordinator can help you find a provider who accepts your coverage.",
      },
      review: {
        title: "You deserve the right level of care",
        body: "A care coordinator should review your needs before you continue. This isn’t a decision about your diagnosis.",
      },
      virtual: {
        title: "It’s okay to prefer in-person care",
        body: "This service is virtual. A care coordinator can help you identify a next step that fits your needs.",
      },
    };
    const message = messages[state.exitReason] || messages.review;
    return (
      <Page
        title={urgent ? "You don’t have to handle this alone" : message.title}
        subtitle={
          urgent
            ? "This appointment flow cannot provide emergency support."
            : message.body
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => p.back()}>
              Review my answer
            </Button>
          </>
        }
      >
        {urgent ? (
          <div className="support-options">
            <Notice tone="warning">
              If you or someone else is in immediate danger, call 911.
            </Notice>
            <a className="support-link" href="tel:988">
              <span>
                <strong>Call 988</strong>
                <small>Connect with the Suicide & Crisis Lifeline</small>
              </span>
              <ArrowUpRight size={21} />
            </a>
            <a className="support-link" href="sms:988">
              <span>
                <strong>Text 988</strong>
                <small>Reach a crisis counselor by text</small>
              </span>
              <ArrowUpRight size={21} />
            </a>
            <p className="body-copy">
              You can also ask someone you trust to stay with you while you get
              support.
            </p>
          </div>
        ) : (
          <>
            <Notice>
              This is a service-fit checkpoint, not a clinical assessment.
            </Notice>
            <Button variant="secondary" onClick={openHelp}>
              Explore support options
            </Button>
          </>
        )}
      </Page>
    );
  }
  if (state.step === "needs")
    return (
      <Page
        title="What brings you here?"
        subtitle="Select all that apply. It’s okay if you’re not sure."
        className="needs-screen"
        footer={
          <>
            <Button
              disabled={!state.conditions.length}
              loading={busy}
              onClick={() => advance("goal")}
            >
              Continue
            </Button>
          </>
        }
      >
        <div
          className="condition-grid"
          role="group"
          aria-label="Conditions you would like help with"
        >
          {CONDITION_OPTIONS.map((condition) => {
            const Icon = conditionIcons[condition];
            return (
              <label
                key={condition}
                className={`condition-option ${state.conditions.includes(condition) ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  name="conditions"
                  value={condition}
                  checked={state.conditions.includes(condition)}
                  disabled={busy}
                  onChange={() => {
                    setError("");
                    update({
                      conditions: toggleCondition(state.conditions, condition),
                    });
                  }}
                />
                <span className="condition-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span className="condition-label">{condition}</span>
              </label>
            );
          })}
        </div>
        <Testimonial />
      </Page>
    );
  if (state.step === "goal")
    return (
      <Page
        className="goal-screen"
        title="What would feel most helpful?"
        subtitle="We’ll share your starting point with your clinician."
      >
        <p className="answer-instruction">Choose an answer to continue</p>
        <div className="choices">
          {[
            {
              label: "Understand what’s going on",
              detail: "Explore symptoms and next steps",
            },
            {
              label: "Talk about medication",
              detail: "Review options with a clinician",
            },
            { label: "Continue my care", detail: "Find ongoing support" },
          ].map((item) => (
            <button
              type="button"
              key={item.label}
              className={`fit-answer ${state.goal === item.label ? "selected" : ""}`}
              disabled={busy}
              aria-busy={busy && state.goal === item.label}
              onClick={() =>
                void chooseAndAdvance({ goal: item.label }, "coverage")
              }
            >
              <span className="choice-copy">
                <strong>{item.label}</strong>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
        <Notice>
          Choosing medication support does not guarantee a prescription. You and
          your clinician decide together.
        </Notice>
      </Page>
    );
  if (state.step === "coverage")
    return (
      <Page
        title="How would you like to pay?"
        subtitle="Let’s make the cost clear before you choose a visit."
        footer={
          <>
            <Button
              loading={busy}
              onClick={async () => {
                const ok = await act(async () => {
                  await api.saveDraft("coverage");
                  await api.getProviders();
                  return true;
                });
                if (ok) go("match");
              }}
            >
              See my care options
            </Button>
            <p className="footer-note">No payment is taken at this step</p>
          </>
        }
      >
        <div className="choices">
          <Choice
            label="Use insurance"
            detail="We’ll check your individual benefits"
            selected={state.coverage === "insurance"}
            onClick={() =>
              update({
                coverage: "insurance",
                eligibility: { status: "unverified", estimate: null },
              })
            }
            icon={ShieldCheck}
          />
          <Choice
            label="Pay myself"
            detail="$250 first visit · $150 follow-up"
            selected={state.coverage === "selfpay"}
            onClick={() => update({ coverage: "selfpay" })}
            icon={CreditCard}
          />
        </div>
        <div className="price-explainer">
          <p>
            {state.coverage === "selfpay"
              ? "Your first visit is 60 minutes. Follow-ups are $150, when you choose to book one."
              : "We’ll check your benefits after your details. You’ll review the estimated cost before booking."}
          </p>
        </div>
      </Page>
    );
  return null;
}
