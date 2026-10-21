# Runtime telemetry and marketing-service evidence

Audit date: October 20, 2026. Source: the user's saved Chrome HAR, inspected locally without copying the raw capture into this repository. This analysis covers 298 requests, ending at the Basic Info page. It does not cover a successful Basic Info submission, payment, or a completed visit. The capture contains two page-load segments; counts below are captured event occurrences, not unique people or conversions.

Evidence references use **zero-based HAR entry indices**. Request paths omit queries, public project identifiers, and personal identifiers. Only event names, property schemas, destination-routing configuration, and aggregate counts are documented. No raw request or response payloads are included.

## Finding that changes the original assessment

**Current production does have question-level fit instrumentation.** The assignment's historical telemetry reference did not list it. Those are different claims and should not be conflated.

Six distinct fit question keys produced six occurrences each of `portal.onboarding.question.shown`, `.interacted`, `.submitted`, and `.advanced`. Their batches have the request referrer path `/portal/join/fit`. Evidence: entries 62, 65, 69, 73, 77, 81, and 85. Clinical question keys and answer values are intentionally omitted.

The captured path was an eligible progression. It does **not** establish whether every disqualification branch has an explicit outcome event, how instrumentation behaved in the historical cohort, or whether abandoned attempts can be reliably distinguished from exclusions. The historical 34.8% fit-to-conditions gap remains a mixture that cannot be decomposed from the supplied aggregate counts alone.

## What was actually sent

### PostHog through a first-party proxy

PostHog scripts and event traffic were observed under `app.legionhealth.com/ph-proxy/`. Library assets identify version 1.419.4, including recorder, web vitals, exception, dead-click, and survey modules. Loading a module is not evidence that its associated product feature was used.

| Request path | Calls | Result | Evidence |
|---|---:|---|---|
| `/ph-proxy/e/` | 3 | HTTP 200 | 42, 141, 167 |
| `/ph-proxy/i/v0/e/` | 30 | HTTP 200 | Including 62–100 and 168–295 |
| `/ph-proxy/s/` | 28 | HTTP 200 | Including 66–86 and 169–297 |
| `/ph-proxy/flags/` | 6 | HTTP 200 | 36, 99, 148, 176, 265, 274 |

Local decompression of captured gzip bodies yielded 149 event records across the event and recording endpoints. Those HTTP results establish collection-request acceptance, not correctness of downstream reports.

| Current live event | Occurrences | Route or purpose | Evidence |
|---|---:|---|---|
| `portal.page.join` | 2 | Intake entry | 62, 167 |
| `portal.onboarding.started` | 2 | Intake entry | 62, 167 |
| `portal.page.fit_check` | 1 | Fit | 62 |
| `portal.onboarding.question.shown` | 18 | 6 fit; 1 each conditions/insurance/needs; 9 Basic Info fields | 62, 65, 69, 73, 77, 81, 168, 196, 218, 295 |
| `portal.onboarding.question.interacted` | 9 | 6 fit; 1 each conditions/insurance/needs | 65, 69, 73, 77, 81, 85, 172, 200, 221 |
| `portal.onboarding.question.submitted` | 9 | 6 fit; 1 each conditions/insurance/needs | 65, 69, 73, 77, 81, 85, 196, 218, 227 |
| `portal.onboarding.question.advanced` | 6 | Fit | 65, 69, 73, 77, 81, 85 |
| `portal.onboarding.question.save_succeeded` | 6 | 2 each conditions/insurance/needs | 196, 218, 227 |
| `portal.page.join.conditions` | 1 | Conditions | 168 |
| `portal.onboarding.conditions` | 1 | Conditions saved | 196 |
| `portal.page.join.insurance` | 1 | Insurance | 196 |
| `portal.onboarding.insurance_selected` | 1 | Insurance choice saved | 218 |
| `portal.page.join.needs` | 1 | Needs | 218 |
| `portal.onboarding.needs` | 1 | Needs saved | 227 |
| `portal.page.join.match` | 1 | Matching | 243 |
| `portal.onboarding.match.results_rendered` | 1 | Matching result presentation | 248 |
| `portal.onboarding.match.initial_offers_rendered` | 1 | Initial provider/slot offers | 248 |
| `portal.provider_selected` | 2 | Provider selections | 263, 270 |
| `portal.onboarding.match.slot_selected` | 2 | Slot selections | 263, 270 |
| `portal.onboarding.match.reservation_requested` | 1 | Reservation attempt | 270 |
| `portal.onboarding.match.reservation_created` | 1 | Reservation outcome | 295 |
| `portal.provider.reservation.created` | 1 | Existing canonical reservation event | 295 |
| `portal.page.join.patient` | 1 | Basic Info | 295 |

