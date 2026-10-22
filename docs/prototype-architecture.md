# Checkout, patient portal, and first-visit architecture

> **Baseline documentation.** This describes the screen-based baseline (`baseline-v1`, now at `?experience=classic`). The chat onboarding in the open PR is described in [chat-onboarding-design.md](chat-onboarding-design.md); its vendors, timing and tracking differ.

Updated October 20, 2026. This describes `prototype/src` and the [patient journey](redesigned-journey.md). The endpoint is a **simulated clinician-completed first visit**, followed by care-plan publication and optional follow-up. The interface is designed as a coherent patient experience; all external connections remain local mocks. It is not a production clinical, authentication, or payment system.

## Application structure

- `App.tsx`: typed journey state, browser persistence, navigation/hash routes, session gating, help, external preview/reviewer tools.
- `screens/Intake.tsx`: fit, multiple conditions, goal, coverage.
- `screens/Booking.tsx`: matching, times, demographics, insurance, contact. `screens/Checkout.tsx`: payment entry and confirmation.
- `screens/Care.tsx`: confirmation, Home, preparation, reminders, check-in/waiting/visit, completion/follow-up/feedback. `screens/Portal.tsx`: Visits, Messages, Account, sign-in, health review.
- `model/services.ts`: asynchronous service-shaped operations; no fetch/vendor SDK, payment charge, email/SMS, media capture, or clinical request.
- `hooks/useCareSimulation.ts`: global local scheduler for clinician presence, connected conversation, completion/publication, due notifications, and replies, independent of the visible patient screen.
- `hooks/useMobileViewport.ts`: keyboard-aware layout from layout/visual-viewport geometry and editing context.

Patient mode is `/`; portal routes are hashes such as `#/portal/home`, `#/portal/visits`, `#/portal/messages`, `#/portal/account`, and `#/portal/visit/summary`. `/?review=1` adds screen fixtures, recovery scenarios, and activity inspection. Preview controls/inbox sit outside the patient app in either mode; normal first-visit completion no longer requires reviewer actions.

## Adapter contracts

| Adapter and methods | Behavior | Boundary |
| --- | --- | --- |
| Profile: `saveDraft(stage)`, `saveHealthDetails()` | Save acknowledgment, recoverable save failure, explicit reviewed state | App persists locally; no server patient record |
| Auth: `createAccount()`, `requestSignIn(email)`, `verifySignIn(code)`, `signOut()` | Account marker, signed-in/out state, ten-minute code, wrong/expired/resend recovery | Fixed `246810` in external Preview inbox; no actual email, secure session, identity verification, or cross-device account |
| Scheduling: `getProviders()`, `reserve()`, `confirm()`, `reschedule()`, `cancelAppointment()`, `bookFollowup()` | Directory; 15-minute hold; prerequisites; conflict/expiry; original visit preserved until reschedule; separate follow-up; queued-job cancellation | No shared inventory, server transaction, Healthie API, fee assessment, or full second-visit encounter |
| Sohar: `checkEligibility()` | Checking → verified/pending/unmatched; nonempty member ID; synthetic active/in-network $25 estimate only for verified | No discovery, real benefits, separate network/cost requests, webhook, or payment guarantee |
| Stripe-shaped: `setupPayment(input)`, `completePaymentAuthentication(approved)` | Synthetic SetupIntent states; masked method; bank verification/cancel/retry | Custom preview fields/tokens, no Stripe SDK/hosted element, charge/authorization, or webhook receiver |
| Metriport: `requestRecords(allowed)` | Permission-gated ready/unavailable/declined; permission rechecked after delay | One fictional record, not FHIR/longitudinal retrieval |
| AI brief: `generateBrief()` | Explicit goal, editable draft, labelled sample source/correction, reset approval on edits | Deterministic, no model call, diagnosis, prescribing, or suitability inference |
| Notifications: `scheduleReminders(appointmentId?)`, `deliverNotifications()` | Per-appointment queued/delivered/failed/cancelled records; automatic booking jobs; changes replace/cancel pending jobs | Local statuses, no provider receipt, real delivery, durable outbox, or server scheduler |
| Video: `checkIn()`, `setClinicianReady('clinician')`, `admitToVisit()`, `joinVisit()`, `leaveVisit()`, `reconnect()` | Join-window/prerequisite gates, waiting/readiness, same-encounter interruption/reconnect | Synthetic device checks and conversation; no media permissions or call |
| Encounter: `completeVisit('clinician')`, `publishCarePlan('clinician')` | Joined/final-phase completion; separate pending/published plan; repeat deduplication | Client actor simulates authority, not authenticated clinician or signed event |
| Care team: `sendCareMessage()`, `replyToCareMessage()` | Local thread, delivered status, deduplicated generic acknowledgment | No real inbox or clinical advice; sending/failed shapes are not a full delivery system |

