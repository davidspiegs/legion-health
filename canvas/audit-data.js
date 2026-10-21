/* Sanitized findings. Request evidence and limitations: ../docs/technical-audit.md. */
window.AUDIT = {
  status: "Audited through payment-page reach",
  capturedAt: "Chrome Incognito · October 20, 2026",
  summary: "A fresh private journey, followed by David’s own reservation and signup. The browser reveals incremental intake saving, Healthie evidence, granular product analytics, and advertising routing. Backend vendor calls remain outside view.",
  findings: [
    {
      title: "Fit is already tracked question by question",
      body: "All six fit questions emitted shown, interacted, submitted, and advanced events. These were absent from the supplied historical reference, not from current production. Validate exclusion outcomes and device cohorts before adding duplicate tracking.",
      evidence: "runtime"
    },
    {
      title: "A profile exists before Basic Info",
      body: "After fit, Legion creates an anonymous user and application profile. Conditions, insurance, and needs save incrementally. Signup later updates authentication and calls user.onboardUser; clinical vendor record creation remains unknown.",
      evidence: "runtime"
    },
    {
      title: "Matching comes through Legion’s server",
      body: "One response contained 40 providers and 598 provider-slot entries, with a 5.9-second request duration. Healthie photo storage, client fields, and payment attribution point to Healthie involvement; the upstream scheduling API is not exposed.",
      evidence: "runtime"
    },
    {
      title: "Mobile hides the decision below reassurance",
      body: "At 390 × 844, testimonials and the matching checklist precede provider choices. Bring options, next times, cost, and match reasons forward. The historical 36.6% match-to-selection loss is an investigation signal, not a mobile or causal estimate.",
      evidence: "runtime"
    },
    {
      title: "Payment copy loses the self-pay context",
      body: "After a self-pay selection, payment leads with insurance verification next and typical insurance copays. It says 100% Complete while payment setup and confirmation remain pending. State the actual price, hold status, and remaining commitment clearly.",
      evidence: "runtime"
    },
    {
      title: "Advertising routing is visible",
      body: "Nine PageView requests to Freshpaint explicitly enabled Facebook Conversions API. GTM also configures Meta and GA4 booking/payment tags. Freshpaint acceptance and configuration do not establish downstream delivery, audiences, or active retargeting.",
      evidence: "runtime"
    }
  ],
  services: [
    {
      name: "Legion intake + Supabase Auth",
      role: "Progress persistence and account identity",
      stage: "After fit → signup",
      evidence: "runtime",
      detail: "Anonymous user/profile created after fit; metadata saved on each section. User signup produced an auth PUT and Legion onboarding POST. Loaded configuration identifies Supabase Auth.",
      endpoints: ["POST app.legionhealth.com/api/trpc/onboarding.createAnonymousUser", "POST /api/trpc/onboarding.updateMetadata", "PUT api.legion.health/auth/v1/user", "POST /api/trpc/user.onboardUser"],
      mock: "Durable intake draft; save/resume; explicit account association; recoverable validation and duplicate submission.",
      unknown: "Which clinical/vendor patient records signup creates; merge and cross-device resume rules."
    },
    {
      name: "Legion matching + Healthie evidence",
      role: "Directory, availability, reservation",
      stage: "Matching → hold",
      evidence: "runtime",
      detail: "Provider/slot data arrives in a server-rendered response. Healthie-named photo storage is called; loaded code has Healthie identifiers. Reserve response says payment is required to confirm.",
      endpoints: ["GET app.legionhealth.com/portal/join/match", "GET s3.amazonaws.com/healthie-production/image/…", "POST app.legionhealth.com/api/appointments/reserve"],
      mock: "Replaceable directory/scheduling adapter; explicit time zone; contention, hold expiry, retry, and confirmation states.",
      unknown: "Upstream scheduling API, ranking rules, authoritative availability, hold duration/enforcement, and refresh behavior."
    },
    {
      name: "Stripe + Healthie payment attribution",
      role: "Card setup and billing handoff",
      stage: "After signup",
      evidence: "runtime",
      detail: "Stripe Elements/Link, payment UI resources, and configuration requests loaded. UI names getHealthie.com as the statement descriptor. hCaptcha requests originate from Stripe’s iframe. No payment action was taken.",
      endpoints: ["GET /api/trpc/payment.getCardDetails,appointments.list", "js.stripe.com", "merchant-ui-api.stripe.com/elements/wallet-config", "r.stripe.com/b"],
      mock: "Synthetic card-setup result, retry/action-required states, and separate appointment confirmation. No real card collection.",
      unknown: "Actual setup/authorization operations, billing authority, and post-payment confirmation workflow."
    },
    {
      name: "Payer directory + Availity identifiers",
      role: "Insurer selection",
      stage: "Insurance",
      evidence: "runtime",
      detail: "Legion returns 36 payer records with Availity-named identifier fields. This is a provenance clue, not proof of a direct Availity call or an individual benefits check.",
      endpoints: ["GET app.legionhealth.com/api/trpc/insurance.getInsuranceProviders"],
      mock: "Selectable supported payers; distinguish insurer acceptance from individual eligibility and benefits.",
      unknown: "Directory source, sync contract, and whether Availity is used directly or through another service."
    },
    {
      name: "Sohar Health",
      role: "Eligibility, benefits; optional discovery",
      stage: "Proposed coverage verification",
      evidence: "brief",
      detail: "The assignment confirms existing use. No direct call established in this self-pay path; actual backend timing is unknown.",
      endpoints: [],
      mock: "Pending → active/inactive/unresolved coverage; benefits and estimated cost; correction/retry. Explicit self-pay bypass.",
      unknown: "Current verification trigger, discovery use, plan-specific cost calculation, and manual-resolution workflow."
    },
    {
      name: "Metriport + DoseSpot",
      role: "Medical records and medication workflow",
      stage: "Proposed preparation → clinician care",
      evidence: "brief",
      detail: "Both are established by the assignment. Neither was visible as a direct browser call in the observed onboarding path.",
      endpoints: [],
      mock: "Metriport: asynchronous records, provenance, corrections, partial/no results. DoseSpot: clinician-controlled medication handoff.",
      unknown: "When existing vendor patients are created and records fetched; actual clinician workflow and error handling."
    },
    {
      name: "PostHog",
      role: "Product events and recording",
      stage: "Throughout observed intake",
      evidence: "runtime",
      detail: "First-party proxy carries granular fit/matching events and recording batches. Two reservation-created event names coexist; avoid counting one business action twice.",
      endpoints: ["app.legionhealth.com/ph-proxy/i/v0/e/", "app.legionhealth.com/ph-proxy/s/", "app.legionhealth.com/ph-proxy/flags/"],
      mock: "Allowlisted operational events; consistent journey/request identity; explicit business outcomes and deduplication.",
      unknown: "Excluded-path coverage, historical schema changes, downstream report quality, and replay masking/retention."
    },
    {
      name: "GTM + Freshpaint → Meta / GA4",
      role: "Marketing measurement and routing",
      stage: "Intake page views; configured conversion stages",
      evidence: "runtime",
      detail: "47 Freshpaint track calls succeeded in the saved capture. Nine PageViews request Facebook Conversions API routing. GA4/Meta conversion tags are client-code evidence; payment tags trigger on route reach, not successful payment.",
      endpoints: ["GET www.googletagmanager.com/gtm.js", "freshpaint-cdn.com · perfalytics.com", "POST api.perfalytics.com/track"],
      mock: "Disabled/simulated marketing destination with explicit routing and an allowlisted payload. Real retargeting is unnecessary.",
      unknown: "Server-side transformations, delivery receipts, consent configuration, audience membership, or active campaigns."
    },
    {
      name: "Vercel + presentation dependencies",
      role: "Performance, web analytics, fonts",
      stage: "Page loads and interaction",
      evidence: "runtime",
      detail: "Vercel Web Analytics and Speed Insights requests use first-party paths. Google Fonts supplies styles/fonts; this does not establish Google Analytics collection.",
      endpoints: ["POST /_vercel/insights/view", "POST /_vercel/speed-insights/vitals", "fonts.googleapis.com · fonts.gstatic.com"],
      mock: "No vendor simulation required for the product story; measure real prototype performance separately.",
      unknown: "Production dashboards, sampling, retention, and device-level performance distribution."
    },
    {
      name: "Verified + Persona",
      role: "Optional signup acceleration / identity assurance",
      stage: "Only where justified in the rebuild",
      evidence: "brief",
      detail: "The assignment explicitly says neither is in current live onboarding. Verified may accelerate demographics; Persona requires a defined assurance purpose.",
      endpoints: [],
      mock: "Optional confirmed autofill with manual fallback; conditional identity inquiry with review/expiry states.",
      unknown: "Whether either solves enough demonstrated friction to justify another dependency or patient step."
    },
    {
      name: "Encounter completion authority",
      role: "The assignment’s actual endpoint",
      stage: "First visit",
      evidence: "unknown",
      detail: "The observed flow and supplied historical funnel do not establish how a visit is marked complete. Booking, joining, and prescribing are distinct from completing care.",
      endpoints: [],
      mock: "Clinician-confirmed simulated encounter outcome, with no-show, cancellation, join failure, and interrupted-visit states.",
      unknown: "Source system, completion event/definition, reconciliation, and operational ownership."
    }
  ],
  boundaries: [
    "Evidence A: 298-request user-saved HAR through blank Basic Info. Evidence B: selected native DevTools/UI observations after David personally created the account; not part of that export.",
    "The original 30 screenshots remain unchanged. Payment was observed after user takeover but has no captured screen here. No payment was submitted by the agent.",
    "Fresh Incognito state was verified; third-party cookies were blocked and cache was not disabled. One path cannot establish all production behavior.",
    "Browser-visible requests cannot reveal every server-to-server vendor call. Loaded configuration is distinct from execution and successful downstream delivery.",
    "Historical funnel rates are all-device session transitions, not causes, unique patients, mobile rates, or completed visits.",
    "Only sanitized metadata and structural findings are retained. No raw HAR, credentials, personal values, or identifier values are in this board. Prototype work awaits feedback."
  ]
};
