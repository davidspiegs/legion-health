# First-visit flow prototype: architecture and measurement

October 20, 2026. This describes the code in `prototype/src`, alongside the [redesigned journey](redesigned-journey.md). It is a reviewable flow prototype before the larger rebuild, not the complete final assignment submission or a production care system. Its endpoint is a **simulated clinician-completed first visit**, with an optional follow-up.

## Implementation boundary

React screens share a typed `JourneyState`. `createMockApi` in [services.ts](../prototype/src/model/services.ts) provides asynchronous service-shaped operations with a short simulated delay, except fit and goal saves use zero added latency for direct answer-to-next-step interaction. Urgent support routing happens before saving. There are no vendor SDKs, service requests, payment charges, notifications, camera captures, or real clinical transactions in these adapters. [Fixtures](../prototype/src/model/fixtures.ts) supply two fictional clinicians, synthetic profile data, fixed October/November 2026 availability, and Central Time formatting that accounts for the daylight-saving change.

The patient view is `/`; full reviewer tools are at `/?review=1`. Both modes offer a separate “Preview controls” dialog outside the patient surface to advance appointment day and conversation phases and send the simulated clinician completion signal. Care screens contain no embedded simulation-control blocks. The patient can therefore follow the whole journey without entering the screen-jump review mode.

| Adapter and exact methods | Implemented behavior | Deliberate limit |
| --- | --- | --- |
| Profile: `saveDraft(stage)` | Simulates incremental save acknowledgement and one recoverable save failure. Answers remain in application state. | The method does not write a server record. Local persistence is handled separately by the app. |
| Auth: `createAccount()` | Validates the sample demographic/contact fields and records one successful account-creation operation. | No email link, OTP, identity verification, password, authenticated session, or vendor patient record is created. |
| Scheduling: `getProviders()`, `reserve()`, `confirm()`, `reschedule()`, `bookFollowup()` | Fictional directory; 15-minute local hold; confirmation prerequisites; slot conflict recovery; same-appointment rescheduling; separate follow-up identity. | No shared inventory or real Healthie API. Hold duration is a design choice, not an observed vendor contract. |
| Sohar: `checkEligibility()` | Insured path returns a fictional verified $25 estimate or persistent pending state. Self-pay bypasses the adapter. | No insurer discovery, actual benefits, negative coverage determination, or payer webhook. |
| Payment: `setupPayment()` | Prepares a demo method and supports one failed attempt followed by retry. | No card entry, token, authorization, charge, or real Stripe connection. |
| Metriport: `requestRecords(allowed)` | Permission-gated ready, unavailable, and declined states; permission rechecked after the simulated delay. | One fictional source record, not a real longitudinal history or FHIR integration. |
| AI care brief: `generateBrief()` | Carries the patient's goal into an editable draft, resets approval, and supports a source-labelled fictional record and patient correction. | Deterministic content, not a model call, diagnosis, prescription, or inference of clinical suitability. |
| Reminders: `scheduleReminders(appointmentId?)` | Sets scheduling state for an upcoming first or follow-up appointment. UI previews 24-hour and 1-hour reminders and channel preferences. | Flags and previews, not a durable outbox, delivery receipt, or background scheduler. |
| Video: `joinVisit()`, `reconnect()` | Device-check prerequisite, joined/interrupted states, and recovery into the same visit. | Checks and video are simulated; no media permissions or telehealth connection. |
| Encounter: `completeVisit('clinician')` | Completes only a joined encounter and deduplicates repeat completion. | A client-side simulation of authority, not authenticated clinician authorization. |
| Care team: `sendCareMessage()` | Validates a nonempty message, appends its body, ID, and timestamp to local `careMessages`, emits a generic acknowledgement, and clears the composer. Concurrent duplicate sends share one operation. | Nothing is delivered. Message content stays outside the event ledger; its persistence is limited to this browser's journey storage. |

The calendar download is a real local `.ics` file explicitly labelled as a demo visit; it does not write to a calendar account. Feedback is stored in local journey state. Verified, Persona, DoseSpot, and advertising destinations are intentionally absent from this flow review. The [integration recommendations](integration-options.md) explain their possible later roles.

## State and invariants

Choosing a time before personal details does **not** reserve it. After the phone step validates details and simulates account creation, the app requests a hold and opens review. An existing demo account selecting another time also rechecks availability. Confirmation requires example agreements, an account marker, a prepared demo payment method, a live hold, and verified insurance when the patient has chosen insurance. Pending insurance does not silently become self-pay.

| Invariant | Enforcement in the model |
| --- | --- |
| Repeating an operation does not create duplicate first visits | In-flight operations share a promise; an unexpired hold is reused; existing first-visit confirmation is returned. These guarantees apply within the local model only. |
| A lost or expired slot does not erase intake | Conflict markers prevent retrying the same taken slot; expired holds cannot confirm; profile data remains available when choosing another time. |
| Rescheduling preserves the original visit until success | Availability is checked before replacing the slot on the existing appointment identity. |
| Optional records do not block care | Declining permission does not invoke Metriport; unavailable records can be retried or skipped. Patient corrections remain distinguishable from the fictional source. |
| Joining, leaving, and reconnecting are not completion | Joining sets `joined` or `interrupted`; leaving can interrupt. Only the simulated clinician operation sets `completed`. |
| Follow-up does not rewrite the first visit's outcome | Follow-up requires a completed first visit and has its own appointment identity and reminder flag. Reminders cannot target a completed first visit. |
| Condition choices remain explicit patient input | Native checkboxes save a normalized, allowlisted `conditions` array with multiple selections. No legacy symptom topic is mapped to a diagnosis. |

