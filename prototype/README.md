# Legion first-visit flow prototype

A working mobile-first design review: intake → provider/time → personal details → confirmed booking → preparation → simulated first visit → care plan and follow-up.

All providers, appointments, service calls, records, payment methods and messages are fictional. The AI brief is a fixed, editable simulation. Nothing is sent to clinical, payment, advertising, email or SMS providers.

## Run

```sh
npm ci
npm run dev
```

Open [the patient experience](http://127.0.0.1:5174/). Build with `npm run build`; run the 33 state, integration, and viewport regression tests with `npm test`.

## Review

- **Patient experience `/`:** the default flow, without review rails. Fit and goal choices advance directly; conditions support multiple native-checkbox selections. Personal details come before email and phone.
- **Preview controls:** the footer outside the patient surface opens a simulation dialog. After booking, advance to appointment day; during the visit, advance the conversation, then send the simulated clinician completion signal. The full journey is accessible in patient mode.
- **Full review `/?review=1`:** [open the reviewer view](http://127.0.0.1:5174/?review=1) for chapter navigation and the following tools. Switching modes preserves the current local journey.
- **The flow:** jump to any screen with explicit fictional fixtures. Jumping replaces the review path; it does not complete skipped steps.
- **Recovery:** slot contention, pending or unmatched coverage, unavailable records, payment retry, interrupted visit, and failed save.
- **Mock activity:** inspect the sanitized local service ledger.
- **Use sample details:** fills fictional personal details without accepting agreements or records consent.
- **Restart preview:** clears this preview's progress.

Progress persists in this browser's local storage. This is not a production patient portal or a secure place for real health information. The app needs no environment variables or vendor accounts.

The interface uses Legion's public logo and locally bundled Inter, white backgrounds, and its blue/ink palette. Shared actions keep a stable label and size while busy. Three authentic captured testimonials rotate every nine seconds, stop after manual selection, respect reduced motion, and hide when space or the keyboard requires it. There is no pause button. Screen content transitions while action buttons remain steady. Insurance accepts any nonempty demo member ID and shows checking, estimated benefits, or an unresolved recovery state. [The current design reference](../docs/design/brand-correction-reference.png) is an internal concept, not an approved final design.

See [journey rationale](../docs/redesigned-journey.md), [architecture and production boundaries](../docs/prototype-architecture.md), and [verification](../docs/prototype-qa.md).
