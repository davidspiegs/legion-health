# Capture status

**Original screenshots observed October 20, 2026 in Chrome.** David chose to stop that capture walkthrough at the blank Basic Info / patient-details form. The 30 original screenshots remain unchanged.

**Supplementary October 20 Incognito audit:** David later personally reserved and completed signup, extending observation to the payment page. Payment remains unpaid; no new screenshot was captured and no appointment confirmation or completed visit is established. This later runtime evidence is documented in [technical-audit.md](technical-audit.md) and [runtime-service-evidence.md](runtime-service-evidence.md), separately from the original captures below.

## Capture method

- Desktop viewport: **1,440 × 749 CSS pixels**.
- Responsive viewport: **390 × 844 CSS pixels**. These are Chrome viewport tests, not physical-mobile-device tests.
- All 30 screenshots are full-page captures. Their image dimensions are viewport width × `pageHeight` in [capture-manifest.json](capture-manifest.json); all 30 dimensions were checked against the image files.
- Full-page stitching can reposition sticky elements. Some insurance self-pay and match captures show the sticky header partway down; that capture artifact must not be reported as a live UI defect.
- The clinical and insurance selections below are the authorized **assignment scenario**, not David's health or insurance history. No real patient details appear in these captured forms.

## Original captured journey

| Route | Captured states per viewport | Verified observation |
| --- | ---: | --- |
| `/portal/join` | 0 | Displayed “Creating anonymous session,” then automatically redirected to `/portal/join/fit`. No persistent start screen was captured. |
| `/portal/join/fit` | 7 | Six questions and a completion state on the same route. Scenario answers: Texas—Yes; Medicare / Medicaid—No; current harm risk—No; inpatient mental-health or substance-use stay in the past year—No; age 18 or older—Yes; virtual-only care—Yes. |
| `/portal/join/conditions` | 1 | ADHD selected for the assignment scenario. Condition cards expand with medication and testing information. |
| `/portal/join/insurance` | 2 | Insurance options, followed by the selected No Insurance state showing self-pay prices of $250 for intake and $150 for follow-ups. No real insurance information supplied or verified. |
| `/portal/join/needs` | 1 | Selected the scenario for an existing diagnosis and medication support. |
| `/portal/join/match` | 3 | Initial results, a selected provider/time, and optional earlier-appointment preferences. Three initial providers, all PMHNPs, with an indication of 37 more; earliest displayed availability was October 21 at capture. A matching checklist remains above the results. |
| `/portal/join/patient` | 1 | Blank form reached after Book appointment, including date-of-birth and referral fields plus three agreement checkbox groups. Field requiredness and validation were not tested. |
| `/portal/join/payment` | 0 | Beyond the original Basic Info capture boundary. Observed later in the supplementary Incognito audit after David personally signed up; no screenshot or payment submission. |

In the original capture walkthrough, the displayed **October 28, 1:00 PM** slot for **Doose Jennifer Onarinde** was selected. The optional earlier-appointment preference was enabled for inspection, then disabled before advancing. Clicking **Book appointment** moved the anonymous user to the patient-details form. This does not establish a confirmed appointment; no account, payment, or completed appointment was confirmed by those screenshots.

The board references the verified Chrome JPGs in `canvas/assets/`, including all within-route captures. The obsolete preliminary PNG is unreferenced.

## Supplementary runtime findings

- The fresh Incognito run initially returned no authenticated user. Continuing after fit invoked `onboarding.createAnonymousUser`, creating an anonymous user and application profile before conditions. The original “Creating anonymous session” UI observation above does not establish that the backend profile was created at entry.
- Current production traffic contains granular events for all six fit questions. The absence of these events and per-question rates from the supplied brief is a documentation/data boundary, not proof of absent production tracking.
- After David personally clicked Book appointment, the audit observed a successful reservation response. After he completed signup, `user.onboardUser` succeeded and the UI advanced to payment with an account-created message.
- Payment UI and related services were observed, but no payment was submitted. This supplement adds no screenshot, does not replace the original blank Basic Info captures, and does not establish appointment confirmation or visit completion.

## Evidence boundaries and next step

The board keeps current UI observations separate from the brief's historical aggregate telemetry: rolling 30 days ending **August 29, 2026**, ordered browser-session milestones, all devices. Historical figures are unchanged. The supplied data does not identify causes of drop-off, mobile-specific conversion, losses between individual fit questions, payment success, or first-visit completion. Observing current granular events does not supply those missing historical rates.

The original screenshot walkthrough remains bounded at Basic Info; the supplementary audit extends observations to the unpaid payment page through David's own actions. Await David's feedback before building the redesigned prototype. No prototype or Vercel deployment has been started.
