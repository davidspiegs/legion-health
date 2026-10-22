# Language evals

Claude now reads the patient's own words and answers typed questions on the deployed preview (`prototype/api/assistant.ts`). The keyword reader described here is the offline fallback behind it (Vite dev, or a call that fails or runs long), and its crisis check still runs first. No new evals were run for the take-home: the numbers below are the keyword reader's.

Wren's language work sits behind one contract in `prototype/src/chat/guide-ai.ts`: `mentionsCrisis` (the crisis floor under every free-text answer), `readStory` (the patient's own words read back as intake choices) and `answerQuestion` (Help). A deterministic interpreter stands in for a model. The labeled cases are in `language-eval-data.ts`. To print the table, run `node --import tsx --test src/chat/language-eval.test.ts` from `prototype/`.

## What the set covers

- **Crisis floor:** 345 sentences, 171 that must flag and 174 that must not. The positives cover iPhone curly apostrophes and other look-alikes, missing apostrophes, slang ("kms", "unalive", "wanna die"), methods and overdoses, harm to others, and a little Spanish. The negatives are the hard ones: idioms ("this job is killing me", "I could kill for a coffee"), panic ("I feel like I'm going to die"), accidents, and safe uses of trigger words ("cutting back on caffeine", "I don't want to go on medication").
- **Story read-back:** 100 stories, each labeled with what a careful intake coordinator would note. They include negation ("I don't have depression, I just get anxious"), relatives ("my mom has bipolar"), substance use, the verb "add" versus ADD, and stories that also carry crisis language.
- **Help:** 49 questions: overdoses, "should I go to the ER?", insurance by plan name, cost, cancelling and visit length.

The labeling rules sit at the top of the data file and were written before any tuning. They're cautious on purpose: a denial ("I'm not suicidal"), someone else's suicide, and saying you could kill a particular person all count as positives, because words alone can't tell a denial from ambivalence or a joke from a threat. The first 179 crisis cases were written alongside the patterns. Four held-out rounds followed, each written after the patterns were frozen and scored before anything changed; their misses were then fixed and kept as regressions.

## Results

| | Crisis caught | False alarms | Stories exactly right | Help |
| --- | --- | --- | --- | --- |
| Today, every case | 171 of 171 | 0 of 174 | 100 of 100 | 49 of 49 |
| Round 1, first run | 15 of 26 (58%) | 0 of 18 | 9 of 14 (64%) | 7 of 8 |
| Round 2, first run | 13 of 22 (59%) | 1 of 18 | 13 of 15 (87%) | 6 of 6 |
| Round 3, first run | 14 of 18 (78%) | 0 of 14 | 5 of 9 (56%) | 5 of 5 |
| Round 4, first run (mostly ordinary text) | 4 of 4 | 0 of 46 | | |
| All rounds, first run | 46 of 70 (66%) | 1 of 96 (1%) | 27 of 38 (71%) | 18 of 19 (95%) |

The test fails on any missed positive, any false alarm, any Help safety question that doesn't get the emergency or crisis answer, or story accuracy under 90%. The honest reading: the floor is right on every case written down, but on phrasing it hadn't seen, it caught about two in three on the first try. That's why it's a floor and not the safety system.

## Limits of the deterministic interpreter

The safety question is the primary instrument. Every patient answers it before booking. The floor runs locally under the free text. A match records the words and queues a same-day care-team check-in (`flagRisk`).

- **New phrasings slip through.** First-run recall ran 58 to 78% per round. Five known gaps are reported on every run but not scored: a typo ("kil myself"), warning signs with no trigger words ("giving my things away"), indirect statements ("I won't be a problem for anyone much longer"), danger from someone else ("my husband says he'll kill me"), and an implied method.
- **It over-captures by design.** Denials, other people's suicides, hyperbole about a specific person, and "I think about dying every day" all flag, even when the words turn out to be fear rather than a wish.
- **Story reading is heuristic.** Negation and whose condition it is are decided clause by clause, so sarcasm and long-range references ("I've never been depressed before, but now I am") can misread. The patient's "Did I get that right?" is the backstop.
- **Help is keyword routing.** The first matching topic wins, so a two-part question gets one answer.
- **Scope.** The set is English plus a few Spanish phrases, and one author wrote every case, so it shares that author's blind spots.

## A model behind the same contract

The function signatures and return shapes stay the same, so callers don't change. A model can add optional structure to `readStory`, such as self or family, negation, confidence, and the words it relied on.

- **The floor is never replaced.** A crisis flag is the floor's result *or* the model's. A model can add a flag but never clear one. If the model is slow or down, the floor and the safety question still work.
- **Same set, side by side.** Report the floor alone against the floor plus the model on every split, for crisis recall, precision and false alarms, story exact-match, and Help routing, with Help answers checked against the written policy. The combined system can't miss anything the floor catches, should close the known gaps, and must route every safety question correctly.
- **Real labels before any claim.** Use de-identified patient text labeled by Legion clinicians, and grow the set in phases, the way the Utah agreement moved from pre-reviewed to post-reviewed cases. Prompt-injection text stays in the set.
- **In production,** clinicians review a weekly sample of free text, and every miss becomes a labeled case. Taps on "Not quite" are the live accuracy signal for the read-back.
