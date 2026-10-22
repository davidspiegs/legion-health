# Assignment understanding

Source: Legion's Founding Product take-home brief, kept out of this repository. This document separates the brief's requirements from interpretation and recommendations. It contains no live UX observations.

## Explicit requirements

1. Go through Legion's onboarding as a prospective patient in Texas, starting at [app.legionhealth.com/portal/join](https://app.legionhealth.com/portal/join).
2. Rebuild patient onboarding for an “AI-native world.”
3. Continue the journey until the patient's **first visit is completed**. A reservation, scheduled appointment, account, or payment-page visit is not the assignment's endpoint.
4. Build and deploy a working prototype.
5. Submit the prototype, repository, an **open pull request**, and a recorded walkthrough of roughly five minutes explaining the most important decisions and tradeoffs.
6. Choose useful data sources and integrations. Any subset of the suggested sources is permitted; additional sources are permitted with a brief explanation of what each adds.

The complete AI interaction history is also a final submission requirement; per David's direction, it will be addressed at the end.

The brief identifies Metriport and Sohar Health as currently used, and DoseSpot as an existing integration. Verified and Persona are available for consideration and are explicitly **not part of the current live onboarding**. Their inclusion is optional. The brief does not require a particular framework, a chatbot, or every listed integration.

David reports that Yash confirmed by email that mocked or simulated external services are acceptable. Vendor sandboxes are therefore unnecessary for this assignment.

## Current work authorized by David

The first deliverable is an inspectable HTML canvas of the existing journey, with desktop and mobile views, screen URLs, relevant documented events, and correctly attributed funnel metrics. Explore as far as practical, identify any account or contact-information blocker, and distinguish observed screens from unobserved downstream stages.

Create a private GitHub repository named `legion-health-assignment` (since renamed `legion-health`), with a basic README on `main` and assignment work on a separate branch. Pause for David's feedback after the canvas before building the redesigned prototype. Vercel is intended for the later prototype phase.

## Why this fits the role — interpretation

The following are inferred evaluation criteria, not additional requirements stated by Legion:

| Role responsibility | What the assignment can reveal |
| --- | --- |
| Consumer product | Understanding patient uncertainty, establishing trust, reducing unnecessary effort, making cost and provider choices understandable, and supporting access to care. |
| Platform product | Coordinating data sources and operational states; handling consent, asynchronous work, incomplete or conflicting data, failures, and clinician handoffs. |
| AI product | Choosing consequential AI work, evaluating its output, managing uncertainty, and retaining appropriate patient and clinician control. |
| Founding PM | Turning an ambiguous goal into a focused working product, using evidence to prioritize, explaining tradeoffs, and owning an outcome across organizational boundaries. |

The completed-visit endpoint suggests that Legion wants outcome ownership beyond registration or scheduling. A successful candidate should connect acquisition and intake to preparation, attendance, and completion, while recognizing that appropriate eligibility exits may be beneficial.

## What an impressive version would demonstrate — recommendations

- A coherent journey that earns trust, minimizes repeated entry, explains provider availability and cost, and prepares the patient for the first visit.
- AI that performs useful work: organizing patient-provided information, helping reconcile imported context with patient confirmation, explaining a match, and preparing a source-linked summary for clinician review.
- Realistic simulated integration behavior, including success, pending, unavailable, and conflicting results, with clear recovery paths.
- A small number of consequential design choices executed thoroughly, supported by evidence and explicit tradeoffs.
- Operational truth behind the interface: distinguish verification, reservation, booking, preparation, attendance, and completed-visit states. A simulated completion must be identified as simulated.
- Measurement that can eventually connect an eligible intake cohort to a verified first completed visit across sessions. The observation window, identity model, eligibility definition, and completion source must be specified before reporting this outcome.

These recommendations should guide the later prototype. They do not imply that these capabilities exist in Legion's current interface.

## Supplied funnel: all 11 milestones

**Source basis:** actual aggregate production PostHog telemetry supplied in section 2 of the brief, for the rolling 30 days ending **August 29, 2026**. Counts describe ordered milestones within the same browser session. They are not unique verified patients and are not a measurement of the interface captured during this project.

The table below moves each loss to the transition **out of** the milestone where the session last progressed. This differs from the brief's “Drop from previous milestone” layout. The values are unchanged.

| # | Milestone | Route | Milestone evidence used in supplied funnel | Sessions | From start | Next milestone | Observed outgoing loss |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| 1 | Start | `/portal/join` | Page reached | 5,898 | 100.0% | Fit check | 408 (6.9%) |
| 2 | Fit check | `/portal/join/fit` | Page reached after start | 5,490 | 93.1% | Conditions | 1,912 (34.8%) |
| 3 | Conditions | `/portal/join/conditions` | Page reached after fit check | 3,578 | 60.7% | Insurance | 240 (6.7%) |
| 4 | Insurance | `/portal/join/insurance` | Page reached after conditions | 3,338 | 56.6% | Needs | 243 (7.3%) |
| 5 | Needs | `/portal/join/needs` | Page reached after insurance | 3,095 | 52.5% | Provider match page | 82 (2.6%) |
| 6 | Provider match page | `/portal/join/match` | Match page reached after needs | 3,013 | 51.1% | Provider selected | 1,104 (36.6%) |
| 7 | Provider selected | `/portal/join/match` | `portal.provider_selected` after match-page reach | 1,909 | 32.4% | Reservation created | 145 (7.6%) |
| 8 | Reservation created | `/portal/join/match` | `portal.provider.reservation.created` after provider selection | 1,764 | 29.9% | Patient details page | 1 (0.1%) |
| 9 | Patient details page | `/portal/join/patient` | Page reached after reservation creation | 1,763 | 29.9% | Account created | 360 (20.4%) |
| 10 | Account created | `/portal/join/patient` | `portal.onboarding.userCreated` after patient-page reach | 1,403 | 23.8% | Payment page | 0 (0.0%) |
| 11 | Payment page | `/portal/join/payment` | Page reached after account creation | 1,403 | 23.8% | Not measured in supplied funnel | Unknown |

Page-reach milestones use PostHog's automatic `$pageview`; action milestones use the explicit events shown above. The additional canonical page and action events are documented in [Telemetry reference](telemetry-reference.md).

## Opportunity priorities and interpretation

There are **4,495 fewer sessions** at payment-page reach than at start. Three transitions account for **75.1%** of that observed loss:

| Investigation priority | Lost sessions | Loss within transition | Share of all observed losses before payment-page reach |
| --- | ---: | ---: | ---: |
| Fit check → conditions | 1,912 | 34.8% | 42.5% |
| Match page → provider selected | 1,104 | 36.6% | 24.6% |
| Patient details page → account created | 360 | 20.4% | 8.0% |

These are investigation priorities, not estimates of recoverable conversion. For example, fit-check exits may reflect appropriate eligibility filtering. The provider-selection transition could reflect fit, cost, supply, availability, interface friction, or other causes; this table cannot distinguish them.

The **34.8%** loss belongs to **fit → conditions**, not to interaction with the conditions screen. Likewise, **36.6%** belongs to match-page reach → provider selection, and **20.4%** to patient-page reach → account creation. Screens can show these outgoing transitions without claiming that the screen caused the loss.

The supplied data has no device breakdown. Mobile observations can identify usability hypotheses, but the aggregate rates cannot establish mobile-specific drop-off or the effect of a mobile redesign.

Payment-page reach does not prove payment success. A reservation does not prove a completed appointment. No supplied milestone establishes first-visit completion, so the assignment's ultimate outcome is currently unmeasured in this dataset.
