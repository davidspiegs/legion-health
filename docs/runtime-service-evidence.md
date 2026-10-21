# Runtime evidence: intake, matching, and reservation

Audit date: October 20, 2026. Evidence is the user-exported Chrome HAR inspected locally, with 298 entries. Entry numbers below are **zero-based HAR array indices**. No raw HAR, authentication material, patient values, or identifier values are included in this repository.

This capture reaches the Basic Info page after a reservation. It does not contain a `user.onboardUser` submission or a payment request. A separately attributed native DevTools observation after the user's later save is recorded below. Browser traffic exposes Legion's client-facing boundary; server-to-server vendor calls can remain invisible.

## What the capture establishes

| Stage | Observed request / response | Conclusion and boundary |
|---|---|---|
| Initial state | `GET /api/trpc/user.me`, entries 38 and 97, HTTP 200; response has `user: null` and `isAuthenticated` | No user record was returned at those checks. This alone does not prove browser privacy mode or the absence of every prior cookie. |
| Anonymous creation | `POST /api/trpc/onboarding.createAnonymousUser`, entry 98, HTTP 200; empty request object; response keys `success`, `userId`, `isExisting`, `onboardingVersion`, `profileId`; success true and isExisting false | Legion creates an anonymous user/profile before Basic Info. The call returns separate user and profile identifiers. It does not prove an external EHR patient has been created. |
| Anonymous session read | `GET /api/trpc/user.me`, entry 137, HTTP 200; `user.isAnonymous: true`, `onboardingStep: 1`, `onboardingComplete: false` | An anonymous profile already has progress state. User/profile identifiers match those returned by entry 98; values are deliberately omitted. |
| Conditions persistence | `POST /api/trpc/onboarding.updateMetadata`, entry 175, HTTP 200; request keys `topics[]` and `adhd.intakeSignals.hospitalizedForMentalHealthPastYear`; then `updateStep`, entry 177 | Clinical selection/intake metadata is persisted before Basic Info. This is an operational API, not an analytics event. Response contains merged metadata. |
| Insurance directory | `GET /api/trpc/insurance.getInsuranceProviders`, entry 193, HTTP 200; 36 directory objects | A list of payer options is fetched from Legion. Directory retrieval is not eligibility verification. |
| Insurance persistence | `POST /api/trpc/onboarding.updateMetadata`, entry 204, HTTP 200; request `insurance: {payerId, payerName}`; then `updateStep`, entry 205 | Payer selection is saved incrementally. The response also retains earlier metadata. No coverage-verification conclusion follows from this selection. |
| Needs persistence | `POST /api/trpc/onboarding.updateMetadata`, entry 224, HTTP 200; request has `needs`; then `updateStep`, entry 225 | Needs are saved separately before matching. |
| Matching data | `GET /portal/join/match`, entry 226, HTTP 200, `text/x-component` | Provider directory records and available slots arrive in the Next.js server-component response from Legion. There is no need for a separate visible browser-to-vendor directory call for this page. |
| Provider images | `GET` requests to `s3.amazonaws.com/healthie-production/image/…`, entries 245–247, HTTP 200 | Healthie-branded production image storage is actually used. This is stronger evidence of a Healthie relationship than a name in dormant code, but is not observation of a Healthie scheduling API call. |
| Reservation | `POST /api/appointments/reserve`, entry 269, HTTP 200; request `{datetime, providerId, providerName}`; response `{success, reservation: {datetime, providerId, providerName, reservedAt}, message}` | Server reports success and: “Appointment reserved. Please add payment method to confirm.” Reservation is distinct from confirmed booking. Upstream hold enforcement, TTL, and concurrency guarantees are not exposed. |
| Profile after reservation | `GET /api/trpc/user.me`, entry 272, HTTP 200; still `isAnonymous: true`, `onboardingComplete: false`; metadata now contains `appointmentReservation` | The same anonymous user/profile identifiers persist from creation through reservation. A reservation can be associated with the anonymous profile before Basic Info. Reservation metadata fields: `datetime`, `timestamp`, `providerId`, `reservedAt`, `providerName`. |
| Basic Info arrival | `POST /api/trpc/onboarding.updateStep`, entry 273; `GET /portal/join/patient`, entry 275, both HTTP 200 | Captured runtime ends at the account-details stage. Entry 283 contains the form's JavaScript, but the account submission is not present in this HAR. |

