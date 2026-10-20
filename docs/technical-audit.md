# Current journey: UX and integration audit

**October 20, 2026 · Chrome Incognito · production · research, not a prototype.**

The fresh run materially changes two earlier assumptions: **individual fit questions are tracked in the current product**, and **an anonymous user plus application profile exists before Basic Info**. Provider data and availability reach the browser through Legion's own server response; Healthie is a strong integration lead, with its image infrastructure and identifiers present, but its upstream scheduling API was not directly visible.

## What was observed

The Incognito window was verified in Chrome's native UI. David reported closing older private windows. The newly opened private window was restarted, with DevTools recording and Keep log enabled **before** navigating to `/portal/join`. Third-party cookies remained blocked; cache was not disabled. This is a fresh anonymous journey, not a cold-cache benchmark. Initial `user.me` returned `user: null`, `isAuthenticated: false`; creation later returned `isExisting: false`.

The agreed synthetic scenario was Texas adult, virtual care, ADHD, no insurance/self-pay, existing diagnosis with medication support. These are assignment inputs, not assertions about David's medical history. Matching was also checked at 390 × 844 CSS pixels, then desktop mode restored. This is responsive testing, not physical-device testing.

The agent stopped before the consequential Book appointment click. **David clicked it, entered signup details, and created the account himself**, explicitly extending the observation boundary to payment-page reach. No payment information or payment action was entered by the agent. The Incognito page is intentionally left open with recording active.

Evidence has two parts:

- **A:** David's saved 298-entry HAR, from initial navigation through the blank Basic Info page. It was analyzed locally; the raw export is outside the repository. References in the detailed documents are zero-based entry indices. [Sanitized request inventory](network-evidence.json).
- **B:** Native DevTools and visible payment UI inspected after David completed signup. Only selected endpoint names, methods, status, timing, and UI observations were recorded; personal response/request values were not copied. These supplemental observations are not part of the 298-entry export.

## Profile, providers, and booking: the actual sequence

| Step | Observed connection / result | What it establishes |
| --- | --- | --- |
| Fresh entry and fit | `GET /api/trpc/user.me` → no user. Six fit questions precede creation. | Anonymous browser activity and a backend user/profile are separate stages. |
| Continue after fit | `POST /api/trpc/onboarding.createAnonymousUser` → success, new `userId` and `profileId`; subsequent `user.me` reports authenticated **and** anonymous. | Application identity/profile creation happens before Basic Info. Authentication here does not mean a fully identified patient. |
| Conditions, insurance, needs | Each Continue sends `POST onboarding.updateMetadata`, followed by `POST onboarding.updateStep`. `GET insurance.getInsuranceProviders` supplies the insurer list. | Intake is persisted incrementally. Choosing an insurer is not benefits verification; this run chose self-pay. |
| Matching | `GET /portal/join/match` returns a React Server Component response containing 40 provider records and 598 provider-slot entries. | Directory and availability are delivered by Legion's server. No direct browser call to an external scheduling API was observed. Slots are not 598 unique appointment times. |
| Provider selection | Loaded code ties `portal.provider_selected` to a **slot click**, and current traffic includes `portal.onboarding.match.slot_selected`. | The current milestone is more specific than simply viewing or preferring a provider. Confirm historical semantics before reinterpreting August's funnel. |
| David clicks Book appointment | `POST /api/appointments/reserve` → success and reservation data; message: “Appointment reserved. Please add payment method to confirm.” | A real reservation was created; it is not proof of a confirmed appointment. The existing anonymous profile contains reservation metadata. |
| David creates account | `PUT api.legion.health/auth/v1/user` → 200; `POST /api/trpc/user.onboardUser` → 200; followed by `user.me`, `onboarding.updateStep`, and the payment route. UI reports Account created. | An authentication update and Legion onboarding operation occur at signup. Backend clinical/vendor record creation inside that operation remains unverified. |
| Payment page loads | Batched `GET payment.getCardDetails,appointments.list` → 200; Stripe scripts, card Elements/Link, and Stripe-initiated hCaptcha resources load. | Payment infrastructure is active; this does not prove payment setup, authorization, or appointment confirmation succeeded. |

The matching request took **5.9 seconds in this one run**, with a server-supplied load-duration field of about 4.6 seconds. Investigate this wait alongside the mobile layout; it is not a production latency estimate. [Detailed service evidence and response shapes](runtime-service-evidence.md).

