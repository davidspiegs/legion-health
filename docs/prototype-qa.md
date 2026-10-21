# Checkout and first-visit verification

Verified October 20, 2026 (the final run continued into October 21 UTC). All payment, insurance, account, messaging, appointment, device, and clinical operations are simulated. No real Legion patient page was submitted or closed. Earlier focused insurance/transition evidence remains in Git history.

## Automated checks

- **52 tests pass** with `npm test` from `prototype/`: service and journey contracts, reviewer fixtures, and mobile viewport regressions.
- TypeScript and Vite production build pass; `git diff --check` passes.
- Coverage includes insurance pending/unmatched/stale responses, arbitrary nonempty member IDs, slot conflict/expiry, payment setup/authentication/retry, preserving an existing card after failed replacement, renewed financial authorization when terms change, finite preparation, return sign-in, interrupted encounters, clinician completion versus plan publication, and reminder preferences/deduplication.
- Cancellation followed by same-slot rebooking receives a new appointment identity and fresh notifications; moving an existing appointment retains its identity. Regression tests cover first and follow-up appointments.

## Full mobile patient journey

Browser: Codex in-app Chromium, 390 × 844, local `http://127.0.0.1:5174/`. Used fictional Alex Rivera details and the synthetic `4242` card. This was a fresh patient walkthrough, not a reviewer jump to a completed visit.

| Stage | Observed result |
| --- | --- |
| Fit and conditions | Walked all six fit questions; newly entered questions were unselected. Selected ADHD and Anxiety together, then a care goal |
| Matching and details | Selected Maya Chen and an available time; completed name, birth date, address, insurance, email, phone |
| Eligibility | Member ID `1` passed through a visible checking state to a labelled $25 estimated copay |
| Typed contact fields | Email Enter advanced to phone; phone formatting and Enter progression worked |
| Checkout | Entered synthetic card/expiry/CVC; both acknowledgments initially unchecked; final action became available after readiness. Processing led to a confirmed appointment with $0 due today |
| Portal | Confirmation led to Home with persistent Home/Visits/Messages/Account navigation and appointment context |
| Finite preparation | Health review saved and returned Home marked Reviewed. Records were skipped and marked Skipped. Care brief saved and returned Home marked Reviewed. Optional tasks did not block joining |
| Return access | Signed out, requested the simulated code, inspected Preview inbox, and signed back in. Appointment and preparation remained intact |
| Reminders | Preview inbox showed simulated confirmation and joining reminder as delivered; no actual message was sent |
| Check-in | Simulated camera/audio checks, current Texas location, synthetic current address, and callback number enabled waiting-room entry |
| Waiting and visit | Clinician readiness appeared separately from patient arrival. Joined the simulated visit from the waiting room |
| Departure/reconnect | Left mid-visit. Home showed the visit still open; reconnected to the same unfinished encounter. Departure did not complete it |
| Completion | Simulated clinician completed the encounter. The app moved to first-visit summary and published care plan automatically, without reviewer controls |
| Continuing care | Booked a separate follow-up; Visits showed upcoming follow-up and completed first visit. Saved optional feedback and saw the saved acknowledgment |
| Persistence and messages | Reload retained completed visit, care plan, follow-up and feedback. A local message received a simulated care-team reply |

Screenshots were inspected and saved in `/tmp/legion-portal-qa/`: `home-390.png`, `waiting-390.png`, `visit-390.png`, `completed-390.png`, and `visits-375.png`. The completed-visit layout was compacted after inspection so care-team and feedback actions fit above the primary action at 390 × 844.

## Separate checkout and responsive checks

- At 390 × 844: normal confirmation, payment failure/retry, bank authentication approve/cancel, and card replacement in Account.
- Successful replacement updated the masked expiration. Cancelling a later replacement retained the previous method without a false success message or another appointment.
- Keyboard Enter chain: card → expiration → CVC → ZIP → acknowledgment. At a 390 × 400 keyboard-sized viewport, the focused field and action remained reachable.
- At 375 × 667: inspected Visits with an upcoming and past appointment. Longer lists scroll while portal navigation remains visible.
- At 1440 × 1000: inspected the populated Messages view; readable content width, composer, and navigation remained intact.
- Checkout test tab returned no console warnings/errors. Root's long-lived local tab retained three historical Vite hot-reload errors from incomplete intermediate edits; the final build and reloaded app succeeded. Hosted verification is recorded below separately.

