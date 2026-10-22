# Five-minute walkthrough: outline

Draft for David's recording. Times are targets. Everything shown is the prototype on the deployed preview, where Claude is live, in a desktop window so the care team view can open beside the chat. Preview tools are used only to skip waiting.

## The problem, in Legion's own numbers (0:00 to 0:30)

- 5,898 sessions start; 1,403 reach the payment page. Three steps hold 75% of the loss: the six fit questions (34.8%), choosing a provider on a page that runs about 3,900 pixels on a phone (36.6%), and account creation (20.4%).
- Nothing measures whether a booked patient completes a first visit, which is the brief's endpoint and where revenue and care begin.
- Legion's stated direction is autonomous care, and its Utah agreement already lets its AI renew some prescriptions under phased review. Onboarding is the first time a patient meets that AI.

## Demo: one conversation, the patient taps, Wren does the work (0:30 to 3:00)

1. **A person-like assistant, honestly disclosed.** "Hi, I’m Wren" in a messaging header. The first card says once, plainly, that Wren is an AI, not a person, and that clinicians make every decision (Texas HB 149).
2. **Story, in the patient's own words.** Tap "in my own words" and type a few lines in Spanish about constant worry and nightmares since a car accident. Claude reads them into Legion's real choices, and the read-back comes back in Spanish ("Esto es lo que entendí: …") for the patient to confirm. Three logistics checks in one tap, then the live fit check's safety question, worded so yes means safe. No screening is added.
3. **Matching with receipts.** The work card shows how the directory narrowed; the best fit and three real evening times are visible immediately. Tap a time: held, not booked.
4. **Four typed fields on the happy path.** Phone, code, birth date, then "Is this you?" from the identity network. Coverage was verified while the patient typed their email: plan, network, $25 estimate, source. When Sohar misses, Wren asks right away for the member ID from the card.
5. **Agreements in plain language,** unchecked, with AI note-taking as a separate switch. Card on file, nothing charged. Booked is its own step.
6. **Edit anything.** Change availability from evenings to mornings: matching re-runs, the evening hold is let go with a stated reason, and only the dependent steps are asked again.
7. **Preparation that's useful and finite.** Records come back with the pharmacy's fill history of the regimen that goes with the patient's conditions (for anxiety and PTSD, sertraline 100 mg and prazosin 2 mg at bedtime; a patient without ADHD keeps the stimulant ID check out of the demo), and Wren asks them to confirm it and the allergy. Claude drafts the brief's reason for the visit, in English with a few of the patient's own Spanish words, and what to cover, both marked "Drafted by Wren". Medications and allergies stay facts from their sources. The patient approves.
8. **After booking, Wren stays, and so does the care team.** Wren offers to bring the chart from MyChart, in the chat. Message Dr. Chen a medication question, then open **Care team view**: Claude sorted it, summed it up in a line and drafted a reply; the owner (Dr. Chen) and due time (today) come from fixed rules. Edit a word, send, and the reply lands in the patient's thread under their message, signed Dr. Chen. The Clinician tab shows the brief with the reason Claude drafted.
9. **Visit day** (Preview: skip). Reminder, check-in, the waiting room, the visit, and a clinician-signed plan that continues the regimen, one DoseSpot prescription per medication to the saved pharmacy. Follow-up booked, "first visit complete."
10. **A medication question after the visit.** Type "I forgot my sertraline this morning, can I still take it tonight?" Claude answers from the patient's regimen and plan, with a small "AI answer" caption under the reply. Ask to raise a dose, and Wren explains what's involved and offers to message Dr. Chen, who makes the change.

## Under the hood (3:00 to 3:50)

- The transcript is computed from journey state: editing, resume and an agent-ready question graph all fall out of that one decision.
- Deterministic rails for eligibility, safety, consent and booking, and Wren's scripted questions stay scripted. Claude runs only where language varies: four tasks on one endpoint (story, question, brief, triage), each with a strict JSON schema, Opus 5.5 at low effort, roughly a few cents per patient. The local crisis check runs first; Claude can add a crisis flag but never clear one. Every call has a local fallback, so a slow or missing model never stalls the conversation.
- Every vendor is a typed call on one mock API, choreographed to hide latency: Verified finds the person, Sohar finds and verifies coverage behind the next question, Metriport after booking with permission, Persona only on the controlled-medication path, DoseSpot pharmacy before any prescription. Each has a failure you can switch on in Preview tools.
- Synthetic patients and a labeled language eval set, run by `npm test`, plus the Claude tasks tested with the model stubbed. Tell the honest story: an adversarial review found that an iPhone's curly apostrophe ("don’t want to be alive") slipped past the crisis check. It's now normalized, and every variant is in the eval set. The set measures the keyword floor; Claude itself hasn't been evaluated yet.

## The agentic future, without overclaiming (3:50 to 4:30)

- Patients learn to delegate safely at low-stakes edges: honest identity, permission before acting, receipts, clinician sign-off, a person always reachable.
- Autonomy can move one task at a time behind evidence gates (Legion's own Utah phases), while the patient experience stays the same. The care team inbox is the pattern: Claude drafts, a person sends, and how often a draft goes out unedited, by category, is the evidence for changing how much review it needs.
- The same graph can be offered to a patient's own AI assistant with consent; Legion's rails still run.

## Measurement and what's next (4:30 to 5:00)

- North star: first visits completed by the clinician within 30 days per eligible start (a start that passed the fit check). Ship as an experiment against the screen baseline; guardrails on crisis routing, exit mix, time to book, no-shows, and ops minutes per patient. Preview tools shows the PostHog events as they fire: Legion's current event names where a step still exists, plus what today's funnel can't see, from `payment_method_saved` and `appointment.booked` to `portal.onboarding.first_visit_completed`, and `care_team.reply_sent {edited}` for the drafts, with no answers or contact details in any event.
- Next: evals of Claude against the labeled set and against clinician-labeled real text, Legion's real policies (cancellation window, visit length, Schedule II workflow), and a measured pilot.
