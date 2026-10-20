# Capture status

**Observed October 20, 2026 in Chrome.** David chose to stop the live walkthrough at the blank Basic Info / patient-details form. Payment and the later journey remain unobserved.

## Capture method

- Desktop viewport: **1,440 × 749 CSS pixels**.
- Responsive viewport: **390 × 844 CSS pixels**. These are Chrome viewport tests, not physical-mobile-device tests.
- All 30 screenshots are full-page captures. Their image dimensions are viewport width × `pageHeight` in [capture-manifest.json](capture-manifest.json); all 30 dimensions were checked against the image files.
- Full-page stitching can reposition sticky elements. Some insurance self-pay and match captures show the sticky header partway down; that capture artifact must not be reported as a live UI defect.
- The clinical and insurance selections below are the authorized **assignment scenario**, not David's health or insurance history. No real patient details appear in these captured forms.

## Observed journey

| Route | Captured states per viewport | Verified observation |
| --- | ---: | --- |
| `/portal/join` | 0 | Displayed “Creating anonymous session,” then automatically redirected to `/portal/join/fit`. No persistent start screen was captured. |
| `/portal/join/fit` | 7 | Six questions and a completion state on the same route. Scenario answers: Texas—Yes; Medicare / Medicaid—No; current harm risk—No; inpatient mental-health or substance-use stay in the past year—No; age 18 or older—Yes; virtual-only care—Yes. |
| `/portal/join/conditions` | 1 | ADHD selected for the assignment scenario. Condition cards expand with medication and testing information. |
| `/portal/join/insurance` | 2 | Insurance options, followed by the selected No Insurance state showing self-pay prices of $250 for intake and $150 for follow-ups. No real insurance information supplied or verified. |
| `/portal/join/needs` | 1 | Selected the scenario for an existing diagnosis and medication support. |
| `/portal/join/match` | 3 | Initial results, a selected provider/time, and optional earlier-appointment preferences. Three initial providers, all PMHNPs, with an indication of 37 more; earliest displayed availability was October 21 at capture. A matching checklist remains above the results. |
| `/portal/join/patient` | 1 | Blank form reached after Book appointment, including date-of-birth and referral fields plus three agreement checkbox groups. Field requiredness and validation were not tested. |
| `/portal/join/payment` | 0 | Unobserved; beyond the agreed Basic Info stopping point. |

At provider selection, the displayed **October 28, 1:00 PM** slot for **Doose Jennifer Onarinde** was selected. The optional earlier-appointment preference was enabled for inspection, then disabled before advancing. Clicking **Book appointment** moved the anonymous user to the patient-details form. This does not establish a confirmed appointment; no account, payment, or completed appointment was confirmed by the captured evidence.

The board references the verified Chrome JPGs in `canvas/assets/`, including all within-route captures. The obsolete preliminary PNG is unreferenced.

## Evidence boundaries and next step

The board keeps current UI observations separate from the brief's historical aggregate telemetry: rolling 30 days ending **August 29, 2026**, ordered browser-session milestones, all devices. The supplied data does not identify causes of drop-off, mobile-specific conversion, losses between individual fit questions, payment success, or first-visit completion.

The live walkthrough is finished at the agreed Basic Info boundary. Await David's canvas feedback before building the redesigned prototype. No prototype or Vercel deployment has been started.