## Provider directory and availability details

Entry 226's React server-component record `4`, props object at `[3]`, contains:

```text
insuranceName
isAdhd
isUsingCredentialedProviders
loadResult: {
  requestId, status, reason, eligibleProviderCount,
  failedProviderCount, serverLoadDurationMs
}
providers[]: {
  id, fullName, avatarUrl, gender, bio, rating, reviewCount,
  specialties[], adhdComplexityLevel, availableSlots[],
  appointmentTypes: [{ id }], isBookable, isCallToBook,
  callToBookMessage, priorityType? 
}
totalProviderCount
```

The response contains 40 provider records and 598 **provider-slot entries**; the latter is not a count of distinct appointment times or currently reservable inventory. Thirty-nine records have `isBookable: true`; one has `isCallToBook: true`. Three providers have no returned slots. The response reports `totalProviderCount: 106`, `eligibleProviderCount: 40`, zero failed providers, and a successful load. These are this response's values, not independently verified organization-wide totals.

One provider has `priorityType: soonest`, another `mostAvailable`, and the other 38 omit that field. The client translates these labels into availability-oriented badges. The evidence does **not** expose the full ranking algorithm, prove an AI matching model, explain the 106-to-40 filtering, or establish how ratings/reviews are sourced.

All 40 avatar URLs use the public `healthie-production` S3 bucket. Loaded client code also uses names such as `healthie_id`, `healthieId`, and `preferredProviderHealthieId`. Together these make **Healthie a credible upstream directory/scheduling candidate to confirm**, not a verified live API call. There is no direct Healthie API hostname in these observed directory and reservation requests.

Slots arrive as offset-bearing timestamp strings with `-0500` or `-0600`. Client code parses ISO, then SQL-style dates, then a JavaScript date fallback, and formats date/time labels. The inspected helper does not explicitly choose a named timezone. A single capture cannot establish cross-timezone or daylight-saving behavior. The rebuild should show the user's appointment timezone and test conversion across DST boundaries explicitly.

The matching request took approximately **5.91 seconds** in this one HAR sample. The response's `serverLoadDurationMs` is **4,636 ms**. HAR receive time includes streamed response delivery; it should not be treated as pure download latency. This is an investigation lead, not a latency benchmark or demonstrated cause of abandonment.

## Loaded client code: additional evidence, not additional runtime calls

Entry 234 is the match-page JavaScript. It shows:

- The rendered provider list starts with three records and reveals more from the supplied list. This fits the 3-plus-37 observed presentation; it is not evidence of a new vendor query for each reveal.
- The active matching branch uses `bookingMode: "reserve"` and posts to `/api/appointments/reserve`.
- `portal.provider_selected` fires when a **time-slot button** is clicked, with `selection_type: "slot_clicked"`; `portal.onboarding.match.slot_selected` is also defined. This clarifies the current code's milestone semantics, but does not prove the same implementation was deployed during the August historical funnel.
- Successful reservation emits `portal.provider.reservation.created`; the code also defines `portal.onboarding.match.reservation_requested`, `.reservation_created`, and `.reservation_failed` with request/attempt linkage and failure categories. An analytics payload inspection is needed to label each as observed in this run.
- `appointments.saveReschedulePreferences` exists for optional earlier-appointment preferences. An unused `appointments.createAppointment.useMutation` hook also exists, but the direct-booking alternative in this component throws an unsupported-operation error. Loaded names must not be counted as called endpoints.
- Matching code has results-rendered / availability instrumentation and a staged matching animation. Neither is evidence that each animation step triggers a distinct backend check.

Entry 283 is the Basic Info JavaScript. It defines `user.onboardUser.useMutation`, invalidates `user.me` on success, and emits `portal.onboarding.userCreated`. This is a **code-supported next step**, not an observed account-creation request in this capture. The capture cannot show whether this later operation creates an EHR patient, transforms the anonymous account in place, or calls another vendor.

## Payer directory provenance

