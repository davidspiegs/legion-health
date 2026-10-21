# Wren: one conversation from hello to a completed first visit

Design proposal, October 21, 2026. Builds on the approved screen-based baseline (`baseline-v1`). The prototype lives in `prototype/src/chat/` and is the default experience on the `design/chat-onboarding` branch; the baseline remains at `?experience=classic`. Every service, clinician, appointment and payment is simulated.

## 1. The idea in one paragraph

Legion says it is building autonomous medical care, starting with psychiatry, and in March 2026 it signed a Utah agreement that lets its AI renew certain psychiatric maintenance prescriptions under phased clinician oversight. Its patient-facing AI there is called Legion AI. In Texas today, clinicians make every medical decision and AI runs the administration, with human assistants still doing much of intake by hand. Onboarding is the first time a patient meets Legion's AI. This design makes that first meeting a single, calm conversation with **Wren, Legion’s virtual assistant**, in which **the patient mostly taps and Wren does the work**: it finds their details, finds and verifies their coverage, ranks clinicians with visible reasons, holds a time, books it, gathers records, drafts a brief for the clinician, checks them in, and follows through to a clinician-completed first visit and plan. Every action leaves a receipt, every medical decision belongs to a named clinician, and safety rules are deterministic code, not model judgment. The conversion goal and the strategic goal are the same: earn calibrated trust at the low-stakes edges of care, so autonomy can grow later without redesigning the experience.

## 2. What the brief asks, and what the data says

- **Ask:** rebuild patient onboarding for an AI-native world, ending at the **first completed visit**, not booking. Deliver a deployed prototype, repo plus open PR, a five-minute walkthrough of decisions and tradeoffs, and the complete AI interaction history. Mocked vendors are fine (confirmed by Yash).
- **Funnel (30 days to Aug 29, 2026, same-session):** 5,898 starts reach 1,403 payment-page sessions (23.8%). Three transitions hold 75% of the observed loss: fit → conditions (1,912, 34.8%), match page → provider selected (1,104, 36.6%), patient details → account created (360, 20.4%). No payment-success or visit-completed event exists, so the outcome Legion cares about is unmeasured. About 29% of start sessions carried campaign attribution, so conversion is directly a cost-of-acquisition lever.
- **Role signal:** the Founding PM job description names first-visit completion, time to care, patient confusion, support burden, no-shows and ops cost per visit as owned metrics, and asks for "clear boundaries around what AI does, what doctors do, and when humans review or intervene."

## 3. Principles

1. **Conversation, not a form.** Tap first; type only where no system can supply the answer. One decision per turn. Any answer can be changed.
2. **Wren does the work, visibly.** Background work (matching, holds, identity, coverage, records, booking, briefs) appears as work cards with a status line and a receipt naming the source. This is the one place the design spends its boldness.
3. **Calibrated trust, without AI in the patient's face.** The assistant has a name, Wren, and the header always says "Legion’s virtual assistant". The first card states plainly, once, that Wren is an AI system and not a person, before the first question (Texas HB 149 asks for clear disclosure; it doesn't ask for "AI" on every line). Clear lines: what Wren does, what the clinician decides, when a person steps in. A messaging-app feel does the rest: a real header, a typing indicator, answers in the thumb zone, and an assistant that stays available after booking.
4. **Safety by construction.** Risk questions are fixed, tappable components. A local crisis check runs on everything the patient writes in their own words (their story, "Other", notes, medication and allergy answers, brief edits, Help questions) before anything else. Risk is never erased, and after booking it never takes the visit away. Stops are warm and specific, never dead ends.
5. **Through the first completed visit.** Booking is the midpoint. Preparation, reminders, check-in, the visit, the plan and the follow-up are part of onboarding, and only the clinician can complete the visit.

## 4. The experience

Progress is four named chapters that run through the first visit: **Your story → Your clinician → Booking → Your first visit**. The header shows the chapter and how many quick steps remain before booking; it never shows "100%" before confirmation (the live payment page does).