Checkout screenshots: `/tmp/legion-checkout-qa/checkout-top-390.png`, `checkout-ready-390.png`, `checkout-keyboard-390x400.png`, `checkout-bank-auth-390.png`, `checkout-retry-390.png`, `account-card-update-390.png`, `account-card-updated-390.png`.

## Native iOS keyboard verification

Safari in an **iPhone 17 Pro, iOS 26.4 Simulator**, controlled through native CUA. This is an actual iOS software-keyboard run in Simulator, not a physical-device test.

- Name: Continue remained above the keyboard; native Next moved first → last name and brought the next field into view. Accessory Done restored full layout without the stuck blank offset.
- Email: appropriate `@` keyboard appeared. Done restored the full viewport; keyboard Go advanced directly to Phone.
- Phone: number pad appeared, editing retained `(202) 555-0148` formatting, and Review my visit worked while the keyboard remained open.
- Checkout: number-pad taps formatted the synthetic card correctly. Native accessory arrows initially appeared disabled and expiration was partly below the fixed action. The explicit keyboard-next refinement was then retested successfully on native iOS: card → expiry → CVC → ZIP retained the keyboard and revealed each field. Review authorization dismissed the keyboard, restored the viewport, and focused the still-unchecked acknowledgment; confirmation remained disabled.
- Native captures: `/tmp/legion-ios-qa/name-done-restored.png`, `email-keyboard-open.png`, `email-done-restored.png`, `phone-numberpad.png`, `checkout-card-numberpad.png`. These are 790 × 1700 screenshots including Simulator chrome; exact CSS viewport dimensions were not instrumented.

Physical iPhone, Android keyboards, real autofill, assistive-technology output, larger accessibility text sizes, and actual media/network behavior remain unverified. The full first-visit walkthrough was performed in mobile-sized Chromium; the native Simulator pass focused on keyboard behavior. Native Simulator control briefly became unavailable but recovered for the final field-progression retest. Invalid-field recovery was checked in Chromium, not separately on native iOS.

Final native checkout evidence: `/tmp/legion-ios-qa/checkout-security-keyboard-next.png`, `checkout-zip-keyboard-review.png`, and `checkout-review-authorization-unchecked.png`. No consent or booking submission occurred in the native Simulator pass.

### Numeric-keyboard follow-up

Checkout and Account card editing now have a sticky Next action while typing: card → expiration → CVC → ZIP → Review authorization. In a 390 × 400 Chromium viewport, exercised every transition, confirmed an empty expiry remains focused with an inline error, and verified the final action focuses the still-unchecked acknowledgment without saving or confirming. Screenshot: `/tmp/legion-portal-qa/payment-next-390x400.png`.

## Hosted preview

- [Updated protected preview](https://legion-health-assignment-4prcit9y3-davidspiegs-projects.vercel.app)
- [Jump through the journey](https://legion-health-assignment-4prcit9y3-davidspiegs-projects.vercel.app/?review=1)
- Deployment `dpl_57c7MzULHD23ou7U5kbS7Jj9RUbw`: READY, preview (`target: null`, `productionUrl: null`), Vercel authentication protection enabled. Application source commit: `636177f` on `assignment/journey-audit`.
- Hosted assets observed: `index-D8-jVRKw.css`, `index-BXntiZZ9.js`.
- At 390 × 844, rendered and inspected checkout, portal Home, and completed-visit summary using the explicitly labelled reviewer fixtures. Both checkout acknowledgments were unchecked and confirmation disabled. Portal navigation, appointment context, plan, follow-up, care-team and feedback controls rendered. Document width matched viewport width (390px); no console warnings/errors were returned.
- Hosted checks are a deployment smoke test, not a second full patient walkthrough. The fresh end-to-end journey was completed locally as recorded above. No hosted payment or booking was submitted. The hosted test path was reset to Welcome before handoff.
- Hosted screenshots: `/tmp/legion-portal-qa/hosted-checkout-390.png`, `hosted-home-390.png`, `hosted-completed-390.png`. Vercel's floating review toolbar is hosting chrome, not part of the patient application.

## Boundaries

The patient-facing flow is coherent, but external systems remain mocks: no live Stripe, Sohar, Metriport, identity, video, email/SMS, clinician, or server authentication. A completed simulation is not a completed clinical visit. The accelerated appointment clock and fixed sign-in code are reviewer conveniences outside a production implementation. The proposed card-on-file/no-charge-today billing policy remains a design assumption, not verified Legion policy.