The two reservation-created names coexist in the same batch. This is not evidence that the brief's canonical event has been replaced. A funnel should deliberately select one event or deduplicate the same business outcome rather than add the two counts.

Some submit/save events are batched after navigation. For example, conditions submission and saving appear in entry 196, whose request referrer is already `/portal/join/insurance`. Route attribution above uses event order and matching question identity across the preceding shown/interacted events; it does not assign every event to the batch's referrer page.

### Available measurement structure

The question-event schema includes `schema_version`, `flow`, `environment`, `question_key`, `question_visit_id`, and `was_shown`; submission events also include `submission_id`, and successful saves include `save_stage`. These provide useful foundations for per-question analysis and deduplication. Two save-success events per section are observed; their distinct save stages must be understood before treating them as conversions.

Matching result events already include schema fields for request and retry identity, status/reason, eligible/failed/loaded/bookable provider counts, loaded slot count, and server-load/client-render durations. Initial-offer events contain provider/card/slot counts and availability lead-time buckets. Slot and reservation events carry request identity and a selected lead-time bucket; reservation events include an attempt identifier. These fields could support diagnosis of supply scarcity versus interface friction, subject to validation of their semantics.

Other captured PostHog records: `$pageview` (8), `$web_vitals` (4), `$autocapture` (16), `$$heatmap` (17), `$snapshot` (30), `$identify` (1), and `$set` (3). The identity event alone does not prove that a patient account was created. Snapshot events establish that recording data was sent to the first-party proxy; this audit does not establish what was masked or retained downstream.

Existing event schemas also include clinical and coverage-related property keys, such as `conditions`, `need_type`, `payerId`, and `payerName`. Their values are excluded here. Any prototype analytics design should explicitly review which data is appropriate for each destination and keep clinical context out of general marketing measurement.

## Freshpaint and marketing destinations

### Observed runtime calls

Freshpaint assets loaded from `freshpaint-cdn.com` and `perfalytics.com`; its GTM adapter also loaded. Evidence: entries 44–48 and 143–146.

The browser sent **47 POST requests to `api.perfalytics.com/track`, all HTTP 200**. Captured request elapsed time: median 66 ms, range 45–130 ms. This is one walkthrough's request timing, not a performance benchmark.

| Freshpaint event | Calls | Evidence |
|---|---:|---|
| `$page` | 2 | 49, 149 |
| `PageView` | 9 | 50, 54, 90, 150, 160, 183, 210, 235, 284 |
| `$web_event` | 26 | Including 51–92 and 151–286 |
| `$user_engagement` | 7 | 55, 91, 161, 184, 211, 236, 285 |
| `$scroll` | 3 | 202, 214, 257 |

**All nine `PageView` requests explicitly request routing to `Facebook Conversions API`**, with other integrations disabled by the request's routing configuration. The pages include intake entry, fit, conditions, insurance, needs, match, and Basic Info. This is concrete browser evidence of intended server-side Meta forwarding, not merely a Facebook string in a generic SDK.

