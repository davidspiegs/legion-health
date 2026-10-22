# Legion first-visit flow prototype

A working mobile-first design review: intake → provider/time → personal details → confirmed booking → preparation → simulated first visit → care plan and follow-up.

This is the screen-based baseline (`baseline-v1`), now at `/?experience=classic`. `/` opens the Wren conversation described in the [top-level README](../README.md).

All providers, appointments, service calls, records, payment methods and messages are fictional. The AI brief is a fixed, editable simulation. Nothing is sent to clinical, payment, advertising, email or SMS providers.

## Run

```sh
npm ci
npm run dev
```

Open [the patient experience](http://127.0.0.1:5174/?experience=classic). Build with `npm run build`; run the test suites, the baseline's and the conversation's, with `npm test`.

## Review

- **Patient experience `/?experience=classic`:** the baseline flow, without review rails. Fit and goal choices briefly acknowledge the selected answer, then advance; conditions support multiple native-checkbox selections. Personal details come before email and phone.
- **Preview controls:** the footer outside the patient surface opens a simulation dialog. After booking, advance to appointment day; during the visit, advance the conversation, then send the simulated clinician completion signal. The full journey is accessible in patient mode.
- **Full review `/?review=1`:** [open the reviewer view](http://127.0.0.1:5174/?review=1) for chapter navigation and the following tools. Switching modes preserves the current local journey.
- **The flow:** jump to any screen with explicit fictional fixtures. Jumping replaces the review path; it does not complete skipped steps. Intake shortcuts seed only earlier prerequisites, leaving the current and later questions unanswered.
- **Recovery:** slot contention, pending or unmatched coverage, unavailable records, payment retry, interrupted visit, and failed save.
- **Mock activity:** inspect the sanitized local service ledger.
- **Use sample details:** fills fictional personal details without accepting agreements or records consent.
- **Restart preview:** clears this preview's progress.

Progress persists in this browser's local storage. This is not a production patient portal or a secure place for real health information. The baseline needs no environment variables or vendor accounts. Only the Wren conversation calls a model: Claude, through `api/assistant.ts`, when the deployment has `ANTHROPIC_API_KEY`.

The interface uses Legion's public logo and locally bundled Inter, white backgrounds, and its blue/ink palette. Shared actions keep a stable label and size while busy. Three authentic captured testimonials rotate every nine seconds, stop after manual selection, respect reduced motion, and hide when space or the keyboard requires it. There is no pause button. Screen content transitions while action buttons remain steady. Insurance accepts any nonempty demo member ID and shows checking, estimated benefits, or an unresolved recovery state. [The current design reference](../docs/design/brand-correction-reference.png) is an internal concept, not an approved final design.

See [journey rationale](../docs/redesigned-journey.md), [architecture and production boundaries](../docs/prototype-architecture.md), and [verification](../docs/prototype-qa.md).
