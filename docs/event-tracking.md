# Event tracking

The chat onboarding emits PostHog events, mocked in the prototype (`prototype/src/chat/analytics.ts`). Every event is built in PostHog's capture format and kept with the journey, so **Preview tools → PostHog events** shows them live. When a real `posthog-js` client is on the page, the same events are forwarded to it. Nothing leaves the browser in the preview.

## Principles

1. **Comparable with today.** Where a step still exists, the event keeps Legion's current name (`portal.onboarding.started`, `portal.onboarding.conditions`, `portal.onboarding.insurance_selected`, `portal.onboarding.needs`, `portal.provider_selected`, `portal.provider.reservation.created`, `portal.onboarding.userCreated`). The brief's August funnel can be rebuilt beside the new one.
2. **See past the payment page.** The brief's telemetry stops at payment-page reach, with no payment-success or first-visit event. The chat adds `portal.onboarding.payment_method_saved`, `portal.appointment.booked`, `portal.visit.checked_in`, `portal.visit.joined` and **`portal.onboarding.first_visit_completed`**, the milestone this assignment defines as the end of onboarding.
3. **Milestones come from the journey, not the screen.** Bookings, visits and plans are emitted when the journey's state changes: the appointment is confirmed, the encounter completes, the plan is published. A page view never stands in for them. In production, `first_visit_completed` comes from the encounter system through PostHog's server SDK.
4. **No PHI in events.** Properties are enums, counts and booleans. Events never carry answers to health questions (story, safety, hospital stay, medications, allergies), free text, names, birth dates, phone numbers, emails or member IDs. Fit-check exits carry a coarse reason code, so appropriate exits can be told apart from friction. PostHog runs under a BAA, with an internal patient ID as the person, session recording off on health inputs, and autocapture limited to clicks.

## Identity and super properties

- **Anonymous until the account exists.** Events start with an `anon_…` distinct ID. When the account is created, a `$identify` event links that history (`$anon_distinct_id`) to an internal `patient_…` ID. The only person properties are `signup_experience` and `coverage`.
- **Every event carries:** `$session_id` (one per page load), `$current_url` (no query string), `$lib`, `experience: "chat"` (the baseline would send `"classic"` for the A/B), `assistant`, `booked`, `preview`, and `preview_scenario` when a failure scenario is switched on.

## The funnel, against today's

| Brief milestone (Aug 2026) | Legion event today | Chat event |
| --- | --- | --- |
| 1. Start | `portal.page.join`, `portal.onboarding.started` | `$pageview`, `portal.onboarding.started {choice}` |
| 2. Fit check | `portal.page.fit_check` (no submit event) | `portal.onboarding.fit_checked {choice}`, `portal.onboarding.safety_answered`, `portal.onboarding.history_answered`; exits: `portal.onboarding.fit_exited {reason}` |
| 3. Conditions | `portal.onboarding.conditions` | `portal.onboarding.conditions {mode, count}` |
| 4. Insurance | `portal.onboarding.insurance_selected` | `portal.onboarding.insurance_selected {choice}`, `portal.onboarding.payer_selected {choice}` |
| 5. Needs | `portal.onboarding.needs` | `portal.onboarding.needs {soonest, windows}` |
| 6. Provider match | `portal.page.join.match` | `portal.provider.match_shown {offers, ranked}` |
| 7. Provider selected | `portal.provider_selected` | `portal.provider_selected {rank}` |
| 8. Reservation created | `portal.provider.reservation.created` | `portal.provider.reservation.created {lead_hours}` |
| 9. Patient details | `portal.page.join.patient` | `portal.onboarding.phone_submitted`, `.phone_verified`, `.identity_prefilled {result}`, `.details_confirmed {choice}`, `.email_added` |
| 10. Account created | `portal.onboarding.userCreated` | `portal.onboarding.userCreated`, `$identify` |
| 11. Payment page | `portal.page.join.payment` | n/a (there's no page) |
| New | n/a | `portal.onboarding.benefits_checked {result, via, member_id_entered}`, `portal.onboarding.agreements_accepted {ai_notes}`, `portal.onboarding.payment_method_saved {method}`, `portal.appointment.booked {lead_hours, coverage}` |
| New: through the first visit | n/a | `portal.prep.offer_answered {choice}`, `portal.records.searched {result, sources}`, `portal.prep.brief_answered {choice}`, `portal.prep.mychart_answered {choice}`, `portal.chart.imported`, `portal.visit.reminder_answered {choice}`, `portal.visit.checked_in`, `portal.visit.joined`, **`portal.onboarding.first_visit_completed {days_from_booking, source}`** |
| New: after the visit | n/a | `portal.care_plan.published`, `portal.prescription.sent {status}`, `portal.followup.answered {choice}`, `portal.followup.booked {weeks_out}` |

## Other events

- **Changes and other steps:** `portal.onboarding.answer_changed {step}`, plus `portal.onboarding.step_answered {step}` for steps without their own event.
- **After booking:** `portal.assistant.quick_action {action}`, `portal.assistant.question_answered {source, actions}` (source is `booking`, `model`, `policies` or `crisis`, never the question), `portal.care_message.sent`, `portal.appointment.rescheduled {lead_hours}`.
- **Support:** `portal.support.crisis_resources_shown {source}`, `portal.support.safety_callback_requested {from}`, `portal.support.care_team_requested {kind}`, `portal.support.call_requested`.
- **Clinician view (preview):** `portal.clinician.brief_reviewed {action}`, `portal.prep.brief_edited {reason_changed, note_changed}`.

## What it answers

- **North star:** first visits completed within 30 days per eligible start (`portal.onboarding.first_visit_completed` over `portal.onboarding.started`, excluding `fit_exited` reasons that are appropriate exits), on matured cohorts.
- **Where AI earns its keep:** `identity_prefilled {result}` and `benefits_checked {via, member_id_entered}` show how often the patient didn't have to type. `question_answered {source}` shows how many typed questions the model handles versus policy answers.
- **The A/B:** the same events with `experience: "chat"` or `"classic"`, stratified by device, with guardrails on `fit_exited {reason}` mix, time from `started` to `appointment.booked`, `support.*` volume and no-shows (`visit.checked_in` over `appointment.booked`).

## Checking it in the preview

Open **Preview tools → PostHog events (simulated)**. A full walkthrough emits about 45 events, in order, from `$pageview` to `portal.onboarding.first_visit_completed`. The first ones are anonymous and the rest use the patient ID after `$identify`. `src/chat/analytics.test.ts` checks the funnel through the completed visit, identify on account creation, and that no answer, free text or contact detail reaches an event.
