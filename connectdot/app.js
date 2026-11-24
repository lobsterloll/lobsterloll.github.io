(function () {
  "use strict";

  const PAPER_PAD = 28;

  const state = {
    image: null,
    puzzle: null,
    connectedCount: 0,
    showNumbers: true,
    dragToConnect: true,
    peekOriginal: false,
    revealOriginal: false,
    hintActive: false,
    isDraggingDraw: false,
    dragCursor: null,
    prevDragPt: null,
    isPanning: false,
    spacePressed: false,
    panStart: { x: 0, y: 0 },
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    startTime: null,
  };

  const els = {
    imageInput: document.getElementById("imageInput"),
    stageContainer: document.getElementById("stageContainer"),
    dropOverlay: document.getElementById("dropOverlay"),
    canvas: document.getElementById("puzzleCanvas"),
    undoBtn: document.getElementById("undoBtn"),
    hintBtn: document.getElementById("hintBtn"),
    peekBtn: document.getElementById("peekBtn"),
    completeBtn: document.getElementById("completeBtn"),
    resetBtn: document.getElementById("resetBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    printBtn: document.getElementById("printBtn"),
    regenerateBtn: document.getElementById("regenerateBtn"),
    dotCountInput: document.getElementById("dotCountInput"),
    dotCountValue: document.getElementById("dotCountValue"),
    sensitivityInput: document.getElementById("sensitivityInput"),
    sensitivityValue: document.getElementById("sensitivityValue"),
    smoothingInput: document.getElementById("smoothingInput"),
    smoothingValue: document.getElementById("smoothingValue"),
    showNumbersInput: document.getElementById("showNumbersInput"),
    autoAdvanceInput: document.getElementById("autoAdvanceInput"),
    progressText: document.getElementById("progressText"),
    nextDotText: document.getElementById("nextDotText"),
    progressBarFill: document.getElementById("progressBarFill"),
    zoomControls: document.getElementById("zoomControls"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomResetBtn: document.getElementById("zoomResetBtn"),
    zoomLevelText: document.getElementById("zoomLevelText"),
    completeBanner: document.getElementById("completeBanner"),
    completeSummary: document.getElementById("completeSummary"),
    revealOriginalBtn: document.getElementById("revealOriginalBtn"),
    playAgainBtn: document.getElementById("playAgainBtn"),
  };

  const ctx = els.canvas.getContext("2d");

  function resizeCanvas() {
    const rect = els.stageContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    els.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function fitViewToStage() {
    if (!state.puzzle) return;
    const rect = els.stageContainer.getBoundingClientRect();
    const paperW = state.puzzle.width + PAPER_PAD * 2;
    const paperH = state.puzzle.height + PAPER_PAD * 2;
    const scale = Math.min((rect.width - 40) / paperW, (rect.height - 40) / paperH, 2.5);
    state.view.scale = Math.max(0.25, scale);
    state.view.offsetX = (rect.width - paperW * state.view.scale) / 2;
    state.view.offsetY = (rect.height - paperH * state.view.scale) / 2;
    updateZoomLabel();
    render();
  }

  function updateZoomLabel() {
    els.zoomLevelText.textContent = Math.round(state.view.scale * 100) + "%";
  }

  function screenToPuzzle(clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const px = (sx - state.view.offsetX) / state.view.scale - PAPER_PAD;
    const py = (sy - state.view.offsetY) / state.view.scale - PAPER_PAD;
    return { x: px, y: py };
  }

  function loadImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.image = img;
      generatePuzzle();
      fitViewToStage();
    };
    img.src = url;
  }

  function generatePuzzle() {
    if (!state.image) return;
    const options = {
      targetDots: Number(els.dotCountInput.value),
      sensitivity: Number(els.sensitivityInput.value),
      smoothing: Number(els.smoothingInput.value),
    };
    state.puzzle = window.DotsEngine.generateDots(state.image, options);
    state.connectedCount = 0;
    state.revealOriginal = false;
    state.peekOriginal = false;
    state.hintActive = false;
    state.startTime = null;
    els.peekBtn.classList.remove("is-active");
    els.dropOverlay.hidden = true;
    els.zoomControls.hidden = false;
    els.completeBanner.hidden = true;
    updateControls();
    render();
  }

  function updateControls() {
    const hasPuzzle = Boolean(state.puzzle && state.puzzle.dots.length > 0);
    const total = hasPuzzle ? state.puzzle.dots.length : 0;
    const connected = state.connectedCount;
    const isComplete = hasPuzzle && connected >= total;

    els.regenerateBtn.disabled = !state.image;
    els.undoBtn.disabled = !hasPuzzle || connected === 0;
    els.hintBtn.disabled = !hasPuzzle || isComplete;
    els.peekBtn.disabled = !hasPuzzle;
    els.completeBtn.disabled = !hasPuzzle || isComplete;
    els.resetBtn.disabled = !hasPuzzle || connected === 0;
    els.downloadBtn.disabled = !hasPuzzle;
    els.printBtn.disabled = !hasPuzzle;

    els.progressText.textContent = hasPuzzle ? `${connected} / ${total}` : "0 / 0";
    els.nextDotText.textContent = hasPuzzle ? (isComplete ? "Done!" : String(connected + 1)) : "—";
    const pct = total > 0 ? (connected / total) * 100 : 0;
    els.progressBarFill.style.width = `${pct}%`;

    if (isComplete) {
      const elapsedSec = state.startTime ? Math.max(1, Math.round((Date.now() - state.startTime) / 1000)) : 0;
      els.completeSummary.textContent = elapsedSec > 0
        ? `Connected all ${total} dots in ${elapsedSec}s.`
        : `Connected all ${total} dots.`;
      els.completeBanner.hidden = false;
    } else {
      els.completeBanner.hidden = true;
    }
  }

  function distToSegmentSq(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2;
  }

  function tryConnectNextDot(px, py, prevPt) {
    if (!state.puzzle || state.connectedCount >= state.puzzle.dots.length) return false;
    const hitRadius = Math.max(12, 16 / state.view.scale);
    const hitSq = hitRadius * hitRadius;
    let connectedAny = false;

    for (let step = 0; step < 20 && state.connectedCount < state.puzzle.dots.length; step++) {
      const targetDot = state.puzzle.dots[state.connectedCount];
      const distSq = prevPt
        ? distToSegmentSq(targetDot, prevPt, { x: px, y: py })
        : (px - targetDot.x) ** 2 + (py - targetDot.y) ** 2;
      if (distSq > hitSq) break;

      if (state.connectedCount === 0) {
        state.startTime = Date.now();
      }
      state.connectedCount += 1;
      state.hintActive = false;
      connectedAny = true;
    }

    if (connectedAny) {
      updateControls();
      render();
    }
    return connectedAny;
  }

  function renderToContext(targetCtx, puzzle, options) {
    const { width, height, dots } = puzzle;
    const invScale = options.invScale || 1;

    targetCtx.fillStyle = "#ffffff";
    targetCtx.fillRect(-PAPER_PAD, -PAPER_PAD, width + PAPER_PAD * 2, height + PAPER_PAD * 2);

    if (options.showOriginal && state.image) {
      targetCtx.save();
      targetCtx.globalAlpha = options.originalAlpha || 0.25;
      targetCtx.drawImage(state.image, 0, 0, width, height);
      targetCtx.restore();
    }

    // Connected lines
    if (options.connectedCount > 1) {
      targetCtx.save();
      targetCtx.strokeStyle = "#1b1b1f";
      targetCtx.lineWidth = Math.max(0.9, 1.4 * invScale);
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
      targetCtx.beginPath();
      targetCtx.moveTo(dots[0].x, dots[0].y);
      for (let i = 1; i < options.connectedCount; i++) {
        if (dots[i].breakBefore) {
          targetCtx.moveTo(dots[i].x, dots[i].y);
        } else {
          targetCtx.lineTo(dots[i].x, dots[i].y);
        }
      }
      targetCtx.stroke();
      targetCtx.restore();
    }

    // Dots & Numbers
    const dotRadius = Math.max(1.0, Math.min(2.0, 1.5 * invScale));
    const fontSize = Math.max(7.5, Math.min(12, 9.5 * invScale));
    targetCtx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    targetCtx.textBaseline = "middle";

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const isConnected = i < options.connectedCount;
      const isNext = i === options.connectedCount && options.highlightNext;

      if (isNext) {
        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.arc(dot.x, dot.y, dotRadius * (options.hintActive ? 3.8 : 2.6), 0, Math.PI * 2);
        targetCtx.fillStyle = options.hintActive ? "rgba(37, 99, 235, 0.25)" : "rgba(37, 99, 235, 0.16)";
        targetCtx.fill();
        targetCtx.lineWidth = Math.max(1, 1.4 * invScale);
        targetCtx.strokeStyle = "#2563eb";
        targetCtx.stroke();
        targetCtx.restore();
      }

      targetCtx.beginPath();
      targetCtx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
      targetCtx.fillStyle = isNext ? "#2563eb" : isConnected ? "#1b1b1f" : "#2d2d34";
      targetCtx.fill();

      if (options.showNumbers) {
        const offsetDist = Math.max(7, 9.5 * invScale);
        const lx = dot.x + dot.labelDx * offsetDist;
        const ly = dot.y + dot.labelDy * offsetDist;
        targetCtx.textAlign = dot.labelDx > 0.2 ? "left" : dot.labelDx < -0.2 ? "right" : "center";
        targetCtx.fillStyle = isNext ? "#1d4ed8" : isConnected ? "#8e9099" : "#222328";
        targetCtx.fillText(String(dot.number), lx, ly);
      }
    }
  }

  function render() {
    const rect = els.stageContainer.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!state.puzzle) return;

    const paperW = state.puzzle.width + PAPER_PAD * 2;
    const paperH = state.puzzle.height + PAPER_PAD * 2;

    ctx.save();
    ctx.translate(state.view.offsetX, state.view.offsetY);
    ctx.scale(state.view.scale, state.view.scale);

    // Paper shadow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, paperW, paperH);
    ctx.restore();

    ctx.translate(PAPER_PAD, PAPER_PAD);

    const invScale = 1 / Math.max(0.7, Math.min(2.2, state.view.scale));
    renderToContext(ctx, state.puzzle, {
      connectedCount: state.connectedCount,
      showNumbers: state.showNumbers,
      showOriginal: state.peekOriginal || state.revealOriginal,
      originalAlpha: state.revealOriginal ? 0.85 : 0.25,
      highlightNext: true,
      hintActive: state.hintActive,
      invScale,
    });

    if (
      state.isDraggingDraw &&
      state.dragCursor &&
      state.connectedCount > 0 &&
      state.connectedCount < state.puzzle.dots.length &&
      !state.puzzle.dots[state.connectedCount].breakBefore
    ) {
      const lastDot = state.puzzle.dots[state.connectedCount - 1];
      ctx.save();
      ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
      ctx.lineWidth = Math.max(1, 1.4 * invScale);
      ctx.setLineDash([4 * invScale, 4 * invScale]);
      ctx.beginPath();
      ctx.moveTo(lastDot.x, lastDot.y);
      ctx.lineTo(state.dragCursor.x, state.dragCursor.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function zoomAt(factor, clientX, clientY) {
    if (!state.puzzle) return;
    const rect = els.canvas.getBoundingClientRect();
    const cx = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const cy = clientY !== undefined ? clientY - rect.top : rect.height / 2;

    const newScale = Math.max(0.25, Math.min(6, state.view.scale * factor));
    const ratio = newScale / state.view.scale;
    state.view.offsetX = cx - (cx - state.view.offsetX) * ratio;
    state.view.offsetY = cy - (cy - state.view.offsetY) * ratio;
    state.view.scale = newScale;
    updateZoomLabel();
    render();
  }

  function downloadPng() {
    if (!state.puzzle) return;
    const scale = 2;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = (state.puzzle.width + PAPER_PAD * 2) * scale;
    exportCanvas.height = (state.puzzle.height + PAPER_PAD * 2) * scale;
    const ectx = exportCanvas.getContext("2d");
    ectx.scale(scale, scale);
    ectx.translate(PAPER_PAD, PAPER_PAD);

    renderToContext(ectx, state.puzzle, {
      connectedCount: state.connectedCount,
      showNumbers: state.showNumbers,
      showOriginal: state.revealOriginal,
      originalAlpha: 0.85,
      highlightNext: false,
      hintActive: false,
      invScale: 1,
    });

    const link = document.createElement("a");
    link.download = "connect-the-dots.png";
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  // Event Listeners
  els.imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) loadImageFile(file);
    e.target.value = "";
  });

  els.stageContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.stageContainer.classList.add("is-dragover");
  });

  els.stageContainer.addEventListener("dragleave", () => {
    els.stageContainer.classList.remove("is-dragover");
  });

  els.stageContainer.addEventListener("drop", (e) => {
    e.preventDefault();
    els.stageContainer.classList.remove("is-dragover");
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  els.dotCountInput.addEventListener("input", () => {
    els.dotCountValue.textContent = els.dotCountInput.value;
  });
  els.dotCountInput.addEventListener("change", generatePuzzle);

  els.sensitivityInput.addEventListener("input", () => {
    els.sensitivityValue.textContent = els.sensitivityInput.value + "%";
  });
  els.sensitivityInput.addEventListener("change", generatePuzzle);

  els.smoothingInput.addEventListener("input", () => {
    els.smoothingValue.textContent = els.smoothingInput.value;
  });
  els.smoothingInput.addEventListener("change", generatePuzzle);

  els.showNumbersInput.addEventListener("change", () => {
    state.showNumbers = els.showNumbersInput.checked;
    render();
  });

  els.autoAdvanceInput.addEventListener("change", () => {
    state.dragToConnect = els.autoAdvanceInput.checked;
  });

  els.regenerateBtn.addEventListener("click", generatePuzzle);

  els.undoBtn.addEventListener("click", () => {
    if (state.connectedCount > 0) {
      state.connectedCount -= 1;
      updateControls();
      render();
    }
  });

  els.resetBtn.addEventListener("click", () => {
    state.connectedCount = 0;
    state.revealOriginal = false;
    state.startTime = null;
    updateControls();
    render();
  });

  els.peekBtn.addEventListener("click", () => {
    state.peekOriginal = !state.peekOriginal;
    els.peekBtn.classList.toggle("is-active", state.peekOriginal);
    render();
  });

  els.completeBtn.addEventListener("click", () => {
    if (!state.puzzle) return;
    state.connectedCount = state.puzzle.dots.length;
    state.hintActive = false;
    updateControls();
    render();
  });

  els.hintBtn.addEventListener("click", () => {
    if (!state.puzzle || state.connectedCount >= state.puzzle.dots.length) return;
    const target = state.puzzle.dots[state.connectedCount];
    const rect = els.stageContainer.getBoundingClientRect();
    state.view.scale = Math.max(state.view.scale, 1.35);
    state.view.offsetX = rect.width / 2 - (target.x + PAPER_PAD) * state.view.scale;
    state.view.offsetY = rect.height / 2 - (target.y + PAPER_PAD) * state.view.scale;
    state.hintActive = true;
    updateZoomLabel();
    render();
  });

  els.downloadBtn.addEventListener("click", downloadPng);
  els.printBtn.addEventListener("click", () => window.print());

  els.revealOriginalBtn.addEventListener("click", () => {
    state.revealOriginal = !state.revealOriginal;
    render();
  });

  els.playAgainBtn.addEventListener("click", () => {
    state.connectedCount = 0;
    state.revealOriginal = false;
    state.startTime = null;
    updateControls();
    render();
  });

  els.zoomInBtn.addEventListener("click", () => zoomAt(1.25));
  els.zoomOutBtn.addEventListener("click", () => zoomAt(0.8));
  els.zoomResetBtn.addEventListener("click", fitViewToStage);

  els.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  els.canvas.addEventListener("pointerdown", (e) => {
    if (!state.puzzle) return;
    els.canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || e.button === 2 || state.spacePressed) {
      state.isPanning = true;
      state.panStart = { x: e.clientX - state.view.offsetX, y: e.clientY - state.view.offsetY };
      els.canvas.style.cursor = "grabbing";
      return;
    }

    const pt = screenToPuzzle(e.clientX, e.clientY);
    tryConnectNextDot(pt.x, pt.y, null);
    if (state.dragToConnect) {
      state.isDraggingDraw = true;
      state.dragCursor = pt;
      state.prevDragPt = pt;
      render();
    }
  });

  els.canvas.addEventListener("pointermove", (e) => {
    if (state.isPanning) {
      state.view.offsetX = e.clientX - state.panStart.x;
      state.view.offsetY = e.clientY - state.panStart.y;
      render();
      return;
    }

    if (state.isDraggingDraw && state.puzzle) {
      const pt = screenToPuzzle(e.clientX, e.clientY);
      const connected = tryConnectNextDot(pt.x, pt.y, state.prevDragPt);
      state.prevDragPt = pt;
      state.dragCursor = pt;
      if (!connected) {
        render();
      }
    }
  });

  function stopPointerAction(e) {
    if (e && els.canvas.hasPointerCapture(e.pointerId)) {
      els.canvas.releasePointerCapture(e.pointerId);
    }
    const wasDragging = state.isDraggingDraw;
    state.isPanning = false;
    state.isDraggingDraw = false;
    state.dragCursor = null;
    state.prevDragPt = null;
    els.canvas.style.cursor = state.spacePressed ? "grab" : "crosshair";
    if (wasDragging) render();
  }

  els.canvas.addEventListener("pointerup", stopPointerAction);
  els.canvas.addEventListener("pointercancel", stopPointerAction);

  els.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      state.spacePressed = true;
      els.canvas.style.cursor = "grab";
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      state.spacePressed = false;
      if (!state.isPanning) {
        els.canvas.style.cursor = "crosshair";
      }
    }
  });

  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const desc = btn.closest(".control-group").querySelector(".control-desc");
      if (!desc) return;
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      desc.hidden = expanded;
    });
  });

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  updateControls();
})();
