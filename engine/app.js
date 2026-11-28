import {
  ENGINE_LAYOUTS, FUEL_TYPES, PARTS_CATALOG, DRIVETRAINS,
  GEARBOX_PRESETS, DRIVE_MODES, STAGE_PRESETS,
  createDefaultConfig, getDisplacementCc, evaluateEnginePoint,
  computeVehicleSpeedKmh, runDynoSweep
} from './physics.js?v=4';
import { Engine3DViewer } from './engine3d.js?v=4';
import { EngineAudio } from './audio.js?v=4';

const cfg = createDefaultConfig();
const viewer = new Engine3DViewer(document.getElementById('viewport3d'));
const audio = new EngineAudio();

const sim = {
  running: true,
  rpm: 850,
  boostPsi: -4.0,
  throttle: 0,
  holdThrottle: 0,
  pedalGas: false,
  pedalBrake: false,
  brake: 0,
  holdBrake: 0,
  gear: 0,
  autoShift: true,
  coolantC: 88,
  oilC: 94,
  dynoPullActive: false,
  dynoPullRpm: 1500,
  currentDyno: null,
  baselineDyno: null
};

function fillSelect(id, items, selectedKey, labelFn = (v) => v.name) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  if (Array.isArray(items)) {
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      if (item.id === selectedKey) opt.selected = true;
      el.appendChild(opt);
    });
  } else {
    Object.entries(items).forEach(([k, v]) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = labelFn(v);
      if (k === selectedKey) opt.selected = true;
      el.appendChild(opt);
    });
  }
}

function openCategory(catId, label) {
  const drawer = document.getElementById('catDrawer');
  const alreadyActive = document.querySelector(`.cat-btn[data-cat="${catId}"]`)?.classList.contains('active') && drawer.classList.contains('open');

  document.querySelectorAll('#leftDock .cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.cat-pane').forEach(p => p.classList.remove('active'));

  if (alreadyActive) {
    drawer.classList.remove('open');
    return;
  }

  document.querySelector(`.cat-btn[data-cat="${catId}"]`)?.classList.add('active');
  document.getElementById(catId)?.classList.add('active');
  document.getElementById('drawerTitle').textContent = label;
  drawer.classList.add('open');

  if (catId === 'cat-dyno' && !sim.currentDyno) {
    sim.currentDyno = runDynoSweep(cfg);
    drawDynoChart();
  }
}

function shiftUp() {
  const maxG = GEARBOX_PRESETS[cfg.gearbox].ratios.length;
  if (sim.gear < maxG) {
    if (sim.gear > 0) {
      const oldR = GEARBOX_PRESETS[cfg.gearbox].ratios[sim.gear - 1];
      const newR = GEARBOX_PRESETS[cfg.gearbox].ratios[sim.gear];
      sim.rpm = Math.max(850, sim.rpm * (newR / oldR));
    }
    sim.gear++;
  }
}

function shiftDown() {
  if (sim.gear > 0) {
    if (sim.gear > 1) {
      const oldR = GEARBOX_PRESETS[cfg.gearbox].ratios[sim.gear - 1];
      const newR = GEARBOX_PRESETS[cfg.gearbox].ratios[sim.gear - 2];
      sim.rpm = Math.min(cfg.revLimit, sim.rpm * (newR / oldR));
    }
    sim.gear--;
  }
}

