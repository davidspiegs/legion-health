# Event tracking

The chat onboarding emits PostHog events, mocked in the prototype (`prototype/src/chat/analytics.ts`). Every event is built in PostHog's capture format and kept with the journey, so **Preview tools → PostHog events** shows them live. When a real `posthog-js` client is on the page, the same events are forwarded to it. Nothing leaves the browser in the preview.

## Principles

1. **Comparable with today, honestly.** A name is reused only where the step means the same thing: `portal.onboarding.started`, `portal.onboarding.conditions`, `portal.onboarding.needs` (what the patient wants help with), `portal.onboarding.insurance_selected`, `portal.provider_selected`, `portal.provider.reservation.created` and `portal.onboarding.userCreated`. Steps that changed get new names. The August funnel counts page reach, which the chat replaces with `portal.onboarding.stage_entered {stage}` (story, clinician, booking, first visit). The historical report stays as it was, beside the new one, not merged into it.
2. **See past the payment page.** The brief's telemetry stops at payment-page reach, with no payment-success or first-visit event. The chat adds `portal.onboarding.payment_method_saved`, `portal.appointment.booked`, `portal.visit.checked_in`, `portal.visit.joined` and **`portal.onboarding.first_visit_completed`**, the milestone this assignment defines as the end of onboarding.
3. **Milestones come from the journey, not the screen.** Bookings, visits and plans are emitted when the journey's state changes: the appointment is confirmed, the encounter completes, the plan is published. A page view never stands in for them. In production, `first_visit_completed` comes from the encounter system through PostHog's server SDK.
4. **Minimum necessary.** Properties are enums, counts and booleans from an allowlist that the capture step enforces (`ALLOWED_PROPS`); anything else is dropped before the event exists. Events never carry answers to health questions (story, safety, hospital stay, medications, allergies), free text, names, birth dates, phone numbers, emails or member IDs. This is minimization, not de-identification: events about a patient of a psychiatric practice are still health information. So PostHog runs under a BAA, with an internal patient ID as the person, session recording off on health inputs and autocapture limited to clicks. Crisis and support events (`portal.support.*`, a fit exit for immediate support, a crisis answer to a typed question, a care-team reply to a message the crisis check flagged) carry `analytics_stream: "restricted"`, for a separate project with narrower access.

## Identity and super properties

- **Anonymous until the account exists.** Events start with an `anon_…` distinct ID. When the account is created, a `$identify` event links that history (`$anon_distinct_id`) to an internal `patient_…` ID. The only person properties are `signup_experience` and `coverage`.
- **Every event carries:** `$session_id` (kept across reloads and tabs until 30 minutes without activity, as posthog-js does), `analytics_stream` (`product` or `restricted`), `$current_url` (no query string), `$lib`, `experience: "chat"` (the baseline would send `"classic"` for the A/B), `assistant`, `booked`, `preview`, and `preview_scenario` when a failure scenario is switched on.

## The funnel, against today's

