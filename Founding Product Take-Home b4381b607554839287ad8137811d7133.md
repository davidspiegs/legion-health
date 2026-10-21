# Founding Product Take-Home

# 1. Goal

Go through Legion's current onboarding as if you were a prospective patient in Texas: [open the current onboarding](https://app.legionhealth.com/portal/join). 

**Rebuild our patient onboarding in an AI-native world.**

For this assignment, **onboarding ends when the patient's first visit is completed**. It does not end when the visit is booked or scheduled.

Build and deploy the version you believe should exist. Submit the working prototype, the repository and open pull request, and a short recorded walkthrough (roughly five minutes) explaining the most important decisions and tradeoffs.

**Complete AI interaction history — required:** Submit the complete, unedited history of every AI interaction used for this assignment, including every prompt, response, follow-up, retry, and correction across all tools and threads. We want to understand how you directed AI, evaluated its output, and iterated—not just see the final result. Do not submit selected excerpts or a reconstructed summary. Redact only credentials, secrets, or unrelated personal information, and label every redaction. Do not include real patient information.

# 2. Current onboarding data

<aside>
📊

**This is actual aggregate production telemetry from Legion's PostHog.** It contains no patient-level information.

</aside>

**Scope note:** The telemetry below covers the current web flow through payment-page reach. It does not include a first-visit-completed milestone, even though this assignment's definition of onboarding continues through completion of the first visit.

**Snapshot:** rolling 30 days ending August 29, 2026  

**Environment:** production host `app.legionhealth.com` only  

**Exclusions:** staging, preview, demo, local development traffic, other hosts, and future-dated records  

**Unit:** ordered milestones reached within the same PostHog browser session; page milestones use PostHog's automatic `$pageview`, and action milestones use the explicit journey events named below  

**Important:** these are sessions, not verified individual patients. Repeat visits, identity stitching, blocked analytics, and cross-session continuation can affect the counts.