function initUI() {
  fillSelect('cfgLayout', ENGINE_LAYOUTS, cfg.layout);
  fillSelect('cfgFuelType', FUEL_TYPES, cfg.fuelType);
  fillSelect('partIntake', PARTS_CATALOG.intake, cfg.intake);
  fillSelect('partIntercooler', PARTS_CATALOG.intercooler, cfg.intercooler);
  fillSelect('partTurbo', PARTS_CATALOG.turbo, cfg.turbo);
  fillSelect('partTurboCooling', PARTS_CATALOG.turboCooling, cfg.turboCooling);
  fillSelect('partCamshaft', PARTS_CATALOG.camshaft, cfg.camshaft);
  fillSelect('partInternals', PARTS_CATALOG.internals, cfg.internals);
  fillSelect('partFuelSystem', PARTS_CATALOG.fuelSystem, cfg.fuelSystem);
  fillSelect('partExhaust', PARTS_CATALOG.exhaust, cfg.exhaust);
  fillSelect('partOilCooling', PARTS_CATALOG.oilCooling, cfg.oilCooling);
  fillSelect('partCooling', PARTS_CATALOG.cooling, cfg.cooling);
  fillSelect('cfgGearbox', GEARBOX_PRESETS, cfg.gearbox);
  fillSelect('cfgDrivetrain', DRIVETRAINS, cfg.drivetrain);

  syncInputsFromConfig();
  viewer.rebuildEngine(cfg);

  // Left Dock Category Buttons & Drawer Close
  document.querySelectorAll('#leftDock .cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.querySelector('span:last-child').textContent;
      openCategory(btn.dataset.cat, label);
    });
  });
  document.getElementById('btnCloseDrawer').addEventListener('click', () => {
    document.getElementById('catDrawer').classList.remove('open');
    document.querySelectorAll('#leftDock .cat-btn').forEach(b => b.classList.remove('active'));
  });

  // Stage cards
  document.querySelectorAll('#stageBar .stage-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#stageBar .stage-card').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Object.assign(cfg, STAGE_PRESETS[btn.dataset.stage]);
      syncInputsFromConfig();
      viewer.rebuildEngine(cfg);
    });
  });

  // Mode cycle button (SPORT -> ECO -> COMFORT)
  const modeOrder = ['sport', 'eco', 'comfort'];
  const btnMode = document.getElementById('btnModeCycle');
  btnMode.addEventListener('click', () => {
    const nextIdx = (modeOrder.indexOf(cfg.driveMode) + 1) % modeOrder.length;
    cfg.driveMode = modeOrder[nextIdx];
    btnMode.textContent = DRIVE_MODES[cfg.driveMode].name;
    btnMode.className = `mode-cycle-btn mode-${cfg.driveMode}`;
    viewer.rebuildEngine(cfg);
  });

  // 3D View modes & Camera presets
  document.querySelectorAll('#viewModes .vp-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#viewModes .vp-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      viewer.setViewMode(btn.dataset.view);
    });
  });
  document.querySelectorAll('#camPresets .vp-chip').forEach(btn => {
    btn.addEventListener('click', () => viewer.setCameraPreset(btn.dataset.cam));
  });

  // Sound toggle + auto-unlock on first user interaction
  const btnSound = document.getElementById('btnSound');
  let userMuted = false;
  const unlockAudio = () => {
    if (!userMuted && !audio.enabled) {
      audio.enable();
      btnSound.textContent = 'Sound: ON';
      btnSound.classList.add('active');
    }
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  btnSound.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = audio.toggle();
    userMuted = !on;
    btnSound.textContent = on ? 'Sound: ON' : 'Sound: OFF';
    btnSound.classList.toggle('active', on);
  });

  // Start / Stop Engine
  const btnToggleEngine = document.getElementById('btnToggleEngine');
  btnToggleEngine.addEventListener('click', () => {
    sim.running = !sim.running;
    if (sim.running) {
      sim.rpm = 850;
      audio.triggerStarter();
      btnToggleEngine.textContent = 'Stop Engine';
      btnToggleEngine.classList.remove('stopped');
    } else {
      sim.dynoPullActive = false;
      btnToggleEngine.textContent = 'Start Engine';
      btnToggleEngine.classList.add('stopped');
    }
  });

  // Transmission Auto / Manual
  const btnAuto = document.getElementById('btnTransAuto');
  const btnManual = document.getElementById('btnTransManual');
  btnAuto.addEventListener('click', () => {
    sim.autoShift = true;
    btnAuto.classList.add('active');
    btnManual.classList.remove('active');
  });
  btnManual.addEventListener('click', () => {
    sim.autoShift = false;
    btnManual.classList.add('active');
    btnAuto.classList.remove('active');
  });

  // Pedals (Mouse/Touch + Keyboard W/S/E/Q)
  const btnGas = document.getElementById('btnGasPedal');
  const btnBrake = document.getElementById('btnBrakePedal');
  const setGas = (down) => { sim.pedalGas = down; btnGas.classList.toggle('pressed', down); };
  const setBrake = (down) => { sim.pedalBrake = down; btnBrake.classList.toggle('pressed', down); };

  btnGas.addEventListener('pointerdown', () => setGas(true));
  btnGas.addEventListener('pointerup', () => setGas(false));
  btnGas.addEventListener('pointerleave', () => setGas(false));

  btnBrake.addEventListener('pointerdown', () => setBrake(true));
  btnBrake.addEventListener('pointerup', () => setBrake(false));
  btnBrake.addEventListener('pointerleave', () => setBrake(false));

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 'w') setGas(true);
    if (k === 's') setBrake(true);
    if (k === 'e') shiftUp();
    if (k === 'q') shiftDown();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w') setGas(false);
    if (k === 's') setBrake(false);
  });

  document.getElementById('sliderThrottle').addEventListener('input', e => {
    sim.holdThrottle = Number(e.target.value) / 100;
    document.getElementById('lblThrottle').textContent = `${e.target.value}%`;
  });
  document.getElementById('sliderBrake').addEventListener('input', e => {
    sim.holdBrake = Number(e.target.value) / 100;
    document.getElementById('lblBrake').textContent = `${e.target.value}%`;
  });

  document.getElementById('btnGearUp').addEventListener('click', shiftUp);
  document.getElementById('btnGearDown').addEventListener('click', shiftDown);

  // Config listeners
  const bindSelect = (id, key, rebuild = false) => {
    document.getElementById(id).addEventListener('change', e => {
      cfg[key] = e.target.value;
      if (key === 'layout') {
        const l = ENGINE_LAYOUTS[cfg.layout];
        cfg.boreMm = l.defaultBore;
        cfg.strokeMm = l.defaultStroke;
        syncInputsFromConfig();
      }
      if (key === 'fuelType') {
        const isD = FUEL_TYPES[cfg.fuelType].isDiesel;
        cfg.compressionRatio = isD ? 17.5 : 9.8;
        cfg.revLimit = isD ? 4800 : 7500;
        syncInputsFromConfig();
      }
      if (key === 'gearbox') {
        cfg.finalDrive = GEARBOX_PRESETS[cfg.gearbox].finalDrive;
        syncInputsFromConfig();
      }
      updateDispLabel();
      if (rebuild) viewer.rebuildEngine(cfg);
    });
  };

  bindSelect('cfgLayout', 'layout', true);
  bindSelect('cfgFuelType', 'fuelType', false);
  bindSelect('partIntake', 'intake', true);
  bindSelect('partIntercooler', 'intercooler', true);
  bindSelect('partTurbo', 'turbo', true);
  bindSelect('partTurboCooling', 'turboCooling', false);
  bindSelect('partCamshaft', 'camshaft', false);
  bindSelect('partInternals', 'internals', true);
  bindSelect('partFuelSystem', 'fuelSystem', false);
  bindSelect('partExhaust', 'exhaust', true);
  bindSelect('partOilCooling', 'oilCooling', true);
  bindSelect('partCooling', 'cooling', true);
  bindSelect('cfgGearbox', 'gearbox', false);
  bindSelect('cfgDrivetrain', 'drivetrain', false);

  const bindRange = (id, key, lblId, fmt) => {
    document.getElementById(id).addEventListener('input', e => {
      cfg[key] = Number(e.target.value);
      document.getElementById(lblId).textContent = fmt(cfg[key]);
      updateDispLabel();
    });
  };

  bindRange('cfgBore', 'boreMm', 'valBore', v => v.toFixed(1));
  bindRange('cfgStroke', 'strokeMm', 'valStroke', v => v.toFixed(1));
  bindRange('cfgCR', 'compressionRatio', 'valCR', v => `${v.toFixed(1)}:1`);
  bindRange('cfgAmbTemp', 'ambientTempC', 'valAmbTemp', v => `${v}°C`);
  bindRange('cfgAmbPress', 'ambientPressureKpa', 'valAmbPress', v => `${v.toFixed(1)} kPa`);
  bindRange('ecuBoost', 'boostTargetPsi', 'valBoostTarget', v => `${v} PSI`);
  bindRange('ecuAfr', 'targetAFR', 'valTargetAfr', v => `${v.toFixed(1)}:1`);
  bindRange('ecuTiming', 'timingAdvance', 'valTiming', v => `${v}° BTDC`);
  bindRange('ecuRevLimit', 'revLimit', 'valRevLimit', v => `${v} RPM`);
  bindRange('cfgFinalDrive', 'finalDrive', 'valFinalDrive', v => v.toFixed(2));

  document.getElementById('ecuAntilag').addEventListener('change', e => cfg.antilag = e.target.checked);
  document.getElementById('ecuPops').addEventListener('change', e => cfg.popsBangs = e.target.checked);

  // Dyno Pull Button
  document.getElementById('btnDynoPull').addEventListener('click', () => {
    if (!sim.running) {
      sim.running = true;
      sim.rpm = 1500;
      btnToggleEngine.textContent = 'Stop Engine';
      btnToggleEngine.classList.remove('stopped');
    }
    if (!document.getElementById('catDrawer').classList.contains('open') || !document.getElementById('cat-dyno').classList.contains('active')) {
      openCategory('cat-dyno', 'Dyno');
    }
    sim.dynoPullActive = true;
    sim.dynoPullRpm = 1500;
    sim.gear = 4;
    sim.holdThrottle = 1.0;
    document.getElementById('sliderThrottle').value = 100;
    document.getElementById('lblThrottle').textContent = '100%';
    document.getElementById('btnDynoPull').disabled = true;
    sim.currentDyno = runDynoSweep(cfg);
    drawDynoChart();
  });

  document.getElementById('btnPinBaseline').addEventListener('click', () => {
    if (!sim.currentDyno) sim.currentDyno = runDynoSweep(cfg);
    sim.baselineDyno = sim.currentDyno;
    drawDynoChart();
  });
}

