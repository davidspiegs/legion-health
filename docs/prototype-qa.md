# First-visit prototype verification

Verified October 20, 2026 after the insurance, mobile viewport, conditions, testimonials, and transition refinement. All clinical, insurance, payment, messaging, appointment, and video operations remain simulated. This pass updates the earlier brand-correction checks; previous full-journey captures and findings remain in Git history.

## Build and regression checks

- TypeScript/Vite production build passes.
- All **33 tests pass**: 24 model/service contracts and 9 viewport sequence regressions. Run `npm test` from `prototype/`.
- Insurance tests cover arbitrary nonempty numeric/alphanumeric IDs, a visible checking contract, pending/unmatched responses without invented costs, concurrent request deduplication, stale responses, and invalidation after previously successful verification. Name, birth date, address, payer, member ID, clinician, appointment slot/date, coverage path, and scenario changes require a new check. Email, phone, and navigation changes preserve a current result.
- Pending/unmatched insurance cannot confirm an insured booking; switching to self-pay requires an explicit choice. Tests retain the existing account/reservation/confirmation, records consent, encounter completion, follow-up, and event-value exclusion contracts.
- Viewport sequence tests cover retained focus after Safari Done, delayed stale offsets, blur while geometry is still reduced, subsequent field focus, later keyboard-height changes, toolbar changes, hardware keyboards, rotation, pinch zoom, and transient invalid dimensions.
- `git diff --check` passes.

## Rendered interaction checks

Browser: Codex in-app Chromium through CUA. The target path was insurance entry → checking → result/recovery → email → phone, plus conditions and fit navigation. Local URL: `http://127.0.0.1:5174/`. Fictional sample data only.

| Check | Result and evidence |
| --- | --- |
| Page identity and nonblank render | Local and hosted titles/routes matched the selected screens; meaningful headings, fields, and controls rendered |
| Framework overlays and console | No framework error overlay; no warnings or errors returned by local or hosted console checks |
| Member ID `1` | Local and hosted entry visibly progressed through “Checking your coverage” to active coverage with a clearly labelled $25 estimate |
| Unmatched recovery | At 375 × 667, result retained uncertainty, offered edit/retry/help and explicit self-pay; all content and both footer actions fit without scrolling after compacting the layout |
| Pending recovery | At 375 × 667, no copay was shown, both footer choices remained visible, and content scroll height equalled client height (381px) |
| Interrupted check | Reloaded during checking; the entry form returned with the entered `999` preserved, rather than leaving a stranded loading state |
| Email → phone | Enter from the email input advanced directly and focused phone. At a keyboard-sized 375 × 390 viewport, the field and primary action stayed visible; footer ended at y390 |
| Keyboard-size restoration | Restoring height to 667 while phone remained focused removed typing mode, reset top to 0px, and restored the full screen. This is browser emulation, not iOS proof |
| Conditions | At 390 × 844, ADHD and Anxiety remained selected with distinct icons and native checkboxes. The longest captured quote, all options, and Continue fit; content scroll height equalled client height (602px) |
| Testimonials | Three distinct captured patient quotes, honest attribution, discreet selection dots, no pause control. Manual selection stops rotation. Source also retains reduced-motion/hover/focus/hidden-tab handling |
| Screen transitions | Forward and Back navigation set the appropriate direction and use a 200ms content entrance. The app shell and footer action are outside that animation |
| Desktop | Inspected the fit screen at 1440 × 1000; no horizontal overflow or clipping, and direct-answer navigation and Back remained functional |

Screenshots were saved outside the repository in `/tmp/legion-refinement-qa/` and inspected. Relevant captures: `conditions-390.png`, `insurance-result-390.png`, `insurance-pending-375.png`, `phone-restored-375.png`, and `hosted-coverage-390.png`. Vercel's floating preview toolbar may appear on hosted captures; it is not a patient UI component.

## Keyboard issue and remaining validation

The supplied iPhone screenshots show temporary viewport offset/height surviving keyboard dismissal. The previous code copied that offset on every viewport event and repeatedly called document-affecting `scrollIntoView`; focus alone also kept the compact typing layout active.

The replacement hook infers keyboard occlusion from actual geometry, restores zero offset and full height during dismissal, ignores pinch zoom, batches geometry work, and reveals inputs only within the owned content pane. Later keyboard shrinkage schedules a bounded, debounced visibility check instead of a document-scroll feedback loop. The test sequences specifically reproduce a stale 240px offset.

**Physical iPhone/Safari validation remains outstanding.** CoreSimulatorService was unavailable in this environment. The responsive/browser checks and pure geometry tests support the fix but do not establish actual iOS keyboard or browser-toolbar behavior. Android keyboards, real autofill, assistive-technology output, large accessibility text sizes, and real media/network conditions were not verified. The earlier full simulated first-visit walkthrough was not repeated end to end for this focused change; its model contracts still pass.

## Hosted preview

- [Updated protected preview](https://legion-health-assignment-6wgqwyi43-davidspiegs-projects.vercel.app)
- [Full journey review](https://legion-health-assignment-6wgqwyi43-davidspiegs-projects.vercel.app/?review=1)
- Deployment `dpl_8weB9qw7Jg9uar64pYjLZd4EVuU8`: READY, preview (`target: null`, `productionUrl: null`), Vercel authentication protection enabled.
- Hosted build assets: `index-C6C8aqNq.css`, `index-C_VJjXkY.js`.
- Opened the deployed patient surface and exercised member ID `1` through checking and the estimated-coverage result; inspected the hosted screenshot and console.

The real Legion patient tab was not interacted with, submitted, or closed during this refinement. No real appointments, payments, messages, or vendor verification requests were created by the prototype.
