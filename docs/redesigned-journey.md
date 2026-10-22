# From finding care to a completed first visit

> **Baseline documentation.** This describes the screen-based baseline (`baseline-v1`, now at `?experience=classic`). The chat onboarding in the open PR is described in [chat-onboarding-design.md](chat-onboarding-design.md); its vendors, timing and tracking differ.

Updated October 20, 2026. This describes the implemented patient journey in `prototype/`. The assignment defines the endpoint as the **first completed visit**, not an account, reservation, payment page, or confirmed appointment. Checkout and the patient portal now form one continuing experience. Providers, appointments, payments, records, messages, and visits remain fictional local simulations; the research canvas documents the separately observed live experience.

## The journey

| Phase | Patient experience | Mock connections |
| --- | --- | --- |
| Find care | Welcome → six fit questions → multiple conditions → preferred support → insurance or self-pay → provider comparison → appointment time | Service-area routing, draft persistence, directory, availability |
| Your details | Name → birth date → address → insurance details/result if insured → email → phone and optional text preference | Profile, Sohar-shaped verification, account, scheduling hold |
| Checkout | Appointment/cost summary → synthetic card fields → financial authorization and video-care consent → save card → any bank verification → confirm | Stripe SetupIntent-shaped adapter and appointment authority |
| Confirmation | Appointment confirmation, calendar download, confirmation/reminders created automatically, **Go to your portal** | Scheduling, notification queue |
| Portal | Home, Visits, Messages, Account; return to the same appointment after reload or simulated sign-in | Local profile/session, scheduling, messages, notifications |
| Prepare | Review health details once; optionally share records and review an editable care brief; return Home | Profile, Metriport, deterministic AI brief |
| Join | Time-based joining → location/callback and simulated device checks → waiting → clinician ready → join | Appointment clock, check-in, clinician presence, video |
| Meet | Simulated conversation; interruption/leave/reconnect; clinician completion | Encounter state separate from connection state |
| Continue care | Completed acknowledgment → care plan pending → publication → summary, feedback, messages, optional follow-up | Care-plan publication, follow-up, care-team thread |

A time selected before personal details is a preference. The local 15-minute hold is acquired after final contact validation, draft save, and account creation. The patient is not racing a hold while entering their identity. An expired hold can be rechecked or replaced without discarding entered details or a successfully saved payment method. Selection, reservation, payment setup, confirmation, joining, completion, and care-plan publication remain separate states.

## Checkout and payment policy

Checkout presents the clinician, date/time in Central Time, duration, expected cost, **$0 due today**, card fields, and two specific acknowledgments. Confirm appointment is enabled when fields, consent, current hold, and applicable insurance result are ready. Submission saves the method, completes bank authentication when required, then confirms the appointment. Payment failure is recoverable; saved-card success alone is not booking success.

**Working policy assumption, not verified Legion policy:** save a card at booking, charge no visit fee today, bill the $250 self-pay first visit after the visit, and bill an insured patient's final balance after insurance processing and presentation of the balance. The $150 self-pay follow-up amount is also a scenario price. These amounts are never charged. Charge timing, financial authorization, claim reconciliation, cancellation fees, and legal language require validated policy before live release. The earlier unsupported 48-hour/$250 cancellation rule is not used.

The payment fields accept the synthetic `4242 4242 4242 4242` preview number, future expiration, any three-digit code, and a five-digit ZIP. Number/expiration format during entry, numeric keyboard hints and Enter/Next connect the fields, and errors are field-specific. Raw entry stays in mounted component state; it never enters journey storage, service arguments, or the ledger. These are **custom mock inputs, not Stripe-hosted fields or a production card-handling implementation**. The adapter receives a synthetic opaque token and masked metadata. A live implementation must use hosted payment components and a server-owned lifecycle.

Payment moves through empty, processing, requires action, succeeded, or failed. Bank verification can be approved or cancelled. Stable-button processing, content transitions, and confirmation acknowledgment communicate real state changes without invented percentage progress. Reduced-motion preferences suppress nonessential animation.

## A portal, not a continuing wizard

Home is the persistent place to find the appointment and join. Visits contains upcoming/past appointments, first-visit rescheduling, and cancellation. Messages retains a thread with local delivery states and simulated acknowledgments. Account supports contact editing, masked payment details, coverage, reminder preferences, and sign-out. Its Change card action opens a self-service replacement form with fresh financial authorization and the same mock authentication/failure states. The prior method remains available until replacement succeeds; updating a card neither charges it nor reconfirms the appointment. Coverage changes route to the care team rather than pretending to reverify benefits.

Portal hash routes include `#/portal/home`, `#/portal/visits`, and `#/portal/visit/summary`. Reload restores progress on the same browser/origin. A signed-out patient requests a code using their saved email and enters the code from the **Preview inbox**, outside the patient app. The synthetic code is `246810`; expiry, wrong-code, and resend states exist. No email is sent and this is not secure authentication or cross-device access.

| Preparation task | Required? | Completion behavior |
| --- | --- | --- |
| Health details | Before check-in | Review conditions, medications, and allergies. Saving marks reviewed; editing clears review. Return Home or continue to check-in when joining is open. |
| Outside records | Optional | Grant permission, decline, or continue when unavailable; review/correct a returned source. Return Home with reviewed/skipped/unavailable status. |
| Care brief | Optional | Edit the draft from intake and available sample records; save and return Home. Never blocks joining. |
| Device setup | At check-in; can be tried earlier | Save simulated camera/sound readiness. Confirm current location and callback number at check-in. |