function updateDispLabel() {
  const cc = getDisplacementCc(cfg);
  document.getElementById('valDisp').textContent = `${Math.round(cc)} cc (${(cc / 1000).toFixed(2)} L)`;
}

function syncInputsFromConfig() {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('cfgLayout', cfg.layout);
  setVal('cfgFuelType', cfg.fuelType);
  setVal('cfgBore', cfg.boreMm);
  setVal('cfgStroke', cfg.strokeMm);
  setVal('cfgCR', cfg.compressionRatio);
  setVal('partIntake', cfg.intake);
  setVal('partIntercooler', cfg.intercooler);
  setVal('partTurbo', cfg.turbo);
  setVal('partTurboCooling', cfg.turboCooling);
  setVal('partCamshaft', cfg.camshaft);
  setVal('partInternals', cfg.internals);
  setVal('partFuelSystem', cfg.fuelSystem);
  setVal('partExhaust', cfg.exhaust);
  setVal('partOilCooling', cfg.oilCooling);
  setVal('partCooling', cfg.cooling);
  setVal('ecuBoost', cfg.boostTargetPsi);
  setVal('ecuAfr', cfg.targetAFR);
  setVal('ecuTiming', cfg.timingAdvance);
  setVal('ecuRevLimit', cfg.revLimit);
  setVal('cfgGearbox', cfg.gearbox);
  setVal('cfgDrivetrain', cfg.drivetrain);
  setVal('cfgFinalDrive', cfg.finalDrive);

  document.getElementById('valBore').textContent = cfg.boreMm.toFixed(1);
  document.getElementById('valStroke').textContent = cfg.strokeMm.toFixed(1);
  document.getElementById('valCR').textContent = `${cfg.compressionRatio.toFixed(1)}:1`;
  document.getElementById('valBoostTarget').textContent = `${cfg.boostTargetPsi} PSI`;
  document.getElementById('valTargetAfr').textContent = `${cfg.targetAFR.toFixed(1)}:1`;
  document.getElementById('valTiming').textContent = `${cfg.timingAdvance}° BTDC`;
  document.getElementById('valRevLimit').textContent = `${cfg.revLimit} RPM`;
  document.getElementById('valFinalDrive').textContent = cfg.finalDrive.toFixed(2);
  updateDispLabel();
}