Calendar download creates a real local `.ics` labelled as a demo; it does not write to a calendar account. Feedback stays local. Verified, Persona, DoseSpot, advertising, and retargeting are absent; the scenario includes no prescription action.

## Payment and confirmation

Working billing assumption: **save a card at booking, no visit fee today**. The screen presents $250 self-pay after the first visit or an insurance estimate with final balance after the claim. These are proposed policies, not verified Legion policy. Charges, capture, claim reconciliation, invoices, refunds, and cancellation/no-show fees are unimplemented.

Checkout holds raw number, expiration, CVC, and ZIP only in component state and accepts only the synthetic `4242` number. Raw values do not enter journey state, storage, service arguments, or ledger. The adapter receives a `pm_mock_*` token, brand/last four, expiration, and ZIP; only masked method metadata persists. These custom fields are not PCI-isolated Stripe components; live card collection must use hosted components and a server-owned lifecycle.

`setupPayment` validates synthetic metadata and financial consent, sets processing, then returns succeeded/requires_action or a recoverable failure. `completePaymentAuthentication` resolves the mock bank dialog. With no prior method, cancellation returns failed state. During a replacement, the existing masked method is retained and restored after failure/cancellation; the new method replaces it only after success. Account's `PaymentMethodEditor` uses this setup/authentication lifecycle with fresh financial authorization, without calling appointment confirmation or charging anything. Successful method setup is distinct from confirmed booking. Motion communicates processing without animated button travel or invented percentage progress.

Confirmation checks account marker, video-care consent, financial authorization, successful setup, live hold, and verified insurance when chosen. Pending/unmatched do not become self-pay. If the card saves but the hold expires, payment metadata survives while booking fails with recheck/alternate-time recovery. Repeat confirmation returns an existing non-cancelled first appointment. In-flight deduplication belongs to one local adapter instance, not a transactional server or multiple clients.

