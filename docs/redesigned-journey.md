# A first visit that feels connected

Proposed October 20, 2026. This is the scope for a working flow prototype for David's review, before the larger rebuild. All care, providers, transactions, communications, and service responses are fictional simulations. The existing research canvas remains separate.

## The journey

| Phase | Screens and patient decisions | Service boundary |
| --- | --- | --- |
| Find care | Welcome → six compact fit questions → select one or more conditions → preferred support → insurance or self-pay → two useful provider choices → time selection | Eligibility routing; local draft; directory and availability |
| Your details | Name → birth date → address → coverage details and result if insured → email → phone and optional SMS preference → refresh availability and acquire a hold | Profile; Sohar checking/verified/pending/unmatched result; authentication; scheduling |
| Confirm | Review provider, time, time zone, price and example agreements → simulated payment method → confirmation; recover if the hold expires | Scheduling; payment setup; appointment authority |
| Prepare | Confirmation and calendar → records permission → records/goal review → editable, source-linked care brief → appointment home and reminder previews | Metriport; simulated AI summarization; reminder scheduling |
| Meet | Appointment-day preview → location/callback and device readiness → waiting room → simulated visit, interruption/reconnect → clinician completion event | Telehealth; encounter authority |
| Continue care | Clinician-reviewed example plan → experience feedback and questions → optional recommended follow-up selection and confirmation | Care team; follow-up scheduling |

A time selected before personal information is a preference. After the final contact step succeeds, availability is checked and a hold acquired on entry to review, so there is no expiring hold while entering identity/contact information. Review can recheck an expired hold or return to alternative times without losing those details. Unverified insurance remains unverified; self-pay is an explicit choice. Booking, payment-method setup, attending, and completing a visit are separate states.

**The insurance/member-ID step before email is an introduced redesign, not an established part of Legion's live sequence.** The audit followed self-pay and observed a [payer directory and saved payer choice](runtime-service-evidence.md), which do not establish eligibility verification. After account creation, the [payment screen said insurance verification came next](technical-audit.md). This prototype moves an insured patient's coverage check after the needed demographics and before contact collection and financial confirmation, so an unresolved result or estimated cost can inform the patient's decision earlier.

## What must work in this version

- A complete path through the first completed visit and optional follow-up.
- Helpful fit exits; urgent support guidance instead of a conversion CTA when appropriate. No autonomous diagnosis or prescribing.
- Fit answers and the preferred-support choice advance directly, without a second Continue tap or an artificial save delay. Urgent resources appear immediately even if the draft save fails.
- Seven explicit condition choices support multiple selections: ADHD, Depression, Anxiety, Bipolar Disorder, PTSD, “I'm not sure,” and Other. These are patient selections, not inferred or confirmed diagnoses.
- Provider comparison, explicit Central Time display, nearby alternatives if a time is taken, and rescheduling without erasing intake.
- Logical personal information steps, contact last, email before phone, visible labels, autocomplete, correct input modes, US phone formatting, and field validation.
- Keyboard-aware layout uses actual layout/visual-viewport geometry plus editing state, rather than treating focus alone as proof of an open keyboard. Enter/Next/Done submits or advances; the shell releases stale keyboard offsets and distinguishes pinch zoom. Optional proof yields to an inferred open keyboard. Never clip required content to enforce a screenshot height.
- Clear self-pay prices, insured estimates with provenance/status, simulated payment setup, and a distinct confirmation.
- Save/resume on the same browser, recovery after save/payment failures, and idempotent reservation/confirmation.
- Records permission, missing-record fallback, patient corrections, sourced preparation summary, and clinician review.
- Reminder previews with editable channel preferences, a real downloadable calendar file, visit-day simulation, device readiness, waiting, reconnect, and an authoritative simulated completion event.
- A care plan, feedback, care-team question simulation, and optional follow-up booking.
- Review controls for chapter navigation, synthetic data, recovery scenarios, and a sanitized integration trace. No real advertising, notifications, camera/microphone capture, cards, or clinical APIs.

## Visual and interaction direction

**Visual thesis:** use Legion's existing identity with a clear mobile hierarchy, calm spacing, and a recognizable clinician.

The current internal visual reference is [brand-correction-reference.png](design/brand-correction-reference.png), superseding the earlier concepts in `docs/design/`. It is a generated working reference, not a user-approved final design.

**Content plan:** one immediate question or decision per ordinary screen; provider and appointment context where it helps; the next action anchored at the bottom; longer comparison/review content allowed to scroll. The default `/` route is the patient experience without review rails. `/?review=1` adds chapter navigation, scenarios, and integration inspection.

**Interaction thesis:** direct answer selection and stable controls keep the task moving. The chosen fit/goal answer is acknowledged for 200ms, then incoming content transitions over 320ms while the frame and action remain stationary. Only explicit answers receive selection styling; incoming answer controls are briefly gated against repeated taps. Reduced-motion settings skip the presentation delays. Shared buttons retain stable dimensions while busy, without arrows, spinners, or button motion. The compact testimonial rotates every 9 seconds, suspends rotation on hover, focus, or a hidden document, and does not rotate with reduced motion enabled. Three manual dots select quotes and stop automatic rotation for that screen; there is no separate pause button. The strip yields to short viewports and the keyboard.

### Design system and implementation inventory