const tachCanvas = document.getElementById('tachCanvas');
const tachCtx = tachCanvas.getContext('2d');

function drawTachometer(rpm, maxRpm) {
  const w = tachCanvas.width;
  const h = tachCanvas.height;
  const cx = w / 2;
  const cy = h * 0.56;
  const r = Math.min(w, h) * 0.43;

  tachCtx.clearRect(0, 0, w, h);
  const startA = Math.PI * 0.78;
  const endA = Math.PI * 2.22;
  const scaleMax = Math.ceil(maxRpm / 1000) * 1000 + 1000;

  tachCtx.beginPath();
  tachCtx.arc(cx, cy, r, startA, endA);
  tachCtx.strokeStyle = '#2a3140';
  tachCtx.lineWidth = 10;
  tachCtx.stroke();

  const redStart = startA + ((maxRpm - 500) / scaleMax) * (endA - startA);
  tachCtx.beginPath();
  tachCtx.arc(cx, cy, r, redStart, endA);
  tachCtx.strokeStyle = '#ea4335';
  tachCtx.lineWidth = 10;
  tachCtx.stroke();

  const steps = scaleMax / 1000;
  tachCtx.font = 'bold 20px Inter, sans-serif';
  tachCtx.textAlign = 'center';
  tachCtx.textBaseline = 'middle';
  for (let i = 0; i <= steps; i++) {
    const a = startA + (i / steps) * (endA - startA);
    tachCtx.beginPath();
    tachCtx.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
    tachCtx.lineTo(cx + Math.cos(a) * (r - 25), cy + Math.sin(a) * (r - 25));
    tachCtx.strokeStyle = i * 1000 >= maxRpm - 500 ? '#ea4335' : '#cbd5e1';
    tachCtx.lineWidth = 3;
    tachCtx.stroke();

    tachCtx.fillStyle = '#e2e8f0';
    tachCtx.fillText(String(i), cx + Math.cos(a) * (r - 44), cy + Math.sin(a) * (r - 44));
  }

  const clamped = Math.max(0, Math.min(scaleMax, rpm));
  const needleA = startA + (clamped / scaleMax) * (endA - startA);
  tachCtx.beginPath();
  tachCtx.moveTo(cx, cy);
  tachCtx.lineTo(cx + Math.cos(needleA) * (r - 16), cy + Math.sin(needleA) * (r - 16));
  tachCtx.strokeStyle = '#ea4335';
  tachCtx.lineWidth = 5;
  tachCtx.stroke();

  tachCtx.beginPath();
  tachCtx.arc(cx, cy, 11, 0, Math.PI * 2);
  tachCtx.fillStyle = '#334155';
  tachCtx.fill();

  tachCtx.fillStyle = '#f8fafc';
  tachCtx.font = 'bold 26px Inter, sans-serif';
  tachCtx.fillText(Math.round(rpm), cx, cy + 56);
  tachCtx.fillStyle = '#94a3b8';
  tachCtx.font = 'bold 12px Inter, sans-serif';
  tachCtx.fillText('RPM', cx, cy + 78);
}

