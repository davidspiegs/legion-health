# Integration options and proposed mock behavior

Reviewed against the assignment brief, official vendor documentation, and the [completed browser audit](technical-audit.md) on October 20, 2026. Vendor capabilities and **proposed prototype contracts** are distinguished below from observed browser behavior. A first-party endpoint can conceal a downstream vendor.

The brief confirms Legion uses **Metriport and Sohar**, and has an existing **DoseSpot** integration. **Verified and Persona are candidates, explicitly absent from current live onboarding.** Mock services are acceptable per Yash's confirmation reported by David; no vendor account or sandbox is needed.

## Recommended minimum

Start with mock boundaries for **directory/scheduling, authentication/profile, payment setup, and encounter status**, then **Sohar eligibility** and **Metriport records**. Add **Verified Signup** if it reduces entry burden, **DoseSpot** for a clinician medication handoff, and **Persona** only for a defined assurance need.

These are product recommendations, not assertions about Legion's architecture. The adapters should expose useful states rather than reproduce complete vendor APIs. Separate UI flow from simulated service responses so another implementation can replace the adapter later.

## Core application contracts

| Boundary | Proposed behavior | Failure and recovery to demonstrate |
| --- | --- | --- |
| Provider directory and matching | Return provider facts, supported needs, relevant constraints, and explainable match reasons. Matching may rank suitable options; do not invent clinical suitability claims. | No matching results and incomplete provider information; let the patient change preferences or request assistance. |
| Availability and reservations | Retrieve slots with explicit time zone; distinguish selected slot, temporary hold, and confirmed appointment. Use an operation key for repeated reservation attempts. | Slot taken, hold expired, request timeout, and changed availability; refresh alternatives without losing intake. A retry must not create duplicate reservations. |
| Authentication and progressive profile | Reflect the observed anonymous user/profile created after fit, incremental metadata saves, and later account conversion. Use a replaceable auth adapter informed by the observed Supabase Auth implementation. Keep auth, draft intake, clinical record, and vendor IDs distinct. | Save failure, refresh/resume, expired session, corrected demographics, and duplicate submission. Preserve intake through account conversion; require confirmation of autofill. |
| Payment setup | Simulate card setup/tokenization and confirmation outcomes without real card collection. Stripe Elements/Link and Healthie payment copy were observed; payment success was not. Keep payment setup separate from charges and appointment confirmation. | Setup failure, additional action, timeout/retry, and reservation expiry during setup. Preserve the draft; never confirm solely because the payment page loaded. |
| Encounter status | Simulate appointment confirmed, preparation pending/complete, visit ready, joined, and clinician-marked completed. | Reschedule, cancellation, no-show, join failure, and interrupted visit. A page view, join click, or prescription is not visit completion. |

Legion's server delivered provider/slot data. Healthie image infrastructure, identifiers, and payment copy make **Healthie a strong integration lead**; its upstream scheduling API remains unverified. Use replaceable scheduling/billing adapters, not an invented Healthie API replica. Signup's clinical/vendor record creation remains unknown.

Marketing may use a disabled/simulated destination and an allowlisted event contract; real ad delivery is unnecessary. The observed Freshpaint routing configuration does not prove downstream delivery.

## Vendor capabilities and useful simulations

### Sohar — existing; prioritize insurance clarity

Sohar's verification flow creates a request, returns a `verificationId`, and makes results available through polling or webhooks. Its separate discovery endpoint accepts demographics and returns a `discoveryId`; discovery and verification are different operations. Sources: [verification quickstart](https://docs.soharhealth.com/documentation/getting-started/quickstart), [create discovery](https://docs.soharhealth.com/api-reference/discovery/create-discovery).

**Proposed mock:** after the necessary information is available, return pending → active coverage with benefits, inactive coverage, or unable to verify. Include payer failure/timeout, corrected member details and retry, and manual follow-up. If discovery is included, let the patient confirm a candidate plan or enter coverage manually when none is found. Keep insurer acceptance, individual eligibility, benefits, and estimated patient cost separate. Show cost assumptions and a verification timestamp. Self-pay bypasses insurance checks and gets an explicit price; unresolved insurance does not silently become self-pay.

### Metriport — existing; prioritize preparation and reconciliation

Metriport creates patients from demographic information, initiates asynchronous network queries, and returns status/results through webhooks or polling. Consolidated FHIR data reflects the most recent network query; reading it does not itself fetch fresh external records. Source: [Medical API quickstart](https://docs.metriport.com/medical-api/getting-started/quickstart).

**Proposed mock:** after the designed identity/authorization checkpoint, create a synthetic patient reference and query reference; return pending → records ready, no records found, partial results, or error. Show source and date beside medications, allergies, and conditions. Allow the patient to flag outdated or incorrect records and add missing information; preserve source data alongside corrections for clinician review. An AI preparation summary should cite its supplied records and expose uncertainty. Continue preparation if records are unavailable; do not imply complete history or automatic diagnosis.

### DoseSpot — existing; clinician medication workflow

DoseSpot's public integration overview describes APIs for demographics, medications, allergies, e-prescribing workflows, and notifications. It does not establish Legion's enabled endpoints or configuration. Source: [Full Integration](https://dosespot.com/full-integration/).

**Proposed mock:** present reconciled medications, allergies, and a synthetic pharmacy preference to the clinician. Simulate a handoff awaiting review, accepted, or failed with retry. If a prescription decision is represented, require explicit simulated clinician action and show its status. No actual prescription is sent, and receiving medication is not required to complete onboarding. Do not portray medication fulfillment as automatic following an ADHD selection.

### Verified — optional; demographic autofill first

1-Click Signup uses a verified phone number, consent, and a recommended identity challenge to retrieve information for user confirmation. Its guide includes additional-information requests and manual fallback. 1-Click Health separately supports insurance autofill and eligibility, with asynchronous results. Sources: [Signup API guide](https://docs.verified.inc/1-click-signup/guides/api-integration), [Health API guide](https://docs.verified.inc/1-click-health/guides/api-integration).

**Proposed mock:** simulate phone verification, retrieval, and editable confirmation; include expired code, additional information needed, no match, and direct manual entry. Use fictional data only. Autofill must not create the impression that contact verification proves all clinical identity facts. Prefer Signup alone initially; adding Verified Health beside Sohar needs an explicit purpose, such as discovery coverage or a tested fallback, rather than duplicate checks.

### Persona — optional; targeted identity assurance

Persona inquiries can use hosted or embedded flows and support API/webhook retrieval. `completed` means the user finished the flow; `approved`, `declined`, and `needs review` are separate decision states. Sources: [inquiries overview](https://docs.withpersona.com/inquiries), [lifecycle](https://docs.withpersona.com/model-lifecycle).

**Proposed mock:** only at an identified assurance checkpoint, simulate an inquiry reference and pending → completed → approved/review/declined outcomes. Include expiry/resume and a support path. Do not collect real identity documents for the prototype or add document verification as an unexplained upfront gate.

## Acceptance for the eventual prototype

Use deterministic synthetic scenarios. Verify duplicate callbacks/retries do not duplicate accounts or appointments; delayed results remain pending; corrected data can be resubmitted; unavailable services preserve progress. Keep service errors distinct from negative eligibility/identity decisions. Emit privacy-minimized operational events, not clinical answers or contact details in general analytics. Only the simulated encounter authority can mark the first visit completed. These implementation checks are recommendations for the later build; this audit does not implement a prototype.
