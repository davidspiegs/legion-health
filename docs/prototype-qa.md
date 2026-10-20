# First-visit prototype verification

Verified October 20, 2026 after the branding and interaction correction. This is a working patient-flow prototype; vendors, people, records, appointments, messages and payments remain simulated.

## Build and behavior

- TypeScript/Vite production build passes. All **16 contract tests pass**.
- The added tests cover multiple explicit conditions surviving failed saves, resume and booking, allowlist normalization, and exclusion of clinical answers from the service ledger. Existing reservation, insurance, consent, completion-authority and follow-up contracts remain covered.
- Walked the revised local patient route through all six fit answers, ADHD + Anxiety, goal, self-pay, provider/time, name, birth date, address, email, phone, payment method, confirmation, optional-records decline, care brief, appointment day, device readiness, waiting room, visit and clinician completion.
- Preview controls advance time and clinician activity outside the patient screen. The default route can reach completion; the full journey review is available separately at `/?review=1`.
- All fit questions and the goal advance from the answer itself. Fit/goal draft saves have no artificial network delay. Urgent safety routing opens resources before persistence, even on a save failure.
- Conditions require at least one explicit choice; native checkboxes allow all seven captured options. ADHD + Anxiety remained selected after Back and reload. Matching described only the overlapping clinician focus areas.
- Continue was measured before and during save: identical text and bounding rectangle (342 × 52 at x24/y758 in the 390 × 844 check), no transform, animation or spinner/arrow swap.
- Local and hosted console checks returned no errors or warnings.

## Responsive and keyboard checks

Browser: Codex in-app Chromium through CUA. Captures use the tab screenshot API; full-page capture was needed for the full 1440px desktop canvas because viewport-only capture could be limited by the side-panel width. Images were inspected with `view_image` alongside the internal reference.

- **390 × 844:** inspected welcome, fit, conditions, matching, confirmed visit and completed visit. The first clinician, relevant specialties, price and available times are visible before scrolling through other providers.
- **375 × 667:** checked all 31 screens in review mode, which adds a 27px review strip. No horizontal overflow; every footer primary action remained in the viewport. All six fit-question answer sets and the complete seven-option conditions screen fit without content scrolling.
- Tightened the goal, coverage and phone screens after the initial sweep by removing redundant explanation and excess margins. The patient route has more space than review mode; phone has zero content overflow at 375 × 667. Provider comparison, booking review, detailed preparation and care-plan pages may scroll within the content area while the primary action remains visible.
- **375 × 390:** approximated the area above an open keyboard. Name and phone inputs stayed visible; the primary action occupied y332–380. Enter moved first name → last name → birth fields → address fields → email → phone → review. Focus moved into the next form without requiring a keyboard-dismiss step.
- Email uses email input/autocomplete; date and ZIP fields use numeric input modes; phone uses `type=tel`, `inputMode=tel`, `enterKeyHint=go`, national telephone autocomplete and `(202) 555-0147` formatting for the fictional fixture.
- **1440 × 1000:** inspected the default patient surface with a bounded, unframed content column. Reviewer rails are absent from the default route.
- Compact testimonials retain pause/play, focus/hover pause and reduced-motion support; short viewports and typing hide the optional quote before removing essential controls. Pause was exercised again on the hosted build. Reduced-motion behavior was verified in the original pass and its implementation remains unchanged.

Not verified: physical iOS/Android keyboard behavior, browser-chrome transitions, screen-reader output, every accessibility text-size setting, real autofill/password managers, or real camera/audio/network behavior. A reduced desktop viewport is not a physical-device test.

## Visual fidelity ledger

The new [brand correction reference](design/brand-correction-reference.png) was generated with the built-in image tool as an internal working reference. It supersedes the first concepts and is not a separately user-approved design. The real brand assets and current intake screenshot are authoritative where a generated reference differs.

| Comparison | Evidence and implemented decision |
| --- | --- |
| Brand identity | Replaced the invented wordmark with Legion’s public SVG and favicon. The actual SVG takes precedence over the generated symbol |
| Typography | Bundled the live intake’s Inter variable font; removed Manrope. Main headings use 500 weight, 30px mobile / 32px desktop, with larger body and control text |
| Palette | White background, source-backed `#3A68E9` action blue, `#000614` text and pale blue support surfaces. No decorative page gradient |
| Conditions / copy | Exact seven live labels, native square checkboxes, two-column layout, Other spanning the final row. Short selection instruction; no expanded diagnosis essay |
| Layout | Cardless patient shell, compact functional progress, ordinary question content above a stable bottom action. No review rail or integration explanation in the default patient screen |
| Button geometry and motion | Full-width 52px Continue; no arrow/spinner exchange, scaling or entrance motion. Only the optional testimonial fades |
| Small-screen spacing | 375 × 667 conditions fit all options and CTA. On shorter screens the quote disappears; comparison/review pages retain bounded scrolling |
| Downstream consistency | Booking and care share the same font, colors, 8–12px corners and readable text. Calendar, reminders, waiting, completion and follow-up remain functional |

Intentional differences from the internal concept: the real SVG replaces the generated logo; progress counts reflect actual screen groups; shorter fit-answer wording and an instruction before the choices clarify one-tap navigation; native checkboxes preserve browser accessibility; the small Preview controls link provides simulation access; testimonial attribution says “excerpt” because these are excerpts from one patient. The patient quote text, actual option names and brand assets are not invented. Above-the-fold copy was checked; no unexpected labels or marketing claims were introduced. The welcome subtitle now directly describes finding a clinician, choosing a time and meeting online.

The material defects found in comparison—narrow Continue width, button label movement, an unnecessary mouse-focus outline, tiny secondary text, generic diagnosis categories and review chrome in the patient page—were repaired. The revised screens were visually verified against the actual brand and working reference; no remaining mismatch with the requested corrections was found in the inspected states.

Selected current captures in `design/qa/`:

- `brand-conditions-mobile.jpg`, `brand-conditions-small.jpg`, `brand-conditions-desktop.jpg`
- `brand-matching-mobile.jpg`, `brand-confirmed-mobile.jpg`, `brand-completed-mobile.jpg`
- `brand-keyboard-name.jpg`, `brand-keyboard-phone.jpg`
- `brand-hosted-conditions-mobile.jpg` (includes Vercel’s own preview toolbar)

The original recovery, calendar-download, rescheduling and follow-up browser checks are retained in Git history. They were not all repeated as browser checks for this visual correction; their contract tests still pass.

## Hosted preview

- [Updated protected preview](https://legion-health-assignment-15bzwyj9z-davidspiegs-projects.vercel.app)
- [Full journey review](https://legion-health-assignment-15bzwyj9z-davidspiegs-projects.vercel.app/?review=1)
- Deployment: `dpl_8y25KPyJNFyHWzZNqvm4Smrt3civ`, READY, preview (`target: null`, `productionUrl: null`). Vercel authentication protection remains enabled.
- Opened the deployed application, exercised all six one-tap fit answers, selected ADHD and Anxiety, paused the quote, and inspected its rendered state. No hosted console warnings or errors returned.
- Hosted build assets: `index-C30hNftb.css` and `index-Cc0sY6R6.js`.

The actual Legion patient tab was not used, submitted or closed during this correction. No real clinical, payment, messaging or advertising integrations were called by the prototype.
