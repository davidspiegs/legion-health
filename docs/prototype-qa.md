# First-visit prototype verification

Verified October 20, 2026. This is a working flow review, not the complete final take-home submission or a production care system.

## Build and contracts

- `npm run build` passes: TypeScript and Vite production build.
- `npm test` passes: 14 tests, zero failures.
- Tests cover hold vs confirmation, expiry, duplicate requests, unavailable slots, payment retry, records permission, pending/verified coverage, self-pay bypass, rescheduling, encounter completion authority, follow-up reminders, local message persistence, sanitized events, date validation and Central Time across daylight saving.
- No browser runtime errors or warnings were returned during the final local check.

## Browser execution

Browser: Codex in-app Chromium, controlled through CUA. Render captures use the browser screenshot API, saved as JPEG at the reported viewport size. These are browser viewport checks, not physical-device screenshots. The live Legion patient tab was not used or closed during this prototype work.

| Check | Observed result |
| --- | --- |
| Full self-pay path | Completed six fit questions, needs/goal, provider/time, name/DOB/address/email/phone, mock account/hold, demo payment and example agreements, confirmed visit |
| Preparation | Requested fictional records with explicit permission, flagged a record out of date, edited the care brief, approved it with Enter |
| Attendance | Saved reminder preferences, previewed appointment day, completed simulated camera/sound/location/callback checks, joined the room, advanced the demo conversation, triggered simulated clinician completion |
| Continuity | Booked a separate follow-up; its reminder screen showed the follow-up date rather than the completed first visit |
| Calendar | Downloaded and inspected a real `.ics` file: October 22, 2026, 14:00–15:00 UTC, matching 9:00–10:00 AM Central Time |
| Rescheduling | Changed the existing visit to 11:30 AM; the appointment home reflected the new time |
| Slot conflict | Details remained saved; lost 9:00 AM slot became disabled and labeled Unavailable; Continue stayed disabled until another time was chosen |
| Pending benefits | No copay invented; the user could retry, seek help, or explicitly choose the displayed self-pay price |
| Payment retry | First setup failed visibly; retry succeeded without repeating personal information |
| Records unavailable | Clear missing-record state; continued to an answer-based care brief |
| Connection loss | Reconnected to the same visit. Leave returned to an interrupted appointment rather than a completed visit |
| Save failure | Error preserved the entered email; retry advanced |
| Low rating | A rating of 2 offered care-team/provider-change draft routes; a local message was saved with Not delivered and remained after reload |
| Urgent fit answer | Routed to immediate-support guidance instead of advancing booking; final implementation provides `tel:988` and `sms:988` actions |
| Testimonials | Auto-rotation observed; pause control switched to Play. Reduced-motion emulation disabled automatic playback; emulation was reset afterward |

## Mobile and keyboard

- Main mobile review at **390 × 844**; smaller phone review at **375 × 667**.
- Examined all 30 primary screens at the smaller size. No horizontal overflow. Ordinary fit/details screens keep their primary action visible; providers, scheduling, review, appointment home, reminders, and expanded care-plan content may scroll within the content region.
- Goal and inpatient-question spacing were tightened after inspection. The goal screen retains approximately 4px of scrollable padding at 375 × 667; its question, choices, caution and primary action remain visible.
- A **375 × 390** viewport approximated space remaining above a keyboard. The active last-name field ended at y=312; the action area occupied y=324–390. The phone field ended at y=223 with the same visible action area.
- Enter/Next was exercised through name → birth → address → email → phone → review. Numeric date/ZIP fields, email input and telephone input use appropriate input modes/autocomplete. Phone text formats as entered; middle editing and punctuation deletion have digit-aware caret handling.
- Navigation focuses the next input in the layout effect when advancing from typing. The application uses VisualViewport height/offset, scrollable content and a separate action area; optional proof/progress/context yields to typing.
- **Not verified:** physical iOS Safari or Android Chrome software keyboards, browser chrome transitions, autofill/password-manager variations, screen-reader output, zoom at all accessibility text sizes, or real camera/audio/network behavior. Browser keyboard-sized checks do not establish those behaviors.

## Visual fidelity review

Internal generated concepts were inspected with `view_image`, alongside the rendered mobile captures, before handoff. These concepts were working design references created under the instruction to design and build, not separately user-approved designs.

| Area | Reference | Rendered result / decision |
| --- | --- | --- |
| Intake hierarchy | `design/intake-matching-concept.png` | Large direct question, four clear choices, compact patient quote and bottom action retained. Supporting text and six-chapter progress are more compact to preserve phone space |
| Matching | `design/intake-matching-concept.png` | Provider, actual focus areas, next time, cost and direct slot choices appear immediately. Removed the concept's implied universal clinical-fit claim; comparison remains factual |
| Personal details | `design/details-preparation-concept.png` | One logical group per form, email before phone, contextual appointment summary. Corrected concept artifact that placed clinician information in patient review fields; hid optional context during typing |
| Preparation | `design/details-preparation-concept.png` | Strong blue appointment panel, consistent portrait, calendar/reschedule actions retained. Preparation and reminder tasks open their functional screens rather than competing on one dense page |
| Visit and completion | `design/visit-completion-concept.png` | Same clinician portrait, calm video room, simple controls and care-plan continuity. Replaced invented call timer with an explicit simulation label; Leave and clinician completion are separate actions |
| Palette, type and rhythm | All three concepts | True white/cool gray, blue actions, ink headings, Manrope, rounded functional controls. Body/utility sizes are deliberately compact; inputs remain 16px. No cream or headline italics |
| Motion and accessibility | Functional extension | Short content transitions leave the footer stationary. Carousel has manual controls, pauses for focus, and respects reduced motion |
| Desktop | Functional extension | 1440 × 1000 review places the compact patient flow between chapter navigation and design/integration context. The patient form is not stretched to desktop width |

Selected captures are in `docs/design/qa/`: welcome, intake, matching, confirmation, visit, completion, keyboard-name, keyboard-phone and desktop-review. The fictional clinician asset is generated; there are no patient photos or invented ratings. Testimonial text is a set of excerpts from one unnamed patient in the captured live journey, not three separate reviews.

## Known boundaries for the next build

The prototype stores data in local browser storage, has fixed example dates, uses fictional providers, and runs asynchronous local adapters. There is no real authentication, backend persistence, AI model call, medical-record access, prescription, payment, notification delivery, or telehealth connection. Server-side authorization, consent/audit controls, idempotency keys, background jobs, clinical review of eligibility rules, and the complete final-assignment deliverables remain work for the larger rebuild. See `prototype-architecture.md`.

## Hosted preview

- URL: https://legion-health-assignment-r2jomco6x-davidspiegs-projects.vercel.app
- Deployment ID: `dpl_CsqwKvGbvJuLVYzriaENm4Jstcw9`
- Vercel API: READY, preview (`target: null`), no aliases. Authentication protection remains enabled; a signed-out browser may need David's Vercel login.
- Authenticated root returned HTTP 200 with the expected app and `X-Robots-Tag: noindex, nofollow`.
- Opened the actual hosted app in the in-app browser; exercised review navigation, provider selection and transition to name entry. No console errors/warnings returned. Saved `design/qa/hosted-matching-mobile.jpg` at 390 × 844, then reset the viewport and restarted the preview for handoff.
- Deployment correction: Vercel auto-assigned its first project deployment to production despite the explicit preview flag. A separate verified preview was created, and only the unintended first deployment was removed; subsequent inspection confirmed it no longer exists. No existing production project or deployment was touched.
