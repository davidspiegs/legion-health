/*
 * Historical telemetry: section 2 of the assignment brief, rolling 30 days
 * ending August 29, 2026. These are ordered browser-session milestones.
 * Live observations and screenshots must be verified separately.
 *
 * All `loss` values below describe the OUTGOING transition named in `to`.
 * They are observed non-progression, not evidence that a screen caused loss.
 */
window.JOURNEY = {
  title: "Legion Health · The journey to a first visit",
  capturedAt: "Live capture in progress · October 20, 2026",
  telemetryPeriod: "Rolling 30 days ending August 29, 2026",
  source: "../Founding%20Product%20Take-Home%20b4381b607554839287ad8137811d7133.md",
  sourceLabel: "Assignment brief · aggregate production PostHog telemetry",
  scope: "Production app.legionhealth.com only. Ordered milestones within the same browser session; not verified individual patients.",
  measurementNotes: [
    "Historical funnel data and current interface observations are separate evidence sources.",
    "Page milestones use automatic $pageview. Action milestones use the explicit events specified in the brief.",
    "Loss is shown beneath the screen where the outgoing transition begins. It records non-progression within the same session, not a causal effect of the screen.",
    "Repeat visits, identity stitching, blocked analytics, and cross-session continuation can affect session counts.",
    "No device breakdown is supplied. These rates do not establish mobile-specific performance.",
    "Payment-page reach is not payment success; a reservation is not a completed visit.",
    "No first-visit-completed milestone is included in the supplied telemetry.",
    "Canonical events are documented in the brief, not verified by this live walkthrough. Raw event volume is not the funnel denominator."
  ],
  overview: [
    { label: "Start sessions", value: "5,898", detail: "Ordered browser sessions reaching /portal/join" },
    { label: "Payment-page reach", value: "1,403", detail: "23.8% of starts; successful payment is not measured" },
    { label: "Largest loss by volume", value: "1,912", detail: "Fit check → conditions · 34.8% of fit-check sessions" },
    { label: "Largest proportional loss", value: "36.6%", detail: "Match page → provider selected · 1,104 sessions" },
    { label: "Journey represented", value: "8 routes / 11 milestones", detail: "Provider and account actions share existing routes" },
    { label: "First visit completed", value: "Not measured", detail: "The assignment's endpoint is beyond the supplied funnel" }
  ],
  stages: [
    {
      id: "start",
      number: 1,
      title: "Start",
      path: "/portal/join",
      url: "https://app.legionhealth.com/portal/join",
      description: "Entry into the prospective-patient onboarding journey.",
      desktop: { src: null, width: null, height: null, status: "Not yet captured", note: "Current desktop interface awaits verified capture." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 5898,
      fromStart: 100.0,
      loss: { count: 408, percent: 6.9, to: "Fit check", note: "5,898 start sessions → 5,490 fit-check sessions." },
      events: ["portal.page.join", "portal.onboarding.started"],
      observations: [],
      hypotheses: ["Research whether the entry experience makes the care offering, eligibility, and next steps understandable before the patient begins."],
      status: "Not yet observed",
      metrics: [
        { label: "Sessions reaching screen", value: "5,898", detail: "100.0% of start sessions" },
        { label: "Continue to fit check", value: "93.1%", detail: "5,490 / 5,898 sessions" },
        { label: "Do not reach fit check", value: "408 · 6.9%", detail: "Outgoing transition; causes are not established" }
      ],
      milestones: [
        { title: "Start page reached", reach: 5898, fromStart: 100.0, conversion: 100.0, loss: { count: 408, percent: 6.9, to: "Fit check" }, events: ["$pageview"], note: "First milestone and denominator of the supplied funnel." }
      ]
    },
    {
      id: "fit",
      number: 2,
      title: "Fit check",
      path: "/portal/join/fit",
      url: "https://app.legionhealth.com/portal/join/fit",
      description: "The assignment's service-fit checkpoint, before conditions.",
      desktop: { src: null, width: null, height: null, status: "Not yet captured", note: "Current desktop interface awaits verified capture." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 5490,
      fromStart: 93.1,
      loss: { count: 1912, percent: 34.8, to: "Conditions", note: "5,490 fit-check sessions → 3,578 conditions sessions. Largest absolute outgoing loss." },
      events: ["portal.page.fit_check"],
      observations: [],
      hypotheses: [
        "Investigate the split between appropriate eligibility exits and avoidable difficulty or uncertainty.",
        "The 34.8% non-progression rate cannot establish whether the fit-check design caused exits."
      ],
      status: "Not yet observed",
      metrics: [
        { label: "Sessions reaching screen", value: "5,490", detail: "93.1% of start sessions" },
        { label: "Continue to conditions", value: "65.2%", detail: "3,578 / 5,490 sessions" },
        { label: "Do not reach conditions", value: "1,912 · 34.8%", detail: "Outgoing loss belongs to fit → conditions" },
        { label: "Measurement gap", value: "No fit-submit event", detail: "No separate fit-submit action was observed in the brief" }
      ],
      milestones: [
        { title: "Fit-check page reached", reach: 5490, fromStart: 93.1, conversion: 93.1, loss: { count: 1912, percent: 34.8, to: "Conditions" }, events: ["$pageview"], note: "Ordered page reach after start; no separate fit-submit event supplied." }
      ]
    },
    {
      id: "conditions",
      number: 3,
      title: "Conditions",
      path: "/portal/join/conditions",
      url: "https://app.legionhealth.com/portal/join/conditions",
      description: "The conditions phase, between fit check and insurance.",
      desktop: { src: "assets/desktop-conditions.png", width: 1380, height: 1093, status: "Preliminary · Opera", note: "October 20, 2026 · Opera · 1,380 × 716 viewport · full-page capture. Chrome walkthrough is pending connection." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 3578,
      fromStart: 60.7,
      loss: { count: 240, percent: 6.7, to: "Insurance", note: "3,578 conditions sessions → 3,338 insurance sessions." },
      events: ["portal.page.join.conditions", "portal.onboarding.conditions"],
      observations: [
        "Preliminary Opera observation: the screen offers seven choices, including “I'm not sure,” and says to select all that apply.",
        "The visible progress indicator labels Conditions as step 1 of 6, followed by Insurance, How can we help you?, Find Match, Basic Info, and Payment Method.",
        "At the captured 1,380 × 716 viewport, Continue is below the initial fold. A patient testimonial occupies the right-hand panel.",
        "Opening /portal/join in the existing Opera profile redirected to this route. Whether that reflected previous browser progress is unverified; Chrome entry behavior remains to be checked."
      ],
      hypotheses: ["Research how the phase supports patients who are uncertain how to describe their needs, without requiring them to self-diagnose."],
      status: "Preliminary desktop observation · Chrome pending",
      metrics: [
        { label: "Sessions reaching screen", value: "3,578", detail: "60.7% of start sessions" },
        { label: "Continue to insurance", value: "93.3%", detail: "3,338 / 3,578 sessions" },
        { label: "Do not reach insurance", value: "240 · 6.7%", detail: "The preceding 34.8% loss belongs to fit → conditions" }
      ],
      milestones: [
        { title: "Conditions page reached", reach: 3578, fromStart: 60.7, conversion: 65.2, loss: { count: 240, percent: 6.7, to: "Insurance" }, events: ["$pageview"], note: "The supplied funnel uses page reach, not the conditions action event." }
      ]
    },
    {
      id: "insurance",
      number: 4,
      title: "Insurance",
      path: "/portal/join/insurance",
      url: "https://app.legionhealth.com/portal/join/insurance",
      description: "The insurance phase, before needs and provider matching.",
      desktop: { src: null, width: null, height: null, status: "Not yet captured", note: "Current desktop interface awaits verified capture." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 3338,
      fromStart: 56.6,
      loss: { count: 243, percent: 7.3, to: "Needs", note: "3,338 insurance sessions → 3,095 needs sessions." },
      events: ["portal.page.join.insurance", "portal.onboarding.insurance_selected"],
      observations: [],
      hypotheses: ["Research what patients understand about accepted coverage, eligibility verification, and their expected cost at this point. An insurance selection alone does not establish verified benefits."],
      status: "Not yet observed",
      metrics: [
        { label: "Sessions reaching screen", value: "3,338", detail: "56.6% of start sessions" },
        { label: "Continue to needs", value: "92.7%", detail: "3,095 / 3,338 sessions" },
        { label: "Do not reach needs", value: "243 · 7.3%", detail: "Outgoing transition; no cost-related cause established" }
      ],
      milestones: [
        { title: "Insurance page reached", reach: 3338, fromStart: 56.6, conversion: 93.3, loss: { count: 243, percent: 7.3, to: "Needs" }, events: ["$pageview"], note: "The supplied funnel uses page reach, not the insurance-selection action event." }
      ]
    },
    {
      id: "needs",
      number: 5,
      title: "Needs",
      path: "/portal/join/needs",
      url: "https://app.legionhealth.com/portal/join/needs",
      description: "The needs phase, immediately before the provider-match page.",
      desktop: { src: null, width: null, height: null, status: "Not yet captured", note: "Current desktop interface awaits verified capture." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 3095,
      fromStart: 52.5,
      loss: { count: 82, percent: 2.6, to: "Provider-match page", note: "3,095 needs sessions → 3,013 provider-match sessions." },
      events: ["portal.page.join.needs", "portal.onboarding.needs"],
      observations: [],
      hypotheses: ["Research whether collected needs meaningfully inform matching and can carry forward into visit preparation without repeated entry."],
      status: "Not yet observed",
      metrics: [
        { label: "Sessions reaching screen", value: "3,095", detail: "52.5% of start sessions" },
        { label: "Continue to provider match", value: "97.4%", detail: "3,013 / 3,095 sessions" },
        { label: "Do not reach provider match", value: "82 · 2.6%", detail: "Outgoing transition; causes are not established" }
      ],
      milestones: [
        { title: "Needs page reached", reach: 3095, fromStart: 52.5, conversion: 92.7, loss: { count: 82, percent: 2.6, to: "Provider-match page" }, events: ["$pageview"], note: "The supplied funnel uses page reach, not the needs action event." }
      ]
    },
    {
      id: "match",
      number: 6,
      title: "Provider match & reservation",
      path: "/portal/join/match",
      url: "https://app.legionhealth.com/portal/join/match",
      description: "One route contains three supplied milestones: match-page reach, provider selection, and reservation creation.",
      desktop: { src: null, width: null, height: null, status: "Not yet captured", note: "Current desktop interface and any within-route states await verified capture." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 3013,
      fromStart: 51.1,
      loss: { count: 1104, percent: 36.6, to: "Provider selected", note: "3,013 match-page sessions → 1,909 provider selections. The two later transitions are shown separately below." },
      events: ["portal.page.join.match", "portal.provider_selected", "portal.provider.reservation.created", "portal.reschedule_preferences.saved"],
      observations: [],
      hypotheses: [
        "Investigate provider fit, availability, cost clarity, and interaction difficulty as separate possible explanations for non-selection.",
        "Inspect selection and reservation states separately; the supplied data does not show that a reservation became a confirmed or completed appointment."
      ],
      status: "Not yet observed",
      metrics: [
        { label: "Sessions reaching screen", value: "3,013", detail: "51.1% of start sessions" },
        { label: "Match → provider selected", value: "1,104 lost · 36.6%", detail: "63.4% continue · 1,909 / 3,013" },
        { label: "Selected → reservation created", value: "145 lost · 7.6%", detail: "92.4% continue · 1,764 / 1,909" },
        { label: "Reservation → patient details", value: "1 lost · 0.1%", detail: "99.9% continue · 1,763 / 1,764" }
      ],
      milestones: [
        { title: "Match page reached", reach: 3013, fromStart: 51.1, conversion: 97.4, loss: { count: 1104, percent: 36.6, to: "Provider selected" }, events: ["$pageview"], note: "Page reach after needs. 63.4% reach the next action." },
        { title: "Provider selected", reach: 1909, fromStart: 32.4, conversion: 63.4, loss: { count: 145, percent: 7.6, to: "Reservation created" }, events: ["portal.provider_selected"], note: "Action on the same route, after match-page reach. 92.4% reach the next action." },
        { title: "Reservation created", reach: 1764, fromStart: 29.9, conversion: 92.4, loss: { count: 1, percent: 0.1, to: "Patient-details page" }, events: ["portal.provider.reservation.created"], note: "Action on the same route, after provider selection. 99.9% reach patient details. Reservation does not prove a completed appointment." }
      ]
    },
    {
      id: "patient",
      number: 7,
      title: "Patient details & account",
      path: "/portal/join/patient",
      url: "https://app.legionhealth.com/portal/join/patient",
      description: "One route contains two supplied milestones: patient-page reach and account creation.",
      desktop: { src: null, width: null, height: null, status: "Not yet captured", note: "Current desktop interface and any account-creation state await verified capture." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 1763,
      fromStart: 29.9,
      loss: { count: 360, percent: 20.4, to: "Account created", note: "1,763 patient-page sessions → 1,403 account creations. All 1,403 subsequently reach payment in the supplied funnel." },
      events: ["portal.page.join.patient", "portal.onboarding.userCreated"],
      observations: [],
      hypotheses: ["Investigate required effort, trust, validation, and continuity at account creation. The 20.4% non-progression rate does not identify which, if any, explains the loss."],
      status: "Not yet observed",
      metrics: [
        { label: "Sessions reaching screen", value: "1,763", detail: "29.9% of start sessions" },
        { label: "Patient details → account created", value: "360 lost · 20.4%", detail: "79.6% continue · 1,403 / 1,763" },
        { label: "Account created → payment page", value: "0 lost · 0.0%", detail: "100.0% continue · 1,403 / 1,403" }
      ],
      milestones: [
        { title: "Patient-details page reached", reach: 1763, fromStart: 29.9, conversion: 99.9, loss: { count: 360, percent: 20.4, to: "Account created" }, events: ["$pageview"], note: "Page reach after reservation creation. 79.6% reach account creation." },
        { title: "Account created", reach: 1403, fromStart: 23.8, conversion: 79.6, loss: { count: 0, percent: 0.0, to: "Payment page" }, events: ["portal.onboarding.userCreated"], note: "Action on the same route, after patient-page reach. 100.0% subsequently reach payment." }
      ]
    },
    {
      id: "payment",
      number: 8,
      title: "Payment page",
      path: "/portal/join/payment",
      url: "https://app.legionhealth.com/portal/join/payment",
      description: "The endpoint of the supplied telemetry, while the assignment continues through the first completed visit.",
      desktop: { src: null, width: null, height: null, status: "Not yet captured", note: "Current desktop payment interface awaits verified capture." },
      mobile: { src: null, width: null, height: null, status: "Not yet captured", note: "Current mobile layout awaits verified capture; no mobile conversion segment was supplied." },
      reach: 1403,
      fromStart: 23.8,
      loss: { count: null, percent: null, to: "Subsequent outcome not measured", note: "No payment-success or first-visit-completed milestone is supplied. Unknown must not be displayed as zero." },
      events: ["portal.page.join.payment"],
      observations: [],
      hypotheses: ["Research the handoff from payment or billing setup to a confirmed appointment, readiness for the visit, and completed care."],
      status: "Not yet observed",
      metrics: [
        { label: "Sessions reaching screen", value: "1,403", detail: "23.8% of start sessions" },
        { label: "Successful payment", value: "Unknown", detail: "No dedicated payment-success event was observed on this page" },
        { label: "First visit completed", value: "Unknown", detail: "The supplied dataset stops before the assignment's endpoint" }
      ],
      milestones: [
        { title: "Payment page reached", reach: 1403, fromStart: 23.8, conversion: 100.0, loss: { count: null, percent: null, to: "Not measured" }, events: ["$pageview"], note: "Ordered page reach after account creation. This is not proof of payment, appointment completion, or onboarding completion." }
      ]
    }
  ],
  followThrough: [
    { title: "Payment / billing outcome", description: "Research waypoint, not a verified current screen. Establish what is required, how success is confirmed, and how a patient recovers from a pending or failed outcome. Current route and conversion are unknown.", status: "Not observed · not measured" },
    { title: "Confirmed first appointment", description: "Research waypoint, not a verified current screen. Distinguish a reservation from a confirmed appointment, and inspect confirmation, changes, and cancellation. Current route and conversion are unknown.", status: "Not observed · not measured" },
    { title: "Ready for the visit", description: "Research waypoint, not a verified current screen. Inspect outstanding intake tasks, consent, information handoff, reminders, and joining instructions. Current sequence and conversion are unknown.", status: "Not observed · not measured" },
    { title: "Arrival and attendance", description: "Research waypoint, not a verified current screen. Inspect check-in, joining the visit, delays, and recovery from a missed connection. Attendance alone is not a completed visit.", status: "Not observed · not measured" },
    { title: "First visit completed", description: "The assignment's explicit onboarding endpoint. No completion milestone is supplied; a future design needs an authoritative completion signal and a defined observation window. Any prototype completion will be simulated.", status: "Required endpoint · not measured" }
  ],
  recommendations: [
    { title: "Start with fit-check exits", body: "The fit → conditions transition accounts for 1,912 of 4,495 observed losses before payment-page reach. Determine how much reflects appropriate eligibility filtering before treating it as recoverable conversion." },
    { title: "Separate match confidence from availability", body: "The match → provider-selected transition loses 1,104 sessions (36.6%). Research whether patients can find a suitable provider and visit time, understand cost, and make a confident choice. The dataset cannot distinguish these explanations." },
    { title: "Examine the account-creation handoff", body: "Patient-page reach → account creation loses 360 sessions (20.4%). Observe effort, validation, trust cues, and resume behavior before choosing a redesign. Account creation → payment-page reach has no observed loss in this snapshot." },
    { title: "Evaluate mobile with actual device evidence", body: "Compare each captured screen for readability, scrolling, selection effort, keyboard behavior, tap targets, and errors. Request a device-segmented funnel before claiming that mobile causes the aggregate losses." },
    { title: "Measure the outcome the assignment defines", body: "Map the unobserved path from reservation and payment-page reach to the first completed visit. Define patient identity across sessions, eligible cohorts, observation windows, and authoritative booking, attendance, and completion signals." },
    { title: "Use AI where it removes work or uncertainty", body: "After reviewing the existing journey, evaluate AI-assisted intake, confirmed autofill, explainable matching, and clinician-ready preparation. Choose a few useful capabilities with clear consent, provenance, patient correction, and fallback behavior; mocked services are acceptable for the later prototype." }
  ],
  funnel: [
    { number: 1, title: "Start", path: "/portal/join", reach: 5898, conversion: 100.0, fromStart: 100.0, incomingLoss: null, loss: { count: 408, percent: 6.9, to: "Fit check" }, event: "$pageview", kind: "page" },
    { number: 2, title: "Fit check", path: "/portal/join/fit", reach: 5490, conversion: 93.1, fromStart: 93.1, incomingLoss: { count: 408, percent: 6.9 }, loss: { count: 1912, percent: 34.8, to: "Conditions" }, event: "$pageview", kind: "page" },
    { number: 3, title: "Conditions", path: "/portal/join/conditions", reach: 3578, conversion: 65.2, fromStart: 60.7, incomingLoss: { count: 1912, percent: 34.8 }, loss: { count: 240, percent: 6.7, to: "Insurance" }, event: "$pageview", kind: "page" },
    { number: 4, title: "Insurance", path: "/portal/join/insurance", reach: 3338, conversion: 93.3, fromStart: 56.6, incomingLoss: { count: 240, percent: 6.7 }, loss: { count: 243, percent: 7.3, to: "Needs" }, event: "$pageview", kind: "page" },
    { number: 5, title: "Needs", path: "/portal/join/needs", reach: 3095, conversion: 92.7, fromStart: 52.5, incomingLoss: { count: 243, percent: 7.3 }, loss: { count: 82, percent: 2.6, to: "Provider-match page" }, event: "$pageview", kind: "page" },
    { number: 6, title: "Provider-match page", path: "/portal/join/match", reach: 3013, conversion: 97.4, fromStart: 51.1, incomingLoss: { count: 82, percent: 2.6 }, loss: { count: 1104, percent: 36.6, to: "Provider selected" }, event: "$pageview", kind: "page" },
    { number: 7, title: "Provider selected", path: "/portal/join/match", reach: 1909, conversion: 63.4, fromStart: 32.4, incomingLoss: { count: 1104, percent: 36.6 }, loss: { count: 145, percent: 7.6, to: "Reservation created" }, event: "portal.provider_selected", kind: "action" },
    { number: 8, title: "Reservation created", path: "/portal/join/match", reach: 1764, conversion: 92.4, fromStart: 29.9, incomingLoss: { count: 145, percent: 7.6 }, loss: { count: 1, percent: 0.1, to: "Patient-details page" }, event: "portal.provider.reservation.created", kind: "action" },
    { number: 9, title: "Patient-details page", path: "/portal/join/patient", reach: 1763, conversion: 99.9, fromStart: 29.9, incomingLoss: { count: 1, percent: 0.1 }, loss: { count: 360, percent: 20.4, to: "Account created" }, event: "$pageview", kind: "page" },
    { number: 10, title: "Account created", path: "/portal/join/patient", reach: 1403, conversion: 79.6, fromStart: 23.8, incomingLoss: { count: 360, percent: 20.4 }, loss: { count: 0, percent: 0.0, to: "Payment page" }, event: "portal.onboarding.userCreated", kind: "action" },
    { number: 11, title: "Payment page", path: "/portal/join/payment", reach: 1403, conversion: 100.0, fromStart: 23.8, incomingLoss: { count: 0, percent: 0.0 }, loss: { count: null, percent: null, to: "Not measured" }, event: "$pageview", kind: "page" }
  ]
};
