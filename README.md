# Legion Health Assignment

Founding Product Manager take-home assignment: rethink patient onboarding from initial intake through completion of the first visit.

Research, journey documentation, and implementation will be developed on a separate branch and submitted for review in an open pull request.

## Current phase: Wren, Legion's conversational onboarding

The prototype now opens as **one conversation with Wren, Legion’s virtual assistant, from hello to a clinician-completed first visit**. Patients mostly tap; Wren does the work in the background (finding their details, checking coverage, ranking clinicians with reasons, holding and booking a time, gathering records, drafting a brief for the clinician) and every action leaves a receipt. Licensed clinicians make every medical decision, safety rules are deterministic, a person on the care team owns every follow-up, and any answer can be changed. Safety screening is Legion’s live fit-check question, worded so “yes” means safe, with nothing added. Claude is used only where language varies: it reads the patient’s own words in any language, answers typed questions (medication questions included) from the patient’s regimen and plan, drafts the clinician’s brief, and gives the care team a first draft of each reply. Wren’s scripted questions stay scripted.

- [Design proposal: Wren onboarding](docs/chat-onboarding-design.md)
- [Language evals: crisis detection and read-back accuracy](docs/language-evals.md)
- [Event tracking: the PostHog plan, through the first completed visit](docs/event-tracking.md)
- Run locally from `prototype/` with `npm run dev`, then open `http://127.0.0.1:5174/`.
- **Preview tools** (top of the rail on desktop, or Help on mobile; hidden with `?preview=0`) jump to any moment, trigger recovery scenarios, and show the simulated texts and emails, the funnel events as they fire, and the agent-ready question graph.
- **Care team view** (a header button on desktop windows 1024 px and wider; hidden with `?preview=0`) opens beside the chat with two tabs. Inbox: each patient message with Claude's category, one-line summary and draft reply, an owner and due time from fixed rules, and Send reply, which puts the edited reply in the patient's thread, signed by the clinician for medication and clinical messages and by the care team otherwise; the care-team queue sits below. Clinician: the brief and chart the clinician reviews, with the reason Claude drafted.
- Wren's language work goes through one endpoint, `api/assistant.ts` (Claude Opus 5.5 at low effort), with four tasks: story, question, brief and triage. `ANTHROPIC_API_KEY` is set in Vercel for Production and Preview. Under `npm run dev` there's no endpoint, so the keyword readers in `src/chat/guide-ai.ts`, Legion's stated policies and the booking's own facts answer instead, as they do when a call fails or runs long. The endpoint answers only the site's own pages, allows 40 calls per caller per 10 minutes and caps each reply's length; production would add Vercel Firewall rate limiting and a spend limit on the key.
- Each demo patient has a fixed, fictional regimen for the conditions they chose (`REGIMENS` in `src/model/fixtures.ts`). It arrives as pharmacy fill history in the Metriport records step and feeds the reconciliation, the brief, MyChart, the clinician view, the signed plan (one DoseSpot prescription per medication) and Claude's context.
- The approved screen-based baseline (`baseline-v1`) remains at `?experience=classic`, and its review mode at `?review=1`.
- `npm test` runs the baseline suites plus the conversation engine, inventory, reconciliation, background-job, language-eval and synthetic-patient safety suites, and the Claude tasks (endpoint, story, brief, triage, patient context) with the model stubbed.

Everything is simulated: providers, appointments, insurance, records, payments, messages and the visit itself. The one real service is Claude, behind `api/assistant.ts`.

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
