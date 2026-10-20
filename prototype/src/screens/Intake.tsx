import {
  Brain,
  HeartHandshake,
  MapPin,
  Monitor,
  ShieldCheck,
  Sprout,
  Sun,
  HelpCircle,
  CreditCard,
  ArrowUpRight,
} from "lucide-react";
import { Button, Choice, Notice, Page, Testimonial } from "../components/ui";
import type { ScreenProps, Step } from "../model/types";

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
  const advance = async (next: Step, stage: string = state.step) => {
    const ok = await act(async () => {
      await api.saveDraft(stage);
      return true;
    });
    if (ok) go(next);
  };
  if (state.step === "welcome")
    return (
      <Page
        title="Find care that feels right"
        subtitle="A clinician who listens. A plan that makes sense. A next step you can take."
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
              Real connection.
              <br />
              From wherever
              <br />
              you feel at home.
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
      <Page
        title={fit.title}
        subtitle={fit.sub}
        className="fit-screen"
        footer={
          <>
            <Button
              disabled={!selected}
              loading={busy}
              onClick={async () => {
                if (selected !== fit.positive) {
                  update({ exitReason: fit.exit || "review" });
                  go("fit-exit");
                  return;
                }
                await advance(fit.next, "fit");
              }}
            >
              Continue
            </Button>
            <p className="footer-note">
              A few questions to make sure we can help
            </p>
          </>
        }
      >
        <div className="choices">
          {fit.options.map((option) => (
            <Choice
              key={option.value}
              label={option.label}
              selected={selected === option.value}
              onClick={() => {
                setError("");
                update({ fit: { ...state.fit, [fit.id]: option.value } });
              }}
            />
          ))}
        </div>
        <div className="gentle-note">
          <ShieldCheck size={18} />
          <p>
            {fit.id === "fit-safety"
              ? "Your safety matters more than finishing a form."
              : "Your answers help us understand whether this service is a fit."}
          </p>
        </div>
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
        body: "Medicare and Medicaid are not supported in this flow. We won’t ask you to pay privately to get around that restriction.",
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
        title="What would you like help with?"
        subtitle="A starting point is enough. We’ll figure out the rest together."
        className="needs-screen"
        footer={
          <>
            <Button
              disabled={!state.topic}
              loading={busy}
              onClick={() => advance("goal")}
            >
              Continue
            </Button>
            <p className="footer-note">Your progress is saved on this device</p>
          </>
        }
      >
        <div className="choices">
          {[
            { label: "Focus & attention", icon: Brain },
            { label: "Anxiety & stress", icon: Sprout },
            { label: "Low mood", icon: Sun },
            { label: "I’m not sure yet", icon: HelpCircle },
          ].map((item) => (
            <Choice
              key={item.label}
              label={item.label}
              selected={state.topic === item.label}
              icon={item.icon}
              onClick={() => update({ topic: item.label })}
            />
          ))}
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
        footer={
          <>
            <Button
              disabled={!state.goal}
              loading={busy}
              onClick={() => advance("coverage")}
            >
              Continue
            </Button>
            <p className="footer-note">You can change your mind as you go</p>
          </>
        }
      >
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
            <Choice
              key={item.label}
              {...item}
              selected={state.goal === item.label}
              onClick={() => update({ goal: item.label })}
            />
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
          {state.coverage === "selfpay" ? (
            <>
              <h2>A clear price for your time</h2>
              <p>
                Your first visit is 60 minutes. Follow-up visits are priced
                separately, when you choose to book one.
              </p>
            </>
          ) : (
            <>
              <h2>Accepted isn’t the same as covered</h2>
              <p>
                After your details, we’ll check eligibility and show an
                estimate. You’ll review the result before confirming.
              </p>
            </>
          )}
        </div>
      </Page>
    );
  return null;
}