| Brief milestone (Aug 2026) | Legion event today | Chat event |
| --- | --- | --- |
| 1. Start | `portal.page.join`, `portal.onboarding.started` | `$pageview`, `portal.onboarding.stage_entered {stage: story}`, `portal.onboarding.started {choice}` (same meaning) |
| 2. Fit check | `portal.page.fit_check` (no submit event) | `portal.onboarding.fit_checked {choice}`, `portal.onboarding.safety_answered`, `portal.onboarding.history_answered`; exits: `portal.onboarding.fit_exited {reason}` |
| 3. Conditions | `portal.onboarding.conditions` | `portal.onboarding.conditions {mode, count}` (same meaning; the chat asks this before the fit check) |
| 4. Insurance | `portal.onboarding.insurance_selected` | `portal.onboarding.insurance_selected {choice}`, `portal.onboarding.payer_selected {choice}` |
| 5. Needs | `portal.onboarding.needs` | `portal.onboarding.needs` (same meaning: what the patient wants help with, the goal question) |
| (availability) | part of the match page | `portal.onboarding.availability_set {soonest, windows}` (new) |
| 6. Provider match | `portal.page.join.match` | `portal.onboarding.stage_entered {stage: clinician}`, `portal.provider.match_shown {offers, ranked}` |
| 7. Provider selected | `portal.provider_selected` | `portal.provider_selected {rank}` |
| 8. Reservation created | `portal.provider.reservation.created` | `portal.provider.reservation.created {lead_hours}` |
| 9. Patient details | `portal.page.join.patient` | `portal.onboarding.stage_entered {stage: booking}`, `portal.onboarding.phone_submitted`, `.phone_verified`, `.identity_prefilled {result}`, `.details_confirmed {choice}`, `.email_added` |
| 10. Account created | `portal.onboarding.userCreated` | `portal.onboarding.userCreated`, `$identify` |
| 11. Payment page | `portal.page.join.payment` | n/a (there's no page) |
| New | n/a | `portal.onboarding.benefits_checked {result, via, member_id_entered}`, `portal.onboarding.agreements_accepted {ai_notes}`, `portal.onboarding.payment_method_saved {method}`, `portal.appointment.booked {lead_hours, coverage}` |
| New: through the first visit | n/a | `portal.prep.offer_answered {choice}`, `portal.records.searched {result, sources}`, `portal.prep.brief_answered {choice}`, `portal.prep.mychart_answered {choice}`, `portal.chart.imported`, `portal.visit.reminder_answered {choice}`, `portal.visit.checked_in`, `portal.visit.joined`, **`portal.onboarding.first_visit_completed {days_from_booking, source}`** |
| New: after the visit | n/a | `portal.care_plan.published`, `portal.prescription.sent {status}` (one per medication DoseSpot sends, or resends), `portal.followup.answered {choice}`, `portal.followup.booked {weeks_out}` |

## Other events

- **Changes and other steps:** `portal.onboarding.answer_changed {step}`, plus `portal.onboarding.step_answered {step}` for steps without their own event.
- **After booking:** `portal.assistant.quick_action {action}`, `portal.assistant.question_answered {source, actions}` (source is `booking`, `model`, `policies` or `crisis`, never the question; a medication question Claude answered is `model`), `portal.care_message.sent`, `portal.appointment.rescheduled {lead_hours}`.
- **Support:** `portal.support.crisis_resources_shown {source}`, `portal.support.safety_callback_requested {from}`, `portal.support.care_team_requested {kind}`, `portal.support.call_requested`.
- **Care team view (preview):** `portal.care_team.reply_sent {category, edited}` when a person sends a reply from the inbox. `category` is the inbox's: `scheduling`, `billing`, `medication`, `clinical`, `records`, `other`, or `urgent` for a message the crisis check flagged (that reply goes to the restricted stream). `edited` says whether the sent reply differs from Claude's draft; with no draft (urgent, or the model didn't answer) it's always true. Never the message or the reply. The Clinician tab sends `portal.clinician.brief_reviewed {action}`.
- **Brief edits:** `portal.prep.brief_edited {reason_changed, note_changed}`, when the patient changes the drafted brief.

## What it answers

- **North star:** first visits completed within 30 days per eligible start, on matured cohorts (starts at least 30 days old). An eligible start is one that passed the fit check, with no `fit_exited` event. Completion is the encounter system's `portal.onboarding.first_visit_completed`, joined to the start through the patient ID that `$identify` links to the anonymous history; starts that never create an account stay anonymous and count in the denominator only.
- **Where AI earns its keep:** `identity_prefilled {result}` and `benefits_checked {via, member_id_entered}` show how often the patient didn't have to type. `question_answered {source}` shows how many typed questions the model handles versus policy answers. `care_team.reply_sent {category, edited}` shows how often Claude's draft goes out unchanged, by category.
- **The A/B:** the same events with `experience: "chat"` or `"classic"`, stratified by device, with guardrails on the `fit_exited {reason}` mix, time from `started` to `appointment.booked`, restricted-stream volume, and no-shows. A no-show is a booked visit whose start time passed without `portal.visit.joined`, excluding cancellations and reschedules; that needs the scheduling system's final appointment status, not a client event.

## Checking it in the preview

Open **Preview tools → PostHog events (simulated)**. A full walkthrough emits about 45 events, in order, from `$pageview` to `portal.onboarding.first_visit_completed`. The first ones are anonymous and the rest use the patient ID after `$identify`. `src/chat/analytics.test.ts` checks the funnel through the completed visit, identify on account creation, and that no answer, free text, contact detail or medication name reaches an event.
