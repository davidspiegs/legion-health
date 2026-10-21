# Legion Health Assignment

Founding Product Manager take-home assignment: rethink patient onboarding from initial intake through completion of the first visit.

Research, journey documentation, and implementation will be developed on a separate branch and submitted for review in an open pull request.

## Current phase: Wren, Legion's conversational onboarding

The prototype now opens as **one conversation with Wren, Legion’s virtual assistant, from hello to a clinician-completed first visit**. Patients mostly tap; Wren does the work in the background (finding their details, checking coverage, ranking clinicians with reasons, holding and booking a time, gathering records, drafting a brief for the clinician) and every action leaves a receipt. Licensed clinicians make every medical decision, safety rules are deterministic, a person on the care team owns every follow-up, and any answer can be changed. Safety screening is Legion’s live fit-check question, unchanged.

- [Design proposal: Wren onboarding](docs/chat-onboarding-design.md)
- [Language evals: crisis detection and read-back accuracy](docs/language-evals.md)
- Run locally from `prototype/` with `npm run dev`, then open `http://127.0.0.1:5174/`.
- **Preview tools** (top of the rail on desktop, or Help on mobile; hidden with `?preview=0`) jump to any moment, trigger recovery scenarios, and show the simulated inbox, the clinician's view of the intake with the care-team queue, the funnel events as they fire, and the agent-ready question graph.
- Typed questions after booking are answered by `api/assistant.ts` (Claude Opus 5.5) when `ANTHROPIC_API_KEY` is set in the deployment; locally and without a key, the app answers from Legion's stated policies. The endpoint answers only the site's own pages, rate-limits each caller and caps reply length; set a spend limit on the key when you add it.
- The approved screen-based baseline (`baseline-v1`) remains at `?experience=classic`, and its review mode at `?review=1`.
- `npm test` runs the baseline suites plus the conversation engine, inventory, reconciliation, background-job, language-eval and synthetic-patient safety suites.

Everything is simulated: providers, appointments, insurance, records, payments, messages and the visit itself.

### Baseline: screen-based first-visit flow

The mobile-first baseline in [prototype/](prototype/README.md) covers intake through a simulated completed first visit, then optional follow-up care.

- [Redesigned journey and rationale](docs/redesigned-journey.md)
- [Mock architecture and production boundaries](docs/prototype-architecture.md)
- [Prototype verification](docs/prototype-qa.md)

## Current journey research

Open [the HTML canvas](canvas/index.html) directly in Chrome, or serve this folder with `python3 -m http.server 4173 --bind 127.0.0.1` and visit `http://127.0.0.1:4173/canvas/`.

The board contains desktop and responsive mobile captures, documented route/event mappings, all eleven historical funnel milestones, and a Technical audit lane mapping observed services to proposed mocks. Drag to pan, use the zoom controls, and click any screenshot to inspect it.

- [Assignment understanding](docs/assignment-understanding.md)
- [Current UX findings and recommendations](docs/ux-findings.md)
- [Updated UX priorities](docs/ux-priorities.md)
- [Fresh-session technical audit](docs/technical-audit.md)
- [Runtime events and advertising evidence](docs/runtime-telemetry.md)
- [Integration options and proposed mocks](docs/integration-options.md)
- [Capture status and evidence boundaries](docs/capture-status.md)
- [Complete telemetry reference](docs/telemetry-reference.md)

The original 30 screenshots stop at blank Basic Info. A later private-session audit reached payment after David personally reserved and created his account. No payment was submitted by the agent. Only sanitized findings are retained; raw HAR exports are excluded. The prototype is a separate review artifact built after feedback on this canvas and audit.
