# Current journey evidence canvas

Open `index.html` directly in Chrome. The board uses plain HTML, CSS, and JavaScript; it works from `file://` and requires no build, package install, API, or network service. Captured pages link back to their original live URLs.

The canvas is a research artifact, not the proposed onboarding prototype.

## Navigation

- Drag the board background to pan, or hold Space and drag anywhere.
- Scroll to pan; pinch or hold Ctrl / Command while scrolling to zoom.
- Use the section buttons to jump between desktop, mobile, the historical funnel, and the journey through the first completed visit.
- Use the screen selector to jump to any route in the current desktop or mobile lane.
- Click a screenshot to open its capture and annotations. Extra captures appear below the primary screenshot.
- `+` / `−` zoom, `0` resets zoom, `F` fits the board, and `?` opens help.
- The overview in the lower-right corner supports direct navigation.

All screenshots retain their original proportions. Missing screenshots appear as explicitly unobserved placeholders. Device comparisons use the same supplied aggregate funnel; the assignment provides no device-segmented conversion data.

## Content contract

`data.js` assigns a plain object to `window.JOURNEY`. This is loaded as a script so the artifact works locally without a server.

```js
window.JOURNEY = {
  title: "Legion Health — current journey",
  capturedAt: "October 20, 2026",
  telemetryPeriod: "Rolling 30 days ending August 29, 2026",
  description: "Optional introduction.",
  overview: [{ label: "", value: "", detail: "" }],
  stages: [{
    id: "start",
    number: 1,
    title: "Start",
    path: "/portal/join",
    url: "https://app.legionhealth.com/portal/join",
    description: "",
    desktop: {
      src: "assets/start-desktop.png",
      width: 1440,
      height: 900,
      status: "Observed",
      note: "",
      frames: [{ src: "assets/start-expanded.png", label: "Expanded state", width: 1440, height: 900 }],
      observations: [],
      hypotheses: []
    },
    mobile: { src: null, status: "Not observed", note: "Explain why the screen was not captured." },
    reach: 5898,
    fromStart: "100.0%",
    // Loss is FROM this route TO the next named milestone.
    loss: { count: 408, percent: "6.9%", to: "Fit check", note: "" },
    events: ["portal.page.join", "portal.onboarding.started"],
    observations: [],
    hypotheses: [],
    mobileObservations: [],
    mobileHypotheses: [],
    status: "Observed",
    // Optional action milestones within a route, such as provider selection.
    milestones: [{
      title: "",
      reach: 1909,
      fromStart: "32.4%",
      conversion: "63.4%",
      loss: { count: 145, percent: "7.6%", to: "Reservation created" },
      events: ["portal.provider_selected"],
      note: ""
    }]
  }],
  followThrough: [{ title: "", description: "", status: "Not observed" }],
  recommendations: [{ title: "", body: "" }]
};
```

Optional `stage.metrics` entries (`{label, value, detail}`) replace the two standard reach metrics. Screens can specify their primary capture in `src` and additional states in `frames`, or put all captures in `frames`.

The funnel preserves the assignment's eleven ordered milestones and conversion values, while displaying outgoing loss toward the next named milestone to match the screen annotations. An optional `funnel` array can override it using objects with `title`, `path` or `event`, `reach`, `conversion`, `fromStart`, and `loss` (a formatted string or `{count, percent, to}`). Unknown post-payment loss is explicitly labeled, not shown as zero.

## Evidence rules

- Observed interface behavior belongs in `observations`.
- Proposed explanations, causal claims to test, and redesign ideas belong in `hypotheses` or `recommendations`.
- `loss` names a measured transition. It does not claim the current screen caused abandonment.
- All historical counts are ordered same-session milestone reach, not people or raw event volume.
- A reservation is not a completed appointment. Payment-page reach is not successful payment. First-visit completion is outside the supplied historical funnel.
