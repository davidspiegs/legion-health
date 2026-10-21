# Current journey: findings for discussion

Observed October 20, 2026 in Chrome. Desktop viewport: 1,440 × 749 CSS pixels. Mobile comparison: 390 × 844 CSS pixels in the same browser, not a physical-device test. Screenshots are full-page captures.

The walkthrough uses an assignment scenario: an eligible adult in Texas seeking medication support for ADHD, with self-pay selected. These choices are not assertions about David's health or insurance. The patient-details capture is blank.

## What the walkthrough establishes

| Area | Observed interface | Product question to test |
| --- | --- | --- |
| Entry | `/portal/join` briefly showed “Creating anonymous session…” and automatically moved to `/portal/join/fit`. | Does the entry make the care offering and effort ahead clear before the screening starts? |
| Fit check | Six separate questions cover Texas location, Medicare/Medicaid, current risk of harm, recent inpatient hospitalization, adulthood, and virtual care. A seventh completion state requires Continue. | Which exits are appropriate service-fit exclusions, and which reflect avoidable uncertainty or effort? |
| Progress | The fit check has its own six-question sequence. Conditions then begins another “Step 1 of 6” sequence. | Would one honest explanation of the full journey make remaining effort easier to understand? |
| Conditions | Seven choices include “I'm not sure.” Choosing ADHD expands explanatory medication and testing copy inside the card. | Can helpful condition-specific information remain available without displacing the next action? |
| Insurance | The initial title says “Great news! We've got you covered” before any plan is chosen. Selecting No Insurance reveals $250 for new-patient intake and $150 for follow-ups. | How should the interface distinguish accepted insurers, verified benefits, and a patient's expected cost? The insured path was not tested. |
| Needs | Three choices distinguish existing diagnosis/medication support, new diagnosis or medication, and uncertainty. Selecting the first expands further reassurance. | How does this answer change matching and carry into the clinician's preparation? That downstream use was not verified. |
| Match | A completed matching checklist remains above the results. The page calls the result a “perfect match,” shows three initial providers, and offers 37 more. Each initial provider displays psychiatric mental health nurse practitioner credentials, expertise, biography, and times. | Can patients understand why an individual provider fits their needs and compare suitable times without reading the entire page? |
| Selected time | Choosing a time reveals a booking button and an optional earlier-appointment preference. Enabling that preference offers current, any, or specific providers plus a free-text availability field. | Does the patient understand when a time is held versus confirmed, and what automatic rescheduling would do? |
| Patient details | The form asks for name, email, phone, birth date, referral source, and three consent groups. It includes treatment/controlled-substance policies and recording/AI transcription consent. | Which information is needed now, how are choices explained, and how well does account creation recover from interruption? |

Selecting the booking control advanced the anonymous walkthrough to patient details. This does not establish a confirmed appointment, account creation, payment, or completed visit. David chose to stop the live walkthrough at Basic Info, before submission of patient details and agreements.

## Mobile observations

The responsive layout fits the 390-pixel width in the captured states: the capture manifest records no horizontal overflow. The stronger issue is vertical ordering and effort.

- The desktop testimonial sidebar becomes a block above the mobile task. It occupies space before the progress indicator and questions.
- On the captured first fit question, the Yes/No controls sit around the bottom of an 844-pixel viewport.
- Selecting ADHD creates a tall explanatory card. Continue is approximately 1,350 pixels down the conditions page.
- The selected needs page is 1,296 pixels tall; the blank patient-details page is 1,556 pixels tall. Their primary actions are below the initial viewport.
- The initial provider-match page is 3,901 pixels tall, about 4.6 viewport heights. The first provider starts below the matching checklist, around 1,230 pixels into the page. The first visible time choice is much further down.
- The mobile match layout exposes fewer time buttons per provider before a “more times” control. It is a responsive interaction change, not simply a narrower desktop screenshot.

Some full-page screenshots position the sticky header below the document top because capture occurred at a scrolled state. That is a capture limitation, not evidence of a live overlapping-header defect. Keyboard behavior, touch interactions, physical-device rendering, and form-error recovery have not yet been tested.

## Priorities to discuss before prototyping

1. **Bring the task and next action forward on mobile.** Test reducing the testimonial's prominence, shortening completed matching status, and making the primary action easy to reach while preserving necessary information.
2. **Explain matching with specific reasons.** Test concise provider comparisons, understandable availability, cost context, and explicit reservation/confirmation states.
3. **Preserve appropriate eligibility routing.** Add question-level outcome measurement before treating fit-check exits as a conversion problem. The historical 34.8% loss includes unknown reasons.
4. **Reduce repeat work while making consent understandable.** Use confirmed autofill and retained progress where appropriate. Investigate rather than assume that the agreement groups explain the historical 20.4% account-creation loss.
5. **Extend the product and measurement to completed care.** The later prototype should include preparation, reminders/joining, recovery from a missed or changed visit, and an authoritative simulated completion signal.

The historical provider-selection loss is 36.6%, but none of these observations proves its cause. The supplied funnel has no device segmentation, payment-success signal, or first-visit-completed milestone.

## What would make the later submission compelling

A focused working journey with two or three defensible product bets, realistic integration behavior, and visible patient/clinician control would demonstrate the role well. For example, imported context could have source labels, an uncertain or conflicting result could require confirmation, and a patient's correction could persist into a clinician-ready summary. The demonstration should include an integration delay or failure and its recovery, not just immediate success.

Platform judgment appears in the states behind the interface: eligibility, consent, identity, benefits, reservation, confirmed appointment, visit preparation, attendance, and completed care. Consumer judgment appears in clarity, effort, trust, mobile task completion, and recovery. AI judgment appears in choosing useful work, evaluating output, handling uncertainty, and preserving control.

These are recommendations for the next phase, not additional requirements or a claim about Legion's current implementation. Prototype work waits for David's feedback on the canvas.
