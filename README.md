# Legion Health Assignment

Founding Product Manager take-home assignment: rethink patient onboarding from initial intake through completion of the first visit.

Research, journey documentation, and implementation will be developed on a separate branch and submitted for review in an open pull request.

## Current phase: working flow prototype

**[Open the protected Vercel preview](https://legion-health-assignment-f6bnnvot0-davidspiegs-projects.vercel.app)**

Patient flow opens by default. Use the footer’s **Preview controls** to advance the simulated appointment day and clinician activity, or open [the full journey review](https://legion-health-assignment-f6bnnvot0-davidspiegs-projects.vercel.app/?review=1).

The mobile-first prototype is in [prototype/](prototype/README.md). It covers intake through a simulated completed first visit, then optional follow-up care.

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
