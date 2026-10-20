/* Local, dependency-free evidence viewer. data.js is the only content source. */
(() => {
  "use strict";

  const data = window.JOURNEY;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const number = value => typeof value === "number" ? value.toLocaleString("en-US") : String(value ?? "—");
  const percent = value => value === undefined || value === null || value === "" ? "—" : typeof value === "number" ? `${value.toFixed(1)}%` : String(value).includes("%") ? String(value) : `${value}%`;
  const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const textOf = value => typeof value === "object" && value !== null ? value.text || value.body || value.description || value.note || "" : value;
  const safeURL = value => /^(https?:\/\/|(?:\.{0,2}\/)?assets\/)/i.test(String(value || "")) ? value : "#";
  const stages = asArray(data?.stages);
  if (!data || !stages.length) return;

  const viewport = $("#viewport");
  const world = $("#world");
  const map = $("#minimap");
  const mapContent = $("#minimap-content");
  const mapWindow = $("#minimap-window");
  const screenDialog = $("#screen-dialog");
  const state = { x: 0, y: 0, scale: 0.9, min: 0.06, max: 2, lane: "desktop", dragging: false, space: false, pointer: null, suppressClickUntil: 0, mapScale: 1, mapOffsetX: 9, mapOffsetY: 9 };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let animation = 0;
  let mapFrame = 0;
  let inspector = { stage: null, lane: "desktop", frames: [], index: 0 };

  function captureFrames(stage, lane) {
    const capture = stage[lane] || {};
    const frames = [];
    if (capture.src) frames.push({ src: capture.src, label: capture.label || "Primary capture", width: capture.width, height: capture.height, note: capture.note, status: capture.status, url: capture.url });
    for (const frame of asArray(capture.frames)) {
      if (!frame?.src) continue;
      const existing = frames.find(item => item.src === frame.src);
      if (existing) Object.assign(existing, frame);
      else frames.push(frame);
    }
    return frames;
  }

  function annotationBlock(items, title, kind = "") {
    const list = asArray(items).filter(Boolean);
    if (!list.length) return "";
    return `<div class="annotation-block ${kind}"><h4>${escape(title)}</h4><ul class="annotation-list">${list.map(item => `<li>${escape(textOf(item))}</li>`).join("")}</ul></div>`;
  }

  function milestoneHTML(items) {
    if (!asArray(items).length) return "";
    return `<div class="milestones">${asArray(items).map(item => `<div class="milestone"><h4>${escape(item.title || item.label)}</h4><div class="milestone-row">${item.reach != null ? `<span><strong>${escape(number(item.reach))}</strong> sessions</span>` : ""}${item.fromStart != null ? `<span><strong>${escape(percent(item.fromStart))}</strong> from start</span>` : ""}${item.conversion != null ? `<span><strong>${escape(percent(item.conversion))}</strong> from previous</span>` : ""}</div>${item.loss ? `<p>${escape(typeof item.loss === "object" ? (item.loss.count == null && item.loss.percent == null ? "The next transition is not measured." : `${number(item.loss.count)} sessions (${percent(item.loss.percent)}) did not reach ${item.loss.to || "the next milestone"}`) : item.loss)}</p>` : ""}${item.note ? `<p>${escape(item.note)}</p>` : ""}${asArray(item.events).map(event => `<code>${escape(textOf(event))}</code>`).join("")}</div>`).join("")}</div>`;
  }

  function detailsHTML(stage, lane, inInspector = false) {
    const loss = stage.loss || {};
    const capture = stage[lane] || {};
    const metrics = asArray(stage.metrics);
    const baseMetrics = metrics.length ? metrics : [{ label: "Sessions reaching page", value: number(stage.reach) }, { label: "From journey start", value: percent(stage.fromStart) }];
    const hasLoss = loss.count != null || loss.percent != null;
    return `<div class="stage-body">
      ${inInspector ? `<a class="stage-url" href="${escape(safeURL(stage.url))}" target="_blank" rel="noopener noreferrer">${escape(stage.url || stage.path || "")} ↗</a>` : ""}
      ${stage.description ? `<p class="stage-description">${escape(stage.description)}</p>` : ""}
      <p class="stage-evidence-label"><i class="key-dot historical"></i>Historical telemetry · all devices</p>
      <div class="metrics">${baseMetrics.map(metric => `<div class="metric"><span class="metric-value${String(metric.value).length > 10 ? " metric-value-long" : ""}">${escape(number(metric.value))}</span><span class="metric-label">${escape(metric.label)}${metric.detail ? `<br>${escape(metric.detail)}` : ""}</span></div>`).join("")}</div>
      ${hasLoss ? `<div class="loss-note"><div class="loss-number">${escape(percent(loss.percent))}<small>${escape(number(loss.count))} sessions</small></div><p class="loss-copy">Did not reach <strong>${escape(loss.to || "the next milestone")}</strong> after this step.${loss.note ? ` ${escape(loss.note)}` : ""}</p></div>` : `<div class="loss-note"><p class="loss-copy">${escape(loss.note || "No subsequent milestone is included in the supplied telemetry.")}</p></div>`}
      <p class="loss-caveat">Observed transition loss; cause is not established.${lane === "mobile" ? " These rates are not mobile-specific." : ""}</p>
      ${milestoneHTML(stage.milestones)}
      ${asArray(stage.events).length ? `<p class="stage-evidence-label">Documented canonical events</p><ul class="event-list">${asArray(stage.events).map(event => `<li>${escape(textOf(event))}</li>`).join("")}</ul>` : ""}
      ${annotationBlock([...(lane === "mobile" ? asArray(stage.mobileObservations) : []), ...asArray(capture.observations), ...asArray(stage.observations)], "Live observation")}
      ${annotationBlock([...(lane === "mobile" ? asArray(stage.mobileHypotheses) : []), ...asArray(capture.hypotheses), ...asArray(stage.hypotheses)], "Hypothesis to test", "hypothesis-block")}
      ${!inInspector && captureFrames(stage, lane).length ? `<button type="button" class="read-details" data-inspect="${escape(stage.id)}" data-lane="${lane}">Inspect screen & annotations ↗</button>` : ""}
    </div>`;
  }

  function frameGalleryHTML(stage, lane, frames) {
    if (frames.length < 2) return "";
    return `<div class="capture-gallery">
      <div class="capture-gallery-heading"><span>More screen states</span><span>${frames.length - 1} additional captures</span></div>
      <div class="frame-grid">${frames.slice(1).map((frame, index) => `<figure class="frame-preview">
        <button type="button" class="frame-image-button" data-inspect="${escape(stage.id)}" data-lane="${lane}" data-frame="${index + 1}" aria-label="Inspect ${escape(frame.label || `capture ${index + 2}`)}, ${lane}">
          <img src="${escape(frame.src)}" alt="${escape(frame.label || `Capture ${index + 2}`)} — actual ${lane} screen"${frame.width ? ` width="${Number(frame.width)}"` : ""}${frame.height ? ` height="${Number(frame.height)}"` : ""} draggable="false" loading="eager">
          <span class="frame-open" aria-hidden="true">Inspect ↗</span>
        </button>
        <figcaption><button type="button" class="frame-title" data-inspect="${escape(stage.id)}" data-lane="${lane}" data-frame="${index + 1}"><span>${String(index + 2).padStart(2, "0")}</span>${escape(frame.label || `Capture ${index + 2}`)}</button>
          ${frame.status ? `<span class="frame-status">${escape(frame.status)}</span>` : ""}
          ${frame.note ? `<p class="frame-note">${escape(frame.note)}</p>` : ""}
          ${frame.url && frame.url !== stage.url ? `<a class="frame-source" href="${escape(safeURL(frame.url))}" target="_blank" rel="noopener noreferrer">${escape(frame.url)} ↗</a>` : ""}
        </figcaption>
      </figure>`).join("")}</div><p class="gallery-metric-note">Route metrics and documented action milestones appear below these captures.</p>
    </div>`;
  }

  function stageHTML(stage, index, lane) {
    const capture = stage[lane] || {};
    const frames = captureFrames(stage, lane);
    const first = frames[0];
    const dimensions = first?.width && first?.height ? `${first.width} × ${first.height}` : lane === "mobile" ? "Mobile viewport" : "Desktop viewport";
    const status = first?.status || capture.status || stage.status || (first ? "Observed" : "Not observed");
    const image = first ? `<button type="button" class="screen-button" data-inspect="${escape(stage.id)}" data-lane="${lane}" aria-label="Inspect ${escape(stage.title)}, ${lane}"><img src="${escape(first.src)}" alt="${escape(stage.title)} — actual ${lane} capture"${first.width ? ` width="${Number(first.width)}"` : ""}${first.height ? ` height="${Number(first.height)}"` : ""} draggable="false" loading="eager"></button>` : `<div class="capture-empty"><span class="capture-empty-symbol" aria-hidden="true">⌑</span><strong>No captured screen</strong><p>${escape(capture.note || "This step was not reached during the live review. No reconstruction is shown.")}</p></div>`;
    return `<article class="stage-card ${lane === "mobile" ? "mobile-card" : ""}" id="${lane}-${escape(stage.id)}" data-stage-id="${escape(stage.id)}" data-lane="${lane}" tabindex="0" aria-label="${escape(stage.title)}, ${lane}">
      <div class="stage-head"><span class="stage-number">${escape(stage.number || index + 1)}</span><div><h3>${escape(stage.title)}</h3><a href="${escape(safeURL(stage.url))}" class="stage-path" target="_blank" rel="noopener noreferrer">${escape(stage.path || stage.url || "")} ↗</a></div></div>
      <div class="capture-wrap"><div class="capture-topline"><span class="capture-status ${first ? "" : "unobserved"}">${escape(status)}</span><span>${escape(first ? dimensions : "Evidence boundary")}</span></div>${image}</div>
      ${first && frames.length > 1 ? `<button type="button" class="primary-frame-label frame-title" data-inspect="${escape(stage.id)}" data-lane="${lane}" data-frame="0"><span>01</span>${escape(first.label || "Primary capture")}</button>` : ""}
      ${(first?.note || capture.note) && first ? `<p class="capture-note">${escape(first.note || capture.note)}</p>` : ""}
      ${first?.url && first.url !== stage.url ? `<a class="primary-frame-source frame-source" href="${escape(safeURL(first.url))}" target="_blank" rel="noopener noreferrer">${escape(first.url)} ↗</a>` : ""}
      ${frameGalleryHTML(stage, lane, frames)}
      ${detailsHTML(stage, lane)}
    </article>`;
  }

  const fallbackFunnel = [
    ["Start", "/portal/join", 5898, "100.0%", "100.0%", "—"],
    ["Fit check", "/portal/join/fit", 5490, "93.1%", "93.1%", "408 (6.9%)"],
    ["Conditions", "/portal/join/conditions", 3578, "65.2%", "60.7%", "1,912 (34.8%)"],
    ["Insurance", "/portal/join/insurance", 3338, "93.3%", "56.6%", "240 (6.7%)"],
    ["Needs", "/portal/join/needs", 3095, "92.7%", "52.5%", "243 (7.3%)"],
    ["Provider match", "/portal/join/match", 3013, "97.4%", "51.1%", "82 (2.6%)"],
    ["Provider selected", "portal.provider_selected", 1909, "63.4%", "32.4%", "1,104 (36.6%)"],
    ["Reservation created", "portal.provider.reservation.created", 1764, "92.4%", "29.9%", "145 (7.6%)"],
    ["Patient details", "/portal/join/patient", 1763, "99.9%", "29.9%", "1 (0.1%)"],
    ["Account created", "portal.onboarding.userCreated", 1403, "79.6%", "23.8%", "360 (20.4%)"],
    ["Payment page", "/portal/join/payment", 1403, "100.0%", "23.8%", "0 (0.0%)"]
  ];

  function renderFunnel() {
    const rows = asArray(data.funnel).length ? data.funnel.map(item => Array.isArray(item) ? item : [
      item.title || item.label || item.milestone, item.event || item.path || item.route || "", item.reach ?? item.sessions, item.conversion ?? item.fromPrevious, item.fromStart,
      typeof item.loss === "object" && item.loss !== null ? (item.loss.count == null && item.loss.percent == null ? "Unknown after this point" : `${number(item.loss.count)} (${percent(item.loss.percent)})`) : item.loss ?? "Unknown after this point",
      item.loss?.count != null ? item.loss?.to || "" : ""
    ]) : fallbackFunnel.map((row, index) => [...row.slice(0, 5), fallbackFunnel[index + 1]?.[5] || "Unknown after this point", fallbackFunnel[index + 1]?.[0] || ""]);
    $("#funnel-body").innerHTML = rows.map((row, index) => `<tr class="${[1, 5, 8].includes(index) ? "loss-large" : ""}"><td><span class="funnel-name">${String(index + 1).padStart(2, "0")} · ${escape(row[0])}</span><span class="funnel-route">${escape(row[1])}</span></td><td class="funnel-strong">${escape(number(row[2]))}</td><td>${escape(percent(row[3]))}</td><td>${escape(percent(row[4]))}</td><td${[1, 5, 8].includes(index) ? ' class="funnel-strong"' : ""}>${escape(row[5])}${row[6] ? `<span class="funnel-route">→ ${escape(row[6])}</span>` : ""}</td></tr>`).join("");
  }

  function render() {
    document.title = `${data.title || "Legion Health — current journey"} | Evidence board`;
    if (data.capturedAt) $("#capture-date").textContent = data.capturedAt;
    if (data.source) {
      $("#assignment-source").href = data.source;
      $("#assignment-source").textContent = `${data.sourceLabel || "Read the assignment source"} ↗`;
      $("#assignment-source").hidden = false;
    }
    if (data.description) $("#board-description").textContent = data.description;
    if (data.telemetryPeriod) $("#telemetry-period").textContent = `${data.telemetryPeriod} · Ordered milestones in the same browser session.`;
    $("#desktop-stages").innerHTML = stages.map((stage, index) => stageHTML(stage, index, "desktop")).join("");
    $("#mobile-stages").innerHTML = stages.map((stage, index) => stageHTML(stage, index, "mobile")).join("");
    $("#stage-select").innerHTML += stages.map((stage, index) => `<option value="${escape(stage.id)}">${index + 1}. ${escape(stage.title)}</option>`).join("");
    const overview = asArray(data.overview).length ? data.overview : [
      { label: "Reached intake entry", value: "5,898", detail: "Ordered sessions in the supplied production funnel." },
      { label: "Reached payment page", value: "23.8%", detail: "1,403 sessions; not a payment-success measure." },
      { label: "Fit → conditions loss", value: "34.8%", detail: "1,912 sessions did not reach the next milestone." },
      { label: "Match → selection loss", value: "36.6%", detail: "1,104 sessions did not record provider selection." }
    ];
    $("#overview").innerHTML = overview.map(item => `<div class="overview-item"><span class="overview-value">${escape(number(item.value))}</span><h3 class="overview-label">${escape(item.label)}</h3><p class="overview-detail">${escape(item.detail)}</p></div>`).join("");
    renderFunnel();
    $("#follow-through-items").innerHTML = asArray(data.followThrough).map((item, index) => `<article class="follow-through-item"><span class="follow-number">${String(index + 1).padStart(2, "0")} / BEYOND THE OBSERVED FLOW</span><h3>${escape(item.title)}</h3><p>${escape(item.description)}</p><span class="status-label">${escape(item.status || "Not observed")}</span></article>`).join("");
    $("#recommendations").innerHTML = asArray(data.recommendations).map(item => `<article class="recommendation"><h4>${escape(item.title)}</h4><p>${escape(item.body || item.description)}</p></article>`).join("");
    $("#loading-state").hidden = true;
  }

  function renderTransform() {
    world.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    viewport.style.backgroundPosition = `${state.x}px ${state.y}px`;
    viewport.style.backgroundSize = `${18 * state.scale}px ${18 * state.scale}px`;
    $("#zoom-label").textContent = `${Math.round(state.scale * 100)}%`;
    $("#zoom-out").disabled = state.scale <= state.min + .001;
    $("#zoom-in").disabled = state.scale >= state.max - .001;
    if (!mapFrame) mapFrame = requestAnimationFrame(() => { drawMinimapWindow(); mapFrame = 0; });
  }

  function clampPosition() {
    const margin = 160;
    state.x = Math.min(viewport.clientWidth - margin, Math.max(-world.offsetWidth * state.scale + margin, state.x));
    state.y = Math.min(viewport.clientHeight - margin, Math.max(-world.offsetHeight * state.scale + margin, state.y));
  }

  function moveTo(x, y, scale = state.scale, smooth = true) {
    cancelAnimationFrame(animation);
    const target = { x, y, scale: Math.min(state.max, Math.max(state.min, scale)) };
    if (!smooth || reducedMotion) {
      Object.assign(state, target);
      clampPosition();
      renderTransform();
      return;
    }
    const start = { x: state.x, y: state.y, scale: state.scale, time: performance.now() };
    const tick = time => {
      const p = Math.min(1, (time - start.time) / 280);
      const t = 1 - Math.pow(1 - p, 3);
      state.x = start.x + (target.x - start.x) * t;
      state.y = start.y + (target.y - start.y) * t;
      state.scale = start.scale + (target.scale - start.scale) * t;
      clampPosition();
      renderTransform();
      if (p < 1) animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
  }

  function zoomTo(newScale, anchorX = viewport.clientWidth / 2, anchorY = viewport.clientHeight / 2, smooth = true) {
    newScale = Math.min(state.max, Math.max(state.min, newScale));
    const worldX = (anchorX - state.x) / state.scale;
    const worldY = (anchorY - state.y) / state.scale;
    moveTo(anchorX - worldX * newScale, anchorY - worldY * newScale, newScale, smooth);
  }

  function markLane(lane) {
    state.lane = lane;
    $$("[data-jump]").forEach(button => {
      const active = button.dataset.jump === lane;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function goToLane(lane, stageId = null, smooth = true) {
    const section = document.getElementById(lane);
    if (!section) return;
    markLane(lane);
    const stage = stageId ? document.getElementById(`${lane}-${stageId}`) : null;
    const small = viewport.clientWidth < 760;
    const scale = lane === "desktop" || lane === "mobile" ? (small ? Math.min(.76, (viewport.clientWidth - 36) / 520) : Math.min(1, (viewport.clientWidth - 90) / 1120)) : (small ? .48 : Math.min(.86, (viewport.clientWidth - 80) / 1672));
    const worldRect = world.getBoundingClientRect();
    const targetRect = (stage || section).getBoundingClientRect();
    const targetX = (targetRect.left - worldRect.left) / state.scale;
    const targetY = (targetRect.top - worldRect.top) / state.scale;
    moveTo((small ? 18 : 34) - targetX * scale, (stage ? 25 : 30) - targetY * scale, scale, smooth);
    $("#canvas-status").textContent = stage ? `${stageId}, ${lane} view` : `${lane.replace("-", " ")} view`;
  }

  function fitBoard() {
    const scale = Math.max(state.min, Math.min((viewport.clientWidth - 70) / world.offsetWidth, (viewport.clientHeight - 70) / world.offsetHeight));
    moveTo((viewport.clientWidth - world.offsetWidth * scale) / 2, (viewport.clientHeight - world.offsetHeight * scale) / 2, scale);
    $("#canvas-status").textContent = "Entire journey board in view.";
  }

  function buildMinimap() {
    const availableWidth = map.clientWidth - 18;
    const availableHeight = map.clientHeight - 28;
    state.mapScale = Math.min(availableWidth / world.offsetWidth, availableHeight / world.offsetHeight);
    state.mapOffsetX = 9;
    state.mapOffsetY = 9;
    mapContent.innerHTML = "";
    const worldRect = world.getBoundingClientRect();
    $$(".stage-card, .analysis-lane", world).forEach(element => {
      const rect = element.getBoundingClientRect();
      const x = (rect.left - worldRect.left) / state.scale;
      const y = (rect.top - worldRect.top) / state.scale;
      const mini = document.createElement("div");
      mini.className = `mini-section ${element.dataset.lane === "mobile" ? "mobile" : ""} ${element.classList.contains("analysis-lane") ? "analysis" : ""}`;
      mini.style.cssText = `left:${x * state.mapScale}px;top:${y * state.mapScale}px;width:${element.offsetWidth * state.mapScale}px;height:${element.offsetHeight * state.mapScale}px;`;
      mapContent.append(mini);
    });
    drawMinimapWindow();
  }

  function drawMinimapWindow() {
    mapWindow.style.cssText = `left:${state.mapOffsetX - state.x / state.scale * state.mapScale}px;top:${state.mapOffsetY - state.y / state.scale * state.mapScale}px;width:${viewport.clientWidth / state.scale * state.mapScale}px;height:${viewport.clientHeight / state.scale * state.mapScale}px;`;
  }

  function updateInspectorFrame() {
    const frame = inspector.frames[inspector.index];
    if (!frame) return;
    const image = $("#inspection-image");
    image.src = frame.src;
    image.alt = `${inspector.stage.title} — ${inspector.lane} — ${frame.label || "capture"}`;
    const frameURL = frame.url || inspector.stage.url;
    const frameStatus = frame.status || inspector.stage[inspector.lane]?.status || "Live capture";
    $("#dialog-lane").textContent = `${inspector.lane} · ${frameStatus}`;
    $("#dialog-source").href = safeURL(frameURL);
    $("#frame-caption").textContent = `${inspector.index + 1} / ${inspector.frames.length} · ${frame.label || "Primary capture"}${frame.width && frame.height ? ` · ${frame.width} × ${frame.height}` : ""}`;
    $("#inspection-frame-evidence").innerHTML = `<p class="stage-evidence-label">This capture · ${inspector.index + 1} of ${inspector.frames.length}</p><h3>${escape(frame.label || "Primary capture")}</h3>${frame.note ? `<p>${escape(frame.note)}</p>` : ""}<a href="${escape(safeURL(frameURL))}" target="_blank" rel="noopener noreferrer">${escape(frameURL || "")} ↗</a>`;
    $("#frame-prev").disabled = inspector.index === 0;
    $("#frame-next").disabled = inspector.index === inspector.frames.length - 1;
    $(".inspection-scroll").classList.toggle("mobile", inspector.lane === "mobile");
    $(".inspection-scroll").scrollTop = 0;
    $(".inspection-scroll").scrollLeft = 0;
  }

  function inspect(stageId, lane, frameIndex = 0) {
    const stage = stages.find(item => item.id === stageId);
    if (!stage) return;
    const frames = captureFrames(stage, lane);
    if (!frames.length) return;
    inspector = { stage, lane, frames, index: Math.max(0, Math.min(frameIndex, frames.length - 1)) };
    $(".inspection-scroll").classList.remove("actual-size");
    $("#image-size").setAttribute("aria-pressed", "false");
    $("#image-size").textContent = "Actual size";
    $("#dialog-lane").textContent = `${lane} · ${stage[lane]?.status || "Live capture"}`;
    $("#dialog-title").textContent = stage.title;
    $("#dialog-source").href = safeURL(stage.url);
    $("#inspection-details").innerHTML = `<div id="inspection-frame-evidence" class="frame-evidence"></div>${detailsHTML(stage, lane, true)}`;
    updateInspectorFrame();
    if (!screenDialog.open) screenDialog.showModal();
    $("#inspection-details").scrollTop = 0;
  }

  function focusElementOnBoard(element) {
    const rect = element.getBoundingClientRect();
    const box = viewport.getBoundingClientRect();
    if (rect.left >= box.left + 15 && rect.right <= box.right - 15 && rect.top >= box.top + 15 && rect.bottom <= box.bottom - 15) return;
    const stage = element.closest(".stage-card");
    if (stage) markLane(stage.dataset.lane);
    // Reveal the focused control itself. Returning to the top of a tall card
    // leaves its lower controls outside the visible canvas.
    const margin = 24;
    let dx = 0;
    let dy = 0;
    if (rect.width > box.width - margin * 2) dx = box.left + margin - rect.left;
    else if (rect.left < box.left + margin) dx = box.left + margin - rect.left;
    else if (rect.right > box.right - margin) dx = box.right - margin - rect.right;
    if (rect.height > box.height - margin * 2) dy = box.top + margin - rect.top;
    else if (rect.top < box.top + margin) dy = box.top + margin - rect.top;
    else if (rect.bottom > box.bottom - margin) dy = box.bottom - margin - rect.bottom;
    moveTo(state.x + dx, state.y + dy);
  }

  render();
  renderTransform();
  goToLane("desktop", null, false);
  buildMinimap();
  const resizeObserver = new ResizeObserver(() => buildMinimap());
  resizeObserver.observe(world);
  resizeObserver.observe(viewport);
  $$("img", world).forEach(image => image.addEventListener("load", buildMinimap, { once: true }));

  // A Space-drag can start on a screenshot or link. Its pointerup must not
  // activate that control after the canvas has moved.
  document.addEventListener("click", event => {
    if (event.detail > 0 && performance.now() < state.suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener("click", event => {
    const inspectButton = event.target.closest("[data-inspect]");
    if (inspectButton) inspect(inspectButton.dataset.inspect, inspectButton.dataset.lane, Number(inspectButton.dataset.frame || 0));
    const jump = event.target.closest("[data-jump]");
    if (jump) goToLane(jump.dataset.jump);
    const close = event.target.closest("[data-close]");
    if (close) document.getElementById(close.dataset.close)?.close();
  });
  $(".wordmark").addEventListener("click", event => { event.preventDefault(); goToLane("desktop"); });
  $("#stage-select").addEventListener("change", event => { if (event.target.value) goToLane(state.lane === "mobile" ? "mobile" : "desktop", event.target.value); });
  $("#zoom-in").addEventListener("click", () => zoomTo(state.scale * 1.2));
  $("#zoom-out").addEventListener("click", () => zoomTo(state.scale / 1.2));
  $("#zoom-reset").addEventListener("click", () => zoomTo(1));
  $("#fit-board").addEventListener("click", fitBoard);
  $("#help-open").addEventListener("click", () => $("#help-dialog").showModal());
  $("#frame-prev").addEventListener("click", () => { if (inspector.index > 0) { inspector.index--; updateInspectorFrame(); } });
  $("#frame-next").addEventListener("click", () => { if (inspector.index < inspector.frames.length - 1) { inspector.index++; updateInspectorFrame(); } });
  $("#image-size").addEventListener("click", () => {
    const actual = $(".inspection-scroll").classList.toggle("actual-size");
    $("#image-size").setAttribute("aria-pressed", String(actual));
    $("#image-size").textContent = actual ? "Fit width" : "Actual size";
  });
  $$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));

  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    cancelAnimationFrame(animation);
    if (event.ctrlKey || event.metaKey) {
      const rect = viewport.getBoundingClientRect();
      zoomTo(state.scale * Math.exp(-event.deltaY * .008), event.clientX - rect.left, event.clientY - rect.top, false);
    } else {
      state.x -= event.deltaX;
      state.y -= event.deltaY;
      clampPosition();
      renderTransform();
    }
  }, { passive: false });

  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.button !== 1) return;
    if (!state.space && event.target.closest("button,a,select,.stage-body")) return;
    cancelAnimationFrame(animation);
    state.dragging = true;
    state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: state.x, startY: state.y, moved: false };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("panning");
    event.preventDefault();
  });
  viewport.addEventListener("pointermove", event => {
    if (!state.dragging || state.pointer?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - state.pointer.x, event.clientY - state.pointer.y) > 4) state.pointer.moved = true;
    state.x = state.pointer.startX + event.clientX - state.pointer.x;
    state.y = state.pointer.startY + event.clientY - state.pointer.y;
    clampPosition();
    renderTransform();
  });
  const endPan = () => {
    if (state.pointer?.moved) state.suppressClickUntil = performance.now() + 400;
    state.dragging = false;
    state.pointer = null;
    viewport.classList.remove("panning");
  };
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);
  viewport.addEventListener("lostpointercapture", endPan);
  world.addEventListener("focusin", event => { if (event.target.matches(":focus-visible")) focusElementOnBoard(event.target); });
  map.addEventListener("pointerdown", event => {
    const rect = map.getBoundingClientRect();
    const x = (event.clientX - rect.left - state.mapOffsetX) / state.mapScale;
    const y = (event.clientY - rect.top - state.mapOffsetY) / state.mapScale;
    moveTo(viewport.clientWidth / 2 - x * state.scale, viewport.clientHeight / 2 - y * state.scale);
  });

  document.addEventListener("keydown", event => {
    if ($("dialog[open]")) {
      if (screenDialog.open && event.key === "ArrowLeft" && inspector.index > 0) { inspector.index--; updateInspectorFrame(); }
      if (screenDialog.open && event.key === "ArrowRight" && inspector.index < inspector.frames.length - 1) { inspector.index++; updateInspectorFrame(); }
      return;
    }
    if (event.target.matches("input,textarea,select") || event.target.isContentEditable || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === "Space") { state.space = true; viewport.classList.add("space-pan"); if (event.target === document.body || event.target === viewport) event.preventDefault(); }
    const shifts = { ArrowLeft: [100, 0], ArrowRight: [-100, 0], ArrowUp: [0, 100], ArrowDown: [0, -100] };
    if (shifts[event.key]) {
      event.preventDefault();
      const [x, y] = shifts[event.key];
      moveTo(state.x + x, state.y + y);
    } else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(state.scale * 1.2); }
    else if (event.key === "-") { event.preventDefault(); zoomTo(state.scale / 1.2); }
    else if (event.key === "0") zoomTo(1);
    else if (event.key.toLowerCase() === "f") fitBoard();
    else if (event.key === "?") $("#help-dialog").showModal();
    else if (event.key === "1") goToLane("desktop");
    else if (event.key === "2") goToLane("mobile");
    else if (event.key === "3") goToLane("funnel");
  });
  document.addEventListener("keyup", event => { if (event.code === "Space") { state.space = false; viewport.classList.remove("space-pan"); } });
  window.addEventListener("blur", () => { state.space = false; viewport.classList.remove("space-pan"); endPan(); });
})();
