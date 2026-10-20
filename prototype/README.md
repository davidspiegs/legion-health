# Legion first-visit flow prototype

A working mobile-first design review: intake → provider/time → personal details → confirmed booking → preparation → simulated first visit → care plan and follow-up.

All providers, appointments, service calls, records, payment methods and messages are fictional. The AI brief is a fixed, editable simulation. Nothing is sent to clinical, payment, advertising, email or SMS providers.

## Run

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5174/`. Build with `npm run build`; run the 14 state/integration contract tests with `npm test`.

## Review

- **Review flow → The flow:** jump to any screen with explicit fictional fixtures.
- **Recovery:** slot contention, pending coverage, unavailable records, payment retry, interrupted visit, and failed save.
- **Mock activity:** inspect the sanitized local service ledger.
- **Use sample details:** fills fictional personal details without accepting agreements or records consent.
- **Restart preview:** clears this preview's progress.

Progress persists in this browser's local storage. This is not a production patient portal or a secure place for real health information. The app needs no environment variables or vendor accounts.

See [journey rationale](../docs/redesigned-journey.md), [architecture and production boundaries](../docs/prototype-architecture.md), and [verification](../docs/prototype-qa.md).