Home says **You're ready for your visit** after health review. Completed tasks become view/edit links, not a compulsory loop. Records permission, corrections, and brief approval remain saved. Missing records and an unreviewed brief do not become attendance barriers.

## Joining and completing the visit

The join window opens 15 minutes before the appointment and ends one hour after its start unless the patient is already waiting or in the encounter. Home explains when to return and offers a setup check before the window. Join visit leads through outstanding health review and check-in. A closed window directs to the care team.

**Preview time is deliberately accelerated:** confirmation starts 45 minutes before the selected visit at 60× speed, opening joining after roughly 30 real seconds. Acceleration caps at ten minutes after start so review does not cause a missed visit, and returns to normal speed at check-in. External Preview controls disclose this behavior. It is not a production scheduling rule or predicted visit timing.

The global mock clinician becomes ready automatically after six seconds of waiting, or 25 seconds in the late scenario. The patient joins; three illustrative conversation phases progress and the clinician completes the visit after 28 seconds of connected time. Leaving or interruption pauses connected-time progress and preserves the encounter for reconnecting. Reviewer controls are not required to finish.

Completion creates a **pending** care plan. A separate clinician simulation publishes it after five seconds, or 25 seconds in the delayed-plan scenario. The generic summary fabricates no diagnosis or prescription. Follow-up timing comes from the mock care-plan field; the current fixture is two weeks, not a personalized recommendation. Optional follow-up has its own appointment identity/reminders. The full simulated encounter covers the first visit, not a second follow-up encounter.

Confirmation/reminders are created at booking, independently of preparation. Reminder times are 24 hours, one hour, and 15 minutes before the appointment, with only future jobs created. The default accelerated clock begins 45 minutes before the visit, so that path schedules only the 15-minute reminder. Rescheduling replaces pending jobs and cancellation stops them. Care-plan publication also creates a simulated notification. The external Preview inbox shows notification records; its portal links respect simulated session state. Notification failure does not unconfirm the visit. Messages persist locally and receive a generic simulated acknowledgment without clinical advice.

## Insurance evidence and integration choices

The member-ID/Sohar step after demographics and before email is **our redesign**, not an established part of the observed live flow. The self-pay audit found a [payer directory and saved payer choice](runtime-service-evidence.md); after account creation, the [payment page said insurance verification came next](technical-audit.md). That does not establish a live member-ID step or the Sohar trigger.

Any nonempty member ID, including `1`, works. After a visible 1,250ms check, the chosen scenario returns synthetic verified active/in-network coverage with a $25 estimate, pending, or unmatched. Pending/unmatched retain insurance and offer edit, retry, help, or explicit self-pay; they imply neither denial nor a price. Demographic, payer/member, provider, slot, coverage, or scenario changes invalidate results; contact/navigation do not. The fixture combines eligibility/network/cost, rather than making a real benefits determination or payment guarantee.

Implemented adapters cover profile/session, directory/scheduling, Stripe-shaped setup, Sohar, Metriport, AI preparation, notifications, video, completion, publication, and messaging. Healthie remains an architectural lead from the audit, not reproduction of its private API. Verified/Persona are unused. DoseSpot is not invoked because this scenario has no prescribing action. No advertising or retargeting receives data. Exact contracts and limitations are in [prototype-architecture.md](prototype-architecture.md).

## Mobile and visual direction

Legion's public identity supplies white, blue `#3A68E9`, ink `#000614`, muted `#657082`, pale blue `#EEF2FC`, the bundled public SVG logo, and Inter. One generated fictional clinician portrait stays consistent. The redesigned layout is original work; asset sources are recorded in `prototype/public/brand/SOURCES.md`.

Ordinary intake screens ask one question with a stable bottom action. Checkout, booking, portal, and longer health content can scroll. The visual-viewport-aware shell keeps active inputs/actions usable as keyboard geometry changes. Fields have labels, relevant autocomplete/input modes, phone formatting, and Enter/Next behavior. Short/large-text layouts may scroll rather than clip required content.

Fit/goal choices advance after a 200ms acknowledgment; incoming content transitions for 320ms with stationary frame/actions and brief repeated-tap protection. Only actual answers look selected. Reduced motion removes presentation delays. Condition icons accompany native multiple-choice checkboxes: ADHD, Depression, Anxiety, Bipolar Disorder, PTSD, “I'm not sure,” and Other.

Three authentic testimonials from captured live screens rotate every nine seconds. Manual dots stop rotation for that screen; hover/focus/hidden-document/reduced-motion suspend it. No pause button is present. Testimonials yield to short viewports and keyboards. No names, ratings, or reviews are fabricated.

## Outcome and validation boundary

Success is a simulated clinician-confirmed first visit: the patient can book, prepare once, leave, return, join, reconnect, and find next steps. The activity ledger excludes personal/clinical details and free text. Historical production funnel gaps remain investigation evidence, not causal abandonment or predicted lift.

Model/viewport tests cover state and recovery. Executed results, mobile rendered walkthroughs, and screenshots are recorded separately in [prototype-qa.md](prototype-qa.md). Responsive browser tests do not establish physical iOS/Android keyboard behavior, real media, secure authentication, real payments/delivery, or production readiness.