- White background; Legion blue `#3A68E9`, ink `#000614`, muted text `#657082`, and pale blue `#EEF2FC`.
- Bundled Inter from Legion's live app. Screen headings are 32px by default and 30px on mobile, weight 500, with smaller short-viewport/keyboard treatments; form inputs stay 16px. Mobile gutters are 24px, or 20px on narrow devices. Physical-device and large-text legibility still need review.
- Shared primary buttons have a stable 52px minimum height and 8px corners, with a compact 48px keyboard treatment. Cards are reserved for selectable choices, provider comparison, and appointment context.
- Lucide outline icons at consistent 20–24px, 1.8–2px stroke; icons indicate meaning, not decoration.
- Legion's public SVG logo is bundled at `/brand/legion-logo.svg`, alongside the local Inter font. One generated fictional clinician portrait is used consistently across matching, booking and the simulated visit.
- Components: app shell/progress, Page with a scrolling main region and separate action area, buttons, choice rows, fields, notices, appointment context, testimonial strip, accessible review/help dialogs.
- Full-screen mobile shell uses dynamic/visual viewport height. At keyboard-open sizes, progress and optional proof collapse before essential fields or actions. Large text and unusually short viewports can scroll rather than clip.
- Three distinct authentic testimonials from the captured current flow are attributed as Legion Health patient experiences; shortened quotes are labelled as excerpts. No invented names or ratings.
- Condition choices use native checkboxes and persist as a `conditions` array. Older single-topic drafts are not converted into diagnoses; eligible unfinished drafts return to the condition screen for an explicit selection.
- “Preview controls” lives outside the patient surface. Its dialog advances appointment day, the simulated conversation, and clinician completion in either mode, so the default patient flow can be reviewed end to end without embedding simulation controls in the care screens.

Brand references are Legion's [public logo](https://app.legionhealth.com/legion-logo-dark-text.svg) and its live [base stylesheet](https://app.legionhealth.com/_next/static/css/cf04015137e5e14a.css) and [application stylesheet](https://app.legionhealth.com/_next/static/css/c50624e23d0abf09.css). These identify the source of the identity assets and styling; the redesigned layout remains this prototype's work.

Implementation references: the [W3C carousel tutorial](https://www.w3.org/WAI/tutorials/carousels/) is a reference for reviewing rotation and user control, not a claim of conformance; [MDN `enterkeyhint`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/enterkeyhint) documents keyboard action hints; and the [Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API) supports adapting the shell when a mobile keyboard changes the visible area. These mechanisms do not replace device testing. The urgent-support exit links to [988's explanation of what to expect](https://988lifeline.org/get-help/what-to-expect/); it does not simulate a crisis service or claim a care coordinator has been contacted.

## Integration choices

Mock profile/authentication, directory/scheduling, payment setup, Sohar, Metriport, AI preparation, reminders, video, encounter completion and care-team messaging. Follow-up reminders target the follow-up's own appointment ID; the completed first visit remains unchanged. Care-team messages persist locally outside the event ledger and are never delivered. Healthie is an architectural lead from the audit, not a claim to reproduce its private API. Keep adapters replaceable. The [architecture document](prototype-architecture.md) records the implemented methods, invariants, and production gaps.

The Sohar simulation accepts any nonempty member ID—including `1`—and moves through a visible checking state for 1,250ms. Its scenario then returns active/in-network coverage with a $25 first-visit estimate, pending, or unmatched. These are fixed demonstration responses and timing, not real payer performance or a payment guarantee. Pending and unmatched results offer retry, editing, care-help, or an explicit $250 self-pay choice; unmatched does not mean uninsured or denied. The care-help route explains the support concept but does not contact a team.

A real implementation would create an asynchronous verification request and retrieve its result by polling or webhook, using patient name/birth date, payer/member information, and the applicable specialty/place-of-service inputs. [Sohar quickstart](https://docs.soharhealth.com/documentation/getting-started/quickstart), [verification guide](https://docs.soharhealth.com/documentation/guides/verification). Active coverage, provider network status, and estimated patient cost must stay distinct; Sohar documents separate [network-status](https://docs.soharhealth.com/api-reference/network-status/get-network-status) and [cost-estimate](https://docs.soharhealth.com/api-reference/cost-estimate/create-cost-estimate) operations. Inactive coverage, out-of-network care, deductible/coinsurance calculations, and prior-authorization requirements remain future variants, not implemented claims in this flow.

Verified's phone-first prerequisite conflicts with the requested contact-last sequence, so omit it from the main flow. Persona needs a specific assurance gap before adding a universal identity gate. DoseSpot is a potential clinician medication handoff; this first flow review does not need a simulated prescription to establish successful care.

## Evidence and outcome

The primary outcome is a simulated clinician-confirmed first visit. Supporting measures include eligible continuation, provider/time visibility and choice, reservation recovery, confirmed appointment, preparation reviewed, joined/interrupted/reconnected, and completed encounter. General event traces exclude names, contact information, answers, conditions, medication details and free text. Historical funnel losses remain investigation signals, not promised lift.

Review at 390 × 844 and 375 × 667, plus short keyboard-sized viewports. Exercise the complete happy path and recovery scenarios; verify keyboard submission and footer reach, focus order, visible errors, reduced-motion carousel behavior, consent boundaries, idempotency, and completion authority. Desktop and responsive browser checks do not substitute for physical iOS/Android testing.