function drawDynoChart(sweepRpmMarker = null) {
  const canvas = document.getElementById('dynoCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!sim.currentDyno || sim.currentDyno.points.length === 0) return;
  const pts = sim.currentDyno.points;
  const pad = { l: 48, r: 24, t: 24, b: 30 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const maxRpm = sim.currentDyno.maxRpm;
  const minRpm = 1500;
  let maxY = Math.max(
    sim.currentDyno.peakBhp.val,
    sim.currentDyno.peakTorqueNm.val,
    sim.baselineDyno ? Math.max(sim.baselineDyno.peakBhp.val, sim.baselineDyno.peakTorqueNm.val) : 0,
    250
  ) * 1.12;

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  for (let i = 0; i <= 5; i++) {
    const y = pad.t + (i / 5) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxY * (1 - i / 5)), pad.l - 6, y + 4);
  }

  for (let r = 2000; r <= maxRpm; r += 1000) {
    const x = pad.l + ((r - minRpm) / (maxRpm - minRpm)) * cw;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, h - pad.b);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`${r / 1000}k`, x, h - 10);
  }

  const plotLine = (dataPts, key, color, dashed = false) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1.5 : 2.5;
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.beginPath();
    dataPts.forEach((p, idx) => {
      const x = pad.l + ((p.rpm - minRpm) / (maxRpm - minRpm)) * cw;
      const y = pad.t + (1 - p[key] / maxY) * ch;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  };

  if (sim.baselineDyno) {
    plotLine(sim.baselineDyno.points, 'bhp', '#475569', true);
    plotLine(sim.baselineDyno.points, 'torqueNm', '#334155', true);
  }

  plotLine(pts, 'bhp', '#ef4444');
  plotLine(pts, 'whp', '#38bdf8');
  plotLine(pts, 'torqueNm', '#f59e0b');

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ef4444'; ctx.fillText('■ BHP', pad.l + 8, pad.t + 14);
  ctx.fillStyle = '#38bdf8'; ctx.fillText('■ WHP', pad.l + 68, pad.t + 14);
  ctx.fillStyle = '#f59e0b'; ctx.fillText('■ Torque', pad.l + 128, pad.t + 14);

  if (sweepRpmMarker) {
    const x = pad.l + ((sweepRpmMarker - minRpm) / (maxRpm - minRpm)) * cw;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, h - pad.b);
    ctx.stroke();
  }

  const pk = sim.currentDyno;
  document.getElementById('dynoPeakSummary').textContent =
    `Peak: ${Math.round(pk.peakBhp.val)} BHP / ${Math.round(pk.peakWhp.val)} WHP @ ${pk.peakBhp.rpm} RPM | ${Math.round(pk.peakTorqueNm.val)} Nm`;

  // Populate detailed Dyno Pull Results card
  const card = document.getElementById('dynoResultsCard');
  card.style.display = 'block';
  const maxBoost = Math.max(...pts.map(p => p.boostPsi));
  const maxEgt = Math.max(...pts.map(p => p.egtC));
  const maxSae = Math.max(...pts.map(p => p.saeHp));
  const base = sim.baselineDyno;
  const fmtDelta = (cur, prev, unit) => {
    if (!base) return null;
    const d = Math.round(cur - prev);
    return `${d >= 0 ? '+' : ''}${d} ${unit}`;
  };

  document.getElementById('resBhp').textContent = `${Math.round(pk.peakBhp.val)} BHP`;
  document.getElementById('resBhpSub').textContent = base
    ? `${fmtDelta(pk.peakBhp.val, base.peakBhp.val, 'BHP')} vs Base`
    : `@ ${pk.peakBhp.rpm} RPM`;

  document.getElementById('resWhp').textContent = `${Math.round(pk.peakWhp.val)} WHP`;
  document.getElementById('resWhpSub').textContent = base
    ? `${fmtDelta(pk.peakWhp.val, base.peakWhp.val, 'WHP')} vs Base`
    : `@ ${pk.peakWhp.rpm} RPM`;

  document.getElementById('resTq').textContent = `${Math.round(pk.peakTorqueNm.val)} Nm`;
  document.getElementById('resTqSub').textContent = base
    ? `${fmtDelta(pk.peakTorqueNm.val, base.peakTorqueNm.val, 'Nm')} vs Base`
    : `${Math.round(pk.peakTorqueNm.val * 0.737562)} lb-ft @ ${pk.peakTorqueNm.rpm}`;

  document.getElementById('resSae').textContent = `${Math.round(maxSae)} SAE`;
  document.getElementById('resSaeSub').textContent = `${Math.round(pk.peakBhp.val * 1.01387)} PS`;

  document.getElementById('resBoost').textContent = `${maxBoost.toFixed(1)} PSI`;
  document.getElementById('resBoostSub').textContent = `${(maxBoost * 0.0689476).toFixed(2)} bar`;

  document.getElementById('resEgt').textContent = `${Math.round(maxEgt)}°C`;
  document.getElementById('resEgtSub').textContent = `Redline ${pk.maxRpm} RPM`;
}