The API is inspired by Stripe [SetupIntents](https://docs.stripe.com/payments/setup-intents) for storing a method without a payment, not a complete Stripe contract. Real [webhooks](https://docs.stripe.com/webhooks), signature checks, uncertain-result reconciliation, and [request idempotency](https://docs.stripe.com/api/idempotent_requests) remain necessary.

## Insurance placement and ownership

The member-ID screen after demographics/before email is **our redesign**. The self-pay audit established a [payer directory and payer choice](runtime-service-evidence.md) and a [post-account page](technical-audit.md) saying verification came next. It did not establish this live step or a runtime Sohar call here.

Sohar documents create verification → retain ID → poll/webhook, with demographic, payer/member, specialty/place-of-service inputs. Active coverage alone establishes neither network participation nor final liability. References: [quickstart](https://docs.soharhealth.com/documentation/getting-started/quickstart), [verification guide](https://docs.soharhealth.com/documentation/guides/verification), [network](https://docs.soharhealth.com/api-reference/network-status/get-network-status), [cost](https://docs.soharhealth.com/api-reference/cost-estimate/create-cost-estimate).

The mock accepts any nonempty member ID, including `1`; scenario controls result. The 1,250ms delay/$25 estimate are fixtures. Concurrent identical input shares a request. `eligibilityInputKey` rejects stale responses and invalidates completed results after demographic, payer/member, provider, slot/date, coverage, or scenario changes. Contact/navigation preserves it. The private key contains sensitive inputs but never enters the ledger.

Pending/unmatched retain null cost/unknown network; edit/retry, help, and explicit self-pay remain available. Unmatched is not denial. Inactive/out-of-network, deductible/coinsurance, prior authorization, discovery, and operational queues remain future work.

## Portal, preparation, and encounter

Home replaces the post-booking wizard. Home/Visits/Messages/Account persist across preparation. Health review is required before check-in; records and brief are optional. Each saves independently and returns Home, or health review continues into open check-in. Reviewed health details show ready status with view/edit links. Device checks may be saved before the visit, while location/callback confirmation belongs to check-in.

Appointment, encounter, connection, clinician presence, and care plan are separate states. Waiting is not admitted, interrupted is not completed, and completed may still have a pending plan. Follow-up does not rewrite the first visit. The present follow-up recommendation is a two-week mock plan value, not a personalized recommendation.

| Invariant | Enforcement |
| --- | --- |
| Payment success is not booking success | Confirmation independently checks method, consent, account, benefits, and hold |
| Slot failure preserves progress | Details and saved masked method survive recovery |
| Optional context cannot block care | Records/brief approval are absent from check-in requirements |
| Required check-in is explicit | Session, health review, device, location, callback, open window checked |
| Waiting does not mean clinician ready | Admission requires readiness event |
| Leave/interruption is not completion | Same encounter retained, connected-time progression paused |
| Completion is not publication | Separate pending → published operation |
| Changes retire stale notifications | Reschedule/cancel updates queued jobs for that appointment |
| Follow-up remains distinct | Separate appointment/reminder target preserves first completion |
| General traces omit personal/clinical data | Allowlisted text; patient content remains separate |

### Clock and global service simulation

`journeyNow` uses the preview clock when present. Confirmation starts 45 minutes before appointment at 60×, opening the -15-minute joining window after about 30 seconds. Acceleration caps at +10 minutes to avoid review causing a missed visit; check-in returns rate to 1. Joining normally ends at +60 minutes; already waiting/in-progress encounters stay open. A live adapter would use real time.

The global simulation ticks each second while mounted and resumes from stored timestamps after navigation/reload. Clinician readiness occurs after six seconds (25 when late), conversation phases after eight/sixteen seconds, completion after 28 connected seconds, publication five seconds later (25 when delayed), and generic message reply after at least three seconds. Interrupted duration is subtracted. These short fixtures are not measured vendor latency or clinical timing. No service runs on a background server when the app closes. Failed background operations retain failure and retry after a bounded delay.

## Notifications and sign-in

Confirmation queues appointment notifications automatically for email and optional SMS. Email reminder preference is independent of transactional confirmation. Reminder offsets are 24 hours, one hour, and 15 minutes; only future jobs are created, so a late booking does not send a burst of overdue reminders. The default clock starts 45 minutes before the appointment and therefore creates only the 15-minute reminder. Reschedule replaces queued jobs, preference changes do not duplicate confirmations, and cancellation stops pending jobs. Publishing the care plan creates its own simulated notification. Due jobs become simulated delivered/failed. Those statuses do not prove actual delivery.

The external Preview inbox exposes notification records and code. Portal links respect local signed-in/out status. Sign-in requires the saved email; the fixed code `246810` is valid for ten real minutes, with wrong/expired-code and resend handling. Sign-out preserves appointment/preparation/thread. Route guards redirect signed-out access, but inspectable/editable JavaScript and local state make these **simulation controls, not security boundaries**.

## Persistence, fixtures, and scope limits

`localStorage` key `legion-first-visit-preview-v1` stores the versioned journey on the same origin/browser: profile, conditions, medication/allergy entries, notes, feedback, messages, masked method metadata, notifications, clock, and statuses. Use synthetic data. Storage failures show a session-only notice; restart replaces saved state. There is no encryption, secure credential storage, retention framework, durable server, cross-device resume, or authenticated data isolation.

Reload resets interrupted eligibility checking to unverified. Interrupted payment setup becomes failed/retry when there was no saved method; an interrupted replacement restores the prior masked method with recovery guidance. Before booking, changing the coverage path, payer, or estimated amount also clears financial authorization so a changed payment basis requires fresh agreement. Legacy confirmed previews receive synthetic payment/session/encounter defaults. Older single-topic unbooked drafts lacking explicit conditions return to the condition screen; diagnoses are not inferred. These are compatibility conveniences, not audited migrations.

Reviewer jumps seed prerequisite fixtures, not proof of completed patient actions. Current/future intake answers remain empty while real Back/resume retains answers. Fixture ledger entries identify artificial appointments/encounters and must not enter measured completion cohorts.

Scenarios cover slot conflict, pending/unmatched coverage, missing records, payment failure/authentication, connection loss, failed save, clinician late, delayed plan, expired sign-in, and failed reminder. Most faults are consumed once; missing inventory/unresolved benefits persist explicitly. Hold expiry is supported. Account offers contact editing and self-service synthetic card replacement; coverage questions and follow-up rescheduling route into messaging without implying operational resolution. The complete telehealth simulation covers the first visit.

## Mobile behavior and validation

The viewport hook infers keyboard state using editing plus measured layout/visual viewport. It preserves an unoccluded baseline, separate open/close thresholds, stale-offset release, pinch-zoom handling, bounded rereads, and input reveal within the owned scroll pane. Focus alone is not keyboard-open evidence. Physical device validation remains necessary.

Incoming content moves for 320ms while frame/footer stay stable. Fit/goal acknowledgment lasts 200ms with incoming repeated-tap gating; touch hover cannot mimic selection. Reduced motion removes delays. Authentic testimonials rotate every nine seconds with manual-dot stop behavior, hover/focus/hidden suspension, and omission at keyboard/short heights; no pause button.

Model tests cover multi-condition state, duplicate operations, hold expiry/conflict, payment failure/authentication, eligibility gates/stale responses, records/consent, reschedule/cancel, automatic notifications, check-in/clinician gates, completion/publication, expired sign-in, follow-up identity, message/reply identity, event exclusions, and helpers. Other tests cover reviewer defaults and viewport geometry. Run `npm test` and `npm run build` from `prototype/`. Executed counts and rendered journey evidence belong in [prototype-qa.md](prototype-qa.md), separate from this source description.

## Measurement and production work

The ledger is **local mock-service activity**, not analytics. Entries have ID/time/service/operation/outcome/allowlisted detail. Pending/terminal rows may represent one operation; row counts are not completed business outcomes. Names, contact/address, clinical answers, insurance IDs, notes, and messages are not interpolated. No outside analytics/retargeting receives data.

Operations cover drafts/directory/account/sign-in, verification, hold, setup intent/authentication, appointment confirmation/reschedule/cancellation, records/brief/health review, notification scheduling/delivery, check-in/readiness/room connection, encounter completion, care-plan publication, follow-up, and thread delivery/replies. A successful adapter operation can return a negative state; cancelling bank verification resolves the operation but leaves payment failed.

Production measurement should separate eligible continuation from fit exits; visible results from retrieval; saved payment from booking; scheduled from delivered notifications; joining from clinician-completed encounters; completion from aftercare publication. Reconcile names with supplied Legion events. Use opaque identities/coarse statuses, not clinical answers or messages. Retain August ordered same-session reach, add cross-session cohorts with explicit windows, and exclude previews/fixtures. No next event is unresolved until the window matures, not causal screen abandonment or predicted lift.

A live rebuild needs server-owned drafts/authentication, transactional inventory, signed payment/encounter updates, durable jobs, retries/reconciliation, cross-client idempotency, validated clinical/financial/consent policy, retention/access controls, privacy review, staffed messaging, evaluated source-grounded AI, and tested vendor integration. Physical iOS/Android keyboards, large text, screen readers, actual media, weak networks, and external-service testing remain distinct from responsive browser checks. Production security/compliance cannot be inferred from this interface.