## Other services, including advertising

| Service | Evidence and practical interpretation |
| --- | --- |
| **Healthie / AWS S3** | Provider photos were fetched from the public `healthie-production` S3 bucket. Loaded matching code uses Healthie-named provider fields. Payment copy names `getHealthie.com` as the statement descriptor/payment provider. Strong evidence of Healthie involvement; directory/scheduling/clinical-record API calls behind Legion's server remain unknown. |
| **PostHog** | Scripts and event/replay requests use Legion's `/ph-proxy/` routes. Decoded event batches include all six fit questions and richer matching events. HTTP success proves request acceptance, not downstream dashboard completeness. |
| **Google Tag Manager + Freshpaint** | GTM loads Freshpaint; 47 Freshpaint `/track` requests occur in evidence A. Nine PageView payloads explicitly enable the **Facebook Conversions API** destination. GTM also contains Facebook and GA4 conversion-tag configuration. This establishes routing/configuration, not delivery to Meta/Google or a retargeting campaign actually serving. |
| **Vercel** | Web Analytics view requests and Speed Insights vitals requests are observed through first-party routes. Keep performance telemetry distinct from journey completion. |
| **Stripe + hCaptcha** | After signup, card Elements/Link and Stripe requests appear. hCaptcha is initiated by Stripe's iframe, not established as a separate Legion onboarding identity check. |
| **Authentication service** | A live `PUT /auth/v1/user` is sent to `api.legion.health`. The loaded auth bundle identifies Supabase Auth implementation; deployment/hosting details remain outside browser visibility. |
| **Google Fonts** | Styles/fonts are fetched. This is a presentation dependency, not evidence of Google Analytics collection. |

No direct browser requests to Metriport, Sohar, DoseSpot, Verified, or Persona were established in this path. That does not contradict the brief's existing backend integrations. No SMS/email/support-provider runtime was identified. Server-to-server calls are not visible in a browser capture. [Full telemetry and advertising evidence](runtime-telemetry.md).

## What we should prioritize

1. **Mobile provider/time selection:** lead with useful options and availability; shorten repeated reassurance and the completed matching checklist. The 390px check again left provider options below the initial viewport.
2. **Cost and commitment clarity:** payment now shows “100% Complete” while confirmation is still pending. Despite the self-pay selection, it leads with insurance verification next and typical insurance copays of $0–$40, while cash-pay prices appear later. Branch the explanation by the actual coverage state, show the real price prominently, and distinguish selected, reserved, and confirmed.
3. **Use existing measurement before adding duplicates:** current fit question events exist. Request eligible/excluded/unresolved breakdowns and device cohorts from Legion; validate event semantics and reportability. The historical 34.8% fit loss cannot separate exclusions from friction.
4. **Retain account context and progress:** the application already saves incrementally. Make that continuity visible, retain provider/time/cost at Basic Info, and support recoverable errors and confirmed autofill.
5. **Extend the outcome through completed care:** payment setup, confirmation, preparation, joining, and authoritative visit completion need distinct states. The observed countdown also makes reservation expiry/recovery an important mock scenario.

Historical 36.6% match-to-selection and 20.4% patient-to-account losses remain investigation signals, not causal or mobile-specific findings. [Ordered UX priorities and measurement plan](ux-priorities.md).

## Proposed mock boundaries

Prioritize **profile/authentication**, **provider directory + availability + reservation/confirmation**, **payment setup**, **Sohar eligibility**, **Metriport records**, and **encounter completion**. Healthie-compatible scheduling/billing concepts are justified, but use a replaceable adapter rather than pretending to reproduce an unobserved upstream API. Simulate Stripe tokenization/setup outcomes without real card collection. Keep clinical records and patient corrections separate from AI summaries.

Verified Signup is an optional autofill accelerator; Persona needs a specific assurance purpose; DoseSpot belongs in the clinician medication workflow. Avoid redundant insurance vendors. Advertising can be represented as a disabled/simulated destination with an allowlisted event contract; no real retargeting is needed in the take-home. [Vendor capabilities, sources, and recovery states](integration-options.md).

Before implementation, the highest-value unknowns are the upstream scheduling authority and hold rules, which clinical/vendor records signup creates, Freshpaint's actual destination delivery configuration, and post-confirmation benefits/records/visit-completion workflow. These do not prevent a truthful simulated prototype. Prototype work remains paused for David's feedback.