The 36 payer objects in entry 193 expose these fields:

```text
id, payerUuid, payerId, payerName, availityPayerName,
availityClaimsPayerId, availityEligibilityId,
availityRemittancePayerId, streetAddress,
createdAt, updatedAt, lastSyncedAt, aliases[]
```

The `availity*` fields are a useful additional integration/provenance clue. They do **not** establish a direct Availity request, an active Availity vendor contract, or that Sohar is unused. Legion may maintain a synchronized directory containing another system's identifiers. No benefits calculation or eligibility result is returned by this list endpoint.

## Supplemental observation: user completes Basic Info

Source: the primary audit agent's direct inspection of native Chrome DevTools and the live page after the user personally clicked Book, entered signup details and saved. These observations are **not entries in the 298-entry HAR** above; they must not be cited as if the HAR contains them. No submitted personal values are recorded here.

The UI advanced to `/portal/join/payment` and displayed an account-created success state. The following requests were observed:

| Request | Observed result |
|---|---|
| `POST /api/trpc/user.onboardUser` | HTTP 200, approximately 1.77 seconds |
| `GET /api/trpc/user.me` | HTTP 200, approximately 232 ms |
| `POST /api/trpc/onboarding.updateStep` | HTTP 200, approximately 253 ms |
| `GET /api/trpc/payment.getCardDetails,appointments.list` | Batched read, HTTP 200, approximately 380 ms |
| `PUT https://api.legion.health/auth/v1/user` | HTTP 200, approximately 147 ms; successful `OPTIONS` preflight also observed |

This verifies that Basic Info submission invokes a dedicated onboarding mutation before payment. The successful account UI and request do not establish exactly which external patient records were created or whether every user/profile identifier was preserved; those response details were not inspected for this supplement.

The payment UI names Stripe, presents Link, describes a $1 authorization, and states that `getHealthie.com` will appear as the payment provider. Stripe and hCaptcha resources loaded, including an iframe initiated from `b.stripecdn.com`. **No payment was submitted.** The hCaptcha load is associated with the payment embed; it is not proof of a separate Legion identity-verification integration.

The HAR's loaded JavaScript also supports a Supabase-auth interpretation: app layout entries 26/127 and patient entry 283 explicitly assign `NEXT_PUBLIC_SUPABASE_URL` to `https://api.legion.health`; chunk 9446 at entry 52 contains GoTrue auth client methods; entry 279 contains Supabase SDK markers. Combined with the observed `PUT /auth/v1/user` request, this establishes use of a configured Supabase authentication endpoint behind the custom domain for a user update. It does not establish the entire backend/database topology, and embedded credential/configuration values other than this service URL have not been copied into this report.

## What this implies for the prototype

Model separate interfaces for:

1. Anonymous intake/progress persistence and later account association.
2. Provider directory plus availability, with explicit matching reasons and timezone.
3. Reservation lifecycle, including failure, expiration and confirmation as separate states.
4. Payer directory and insurance verification as separate operations.
5. Optional earlier-appointment preferences and future notification/recovery handling.

Use synthetic data and a replaceable provider/scheduling adapter. A Healthie-shaped adapter may be appropriate after confirmation, but no direct live Healthie connection is needed for the assignment. Do not collapse `profileId`, clinical patient identity, login identity, and reservation into one identifier merely because the demo could do so.

## Questions for Yash / engineering

- Does Healthie supply the provider directory, slots and confirmed appointment, and where are the filtering/ranking rules applied?
- Does `/api/appointments/reserve` hold upstream inventory or only store a local selection? What expires it and resolves concurrent selection?
- When is an EHR patient created relative to anonymous intake, Basic Info and payment? How are duplicate/resumed profiles reconciled?
- What does `totalProviderCount` represent, and which rules reduce the result to eligible providers?
- Which timezone should the patient see, and is that contract consistent between slot display, reservation, confirmation and reminders?
- Are the Availity payer identifiers directory metadata only, or do they participate in verification alongside Sohar?

For broader analytics, advertising/retargeting, vendor choices and UX priorities, see the companion technical audit and integration-options documents. This document is intentionally limited to the evidence inspected here.
