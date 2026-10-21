# Canvas verification

Original capture board verified October 20, 2026 against the locally served canvas in Chrome.

- All 30 screenshot elements loaded with nonzero intrinsic dimensions.
- Sixteen route cards render: eight desktop and eight mobile, including the explicitly unobserved entry/payment image boundaries.
- All eleven historical funnel rows render. Every measured outgoing session loss equals the difference between consecutive supplied milestone counts; the final loss remains unknown.
- Screen navigation, switching to the mobile lane, opening the inspector, moving between captures, actual-size viewing, zoom, and drag-to-pan worked.
- No browser console errors were reported during the checked interactions.
- JavaScript syntax checks and `git diff --check` passed.
- Extra fit, insurance, and match states appear as clickable images on the board as well as in the inspector.

The original screenshots end at the blank patient form: David chose to stop that walkthrough at Basic Info. Subsequent private-session observations reached payment after David personally reserved and signed up; these are documented separately. No payment success, confirmed appointment, completed visit, or physical-device usability outcome is claimed.

Full-page source screenshots may reposition sticky headers when captured from a scrolled state. That limitation is documented rather than classified as a Legion interface defect.

## Supplementary technical-audit verification

The updated canvas was loaded in the existing Chrome localhost preview on October 20, 2026. The Technical audit button navigated to six populated findings cards; the service table rendered and remained readable when panning down the board. It contains eleven service/capability entries with evidence labels, mock boundaries, and unknowns. [Overview screenshot](assets/audit-board-overview.jpg).

- All 30 original screenshot references and dimensions are unchanged and their files exist.
- The historical funnel data is unchanged; supplementary live telemetry is separated from August's aggregates.
- The HTML's seven local script/style/document references resolve to existing files.
- JavaScript syntax checks for `app.js`, `data.js`, and `audit-data.js` and Git whitespace checks passed.
- Selected request indices, paths, methods, status, timings, and host counts were cross-checked against the user-saved export. Request shapes retain field names only; query strings, headers, identifiers, and personal values are excluded.
- The payment route has a supplementary observation note, with no fabricated screenshot or payment-success claim.

The private production page was left open; canvas verification used the separate existing localhost tab. No prototype was built or deployed.
