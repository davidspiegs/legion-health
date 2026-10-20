# Canvas verification

Verified October 20, 2026 against the locally served canvas in Chrome.

- All 30 screenshot elements loaded with nonzero intrinsic dimensions.
- Sixteen route cards render: eight desktop and eight mobile, including the explicitly unobserved entry/payment image boundaries.
- All eleven historical funnel rows render. Every measured outgoing session loss equals the difference between consecutive supplied milestone counts; the final loss remains unknown.
- Screen navigation, switching to the mobile lane, opening the inspector, moving between captures, actual-size viewing, zoom, and drag-to-pan worked.
- No browser console errors were reported during the checked interactions.
- JavaScript syntax checks and `git diff --check` passed.
- Extra fit, insurance, and match states appear as clickable images on the board as well as in the inspector.

The blank patient form remains the live walkthrough boundary pending user input. No payment success, confirmed appointment, completed visit, or physical-device usability outcome is claimed.

Full-page source screenshots may reposition sticky headers when captured from a scrolled state. That limitation is documented rather than classified as a Legion interface defect.