| Phase | Current page or action | Milestone used | Sessions reaching milestone | Conversion from previous milestone | Conversion from start | Drop from previous milestone |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Start | [/portal/join](https://app.legionhealth.com/portal/join) | Page reached | 5,898 | 100.0% | 100.0% | — |
| 2. Fit check | [/portal/join/fit](https://app.legionhealth.com/portal/join/fit) | Page reached after start | 5,490 | 93.1% | 93.1% | 408 (6.9%) |
| 3. Conditions | [/portal/join/conditions](https://app.legionhealth.com/portal/join/conditions) | Page reached after fit check | 3,578 | 65.2% | 60.7% | 1,912 (34.8%) |
| 4. Insurance | [/portal/join/insurance](https://app.legionhealth.com/portal/join/insurance) | Page reached after conditions | 3,338 | 93.3% | 56.6% | 240 (6.7%) |
| 5. Needs | [/portal/join/needs](https://app.legionhealth.com/portal/join/needs) | Page reached after insurance | 3,095 | 92.7% | 52.5% | 243 (7.3%) |
| 6. Provider match | [/portal/join/match](https://app.legionhealth.com/portal/join/match) | Match page reached after needs | 3,013 | 97.4% | 51.1% | 82 (2.6%) |
| 7. Provider selected | [/portal/join/match](https://app.legionhealth.com/portal/join/match) | `portal.provider_selected` after match-page reach | 1,909 | 63.4% | 32.4% | 1,104 (36.6%) |
| 8. Reservation created | [/portal/join/match](https://app.legionhealth.com/portal/join/match) | `portal.provider.reservation.created` after provider selection | 1,764 | 92.4% | 29.9% | 145 (7.6%) |
| 9. Patient details | [/portal/join/patient](https://app.legionhealth.com/portal/join/patient) | Page reached after reservation creation | 1,763 | 99.9% | 29.9% | 1 (0.1%) |
| 10. Account created | [/portal/join/patient](https://app.legionhealth.com/portal/join/patient) | `portal.onboarding.userCreated` after patient-page reach | 1,403 | 79.6% | 23.8% | 360 (20.4%) |
| 11. Payment page | [/portal/join/payment](https://app.legionhealth.com/portal/join/payment) | Page reached after account creation | 1,403 | 100.0% | 23.8% | 0 (0.0%) |

A “reservation created” event is a reservation milestone, not proof of a completed appointment. Likewise, payment-page reach is not proof of successful payment because no dedicated payment-success event was observed on that page.

**Current page and event instrumentation**

| Current page | Phase | Canonical journey events observed at material volume | Instrumentation status |
| --- | --- | --- | --- |
| `/portal/join` | Start | `portal.page.join`; `portal.onboarding.started` | Page and start explicitly instrumented |
| `/portal/join/fit` | Fit check | `portal.page.fit_check` | Page explicitly instrumented; no separate fit-submit event observed |
| `/portal/join/conditions` | Conditions | `portal.page.join.conditions`; `portal.onboarding.conditions` | Page and phase action explicitly instrumented |
| `/portal/join/insurance` | Insurance | `portal.page.join.insurance`; `portal.onboarding.insurance_selected` | Page and selection action explicitly instrumented |
| `/portal/join/needs` | Needs | `portal.page.join.needs`; `portal.onboarding.needs` | Page and phase action explicitly instrumented |
| `/portal/join/match` | Provider match and reservation | `portal.page.join.match`; `portal.provider_selected`; `portal.provider.reservation.created`; `portal.reschedule_preferences.saved` | Page, provider selection, reservation creation, and reschedule-preference action explicitly instrumented |
| `/portal/join/patient` | Patient details and account creation | `portal.page.join.patient`; `portal.onboarding.userCreated` | Page and account-creation action explicitly instrumented |
| `/portal/join/payment` | Payment | `portal.page.join.payment` | Page explicitly instrumented; no dedicated payment-success or onboarding-complete event observed |

All eight pages also emit PostHog's automatic browser telemetry such as `$pageview`; the table above maps the canonical, deliberate journey events. Several `portal.page.*` events fire more than once per session, so the conversion table uses ordered session reach at native timestamp precision rather than raw event volume.

**Low-volume cross-route and ancillary observations:** The same production snapshot also contained event names on routes where they are not canonical: `/portal/join` emitted `portal.page.fit_check` (12 events / 10 sessions), `portal.page.join.conditions` (1 / 1), and the legacy unprefixed `provider_selected` (2 / 2); `/portal/join/fit` emitted `portal.onboarding.started` (3 / 3) and `portal.page.join` (3 / 3); `/portal/join/insurance` emitted `portal.page.login` (2 / 1); `/portal/join/patient` emitted `portal.provider.reservation.created` (9 / 9) and `portal.reschedule_preferences.saved` (2 / 2); and `/portal/join/payment` emitted `portal.provider.reservation.created` (1 / 1). `/portal/join` also emitted `utm.params.applied` (1,718 / 1,717), which is campaign attribution rather than an onboarding-phase milestone. These are disclosed for completeness but are not used as canonical funnel stages.

# 3. Data sources and integrations available to you

Legion currently uses Metriport and Sohar Health and has an existing DoseSpot integration. Verified and Persona are available for consideration as building blocks in your rebuild, but neither is part of the current live onboarding. You may use any subset of these sources, and you may introduce any additional third-party or public data sources that would make your rebuild stronger. These are starting points, not constraints.

- [**Metriport**](https://www.metriport.com/platform/api) — currently used for HIE-connected longitudinal medical records
- [**Sohar Health**](https://docs.soharhealth.com/documentation/getting-started/quickstart) — currently used for insurance eligibility and benefits verification; Sohar also offers insurance discovery
- [**DoseSpot**](https://dosespot.com/) — existing e-prescribing and medication-workflow integration
- [**Verified**](https://docs.verified.inc/) — available for consideration for 1-Click Signup and 1-Click Health, including demographic autofill, insurance discovery, and eligibility
- [**Persona**](https://withpersona.com/) — available for consideration for identity-verification workflows

You may also use other clinical or HIE networks (for example, Particle Health, Health Gorilla, or Zus); patient-mediated coverage or claims sources (for example, Flexpa or b.well); pharmacy-fill, prescription-benefit, or PDMP sources (for example, Surescripts, DrFirst, or Bamboo); labs, provider directories, wearable or patient-generated data; or any other source you believe belongs in the experience. Briefly explain what each additional source adds.