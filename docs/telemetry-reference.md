# Telemetry reference

Source: section 2 of the assignment brief, which is kept out of this repository. This is the brief's historical telemetry reference, not a live instrumentation audit.

## Scope and method

- **Snapshot:** rolling 30 days ending August 29, 2026.
- **Environment:** production host `app.legionhealth.com` only.
- **Exclusions:** staging, preview, demo, local development traffic, other hosts, and future-dated records.
- **Unit:** ordered milestones reached within the same PostHog browser session.
- **Page milestones:** automatic `$pageview` events.
- **Action milestones:** the explicit journey events named in the supplied conversion table.
- **Ordering:** native timestamp precision; ordered session reach rather than raw event volume.
- **Coverage:** current web flow through payment-page reach, with no first-visit-completed milestone.

The brief states that these are actual aggregate production data and contain no patient-level information. Several `portal.page.*` events fire more than once per session.

## Canonical events and instrumentation status

The following table reproduces the canonical mapping supplied in the brief.

| Current page | Phase | Canonical journey events observed at material volume | Instrumentation status |
| --- | --- | --- | --- |
| `/portal/join` | Start | `portal.page.join`; `portal.onboarding.started` | Page and start explicitly instrumented |
| `/portal/join/fit` | Fit check | `portal.page.fit_check` | Page explicitly instrumented; no separate fit-submit event observed |
| `/portal/join/conditions` | Conditions | `portal.page.join.conditions`; `portal.onboarding.conditions` | Page and phase action explicitly instrumented |
| `/portal/join/insurance` | Insurance | `portal.page.join.insurance`; `portal.onboarding.insurance_selected` | Page and selection action explicitly instrumented |
| `/portal/join/needs` | Needs | `portal.page.join.needs`; `portal.onboarding.needs` | Page and phase action explicitly instrumented |
| `/portal/join/match` | Provider match and reservation | `portal.page.join.match`; `portal.provider_selected`; `portal.provider.reservation.created`; `portal.reschedule_preferences.saved` | Page, provider selection, reservation creation, and reschedule-preference action explicitly instrumented |
| `/portal/join/patient` | Patient details and account creation | `portal.page.join.patient`; `portal.onboarding.userCreated` | Page and account-creation action explicitly instrumented |
| `/portal/join/payment` | Payment | `portal.page.join.payment` | Page explicitly instrumented; no dedicated payment-success or onboarding-complete event observed |

All eight pages also emit automatic browser telemetry such as `$pageview`. The deliberate page events above are useful labels for the journey canvas, but their raw counts must not be substituted for the ordered session milestones.

## Interpretation limits

1. **Sessions are not verified individual patients.** Repeat visits, identity stitching, blocked analytics, and cross-session continuation can affect the counts.
2. **Observed non-progression is not causation.** A session that does not reach the next milestone may have encountered friction, exited appropriately, continued elsewhere, or returned in another session.
3. **Incoming and outgoing losses must be distinguished.** The brief reports losses from the previous milestone. A screen-level canvas should label the actual transition rather than attribute an incoming loss to the destination screen.
4. **No device segmentation is supplied.** These rates cannot establish mobile-specific performance.
5. **The snapshot is historical.** Newly observed screens and URLs should carry their own observation date. Their current behavior does not prove the cause of losses in the August dataset.
6. **Reservation is not completed care.** `portal.provider.reservation.created` establishes only the reservation milestone described by the brief.
7. **Payment-page reach is not successful payment.** No dedicated payment-success event was observed on that page.
8. **There is no measured completed-visit outcome here.** Later stages and their conversion rates remain unknown in this source.
9. **Not every canonical event is a separate funnel milestone.** For example, conditions, insurance, and needs have deliberate action events, but the supplied conversion table uses page reach for those phases.

See [Assignment understanding](assignment-understanding.md#supplied-funnel-all-11-milestones) for all 11 supplied milestones and their outgoing losses.

## Ancillary and cross-route observations — verbatim from the brief

**Low-volume cross-route and ancillary observations:** The same production snapshot also contained event names on routes where they are not canonical: `/portal/join` emitted `portal.page.fit_check` (12 events / 10 sessions), `portal.page.join.conditions` (1 / 1), and the legacy unprefixed `provider_selected` (2 / 2); `/portal/join/fit` emitted `portal.onboarding.started` (3 / 3) and `portal.page.join` (3 / 3); `/portal/join/insurance` emitted `portal.page.login` (2 / 1); `/portal/join/patient` emitted `portal.provider.reservation.created` (9 / 9) and `portal.reschedule_preferences.saved` (2 / 2); and `/portal/join/payment` emitted `portal.provider.reservation.created` (1 / 1). `/portal/join` also emitted `utm.params.applied` (1,718 / 1,717), which is campaign attribution rather than an onboarding-phase milestone. These are disclosed for completeness but are not used as canonical funnel stages.