It does **not** prove Meta received the events, that an audience was populated, that retargeting ads ran, or what transformations Freshpaint applied before forwarding. The capture has no direct browser requests to Meta advertising hosts. Server-side forwarding would not appear as such a browser request.

### Tenant configuration, distinct from calls

The loaded Google Tag Manager container contains configured Freshpaint-mediated tags for:

| Destination family | Configured event | Configured trigger evidence | Observed delivery in this capture |
|---|---|---|---|
| Facebook/Meta | `PageView` | Initial load and history changes | Sent to Freshpaint with Facebook Conversions API routing |
| Facebook/Meta | `Booked Appointment` | History-change URL containing the `appointmentConfirmed` marker; or a Confirm click on an appointment-booking path | Not observed as a Freshpaint event in this capture |
| Facebook/Meta | `Payment Info` | History change into `/portal/join/payment` | Not observed in this capture |
| GA4 | `booked` | Same configured booking triggers | Not observed in this capture |
| GA4 | `payment` | History change into `/portal/join/payment` | Not observed in this capture |

Evidence: container source in entry 37, repeated in 136. The payment tag is configured around reaching the payment route, so its name must not be interpreted as proof of successful payment.

The Freshpaint event-definition responses (48 and 146) contain empty `dest_info` and `event_defs` arrays, identity matching enabled, impression pixel sync disabled, session replay disabled, and enhanced scroll/user-engagement/video-engagement events enabled. Cross-domain configuration names `legionhealth.com` and `app.legionhealth.com`. The empty destination array does not negate the explicit per-event Facebook routing above. Freshpaint replay being disabled also does not negate the separate PostHog recording traffic.

Generic GTM/SDK code contains additional vendor names. Such strings are not evidence those destinations are configured or called for Legion. No direct browser calls to Google Analytics, Google Ads, LinkedIn, TikTok, Bing, or other advertising destinations appeared in this capture. This is not proof that no backend integration exists.

## Other observed external hosts

The 298 entries contain 234 requests to `app.legionhealth.com` and 64 to external hosts:

| External host | Calls | Observed role |
|---|---:|---|
| `fonts.googleapis.com` | 2 | Font stylesheet |
| `fonts.gstatic.com` | 2 | Font files |
| `www.googletagmanager.com` | 2 | GTM container |
| `freshpaint-cdn.com` | 2 | Freshpaint installation assets |
| `perfalytics.com` | 6 | Freshpaint SDK, GTM adapter, event configuration |
| `api.perfalytics.com` | 47 | Event collection |
| `s3.amazonaws.com` | 3 | Provider headshots in a Healthie-named production bucket |

The image host/path alone is not evidence that browser scheduling calls go directly to Healthie. Provider and scheduling service conclusions belong in the separate integration audit, using API/source evidence.

## Recommendations for the prototype and next analysis

1. **Reuse the demonstrated granular measurement concepts.** Do not claim question-level tracking needs to be invented from scratch. Validate event semantics, disqualification outcomes, error coverage, and deduplication first.
2. **Analyze fit outcomes separately.** Use restricted service-fit outcome classification plus eligible continuation; retain the historical all-starts funnel for comparability. Do not infer eligibility outcome from a missing next-page event.
3. **Separate matching supply from interaction.** Use already-instrumented provider/slot availability and render results; determine whether actual viewport exposure and no-slot recovery are measured before proposing new events.
4. **Separate reservation, account, payment, and visit completion.** None of these event names substitutes for another business milestone. Account-creation and payment evidence remains outside this capture.
5. **Mock a measurement boundary, not a real advertising connection.** The prototype can show allowlisted product events and a simulated marketing conversion destination with consent and routing states. Real Freshpaint/Meta/GA delivery is unnecessary to demonstrate the workflow, and clinical answers should not enter marketing payloads.
6. **Treat retargeting as an open operational question.** Confirm destination configuration, transformations, consent handling, successful delivery, and actual audience/campaign use with Legion before asserting those occur. Browser routing intent is the strongest evidence available here.