let lastTime = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  sim.throttle = sim.pedalGas ? 1.0 : sim.holdThrottle;
  sim.brake = sim.pedalBrake ? 1.0 : sim.holdBrake;

  const mode = DRIVE_MODES[cfg.driveMode];
  const turboPart = PARTS_CATALOG.turbo.find(t => t.id === cfg.turbo);
  const effectiveMaxRpm = Math.max(3500, cfg.revLimit + mode.revLimitOffset);

  if (!sim.running) {
    sim.rpm = Math.max(0, sim.rpm - 1200 * dt);
    sim.boostPsi += (0 - sim.boostPsi) * dt * 4;
    viewer.updateTelemetry(sim.rpm, sim.boostPsi, 120, 0, dt);
    audio.update(0, 0, 0, 4, false, 'stock', false, 0);
    drawTachometer(sim.rpm, effectiveMaxRpm);
    document.getElementById('hudSpeed').textContent = '0';
    document.getElementById('hudHp').textContent = '0 BHP';
    document.getElementById('hudWhp').textContent = '0 WHP';
    document.getElementById('hudBoost').textContent = '0.0 bar';
    document.getElementById('barBoost').style.width = '0%';
    return;
  }

  if (sim.dynoPullActive) {
    sim.dynoPullRpm += 850 * dt;
    sim.rpm = sim.dynoPullRpm;
    drawDynoChart(sim.rpm);
    if (sim.dynoPullRpm >= effectiveMaxRpm) {
      sim.dynoPullActive = false;
      sim.holdThrottle = 0;
      document.getElementById('sliderThrottle').value = 0;
      document.getElementById('lblThrottle').textContent = '0%';
      document.getElementById('btnDynoPull').disabled = false;
      drawDynoChart();
    }
  }

  const res = evaluateEnginePoint(cfg, sim.rpm, sim.throttle, sim.boostPsi);

  const spoolRate = turboPart.type === 'turbo' ? (1 / Math.max(0.06, turboPart.lag)) : 14;
  const vacTarget = FUEL_TYPES[cfg.fuelType].isDiesel ? 0 : -(1 - sim.throttle) * 9.5;
  const desiredBoost = res.targetBoostPsi > 0.2 ? res.targetBoostPsi : vacTarget;
  sim.boostPsi += (desiredBoost - sim.boostPsi) * Math.min(1, dt * spoolRate);

  if (!sim.dynoPullActive) {
    const gb = GEARBOX_PRESETS[cfg.gearbox];
    const ratio = sim.gear > 0 ? gb.ratios[sim.gear - 1] * cfg.finalDrive : 0;
    const speedKmh = computeVehicleSpeedKmh(sim.rpm, sim.gear, cfg);
    const speedMs = speedKmh / 3.6;
    const wheelRadiusM = (gb.tireDiaMm / 1000) / 2;

    // Realistic rotational inertia: engine/flywheel/clutch + drivetrain + reflected vehicle mass (1650 kg)
    const engineInertia = 0.95 + res.dispL * 0.22;
    const drivetrainInertia = sim.gear > 0 ? 0.35 : 0;
    const vehicleInertia = sim.gear > 0 ? 1650 * Math.pow(wheelRadiusM / ratio, 2) : 0;
    const totalInertia = engineInertia + drivetrainInertia + vehicleInertia;

    // Aerodynamic drag + rolling resistance + engine braking + viscous friction + dyno brake load
    const aeroForceN = 0.5 * 1.225 * 0.32 * 2.2 * speedMs * speedMs;
    const roadLoadNm = sim.gear > 0 ? ((aeroForceN + 220) * wheelRadiusM) / ratio : 0;
    const brakeLoadNm = sim.brake * (sim.gear > 0 ? 750 : 320);
    const engineBrakingNm = (1 - sim.throttle) * (18 + sim.rpm * 0.011) + sim.rpm * 0.006;

    const idleTarget = 850 + (PARTS_CATALOG.camshaft.find(c => c.id === cfg.camshaft).lope * 180);
    const idleAssistNm = sim.rpm < idleTarget ? (idleTarget - sim.rpm) * 0.25 : 0;

    // Rev-limiter fuel cut
    if (sim.rpm >= effectiveMaxRpm) sim.revCut = true;
    else if (sim.rpm < effectiveMaxRpm - 180) sim.revCut = false;
    const driveTorqueNm = sim.revCut ? 0 : res.crankTorqueNm;

    const netTorqueNm = (driveTorqueNm + idleAssistNm) - (roadLoadNm + brakeLoadNm + engineBrakingNm);
    const dRpm = (netTorqueNm / totalInertia) * 9.5492966 * dt;
    sim.rpm = Math.max(650, sim.rpm + dRpm);

    if (sim.autoShift && sim.gear > 0) {
      const upshiftRpm = effectiveMaxRpm * mode.shiftRpmPct;
      if (sim.rpm >= upshiftRpm && sim.gear < gb.ratios.length && sim.throttle > 0.15) {
        const oldR = gb.ratios[sim.gear - 1];
        const newR = gb.ratios[sim.gear];
        sim.rpm *= (newR / oldR);
        sim.gear++;
      } else if (sim.rpm < 1750 && sim.gear > 1) {
        const oldR = gb.ratios[sim.gear - 1];
        const newR = gb.ratios[sim.gear - 2];
        sim.rpm *= (newR / oldR);
        sim.gear--;
      }
    }
  }

  const radMult = PARTS_CATALOG.cooling.find(c => c.id === cfg.cooling).coolingW * mode.fanAggression;
  const oilMult = PARTS_CATALOG.oilCooling.find(c => c.id === cfg.oilCooling).coolingW;
  const heatLoad = (res.bhp / 120) * (0.4 + 0.6 * sim.throttle) + (sim.rpm / 8000) * 0.4;
  sim.coolantC += ((85 + (heatLoad * 18) / radMult) - sim.coolantC) * dt * 0.12;
  sim.oilC += ((90 + (heatLoad * 26) / oilMult) - sim.oilC) * dt * 0.08;

  const camLope = PARTS_CATALOG.camshaft.find(c => c.id === cfg.camshaft).lope;
  viewer.updateTelemetry(sim.rpm, sim.boostPsi, res.egtC, sim.throttle, dt);
  const popped = audio.update(
    sim.rpm, sim.throttle, sim.boostPsi,
    ENGINE_LAYOUTS[cfg.layout].cylinders,
    FUEL_TYPES[cfg.fuelType].isDiesel,
    cfg.exhaust,
    cfg.popsBangs || cfg.antilag,
    camLope,
    sim.revCut
  );
  if (popped) viewer.triggerFlame();

  drawTachometer(sim.rpm, effectiveMaxRpm);
  const speedKmh = computeVehicleSpeedKmh(sim.rpm, sim.gear, cfg);

  // 0-100 km/h Stopwatch
  if (sim.gear === 0 || speedKmh < 3) {
    if (sim.throttle < 0.1) { sim.launchTime = null; sim.zeroToHundred = null; }
  } else if (!sim.launchTime && sim.throttle > 0.3 && speedKmh < 20) {
    sim.launchTime = now;
    sim.zeroToHundred = null;
  } else if (sim.launchTime && !sim.zeroToHundred && speedKmh >= 100) {
    sim.zeroToHundred = (now - sim.launchTime) / 1000;
  }
  const el0100 = document.getElementById('hudZeroToHundred');
  if (sim.zeroToHundred) {
    el0100.textContent = `0-100: ${sim.zeroToHundred.toFixed(2)}s`;
    el0100.style.color = '#10b981';
  } else if (sim.launchTime && speedKmh >= 3 && speedKmh < 100) {
    el0100.textContent = `0-100: ${((now - sim.launchTime) / 1000).toFixed(1)}s`;
    el0100.style.color = '#38bdf8';
  } else {
    el0100.textContent = '0-100: --';
    el0100.style.color = '';
  }
  document.getElementById('hudSpeed').textContent = Math.round(speedKmh);
  document.getElementById('hudGear').textContent = sim.gear === 0 ? 'N' : sim.gear;
  document.getElementById('hudGearRatio').textContent = sim.gear === 0
    ? 'Neutral'
    : `${GEARBOX_PRESETS[cfg.gearbox].ratios[sim.gear - 1].toFixed(2)}:1`;

  const boostBar = sim.boostPsi * 0.0689476;
  document.getElementById('hudBoost').textContent = `${boostBar.toFixed(2)} bar`;
  document.getElementById('barBoost').style.width = `${Math.max(0, Math.min(100, (sim.boostPsi / 35) * 100))}%`;

  document.getElementById('hudTemps').textContent = `${Math.round(sim.coolantC)}°C`;
  document.getElementById('barTemp').style.width = `${Math.max(0, Math.min(100, ((sim.coolantC - 60) / 70) * 100))}%`;

  document.getElementById('hudHp').textContent = `${Math.round(res.bhp)} BHP`;
  document.getElementById('hudWhp').textContent = `${Math.round(res.whp)} WHP | ${Math.round(res.ps)} PS`;

  document.getElementById('hudTorque').textContent = `${Math.round(res.crankTorqueNm)} Nm`;
  document.getElementById('hudAfr').textContent = `AFR ${res.actualAFR.toFixed(1)}`;
  document.getElementById('hudEgt').textContent = `EGT ${Math.round(res.egtC)}°C`;

  document.getElementById('warnKnock').classList.toggle('show', res.knockRisk > 45);
  document.getElementById('warnFuel').classList.toggle('show', res.fuelStarved);
  document.getElementById('warnOverheat').classList.toggle('show', sim.coolantC > 108 || sim.oilC > 128);
  document.getElementById('warnStress').classList.toggle('show', res.peakCylBar > res.maxCylBar || sim.rpm > res.maxSafeRpm);

  document.getElementById('teleIhp').textContent = `${res.ihp.toFixed(1)}`;
  document.getElementById('teleFhp').textContent = `${res.fhp.toFixed(1)}`;
  document.getElementById('teleBhp').textContent = `${res.bhp.toFixed(1)}`;
  document.getElementById('teleWhp').textContent = `${res.whp.toFixed(1)}`;
  document.getElementById('telePs').textContent = `${res.ps.toFixed(1)}`;
  document.getElementById('teleSae').textContent = `${res.saeHp.toFixed(1)}`;
  document.getElementById('teleWhlTq').textContent = `${Math.round(res.wheelTorqueNm)} Nm`;
  document.getElementById('teleBmep').textContent = `${res.bmepBar.toFixed(1)} bar`;
  document.getElementById('teleVe').textContent = `${res.ve.toFixed(1)}%`;
  document.getElementById('teleAir').textContent = `${res.airFlowGs.toFixed(1)} g/s`;
  document.getElementById('teleFuel').textContent = `${res.fuelFlowLph.toFixed(1)} L/h`;
  document.getElementById('teleKnock').textContent = `${Math.round(res.peakCylBar)} bar`;
}

initUI();
requestAnimationFrame(tick);