| Chapter | What happens | Typed inputs |
| --- | --- | --- |
| Your story | Disclosure and acknowledgment. Conditions as Legion's seven live choices (multi-select, icons), or "Tell me in my own words" with a read-back for confirmation. Goal. One combined check (18+, in Texas for visits, video works). The live fit check's safety question, worded so yes means safe (yes; no or not sure). Recent hospitalization. | None (own words optional) |
| Your clinician | Payment method with self-pay price shown up front (Medicare/Medicaid folded in). Insurer as one tap, or "Find it for me". When the patient can meet. A matching work card shows how the directory narrowed (licensed in Texas → focus → network → availability). The best fit and two alternates, each with grounded reasons and three real times visible immediately. Tapping a time holds it for 15 minutes; nothing is booked yet. | None |
| Booking | Mobile number, then a code, then date of birth. Legion AI finds name, address and sex at birth (Verified, simulated) for the patient to confirm. Email. Coverage was checked in the background while the patient typed; the result appears with plan, network, estimated cost and source. Agreements in plain language with unchecked boxes; AI note-taking is a separate optional switch. A card on file, nothing charged today. Booking is its own confirmed step. | Phone, code, birth date, email |
| Your first visit | Optional prep: records request (Metriport, simulated) with medication and allergy reconciliation against what was found, pharmacy confirmation, an optional note, and a drafted brief the patient reviews (or chooses not to send). ID verification is offered only when a controlled medication is being discussed. Reminders, a visit-day check-in (location, callback, device), the simulated video visit, a clinician-signed plan, follow-up booking, and a "first visit complete" milestone. | Optional note |

**Typing budget.** Four typed fields on the happy path, all with native keyboards and autofill: phone, one-time code (autofill), birth date and email. Name, address, sex at birth, insurer and member ID are found and confirmed. The live Basic Info form asks for name, email, phone, birth date and a referral source before payment; the baseline asked for name, birth date, address, member ID, email and phone across eleven fields.

**Editing.** Every patient answer is a button. Tapping it reopens the same control pre-filled, with "Keep my answer." Because the transcript is computed from state (section 7), a change re-derives everything below it: answers that still apply stay, and only invalidated steps are asked again. Choosing the same answer again just closes the change. Safety answers are the exception: a risk answer can be raised but not taken back in chat, because a person on the care team should resolve it. Coverage and holds re-run when their inputs change. A hold that runs out while the patient finishes paperwork is renewed at booking if the time is still open; if someone took it, the conversation returns to choosing a time with everything else kept. The journey sheet (tap the progress bar, or the rail on desktop) lists every answer with a Change button, every receipt, and revocable choices (AI notes, text reminders).

**After booking, the conversation stays open.** When there's nothing to answer, the dock offers one-tap requests that change with the stage: when is my visit, help me get ready, reschedule, message the clinician, what will I pay, get support, and after the visit: my care plan, book a follow-up, prescription question. A "Message Wren" composer sits under them, and "Something else?" reaches the same options in the middle of a question. One-tap requests are answered from the booking itself. Typed questions go to the model endpoint after the local crisis check. Messages to the care team appear in the thread, and so do their replies. Visit day always has a next step: check-in, the time it opens, or rescheduling.

