# Five-minute walkthrough: outline

Draft for David's recording. Times are targets. Everything shown is the prototype on a phone-sized window, with Preview tools used only to skip waiting.

## The problem, in Legion's own numbers (0:00 to 0:30)

- 5,898 sessions start; 1,403 reach the payment page. Three steps hold 75% of the loss: the six fit questions (34.8%), choosing a provider on a page that runs about 3,900 pixels on a phone (36.6%), and account creation (20.4%).
- Nothing measures whether a booked patient completes a first visit, which is the brief's endpoint and where revenue and care begin.
- Legion's stated direction is autonomous care, and its Utah agreement already lets its AI renew some prescriptions under phased review. Onboarding is the first time a patient meets that AI.

## Demo: one conversation, the patient taps, Wren does the work (0:30 to 2:45)

1. **A person-like assistant, honestly disclosed.** "Hi, I’m Wren" in a messaging header. The first card says once, plainly, that Wren is an AI, not a person, and that clinicians make every decision (Texas HB 149).
2. **Story, not screening.** Conditions as Legion's real choices, or "in my own words" with a read-back the patient confirms. Three logistics checks in one tap. The live fit check's safety question, worded so yes means safe ("Are you safe right now?"): "No, I don’t feel safe / Not sure" ends with crisis resources, as it does today. No screening is added.
3. **Matching with receipts.** The work card shows how the directory narrowed; the best fit and three real evening times are visible immediately. Tap a time: held, not booked.
4. **Four typed fields on the happy path.** Phone, code, birth date, then "Is this you?" from the identity network. Coverage was verified while the patient typed their email: plan, network, $25 estimate, source. Sohar finds the plan for only about 55% of commercial requests, so when it misses, Wren asks right away for the member ID from the card (Preview tools: "No plan found").
5. **Agreements in plain language,** unchecked, with AI note-taking as a separate switch. Card on file, nothing charged. Booked is its own step.
6. **Edit anything.** Change availability from evenings to mornings: matching re-runs, the evening hold is let go with a stated reason, and only the dependent steps are asked again.
7. **Preparation that's useful and finite.** Records found, a medication and allergy confirmed against the pharmacy record, and a brief the patient approves (with what the clinician will see).
8. **After booking, Wren stays.** Wren offers to bring the chart from MyChart, in the chat. The actions sit in a grid, all visible: tap "When is my visit?", type a question, message Dr. Chen and watch the care team's reply arrive in the thread.
9. **Visit day** (Preview: skip). Reminder, check-in, the waiting room, the visit, a clinician-signed plan with the refill sent to the saved pharmacy through DoseSpot, follow-up booked, "first visit complete."

## Under the hood (2:45 to 3:45)

- The transcript is computed from journey state: editing, resume and an agent-ready question graph all fall out of that one decision.
- Deterministic rails for eligibility, safety, consent and booking; AI only at the edges (reading free text, answering in-scope questions, drafting the brief), behind one contract, with a local crisis check first.
- Every vendor is a typed call on one mock API, with a response time, a logged request and a failure you can switch on in Preview tools (show one: "Calendars don't answer", then Try again).
- Vendors choreographed to hide latency: Verified finds the person, Sohar finds and verifies coverage behind the next question, Metriport after booking with permission, Persona only on the controlled-medication path, DoseSpot pharmacy before any prescription.
- Synthetic patients and a labeled language eval set, run by `npm test`: risk in any free text, the safety answers, minors on both details paths, out of state, Medicare, prompt injection, lapsed holds, and a golden path to a completed visit. Tell the honest story: an adversarial review found that an iPhone's curly apostrophe ("don’t want to be alive") slipped past the crisis check. It's now normalized, and every variant is in the eval set.
- Show the care-team queue: every follow-up a person owns, with a due time. That's where ops cost per visit lives.
- Show the clinician view: AI-drafted, review required, sources and data gaps.

## The agentic future, without overclaiming (3:45 to 4:30)

- Patients learn to delegate safely at low-stakes edges: honest identity, permission before acting, receipts, clinician sign-off, a person always reachable.
- Autonomy can move one task at a time behind evidence gates (Legion's own Utah phases), while the patient experience stays the same.
- The same graph can be offered to a patient's own AI assistant with consent; Legion's rails still run.

## Measurement and what's next (4:30 to 5:00)

- North star: first visits completed by the clinician within 30 days per eligible start (a start that passed the fit check). Ship as an experiment against the screen baseline; guardrails on crisis routing, exit mix, time to book, no-shows, and ops minutes per patient. Preview tools shows the PostHog events as they fire: Legion's current event names where a step still exists, plus what today's funnel can't see, from `payment_method_saved` and `appointment.booked` to `portal.onboarding.first_visit_completed`, with no answers or contact details in any event.
- Next: turn on the live model (an API key in Vercel; the endpoint is built), Legion's real policies (cancellation window, visit length, Schedule II workflow), and a measured pilot.