The available review scenarios are standard, slot taken, coverage pending, records unavailable, payment retry, connection lost, and save retry. Most faults are consumed once to make recovery demonstrable; a taken slot remains unavailable and coverage remains pending until the scenario or payment choice changes. Expired-hold behavior is implemented and covered by a model test, rather than a dedicated scenario menu item.

## Resume, fixtures, and evidence

`App.tsx` writes the versioned journey to `localStorage` under `legion-first-visit-preview-v1` after state changes and restores it on the same browser/origin. This includes form answers, selected conditions, free text, and saved `careMessages`, so use synthetic data. The message collection is separate from the allowlisted service ledger. Storage errors show a session-only notice. Restart replaces the saved journey with initial state. There is no cross-device resume, encryption layer, or server durability.

Condition migration accepts only explicit selections from ADHD, Depression, Anxiety, Bipolar Disorder, PTSD, “I'm not sure,” and Other. A legacy draft without a `conditions` array, no appointment, and a current goal/coverage/booking step returns to `needs` with its navigation history reset. It does not infer a diagnosis from the old `topic` field or reset an already-booked appointment. This is a narrow compatibility rule, not a general data-migration framework.

Chapter links and “Explore every screen” deliberately load **review fixtures** with prerequisite states. They replace the current review path; they do not prove that the skipped steps were completed. Fixture ledger entries identify loaded appointments/encounters as `review.fixture`; the sample account marker is explicitly described as fictional. A fixture showing a completed visit must never enter a measured completion cohort.

The 16 [model tests](../prototype/src/model/services.test.ts) cover explicit multi-condition persistence and restoration, duplicate operations, expiry, conflict recovery, payment retry, insurance gating, records permission, rescheduling, encounter authority, follow-up reminders targeted to their own appointment ID, local message persistence and duplicate sends, event-value exclusions, and date/phone helpers. They are executable with `npm test` from `prototype/`. This document records code/test coverage; it does not claim a browser walkthrough or physical-device validation was performed. Rendered QA and executed-check results should be reported separately.

## Event ledger and future measurement

The existing ledger is **local mock-service activity**, not a production analytics pipeline. Each entry has `id`, `at`, `service`, `operation`, `outcome`, and allowlisted `detail`. Dynamic names, email, phone, addresses, clinical answers, payer/member details, and free text are not interpolated. A test checks these exclusions. Pending and terminal entries are separate records, so the number of ledger rows is not a count of completed business outcomes. No external analytics or retargeting receives this data.

Current operation names include `draft.saved`, `directory.loaded`, `account.created`, `eligibility.checked`, `slot.reserved`, `payment_method.prepared`, `appointment.confirmed`, `appointment.rescheduled`, `records_permission.declined`, `records.requested`, `brief.drafted`, `reminders.scheduled`, `room.joined`, `connection.interrupted`, `room.reconnected`, `visit.completed`, `followup.confirmed`, and `message.simulated`.

The following is a **proposed production taxonomy**, not instrumentation already implemented here. Reconcile it with Legion's existing question/matching events before adding or renaming events.

| Measurement area | Proposed events and allowed dimensions | Interpretation |
| --- | --- | --- |
| Intake and fit | `journey.started`, `step.viewed`, `step.completed`, `step.error`, `fit.outcome`; opaque journey/attempt IDs, schema version, step ID, coarse result and error categories, device/viewport class | Separate eligible continuation, service-fit exits, technical failure, and unresolved sessions. Do not put answers or detailed clinical exclusion reasons in general analytics. |
| Matching and booking | `results.visible`, `slot.selected`, `reservation.created/failed/expired`, `payment_method.ready/failed`, `appointment.confirmed/rescheduled/cancelled`; result count, availability bucket, operation ID, outcome | Visibility is different from retrieval; selection, hold, payment setup, and confirmation remain distinct. Deduplicate retries by operation/appointment identity. |
| Preparation and attendance | `preparation.reviewed`, `reminder.scheduled/delivered/failed`, `join.attempted/failed`, `encounter.joined/interrupted/reconnected/completed/no_show`; opaque encounter ID, coarse status, latency bucket | Delivery requires a provider receipt. Completion must originate from the encounter authority. No record contents, notes, or messages belong in analytics. |
| Continuity | `followup.offered/confirmed`, `experience.submitted`, `support.requested`; coarse outcome and invitation/response counts | Follow-up is appropriate continuity, not a requirement for successful first care. Analyze satisfaction in a restricted feedback workflow; omit free text from general analytics. |

Retain the original August ordered same-session funnel for comparability. Add mature, cross-session cohorts with explicit windows—initially seven-day intake continuation and 30-day first-visit completion, then adjust to observed scheduling lead times. Report eligible intake completion and confirmed-to-completed attendance separately. “No next event” is an unresolved observation until its window expires, not proof of abandonment or a screen-caused drop-off. Historical losses provide investigation priorities, not predicted lift.

## What the larger rebuild still needs

Server-owned durable drafts, authenticated accounts, signed encounter/webhook updates, transactional slot holds, and idempotency across clients are necessary before these local invariants can become operational guarantees. Today an Auth ledger entry acts as an account marker and a client method accepts the clinician actor; neither is a security boundary.

Real integrations need credential isolation, retries/backoff, asynchronous pending states, reconciliation, auditable consent, and delivery/status monitoring. Contact verification, retention/deletion controls, access controls, privacy review of all event destinations, real clinical policy validation, and clinician workflow design remain work for the rebuild. The deterministic brief needs a separately evaluated, source-grounded AI pipeline with correction and human review. Physical iOS/Android keyboard, accessibility, large-text, media, and weak-network testing remain necessary; responsive browser rendering cannot establish those results. Cancellation/no-show operations, real notification failures, richer records/identity exceptions, and a working care-team inbox are outside this review prototype's implemented scope.