**Help** is in the same place on every screen: crisis lines first (988 call, text and chat, 911, Spanish), then "Ask a question" (answered from Legion's stated policies; clinical questions are noted for the clinician, never answered), then reaching a person.

## 5. Funnel hypotheses (to test, not claims)

| Live drop | What this design changes | How we'd know |
| --- | --- | --- |
| Fit → conditions, 34.8% | Lead with the patient's reason for coming, not six screening questions. Three logistics checks in one tap. The safety question stays as Legion asks it today. Specific, warm off-ramps with a next step. | Separate eligible continuation from appropriate exits using a fit-outcome event with reason codes. A drop in exits alone is not success. |
| Match → provider selected, 36.6% | The live match page was about 3,900 px tall on mobile, with the first provider about 1,230 px down. Here the best fit, reasons and three times are visible immediately, filtered to when the patient said they're free. "More times" and "Other clinicians" are one tap. | Offers shown → time chosen, split by supply (no fitting openings) versus choice. |
| Patient details → account, 20.4% | Context retained (held time visible), four typed fields instead of ten, details found rather than typed, consent unbundled and plain. | Autofill hit rate, manual-fallback completion, time from hold to booked. |
| Booked → completed (unmeasured) | Preparation that's useful and finite, two-way reminders, a check-in that catches location and device problems early, a waiting room that explains delays, reconnect without losing the visit. | Show rate, check-in completion, visits completed by the clinician within 30 days of start. |

The evidence on chat versus forms is mixed: people tend to prefer chat and disclose more to it, but it can be slower. This design engineers speed back in (chips, auto-advance, prefill, no fake typing) and should ship as an experiment against `baseline-v1`, not as an assumed win.

## 6. What Wren does, what the clinician decides, when a person steps in

| Task | Today in this design | Human role | What would move it |
| --- | --- | --- | --- |
| Intake questions, read-back of the patient's own words | Wren asks; deterministic rules decide eligibility | Coordinator reviews flagged exits | Measured read-back accuracy |
| Clinician matching | Wren ranks with stated reasons; the patient chooses | Patient decides | Selection and retention by match reason |
| Coverage and cost | Wren finds and verifies; pending or unmatched never becomes self-pay silently | Care team handles payer exceptions | Discovery hit rate, estimate accuracy against claims |
| Booking, reminders, rescheduling | Wren books within the patient's choices | Patient approves each change | No-show and reschedule outcomes |
| Records and medication reconciliation | Wren requests with permission and asks the patient to confirm each finding | Clinician reviews | Patient correction rate |
| Visit brief | Wren drafts with sources and data gaps; the patient approves | Clinician reviews every AI-created record (Texas SB 1188) | Clinician edit rate on briefs |
| Risk screening | The live fit check's one question, plus crisis lines when someone types crisis words. "No, I don’t feel safe / Not sure" shows the crisis card and pauses booking, as today | Clinician assesses; a person owns every follow-up | Never autonomous |
| Questions after booking | One-tap requests answered from the booking itself; typed questions answered by a model under fixed rules (logistics only, never clinical advice), after the local crisis check | Clinical questions go to the clinician; messages go to the care team, whose replies show in the thread | Answer quality and escalation rate |
| Care-team queue | Wren files each follow-up with a due time: same-day risk check-ins, safety callbacks, coordinator calls, "Not great" after the visit | A person on the care team acts | Task volume and minutes per patient (ops cost per visit) |
| Diagnosis, treatment, prescriptions | Not done by AI | Clinician decides with the patient | Requires law, evidence and Legion's own phased gates (Utah used 250 pre-reviewed, then 1,000 post-reviewed renewals at >98% and >99% agreement) |

The patient experience stays the same as autonomy changes: same guide, same receipts, same escalation. What changes is the approval policy attached to a step, which is auditable configuration rather than a redesign.

## 7. Platform design

**The transcript is a projection of journey state, never a stored log.** The conversation is a typed script of nodes (`src/chat/script.ts`). Each node declares its chapter, when it applies, what the agent says, its input type, how an answer patches state, and a "why I ask" line. `deriveTranscript(script, state)` walks the nodes: answered nodes render their messages and the patient's answer, and the first unanswered node becomes the active question. Consequences:

- Editing is a state change; the reducer's existing invalidation rules (eligibility belongs to its inputs, consent resets when cost terms change) plus a small chat-level reconciliation keep downstream steps honest.
- Reload resumes exactly where the patient was, with nothing replayed.
- The same graph can render as chat, as screens, or be exposed to a patient's own AI assistant (an MCP-style endpoint) with consent, while disclosure, risk screening and consent still happen in Legion's interface. The preview's "Agent-ready intake" panel shows the graph as JSON without patient data.

**Deterministic rails, AI at the edges.** Eligibility, safety, consent and booking logic are code. Language work is behind one contract (`src/chat/guide-ai.ts`): read the patient's own words into intake choices with a confirmation, answer in-scope questions from stated policy, and draft the brief. The preview ships a deterministic interpreter so it works offline and predictably; a model-backed adapter can replace it behind the same contract. A local crisis check always runs first.

**Agent jobs with receipts.** Each background action (`src/chat/agent.ts`) updates a job status rendered as a work card and appends a receipt (actor, action, source, time). Receipts never contain answers, conditions or free text. Jobs re-check their inputs after every wait, and each belongs to one conversation generation, so a restart, a preview jump or a changed answer is never overwritten by stale work. A held time is only released with a stated reason.

**Latency hidden behind questions.** Coverage discovery and verification start when the patient confirms their details and finish while they type their email (Sohar documents results in about 30 seconds). Matching shows its narrowing while it runs. A pending result is shown as pending, with explicit choices.

**Booking states stay separate.** Selected, held, card saved, booked, checked in, joined, completed and plan published are distinct. A saved card is not a booking, joining is not completion, and only the simulated clinician can complete the visit.

**Inventory never goes stale.** Appointment times are generated relative to today in Central Time, with stable ids and correct daylight-saving offsets, so a reviewer opening the preview in November still sees future times.

## 8. Safety and compliance built in

| Requirement | Where it lives |
| --- | --- |
| AI disclosure, clear and conspicuous, before use (Texas HB 149; Legion's Utah pattern) | The first card says once, in plain words, that Wren is an AI system, not a person, and the header's role line ("Legion’s virtual assistant") stays on screen |
| Clinician review of AI-created records, and disclosure (Texas SB 1188) | Brief labeled "AI draft"; clinician view states review is required |
| Separate male/female sex-at-birth field (SB 1188) | Identity confirmation, with a note that gender identity is shared separately |
| No AI therapeutic communication; no emotion inference | Acknowledgments are one specific line; the read-back summarizes content, not feelings |
| Crisis protocol | Deterministic crisis card (988 call, text, chat, Spanish; 911) with an optional same-day callback from a Legion clinician. It shows for "No, I don’t feel safe / Not sure" on the safety question, which pauses booking as the live flow does. Crisis words typed anywhere show the crisis lines and note the words for the care team; nothing pauses after booking (`src/chat/safety.ts`) |
| Notice of Privacy Practices acknowledgment (HIPAA, 45 CFR 164.520) | Agreements, for every patient |
| Good Faith Estimate notice for self-pay patients (No Surprises Act) | Agreements, when paying out of pocket |
| Biometric consent before a face scan (Texas CUBI) | ID verification consent step |
| Schedule II stimulants need a physician in Texas outpatient care | On the ADHD medication path (starting or continuing care), the clinician card says a Legion psychiatrist reviews and writes stimulant prescriptions, before any time is held; the controlled-medication agreement repeats it; ID verification is offered only on that path |
| Primary care report for certain telemedicine modes (Texas Occ. Code §111.005) | Preparation asks about a primary care doctor and whether to share a visit summary; which modality triggers the requirement is an open question |
| No answers to analytics or advertising | Receipts and events carry ids and outcomes only |

**Synthetic patients.** `src/chat/safety.test.ts` drives the real script and simulated services with scripted patients. Risk in the patient's own words shows the crisis lines and the conversation goes on; "No, I don’t feel safe / Not sure" on the safety question stops with crisis resources and can be changed back, like the funnel's back button; risk in a note after booking keeps the visit and queues a same-day check-in; out of state, Medicare or Medicaid, recent hospitalization and a birth date under 18 (on either details path) end warmly. A prompt-injection case confirms typed instructions change nothing but the text. A golden path runs an insured patient from hello to a clinician-completed visit. A labeled language eval set (`src/chat/language-eval.test.ts`, described in `docs/language-evals.md`) measures crisis recall, idiom false positives and story read-back accuracy; it is the bar any model behind the same contract has to clear. Today it catches 171 of 171 crisis sentences with no false alarms on 174 hard negatives, and reads 100 of 100 stories correctly. On four held-out rounds written after the patterns were frozen, it caught 46 of 70 crisis phrasings on first run (66%). That is why the pattern check is a floor under the safety question and a same-day human read, never the safety system on its own.

## 9. Integrations and what each adds

| Source | Role in this design | Status |
| --- | --- | --- |
| Verified 1-Click Signup | Phone plus birth date returns name, address and sex for confirmation | Simulated; optional per brief |
| Sohar | Discovery (name, birth date, state) finds payer and member ID; verification returns network status, copay and deductible | Simulated; in use at Legion |
| Metriport | Records from health networks, pharmacies and labs, with permission | Simulated; in use at Legion |
| DoseSpot | Pharmacy on file and medication history for the clinician; prescriptions remain the clinician's action | Pharmacy confirmation built; prescribing not shown |
| Persona | Photo ID and selfie, offered only when a controlled medication is discussed | Simulated; optional per brief |
| Stripe | Card on file (SetupIntent-shaped), bank authentication, nothing charged today | Simulated |
| Healthie | Likely upstream scheduling and records (from the audit) | Behind the scheduling adapter |

## 10. Measurement

- **North star for onboarding:** first visits completed by the clinician within 30 days, per eligible start, reported on matured cohorts. Completion comes from the encounter system, never a client event.
- **Funnel:** started → story answered → eligible → offers shown → time held → account → coverage resolved → card saved → booked → prep engaged → checked in → joined → completed → plan published → follow-up booked. Keep the August same-session funnel reproducible beside it.
- **Events (no answer values or free text):** `chat.node_shown`, `chat.answer_submitted {input_mode}`, `chat.answer_edited {invalidated_count}`, `agent.job {job, status, duration_bucket}`, `fit.outcome {reason_code}` (restricted), `safety.crisis_shown {source}` (restricted), `match.offers_shown`, `slot.held`, `account.created {method}`, `payment.method_saved`, `appointment.confirmed`, `visit.checked_in`, `visit.completed` (server), `care_plan.published`.
- **Experiment:** randomize new starts between chat and `baseline-v1`, stratified by device and campaign traffic. Guardrails: crisis routing within one turn, exit-reason mix, median time to book, support contacts, no-show rate, and AI quality (read-back corrections, brief edit rate).
- **Ops cost per visit:** human minutes per onboarded patient, which is where an AI-native front door should show up first. The care-team queue is the unit: every task a person owns, with its due time.
- **In the preview:** the conversation records `onboarding_started`, `step_answered {node}`, `answer_changed {node}`, `safety_answered {level}` (restricted), `visit_booked`, `checked_in`, `first_visit_completed` and `care_plan_published`, with node ids only, and Preview tools shows them live.

## 11. What is real and what is simulated

Real in the prototype: the conversation engine, editing and invalidation, eligibility and safety rules, the crisis check, matching over a fictional directory, Central Time inventory, state persistence and resume, the full simulated booking-to-completion lifecycle reused from the baseline's services, and the test suites. Simulated: every vendor (Verified, Sohar, Metriport, Persona, Stripe), the clinician and the video visit, notifications, the care-team queue's people, and the language model (a deterministic interpreter stands in for it).

## 12. Decisions for David

1. **Live model answers.** Built: `prototype/api/assistant.ts` answers typed questions after booking with Claude Opus 5.5 at low effort, a JSON reply schema (reply plus up to two action buttons) and Anthropic's default refusal fallback. Setting `ANTHROPIC_API_KEY` in Vercel turns it on; without it, the app answers from Legion's stated policies. The local crisis check always runs first.
2. **Phone before email.** The integration order forces it (the phone unlocks autofill), which reverses the baseline's email-first preference.
3. **Default experience.** Chat as the default with the baseline at `?experience=classic`, framed in the walkthrough as the A/B we'd run.
4. **Safety question.** Legion's live fit check question, worded as "Are you safe right now?" so yes means safe, with no added screening. Any further change to the wording or what follows is the medical director's call.
5. **The assistant's name.** "Wren", set in one constant (`prototype/src/chat/env.ts`), so a different name is a one-line change.

## 13. Open questions for Legion

- Cancellation window: the homepage says 24 hours, the Terms say 48 hours with a $100 fee. The prototype uses the Terms. Can a visit booked inside the window be moved without the fee? The prototype's soonest openings fall inside it.
- First-visit length: the prototype uses the homepage's 30 to 45 minutes; the baseline used 60.
- Who writes Schedule II prescriptions for ADHD patients seen by nurse practitioners. The prototype proposes a Legion psychiatrist reviewing and writing them.
- Whether booking may proceed while benefits are pending.
- The live $1 card authorization versus "nothing charged today."
- Which telemedicine modality triggers the primary-care report requirement.

## Sources

Research notes with full citations are in the session's research reports; key primary sources: Legion's YC profile and launch posts, the Founding PM job description (Ashby, June 11, 2026), the Utah Legion regulatory mitigation agreement (signed March 18–19, 2026), Texas HB 149 and SB 1188 enrolled text, Sohar, Verified, Metriport, Persona and Stripe documentation, the DEA telemedicine extension through December 31, 2026, and Headway's intake suicidal-ideation study (JMIR, 2026).
