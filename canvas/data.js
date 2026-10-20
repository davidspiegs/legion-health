/*
 * Historical telemetry: section 2 of the assignment brief, rolling 30 days
 * ending August 29, 2026. These are ordered browser-session milestones.
 * Live observations and screenshots must be verified separately.
 *
 * All `loss` values below describe the OUTGOING transition named in `to`.
 * They are observed non-progression, not evidence that a screen caused loss.
 */
window.JOURNEY = {
  "title": "Legion Health · The journey to a first visit",
  "capturedAt": "Chrome walkthrough · October 20, 2026",
  "telemetryPeriod": "Rolling 30 days ending August 29, 2026",
  "source": "../Founding%20Product%20Take-Home%20b4381b607554839287ad8137811d7133.md",
  "sourceLabel": "Assignment brief · aggregate production PostHog telemetry",
  "scope": "Production app.legionhealth.com only. Ordered milestones within the same browser session; not verified individual patients.",
  "measurementNotes": [
    "Historical funnel data and current interface observations are separate evidence sources.",
    "Full-page screenshot stitching can reposition sticky elements. Header placement partway down some match and insurance self-pay captures is a capture caveat, not evidence of a live UI defect.",
    "Screens were observed October 20, 2026 in Chrome. Mobile images are responsive viewport tests (390 × 844), not physical-device captures.",
    "All clinical and insurance selections belong to the authorized assignment scenario, not David’s health or insurance history.",
    "Page milestones use automatic $pageview. Action milestones use the explicit events specified in the brief.",
    "Loss is shown beneath the screen where the outgoing transition begins. It records non-progression within the same session, not a causal effect of the screen.",
    "Repeat visits, identity stitching, blocked analytics, and cross-session continuation can affect session counts.",
    "No device breakdown is supplied. These rates do not establish mobile-specific performance.",
    "Payment-page reach is not payment success; a reservation is not a completed visit.",
    "No first-visit-completed milestone is included in the supplied telemetry.",
    "Canonical events are documented in the brief, not verified by this live walkthrough. Raw event volume is not the funnel denominator."
  ],
  "overview": [
    {"label":"Start sessions","value":"5,898","detail":"Ordered browser sessions reaching /portal/join"},
    {"label":"Payment-page reach","value":"1,403","detail":"23.8% of starts; successful payment is not measured"},
    {"label":"Largest loss by volume","value":"1,912","detail":"Fit check → conditions · 34.8% of fit-check sessions"},
    {"label":"Largest proportional loss","value":"36.6%","detail":"Match page → provider selected · 1,104 sessions"},
    {"label":"Journey represented","value":"8 routes / 11 milestones","detail":"Provider and account actions share existing routes"},
    {"label":"First visit completed","value":"Not measured","detail":"The assignment's endpoint is beyond the supplied funnel"}
  ],
  "stages": [
    {
      "id": "start",
      "number": 1,
      "title": "Start",
      "path": "/portal/join",
      "url": "https://app.legionhealth.com/portal/join",
      "description": "The entry URL initialized an anonymous session and automatically advanced to the fit check.",
      "desktop": {
        "src": null,
        "width": null,
        "height": null,
        "status": "Redirect observed · no persistent screen",
        "note": "Chrome showed “Creating anonymous session” at /portal/join, then automatically opened /portal/join/fit. No persistent start-screen screenshot was captured."
      },
      "mobile": {
        "src": null,
        "width": null,
        "height": null,
        "status": "No separate mobile entry capture",
        "note": "No persistent entry screen was captured. Responsive screen captures begin at /portal/join/fit; the entry initialization was observed in the desktop walkthrough."
      },
      "reach": 5898,
      "fromStart": 100,
      "loss": {"count":408,"percent":6.9,"to":"Fit check","note":"5,898 start sessions → 5,490 fit-check sessions."},
      "events": ["portal.page.join","portal.onboarding.started"],
      "observations": [
        "Opening /portal/join in Chrome showed “Creating anonymous session,” then automatically redirected to /portal/join/fit.",
        "No persistent start-screen screenshot is available. Historical start-page telemetry remains a separate milestone."
      ],
      "hypotheses": ["Research whether the entry experience makes the care offering, eligibility, and next steps understandable before the patient begins."],
      "status": "Entry redirect observed in Chrome",
      "metrics": [
        {"label":"Sessions reaching screen","value":"5,898","detail":"100.0% of start sessions"},
        {"label":"Continue to fit check","value":"93.1%","detail":"5,490 / 5,898 sessions"},
        {"label":"Do not reach fit check","value":"408 · 6.9%","detail":"Outgoing transition; causes are not established"}
      ],
      "milestones": [{"title":"Start page reached","reach":5898,"fromStart":100,"conversion":100,"loss":{"count":408,"percent":6.9,"to":"Fit check"},"events":["$pageview"],"note":"First milestone and denominator of the supplied funnel."}]
    },
    {
      "id": "fit",
      "number": 2,
      "title": "Fit check",
      "path": "/portal/join/fit",
      "url": "https://app.legionhealth.com/portal/join/fit",
      "description": "Six sequential eligibility and service-fit questions, followed by a completion state on the same route.",
      "desktop": {
        "src": "assets/desktop-fit-1.jpg",
        "label": "1 of 6 · Texas location",
        "width": 1440,
        "height": 870,
        "viewportWidth": 1440,
        "viewportHeight": 749,
        "status": "Observed · Chrome",
        "url": "https://app.legionhealth.com/portal/join/fit",
        "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 870. Chrome desktop capture. Assignment scenario response: Yes to being based in Texas.",
        "frames": [
          {
            "src": "assets/desktop-fit-2.jpg",
            "label": "2 of 6 · Medicare / Medicaid",
            "width": 1440,
            "height": 921,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 921. Chrome desktop capture. Assignment scenario response: No to Medicare or Medicaid coverage."
          },
          {
            "src": "assets/desktop-fit-3.jpg",
            "label": "3 of 6 · Current harm risk",
            "width": 1440,
            "height": 921,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 921. Chrome desktop capture. Assignment scenario response: No to current harm risk. This is not David’s health history."
          },
          {
            "src": "assets/desktop-fit-4.jpg",
            "label": "4 of 6 · Recent inpatient stay",
            "width": 1440,
            "height": 925,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 925. Chrome desktop capture. Assignment scenario response: No to an inpatient mental-health or substance-use stay in the past year. This is not David’s health history."
          },
          {
            "src": "assets/desktop-fit-5.jpg",
            "label": "5 of 6 · Age eligibility",
            "width": 1440,
            "height": 897,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 897. Chrome desktop capture. Assignment scenario response: Yes to being 18 or older."
          },
          {
            "src": "assets/desktop-fit-6.jpg",
            "label": "6 of 6 · Virtual-only care",
            "width": 1440,
            "height": 897,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 897. Chrome desktop capture. Assignment scenario response: Yes to virtual-only care."
          },
          {
            "src": "assets/desktop-fit-complete.jpg",
            "label": "Fit check complete",
            "width": 1440,
            "height": 961,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 961. Chrome desktop capture. Completion state after the six assignment-scenario answers; remains on the fit route."
          }
        ]
      },
      "mobile": {
        "src": "assets/mobile-fit-1.jpg",
        "label": "1 of 6 · Texas location",
        "width": 390,
        "height": 1305,
        "viewportWidth": 390,
        "viewportHeight": 844,
        "status": "Observed · Chrome responsive",
        "url": "https://app.legionhealth.com/portal/join/fit",
        "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1305. Responsive Chrome viewport test; not a physical-device capture. Assignment scenario response: Yes to being based in Texas.",
        "frames": [
          {
            "src": "assets/mobile-fit-2.jpg",
            "label": "2 of 6 · Medicare / Medicaid",
            "width": 390,
            "height": 1405,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1405. Responsive Chrome viewport test; not a physical-device capture. Assignment scenario response: No to Medicare or Medicaid coverage."
          },
          {
            "src": "assets/mobile-fit-3.jpg",
            "label": "3 of 6 · Current harm risk",
            "width": 390,
            "height": 1361,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1361. Responsive Chrome viewport test; not a physical-device capture. Assignment scenario response: No to current harm risk. This is not David’s health history."
          },
          {
            "src": "assets/mobile-fit-4.jpg",
            "label": "4 of 6 · Recent inpatient stay",
            "width": 390,
            "height": 1385,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1385. Responsive Chrome viewport test; not a physical-device capture. Assignment scenario response: No to an inpatient mental-health or substance-use stay in the past year. This is not David’s health history."
          },
          {
            "src": "assets/mobile-fit-5.jpg",
            "label": "5 of 6 · Age eligibility",
            "width": 390,
            "height": 1317,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1317. Responsive Chrome viewport test; not a physical-device capture. Assignment scenario response: Yes to being 18 or older."
          },
          {
            "src": "assets/mobile-fit-6.jpg",
            "label": "6 of 6 · Virtual-only care",
            "width": 390,
            "height": 1361,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1361. Responsive Chrome viewport test; not a physical-device capture. Assignment scenario response: Yes to virtual-only care."
          },
          {
            "src": "assets/mobile-fit-complete.jpg",
            "label": "Fit check complete",
            "width": 390,
            "height": 1489,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/fit",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1489. Responsive Chrome viewport test; not a physical-device capture. Completion state after the six assignment-scenario answers; remains on the fit route."
          }
        ]
      },
      "reach": 5490,
      "fromStart": 93.1,
      "loss": {"count":1912,"percent":34.8,"to":"Conditions","note":"5,490 fit-check sessions → 3,578 conditions sessions. Largest absolute outgoing loss."},
      "events": ["portal.page.fit_check"],
      "observations": [
        "Captured all six questions and the completion state on /portal/join/fit.",
        "Assignment scenario answers: Texas—Yes; Medicare / Medicaid—No; current harm risk—No; inpatient mental-health or substance-use stay in the past year—No; age 18 or older—Yes; virtual-only care—Yes.",
        "These are walkthrough scenario answers, not David’s health, age, or insurance history.",
        "The supplied funnel has route-level loss only; it cannot assign a drop-off rate to any of these individual questions."
      ],
      "hypotheses": ["Investigate the split between appropriate eligibility exits and avoidable difficulty or uncertainty.","The 34.8% non-progression rate cannot establish whether the fit-check design caused exits."],
      "mobileObservations": ["The testimonial appears above the questions. In question 1, the Yes/No controls sit near the bottom of the 844-pixel viewport.", "No question-level drop-off data is supplied; the 34.8% belongs to the entire fit → conditions transition."],
      "mobileHypotheses": ["Test a shorter reassurance block so the question and choices appear earlier while preserving appropriate eligibility checks."],
      "status": "Observed in Chrome · October 20, 2026",
      "metrics": [
        {"label":"Sessions reaching screen","value":"5,490","detail":"93.1% of start sessions"},
        {"label":"Continue to conditions","value":"65.2%","detail":"3,578 / 5,490 sessions"},
        {"label":"Do not reach conditions","value":"1,912 · 34.8%","detail":"Outgoing loss belongs to fit → conditions"},
        {"label":"Measurement gap","value":"No fit-submit event","detail":"No separate fit-submit action was observed in the brief"}
      ],
      "milestones": [
        {
          "title": "Fit-check page reached",
          "reach": 5490,
          "fromStart": 93.1,
          "conversion": 93.1,
          "loss": {"count":1912,"percent":34.8,"to":"Conditions"},
          "events": ["$pageview"],
          "note": "Ordered page reach after start; no separate fit-submit event supplied."
        }
      ]
    },
    {
      "id": "conditions",
      "number": 3,
      "title": "Conditions",
      "path": "/portal/join/conditions",
      "url": "https://app.legionhealth.com/portal/join/conditions",
      "description": "Condition selection with expandable information; ADHD selected for the assignment scenario.",
      "desktop": {
        "src": "assets/desktop-conditions.jpg",
        "label": "Conditions · ADHD selected",
        "width": 1440,
        "height": 1141,
        "viewportWidth": 1440,
        "viewportHeight": 749,
        "status": "Observed · Chrome",
        "url": "https://app.legionhealth.com/portal/join/conditions",
        "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 1141. Chrome desktop capture. ADHD was selected for the authorized assignment scenario. Condition cards expand with medication and testing information; no personal diagnosis is asserted."
      },
      "mobile": {
        "src": "assets/mobile-conditions.jpg",
        "label": "Conditions · ADHD selected",
        "width": 390,
        "height": 1662,
        "viewportWidth": 390,
        "viewportHeight": 844,
        "status": "Observed · Chrome responsive",
        "url": "https://app.legionhealth.com/portal/join/conditions",
        "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1662. Responsive Chrome viewport test; not a physical-device capture. ADHD was selected for the authorized assignment scenario. Condition cards expand with medication and testing information; no personal diagnosis is asserted."
      },
      "reach": 3578,
      "fromStart": 60.7,
      "loss": {"count":240,"percent":6.7,"to":"Insurance","note":"3,578 conditions sessions → 3,338 insurance sessions."},
      "events": ["portal.page.join.conditions","portal.onboarding.conditions"],
      "observations": ["ADHD was selected for the authorized assignment scenario. No personal diagnosis is asserted.","Selecting ADHD expands medication and testing information inside that card.", "After the six-question fit check, the progress indicator restarts at Step 1 of 6 for Conditions."],
      "mobileObservations": ["The testimonial moves above the task. In the ADHD-selected state, the page is 1,662 pixels tall and Continue is about 1,350 pixels down.", "The selected ADHD card is much taller than the other options. The remaining choices begin below the first viewport."],
      "mobileHypotheses": ["Keep choices compact and make condition-specific details available without displacing the other choices and next action."],
      "hypotheses": ["Research how the phase supports patients who are uncertain how to describe their needs, without requiring them to self-diagnose."],
      "status": "Observed in Chrome · October 20, 2026",
      "metrics": [
        {"label":"Sessions reaching screen","value":"3,578","detail":"60.7% of start sessions"},
        {"label":"Continue to insurance","value":"93.3%","detail":"3,338 / 3,578 sessions"},
        {"label":"Do not reach insurance","value":"240 · 6.7%","detail":"The preceding 34.8% loss belongs to fit → conditions"}
      ],
      "milestones": [
        {
          "title": "Conditions page reached",
          "reach": 3578,
          "fromStart": 60.7,
          "conversion": 65.2,
          "loss": {"count":240,"percent":6.7,"to":"Insurance"},
          "events": ["$pageview"],
          "note": "The supplied funnel uses page reach, not the conditions action event."
        }
      ]
    },
    {
      "id": "insurance",
      "number": 4,
      "title": "Insurance",
      "path": "/portal/join/insurance",
      "url": "https://app.legionhealth.com/portal/join/insurance",
      "description": "Insurance choices followed by the selected No Insurance self-pay state.",
      "desktop": {
        "src": "assets/desktop-insurance-options.jpg",
        "label": "Insurance options",
        "width": 1440,
        "height": 1161,
        "viewportWidth": 1440,
        "viewportHeight": 749,
        "status": "Observed · Chrome",
        "url": "https://app.legionhealth.com/portal/join/insurance",
        "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 1161. Chrome desktop capture. Available insurance choices before selecting the self-pay scenario. No real insurance information was supplied.",
        "frames": [
          {
            "src": "assets/desktop-insurance-self-pay.jpg",
            "label": "No Insurance · self-pay pricing",
            "width": 1440,
            "height": 1259,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/insurance",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 1259. Chrome desktop capture. The selected No Insurance option displays $250 for intake and $150 for follow-ups. This is a walkthrough scenario, not a statement about David’s coverage."
          }
        ]
      },
      "mobile": {
        "src": "assets/mobile-insurance-options.jpg",
        "label": "Insurance options",
        "width": 390,
        "height": 1427,
        "viewportWidth": 390,
        "viewportHeight": 844,
        "status": "Observed · Chrome responsive",
        "url": "https://app.legionhealth.com/portal/join/insurance",
        "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1427. Responsive Chrome viewport test; not a physical-device capture. Available insurance choices before selecting the self-pay scenario. No real insurance information was supplied.",
        "frames": [
          {
            "src": "assets/mobile-insurance-self-pay.jpg",
            "label": "No Insurance · self-pay pricing",
            "width": 390,
            "height": 1565,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/insurance",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1565. Responsive Chrome viewport test; not a physical-device capture. The selected No Insurance option displays $250 for intake and $150 for follow-ups. This is a walkthrough scenario, not a statement about David’s coverage."
          }
        ]
      },
      "reach": 3338,
      "fromStart": 56.6,
      "loss": {"count":243,"percent":7.3,"to":"Needs","note":"3,338 insurance sessions → 3,095 needs sessions."},
      "events": ["portal.page.join.insurance","portal.onboarding.insurance_selected"],
      "observations": [
        "Captured both the available insurance choices and the No Insurance selection.",
        "The selected self-pay state displays $250 for intake and $150 for follow-up visits.",
        "The heading still says “Great news! We've got you covered” in the No Insurance state.",
        "No real insurance details were supplied or verified; this selection is part of the assignment scenario."
      ],
      "mobileObservations": ["The selected self-pay page is 1,565 pixels tall. The pricing notice appears well above the selected No Insurance option and Continue.", "Full-page capture can reposition sticky headers; any header overlap in this image is not a verified live UI defect."],
      "mobileHypotheses": ["Use explicit self-pay wording and keep the relevant price near the selected option and next action."],
      "hypotheses": ["Research what patients understand about accepted coverage, eligibility verification, and their expected cost at this point. An insurance selection alone does not establish verified benefits."],
      "status": "Observed in Chrome · October 20, 2026",
      "metrics": [
        {"label":"Sessions reaching screen","value":"3,338","detail":"56.6% of start sessions"},
        {"label":"Continue to needs","value":"92.7%","detail":"3,095 / 3,338 sessions"},
        {"label":"Do not reach needs","value":"243 · 7.3%","detail":"Outgoing transition; no cost-related cause established"}
      ],
      "milestones": [
        {
          "title": "Insurance page reached",
          "reach": 3338,
          "fromStart": 56.6,
          "conversion": 93.3,
          "loss": {"count":243,"percent":7.3,"to":"Needs"},
          "events": ["$pageview"],
          "note": "The supplied funnel uses page reach, not the insurance-selection action event."
        }
      ]
    },
    {
      "id": "needs",
      "number": 5,
      "title": "Needs",
      "path": "/portal/join/needs",
      "url": "https://app.legionhealth.com/portal/join/needs",
      "description": "Care-needs selection; the walkthrough chose an existing diagnosis and medication support.",
      "desktop": {
        "src": "assets/desktop-needs.jpg",
        "label": "Needs · existing diagnosis and medication support",
        "width": 1440,
        "height": 836,
        "viewportWidth": 1440,
        "viewportHeight": 749,
        "status": "Observed · Chrome",
        "url": "https://app.legionhealth.com/portal/join/needs",
        "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 836. Chrome desktop capture. Selected the scenario for an existing diagnosis and medication support. This does not describe David’s clinical needs."
      },
      "mobile": {
        "src": "assets/mobile-needs.jpg",
        "label": "Needs · existing diagnosis and medication support",
        "width": 390,
        "height": 1296,
        "viewportWidth": 390,
        "viewportHeight": 844,
        "status": "Observed · Chrome responsive",
        "url": "https://app.legionhealth.com/portal/join/needs",
        "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1296. Responsive Chrome viewport test; not a physical-device capture. Selected the scenario for an existing diagnosis and medication support. This does not describe David’s clinical needs."
      },
      "reach": 3095,
      "fromStart": 52.5,
      "loss": {"count":82,"percent":2.6,"to":"Provider-match page","note":"3,095 needs sessions → 3,013 provider-match sessions."},
      "events": ["portal.page.join.needs","portal.onboarding.needs"],
      "observations": ["Selected the existing-diagnosis and medication-support scenario before advancing to provider matching.","This scenario is not a statement about David’s diagnosis or treatment needs."],
      "mobileObservations": ["Three care-goal choices occupy a 1,296-pixel page. The selected choice expands; Continue is near the end of the page, below the initial viewport."],
      "mobileHypotheses": ["Show three concise choices first, then disclose explanatory detail without making comparison harder."],
      "hypotheses": ["Research whether collected needs meaningfully inform matching and can carry forward into visit preparation without repeated entry."],
      "status": "Observed in Chrome · October 20, 2026",
      "metrics": [
        {"label":"Sessions reaching screen","value":"3,095","detail":"52.5% of start sessions"},
        {"label":"Continue to provider match","value":"97.4%","detail":"3,013 / 3,095 sessions"},
        {"label":"Do not reach provider match","value":"82 · 2.6%","detail":"Outgoing transition; causes are not established"}
      ],
      "milestones": [
        {
          "title": "Needs page reached",
          "reach": 3095,
          "fromStart": 52.5,
          "conversion": 92.7,
          "loss": {"count":82,"percent":2.6,"to":"Provider-match page"},
          "events": ["$pageview"],
          "note": "The supplied funnel uses page reach, not the needs action event."
        }
      ]
    },
    {
      "id": "match",
      "number": 6,
      "title": "Provider match & reservation",
      "path": "/portal/join/match",
      "url": "https://app.legionhealth.com/portal/join/match",
      "description": "Provider cards, time selection, and optional earlier-appointment preferences share one route; three supplied funnel milestones also occur here.",
      "desktop": {
        "src": "assets/desktop-match.jpg",
        "label": "Initial provider results",
        "width": 1440,
        "height": 3129,
        "viewportWidth": 1440,
        "viewportHeight": 749,
        "status": "Observed · Chrome",
        "url": "https://app.legionhealth.com/portal/join/match",
        "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 3129. Chrome desktop capture. Three initial provider cards, all PMHNPs, with an indication of 37 more. Earliest displayed availability was October 21 at the October 20 observation. A matching checklist remains above the cards.",
        "frames": [
          {
            "src": "assets/desktop-match-selected.jpg",
            "label": "Provider and time selected",
            "width": 1440,
            "height": 3280,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/match",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 3280. Chrome desktop capture. Selected the displayed October 28, 1:00 PM slot for Doose Jennifer Onarinde. A selected slot is not proof of a confirmed appointment."
          },
          {
            "src": "assets/desktop-match-earlier.jpg",
            "label": "Optional earlier-appointment preferences",
            "width": 1440,
            "height": 3492,
            "viewportWidth": 1440,
            "viewportHeight": 749,
            "status": "Observed · Chrome",
            "url": "https://app.legionhealth.com/portal/join/match",
            "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 3492. Chrome desktop capture. The optional earlier-appointment preference was enabled to inspect this state, then disabled before advancing. No earlier-appointment preference submission was confirmed."
          }
        ]
      },
      "mobile": {
        "src": "assets/mobile-match.jpg",
        "label": "Initial provider results",
        "width": 390,
        "height": 3901,
        "viewportWidth": 390,
        "viewportHeight": 844,
        "status": "Observed · Chrome responsive",
        "url": "https://app.legionhealth.com/portal/join/match",
        "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 3901. Responsive Chrome viewport test; not a physical-device capture. Three initial provider cards, all PMHNPs, with an indication of 37 more. Earliest displayed availability was October 21 at the October 20 observation. A matching checklist remains above the cards.",
        "frames": [
          {
            "src": "assets/mobile-match-selected.jpg",
            "label": "Provider and time selected",
            "width": 390,
            "height": 4107,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/match",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 4107. Responsive Chrome viewport test; not a physical-device capture. Selected the displayed October 28, 1:00 PM slot for Doose Jennifer Onarinde. A selected slot is not proof of a confirmed appointment."
          },
          {
            "src": "assets/mobile-match-earlier.jpg",
            "label": "Optional earlier-appointment preferences",
            "width": 390,
            "height": 4343,
            "viewportWidth": 390,
            "viewportHeight": 844,
            "status": "Observed · Chrome responsive",
            "url": "https://app.legionhealth.com/portal/join/match",
            "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 4343. Responsive Chrome viewport test; not a physical-device capture. The optional earlier-appointment preference was enabled to inspect this state, then disabled before advancing. No earlier-appointment preference submission was confirmed."
          }
        ]
      },
      "reach": 3013,
      "fromStart": 51.1,
      "loss": {"count":1104,"percent":36.6,"to":"Provider selected","note":"3,013 match-page sessions → 1,909 provider selections. The two later transitions are shown separately below."},
      "events": ["portal.page.join.match","portal.provider_selected","portal.provider.reservation.created","portal.reschedule_preferences.saved"],
      "observations": [
        "The initial results show three providers, all PMHNPs, and an indication of 37 more. Earliest displayed availability was October 21 at the October 20 observation.",
        "A matching checklist remains visible above the provider cards in the captured result states. Its presence does not establish how the underlying matching logic operates.",
        "Selected the displayed October 28, 1:00 PM slot for Doose Jennifer Onarinde.",
        "Enabled the optional earlier-appointment preference to inspect it, then disabled it before advancing.",
        "Clicking Book appointment moved the anonymous user to /portal/join/patient. No account, payment, or completed appointment was confirmed."
      ],
      "hypotheses": [
        "Investigate provider fit, availability, cost clarity, and interaction difficulty as separate possible explanations for non-selection.",
        "Inspect selection and reservation states separately; the supplied data does not show that a reservation became a confirmed or completed appointment."
      ],
      "mobileObservations": ["Initial results occupy 3,901 pixels, about 4.6 viewport heights. The first provider begins around 1,230 pixels down, after the completed matching checklist.", "The first provider exposes three time choices on mobile versus eight in the desktop capture; remaining times are behind a more-times control.", "Full-page capture can reposition sticky headers. This image does not establish a live header-overlap defect."],
      "mobileHypotheses": ["Collapse completed matching status, bring suitable providers and times forward, and explain individual match reasons."],
      "status": "Observed in Chrome · October 20, 2026",
      "metrics": [
        {"label":"Sessions reaching screen","value":"3,013","detail":"51.1% of start sessions"},
        {"label":"Match → provider selected","value":"1,104 lost · 36.6%","detail":"63.4% continue · 1,909 / 3,013"},
        {"label":"Selected → reservation created","value":"145 lost · 7.6%","detail":"92.4% continue · 1,764 / 1,909"},
        {"label":"Reservation → patient details","value":"1 lost · 0.1%","detail":"99.9% continue · 1,763 / 1,764"}
      ],
      "milestones": [
        {
          "title": "Match page reached",
          "reach": 3013,
          "fromStart": 51.1,
          "conversion": 97.4,
          "loss": {"count":1104,"percent":36.6,"to":"Provider selected"},
          "events": ["$pageview"],
          "note": "Page reach after needs. 63.4% reach the next action."
        },
        {
          "title": "Provider selected",
          "reach": 1909,
          "fromStart": 32.4,
          "conversion": 63.4,
          "loss": {"count":145,"percent":7.6,"to":"Reservation created"},
          "events": ["portal.provider_selected"],
          "note": "Action on the same route, after match-page reach. 92.4% reach the next action."
        },
        {
          "title": "Reservation created",
          "reach": 1764,
          "fromStart": 29.9,
          "conversion": 92.4,
          "loss": {"count":1,"percent":0.1,"to":"Patient-details page"},
          "events": ["portal.provider.reservation.created"],
          "note": "Action on the same route, after provider selection. 99.9% reach patient details. Reservation does not prove a completed appointment."
        }
      ]
    },
    {
      "id": "patient",
      "number": 7,
      "title": "Patient details & account",
      "path": "/portal/join/patient",
      "url": "https://app.legionhealth.com/portal/join/patient",
      "description": "A blank patient-details form reached after the Book appointment action, before account creation.",
      "desktop": {
        "src": "assets/desktop-patient.jpg",
        "label": "Patient details · blank form",
        "width": 1440,
        "height": 1125,
        "viewportWidth": 1440,
        "viewportHeight": 749,
        "status": "Observed · Chrome",
        "url": "https://app.legionhealth.com/portal/join/patient",
        "note": "October 20, 2026 · 1440 × 749 CSS-pixel viewport · full-page capture 1440 × 1125. Chrome desktop capture. The Book appointment button led to this form for the anonymous user. The captured form is blank; no account, payment, or completed appointment was confirmed."
      },
      "mobile": {
        "src": "assets/mobile-patient.jpg",
        "label": "Patient details · blank form",
        "width": 390,
        "height": 1556,
        "viewportWidth": 390,
        "viewportHeight": 844,
        "status": "Observed · Chrome responsive",
        "url": "https://app.legionhealth.com/portal/join/patient",
        "note": "October 20, 2026 · 390 × 844 CSS-pixel viewport · full-page capture 390 × 1556. Responsive Chrome viewport test; not a physical-device capture. The Book appointment button led to this form for the anonymous user. The captured form is blank; no account, payment, or completed appointment was confirmed."
      },
      "reach": 1763,
      "fromStart": 29.9,
      "loss": {"count":360,"percent":20.4,"to":"Account created","note":"1,763 patient-page sessions → 1,403 account creations. All 1,403 subsequently reach payment in the supplied funnel."},
      "events": ["portal.page.join.patient","portal.onboarding.userCreated"],
      "observations": [
        "Captured the blank patient-details form after advancing from provider selection.",
        "The form includes name, email, phone, date-of-birth and referral fields plus three agreement checkbox groups. Requiredness and validation of each field were not tested.",
        "No chosen provider, appointment time, or price is visible in the full-page blank-form capture.",
        "David chose to stop the live walkthrough at Basic Info. No personal details or agreements were submitted.",
        "No account creation, payment, or completed appointment is confirmed by the captured evidence."
      ],
      "hypotheses": ["Investigate required effort, trust, validation, and continuity at account creation. The 20.4% non-progression rate does not identify which, if any, explains the loss."],
      "mobileObservations": ["The blank form is 1,556 pixels tall; Save my info & Continue is below the initial viewport. The mobile progress indicator shows a step number and percentage but omits desktop stage names."],
      "mobileHypotheses": ["Retain appointment and cost context while asking for personal information. Test whether acquisition attribution can be optional or asked later."],
      "status": "Observed · agreed walkthrough endpoint",
      "metrics": [
        {"label":"Sessions reaching screen","value":"1,763","detail":"29.9% of start sessions"},
        {"label":"Patient details → account created","value":"360 lost · 20.4%","detail":"79.6% continue · 1,403 / 1,763"},
        {"label":"Account created → payment page","value":"0 lost · 0.0%","detail":"100.0% continue · 1,403 / 1,403"}
      ],
      "milestones": [
        {
          "title": "Patient-details page reached",
          "reach": 1763,
          "fromStart": 29.9,
          "conversion": 99.9,
          "loss": {"count":360,"percent":20.4,"to":"Account created"},
          "events": ["$pageview"],
          "note": "Page reach after reservation creation. 79.6% reach account creation."
        },
        {
          "title": "Account created",
          "reach": 1403,
          "fromStart": 23.8,
          "conversion": 79.6,
          "loss": {"count":0,"percent":0,"to":"Payment page"},
          "events": ["portal.onboarding.userCreated"],
          "note": "Action on the same route, after patient-page reach. 100.0% subsequently reach payment."
        }
      ]
    },
    {
      "id": "payment",
      "number": 8,
      "title": "Payment page",
      "path": "/portal/join/payment",
      "url": "https://app.legionhealth.com/portal/join/payment",
      "description": "The endpoint of the supplied telemetry, while the assignment continues through the first completed visit.",
      "desktop": {
        "src": null,
        "width": null,
        "height": null,
        "status": "Not captured · beyond agreed scope",
        "note": "David chose to stop the live walkthrough at Basic Info. Payment remains unobserved; historical page-reach metrics are retained."
      },
      "mobile": {
        "src": null,
        "width": null,
        "height": null,
        "status": "Not captured · beyond agreed scope",
        "note": "No payment screenshot or responsive observation: the live walkthrough ends at Basic Info by David's choice. Historical page-reach metrics do not establish payment success."
      },
      "reach": 1403,
      "fromStart": 23.8,
      "loss": {"count":null,"percent":null,"to":"Subsequent outcome not measured","note":"No payment-success or first-visit-completed milestone is supplied. Unknown must not be displayed as zero."},
      "events": ["portal.page.join.payment"],
      "observations": [],
      "hypotheses": ["Research the handoff from payment or billing setup to a confirmed appointment, readiness for the visit, and completed care."],
      "status": "Unobserved · beyond agreed walkthrough endpoint",
      "metrics": [
        {"label":"Sessions reaching screen","value":"1,403","detail":"23.8% of start sessions"},
        {"label":"Successful payment","value":"Unknown","detail":"No dedicated payment-success event was observed on this page"},
        {"label":"First visit completed","value":"Unknown","detail":"The supplied dataset stops before the assignment's endpoint"}
      ],
      "milestones": [
        {
          "title": "Payment page reached",
          "reach": 1403,
          "fromStart": 23.8,
          "conversion": 100,
          "loss": {"count":null,"percent":null,"to":"Not measured"},
          "events": ["$pageview"],
          "note": "Ordered page reach after account creation. This is not proof of payment, appointment completion, or onboarding completion."
        }
      ]
    }
  ],
  "followThrough": [
    {
      "title": "Payment / billing outcome",
      "description": "Research waypoint, not a verified current screen. Establish what is required, how success is confirmed, and how a patient recovers from a pending or failed outcome. Current route and conversion are unknown.",
      "status": "Not observed · not measured"
    },
    {
      "title": "Confirmed first appointment",
      "description": "Research waypoint, not a verified current screen. Distinguish a reservation from a confirmed appointment, and inspect confirmation, changes, and cancellation. Current route and conversion are unknown.",
      "status": "Not observed · not measured"
    },
    {
      "title": "Ready for the visit",
      "description": "Research waypoint, not a verified current screen. Inspect outstanding intake tasks, consent, information handoff, reminders, and joining instructions. Current sequence and conversion are unknown.",
      "status": "Not observed · not measured"
    },
    {
      "title": "Arrival and attendance",
      "description": "Research waypoint, not a verified current screen. Inspect check-in, joining the visit, delays, and recovery from a missed connection. Attendance alone is not a completed visit.",
      "status": "Not observed · not measured"
    },
    {
      "title": "First visit completed",
      "description": "The assignment's explicit onboarding endpoint. No completion milestone is supplied; a future design needs an authoritative completion signal and a defined observation window. Any prototype completion will be simulated.",
      "status": "Required endpoint · not measured"
    }
  ],
  "recommendations": [
    {
      "title": "Start with fit-check exits",
      "body": "The fit → conditions transition accounts for 1,912 of 4,495 observed losses before payment-page reach. Determine how much reflects appropriate eligibility filtering before treating it as recoverable conversion."
    },
    {
      "title": "Bring provider decisions forward",
      "body": "The completed matching checklist pushes the first mobile provider below the initial viewport. Test a concise shortlist with specific match reasons and usable time comparison. Match → selection loses 36.6%; the data does not establish that this layout caused those exits."
    },
    {
      "title": "Examine the account-creation handoff",
      "body": "Patient-page reach → account creation loses 360 sessions (20.4%). Observe effort, validation, trust cues, and resume behavior before choosing a redesign. Account creation → payment-page reach has no observed loss in this snapshot."
    },
    {
      "title": "Put the mobile task before repeated reassurance",
      "body": "The testimonial moves above each mobile task and selected cards expand vertically. Test compact reassurance, concise choices, and an easy-to-reach next action. Validate on physical devices and request a device-segmented funnel before estimating conversion impact."
    },
    {
      "title": "Measure the outcome the assignment defines",
      "body": "Map the unobserved path from reservation and payment-page reach to the first completed visit. Define patient identity across sessions, eligible cohorts, observation windows, and authoritative booking, attendance, and completion signals."
    },
    {
      "title": "Use AI where it removes work or uncertainty",
      "body": "After reviewing the existing journey, evaluate AI-assisted intake, confirmed autofill, explainable matching, and clinician-ready preparation. Choose a few useful capabilities with clear consent, provenance, patient correction, and fallback behavior; mocked services are acceptable for the later prototype."
    }
  ],
  "funnel": [
    {"number":1,"title":"Start","path":"/portal/join","reach":5898,"conversion":100,"fromStart":100,"incomingLoss":null,"loss":{"count":408,"percent":6.9,"to":"Fit check"},"event":"$pageview","kind":"page"},
    {
      "number": 2,
      "title": "Fit check",
      "path": "/portal/join/fit",
      "reach": 5490,
      "conversion": 93.1,
      "fromStart": 93.1,
      "incomingLoss": {"count":408,"percent":6.9},
      "loss": {"count":1912,"percent":34.8,"to":"Conditions"},
      "event": "$pageview",
      "kind": "page"
    },
    {
      "number": 3,
      "title": "Conditions",
      "path": "/portal/join/conditions",
      "reach": 3578,
      "conversion": 65.2,
      "fromStart": 60.7,
      "incomingLoss": {"count":1912,"percent":34.8},
      "loss": {"count":240,"percent":6.7,"to":"Insurance"},
      "event": "$pageview",
      "kind": "page"
    },
    {
      "number": 4,
      "title": "Insurance",
      "path": "/portal/join/insurance",
      "reach": 3338,
      "conversion": 93.3,
      "fromStart": 56.6,
      "incomingLoss": {"count":240,"percent":6.7},
      "loss": {"count":243,"percent":7.3,"to":"Needs"},
      "event": "$pageview",
      "kind": "page"
    },
    {
      "number": 5,
      "title": "Needs",
      "path": "/portal/join/needs",
      "reach": 3095,
      "conversion": 92.7,
      "fromStart": 52.5,
      "incomingLoss": {"count":243,"percent":7.3},
      "loss": {"count":82,"percent":2.6,"to":"Provider-match page"},
      "event": "$pageview",
      "kind": "page"
    },
    {
      "number": 6,
      "title": "Provider-match page",
      "path": "/portal/join/match",
      "reach": 3013,
      "conversion": 97.4,
      "fromStart": 51.1,
      "incomingLoss": {"count":82,"percent":2.6},
      "loss": {"count":1104,"percent":36.6,"to":"Provider selected"},
      "event": "$pageview",
      "kind": "page"
    },
    {
      "number": 7,
      "title": "Provider selected",
      "path": "/portal/join/match",
      "reach": 1909,
      "conversion": 63.4,
      "fromStart": 32.4,
      "incomingLoss": {"count":1104,"percent":36.6},
      "loss": {"count":145,"percent":7.6,"to":"Reservation created"},
      "event": "portal.provider_selected",
      "kind": "action"
    },
    {
      "number": 8,
      "title": "Reservation created",
      "path": "/portal/join/match",
      "reach": 1764,
      "conversion": 92.4,
      "fromStart": 29.9,
      "incomingLoss": {"count":145,"percent":7.6},
      "loss": {"count":1,"percent":0.1,"to":"Patient-details page"},
      "event": "portal.provider.reservation.created",
      "kind": "action"
    },
    {
      "number": 9,
      "title": "Patient-details page",
      "path": "/portal/join/patient",
      "reach": 1763,
      "conversion": 99.9,
      "fromStart": 29.9,
      "incomingLoss": {"count":1,"percent":0.1},
      "loss": {"count":360,"percent":20.4,"to":"Account created"},
      "event": "$pageview",
      "kind": "page"
    },
    {
      "number": 10,
      "title": "Account created",
      "path": "/portal/join/patient",
      "reach": 1403,
      "conversion": 79.6,
      "fromStart": 23.8,
      "incomingLoss": {"count":360,"percent":20.4},
      "loss": {"count":0,"percent":0,"to":"Payment page"},
      "event": "portal.onboarding.userCreated",
      "kind": "action"
    },
    {
      "number": 11,
      "title": "Payment page",
      "path": "/portal/join/payment",
      "reach": 1403,
      "conversion": 100,
      "fromStart": 23.8,
      "incomingLoss": {"count":0,"percent":0},
      "loss": {"count":null,"percent":null,"to":"Not measured"},
      "event": "$pageview",
      "kind": "page"
    }
  ],
  "captureMethod": "Full-page Chrome screenshots at a 1,440 × 749 desktop viewport and a 390 × 844 responsive viewport. Responsive captures are viewport tests, not physical-mobile-device tests.",
  "captureBoundary": "Observed from entry through the blank patient-details form. David chose to stop the live walkthrough at Basic Info; payment and the subsequent journey remain unobserved.",
  "scenario": "Authorized assignment walkthrough: Texas adult seeking virtual care; scenario fit-check answers, ADHD selection, self-pay, and an existing-diagnosis medication-support need. These selections do not represent David’s health or insurance history."
};
