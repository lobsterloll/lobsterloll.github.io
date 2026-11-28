// Engine Physics & Thermodynamic Simulation Engine
// Computes IHP, FHP, BHP, PS, WHP, SAE Corrected HP, Torque, BMEP, VE, AFR, Boost, Temps, and Gearing.

export const ENGINE_LAYOUTS = {
  I4:   { name: 'Inline-4 (DOHC)', cylinders: 4,  bankAngle: 0,   type: 'inline', defaultBore: 86, defaultStroke: 86,  firingOrder: [0, 2, 3, 1], baseFriction: 1.00, soundFreqMult: 1.0 },
  I6:   { name: 'Inline-6 (DOHC)', cylinders: 6,  bankAngle: 0,   type: 'inline', defaultBore: 84, defaultStroke: 89.6,firingOrder: [0, 4, 2, 5, 1, 3], baseFriction: 1.03, soundFreqMult: 1.5 },
  V6:   { name: 'V6 (60° DOHC)',   cylinders: 6,  bankAngle: 60,  type: 'v',      defaultBore: 89, defaultStroke: 80,  firingOrder: [0, 3, 1, 4, 2, 5], baseFriction: 1.04, soundFreqMult: 1.5 },
  V8:   { name: 'V8 (90° Crossplane)', cylinders: 8, bankAngle: 90, type: 'v',   defaultBore: 94, defaultStroke: 92,  firingOrder: [0, 7, 3, 2, 5, 4, 1, 6], baseFriction: 1.06, soundFreqMult: 2.0 },
  V10:  { name: 'V10 (90°)',       cylinders: 10, bankAngle: 90,  type: 'v',      defaultBore: 84.5, defaultStroke: 92.8, firingOrder: [0, 5, 4, 9, 1, 6, 2, 7, 3, 8], baseFriction: 1.09, soundFreqMult: 2.5 },
  V12:  { name: 'V12 (60°)',       cylinders: 12, bankAngle: 60,  type: 'v',      defaultBore: 88, defaultStroke: 78,  firingOrder: [0, 11, 4, 7, 2, 9, 5, 6, 1, 10, 3, 8], baseFriction: 1.12, soundFreqMult: 3.0 },
  F4:   { name: 'Boxer Flat-4',    cylinders: 4,  bankAngle: 180, type: 'boxer',  defaultBore: 99.5, defaultStroke: 79, firingOrder: [0, 2, 1, 3], baseFriction: 1.02, soundFreqMult: 1.0 }
};

export const FUEL_TYPES = {
  gas87:     { name: '87 Octane (Regular)',   isDiesel: false, energyMJkg: 44.0, stoichAFR: 14.7, octane: 87,  coolingEffect: 1.00, densityKgL: 0.745 },
  gas93:     { name: '93 Octane (Premium)',   isDiesel: false, energyMJkg: 44.2, stoichAFR: 14.7, octane: 93,  coolingEffect: 1.02, densityKgL: 0.750 },
  e85:       { name: 'E85 Ethanol',           isDiesel: false, energyMJkg: 29.2, stoichAFR: 9.8,  octane: 105, coolingEffect: 1.28, densityKgL: 0.785 },
  race104:   { name: 'Race Fuel (104+ Oct)',  isDiesel: false, energyMJkg: 44.5, stoichAFR: 14.5, octane: 108, coolingEffect: 1.06, densityKgL: 0.755 },
  diesel2:   { name: 'Diesel #2 (ULSD)',      isDiesel: true,  energyMJkg: 42.6, stoichAFR: 14.5, octane: 0,   coolingEffect: 0.95, densityKgL: 0.840 },
  biodiesel: { name: 'Biodiesel (B100)',      isDiesel: true,  energyMJkg: 37.5, stoichAFR: 13.8, octane: 0,   coolingEffect: 0.96, densityKgL: 0.880 }
};

export const PARTS_CATALOG = {
  intake: [
    { id: 'stock',    name: 'Stock Airbox',         veBonus: 0.00, flowLimitMult: 1.00, iatDelta: 0 },
    { id: 'cai',      name: 'Cold Air Intake',      veBonus: 0.04, flowLimitMult: 1.15, iatDelta: -6 },
    { id: 'shortram', name: 'Short Ram Cone',       veBonus: 0.03, flowLimitMult: 1.12, iatDelta: 5 },
    { id: 'itb',      name: 'Carbon Velocity ITBs', veBonus: 0.09, flowLimitMult: 1.35, iatDelta: -4 }
  ],
  intercooler: [
    { id: 'none',       name: 'None (NA / Direct)',    efficiency: 0.00, pressureDropPsi: 0.0 },
    { id: 'stock',      name: 'Stock Side-Mount',      efficiency: 0.52, pressureDropPsi: 1.2 },
    { id: 'fmic',       name: 'Front-Mount (FMIC)',    efficiency: 0.72, pressureDropPsi: 0.9 },
    { id: 'race_fmic',  name: 'Oversized Race FMIC',   efficiency: 0.84, pressureDropPsi: 0.7 },
    { id: 'water_air',  name: 'Water-to-Air + Meth',   efficiency: 0.94, pressureDropPsi: 0.5 }
  ],
  turbo: [
    { id: 'na',         name: 'Naturally Aspirated',    type: 'na',    maxPsi: 0,  spoolRpm: 0,    maxAirLbMin: 999, efficiency: 1.00, lag: 0 },
    { id: 'small',      name: 'Small Single Turbo',     type: 'turbo', maxPsi: 18, spoolRpm: 1650, maxAirLbMin: 29,  efficiency: 0.74, lag: 0.16 },
    { id: 'medium',     name: 'Ball-Bearing Mid Turbo', type: 'turbo', maxPsi: 28, spoolRpm: 2650, maxAirLbMin: 45,  efficiency: 0.79, lag: 0.26 },
    { id: 'large',      name: 'Big Frame Race Turbo',   type: 'turbo', maxPsi: 44, spoolRpm: 3900, maxAirLbMin: 74,  efficiency: 0.76, lag: 0.42 },
    { id: 'twin',       name: 'Sequential Twin-Turbo',  type: 'turbo', maxPsi: 34, spoolRpm: 2100, maxAirLbMin: 68,  efficiency: 0.81, lag: 0.20 },
    { id: 'super',      name: 'Twin-Screw Supercharger',type: 'sc',    maxPsi: 22, spoolRpm: 900,  maxAirLbMin: 60,  efficiency: 0.68, lag: 0.02 }
  ],
  turboCooling: [
    { id: 'oil',        name: 'Oil-Cooled Bearing',    tempMult: 1.08, spoolBonus: 0 },
    { id: 'water_oil',  name: 'Water + Oil Cooled',    tempMult: 0.94, spoolBonus: 0.03 },
    { id: 'blanket',    name: 'Water/Oil + Ti Blanket',tempMult: 0.86, spoolBonus: 0.06 }
  ],
  camshaft: [
    { id: 'stock',      name: 'Stock OEM Cam',         peakShift: 0,    vePeak: 0.00, lowEndLoss: 0.00, maxSafeRpmBonus: 0,    lope: 0.0 },
    { id: 'stage1',     name: 'Stage 1 Street Cam',    peakShift: 450,  vePeak: 0.05, lowEndLoss: 0.02, maxSafeRpmBonus: 400,  lope: 0.25 },
    { id: 'stage2',     name: 'Stage 2 Aggressive',    peakShift: 950,  vePeak: 0.10, lowEndLoss: 0.06, maxSafeRpmBonus: 800,  lope: 0.60 },
    { id: 'stage3',     name: 'Stage 3 Race / Solid',  peakShift: 1550, vePeak: 0.16, lowEndLoss: 0.12, maxSafeRpmBonus: 1400, lope: 1.00 }
  ],
  internals: [
    { id: 'cast',       name: 'Cast Stock Internals',  maxCylBar: 105, maxRpmBase: 7000,  frictionMult: 1.00 },
    { id: 'forged',     name: 'Forged Pistons & Rods', maxCylBar: 165, maxRpmBase: 8400,  frictionMult: 0.97 },
    { id: 'billet',     name: 'Billet Crank + Ti Valves',maxCylBar: 230, maxRpmBase: 9800, frictionMult: 0.94 }
  ],
  fuelSystem: [
    { id: 'stock',      name: 'Stock Injectors & Pump', maxFlowLph: 140 },
    { id: 'highflow',   name: '550cc + 255LPH Pump',    maxFlowLph: 260 },
    { id: 'race1000',   name: '1050cc + Dual Pump',     maxFlowLph: 520 },
    { id: 'dual_port',  name: 'Direct + Port 2000cc',   maxFlowLph: 980 }
  ],
  exhaust: [
    { id: 'stock',      name: 'Stock Muffler & Cat',   backpressure: 1.00, veBonus: 0.00, spoolGain: 0.00 },
    { id: 'catback',    name: 'Sport Cat-Back',        backpressure: 0.72, veBonus: 0.03, spoolGain: 0.04 },
    { id: 'turboback',  name: 'High-Flow Turbo-Back',  backpressure: 0.45, veBonus: 0.06, spoolGain: 0.10 },
    { id: 'titanium',   name: 'Titanium Straight-Pipe',backpressure: 0.22, veBonus: 0.09, spoolGain: 0.15 }
  ],
  oilCooling: [
    { id: 'stock',      name: 'Stock Oil Pan',         coolingW: 1.00 },
    { id: 'thermo',     name: '19-Row Oil Cooler',     coolingW: 1.45 },
    { id: 'drysump',    name: 'Dry Sump + Race Cooler',coolingW: 1.95 }
  ],
  cooling: [
    { id: 'stock',      name: 'Stock Radiator',        coolingW: 1.00 },
    { id: 'alu',        name: 'Aluminum 3-Core Rad',   coolingW: 1.45 },
    { id: 'race',       name: 'Dual-Fan Race Cooling', coolingW: 1.90 }
  ]
};

export const DRIVETRAINS = {
  fwd: { name: 'FWD (12% Loss)', loss: 0.12 },
  rwd: { name: 'RWD (15% Loss)', loss: 0.15 },
  awd: { name: 'AWD (20% Loss)', loss: 0.20 }
};

export const GEARBOX_PRESETS = {
  '6spd_sport': { name: '6-Speed Close-Ratio', ratios: [3.25, 2.15, 1.56, 1.21, 0.97, 0.78], finalDrive: 3.91, tireDiaMm: 640 },
  '7spd_dct':   { name: '7-Speed DCT',         ratios: [3.69, 2.38, 1.72, 1.32, 1.05, 0.86, 0.71], finalDrive: 3.62, tireDiaMm: 650 },
  '5spd_tall':  { name: '5-Speed Long Gear',   ratios: [3.35, 1.93, 1.29, 1.00, 0.76], finalDrive: 3.42, tireDiaMm: 645 },
  'diesel_6':   { name: '6-Speed Diesel Heavy',ratios: [4.15, 2.32, 1.48, 1.06, 0.81, 0.64], finalDrive: 3.23, tireDiaMm: 710 }
};

export const DRIVE_MODES = {
  eco:     { name: 'ECO',     throttlePower: 1.55, boostCapMult: 0.65, revLimitOffset: -1200, timingOffset: -2, fanAggression: 0.85, shiftRpmPct: 0.52 },
  comfort: { name: 'COMFORT', throttlePower: 1.15, boostCapMult: 0.85, revLimitOffset: -400,  timingOffset: 0,  fanAggression: 1.00, shiftRpmPct: 0.72 },
  sport:   { name: 'SPORT',   throttlePower: 0.78, boostCapMult: 1.00, revLimitOffset: 0,     timingOffset: 2,  fanAggression: 1.25, shiftRpmPct: 0.94 }
};

export const STAGE_PRESETS = {
  stock: {
    label: 'Stock OEM',
    intake: 'stock', intercooler: 'stock', turbo: 'small', turboCooling: 'oil',
    camshaft: 'stock', internals: 'cast', fuelSystem: 'stock', exhaust: 'stock',
    oilCooling: 'stock', cooling: 'stock',
    boostTargetPsi: 13.5, targetAFR: 12.8, timingAdvance: 16, revLimit: 6500
  },
  stage1: {
    label: 'Stage 1 (ECU + Intake)',
    intake: 'cai', intercooler: 'stock', turbo: 'small', turboCooling: 'water_oil',
    camshaft: 'stock', internals: 'cast', fuelSystem: 'stock', exhaust: 'catback',
    oilCooling: 'stock', cooling: 'stock',
    boostTargetPsi: 15, targetAFR: 12.6, timingAdvance: 18, revLimit: 7100
  },
  stage2: {
    label: 'Stage 2 (Bolt-Ons + FMIC)',
    intake: 'cai', intercooler: 'fmic', turbo: 'medium', turboCooling: 'water_oil',
    camshaft: 'stage1', internals: 'cast', fuelSystem: 'highflow', exhaust: 'turboback',
    oilCooling: 'thermo', cooling: 'alu',
    boostTargetPsi: 22, targetAFR: 11.9, timingAdvance: 20, revLimit: 7500
  },
  stage3: {
    label: 'Stage 3 (Big Turbo + Forged)',
    intake: 'itb', intercooler: 'race_fmic', turbo: 'large', turboCooling: 'blanket',
    camshaft: 'stage2', internals: 'forged', fuelSystem: 'race1000', exhaust: 'titanium',
    oilCooling: 'thermo', cooling: 'race',
    boostTargetPsi: 31, targetAFR: 11.4, timingAdvance: 22, revLimit: 8300
  },
  stage3plus: {
    label: 'Stage 3+ (Built Race)',
    intake: 'itb', intercooler: 'water_air', turbo: 'large', turboCooling: 'blanket',
    camshaft: 'stage3', internals: 'billet', fuelSystem: 'dual_port', exhaust: 'titanium',
    oilCooling: 'drysump', cooling: 'race',
    boostTargetPsi: 40, targetAFR: 11.2, timingAdvance: 25, revLimit: 9400
  }
};

export function createDefaultConfig() {
  return {
    layout: 'I4',
    fuelType: 'gas93',
    boreMm: 86,
    strokeMm: 86,
    compressionRatio: 9.8,
    drivetrain: 'awd',
    gearbox: '6spd_sport',
    finalDrive: 3.91,
    driveMode: 'sport',
    ambientTempC: 22,
    ambientPressureKpa: 101.325,
    humidityPct: 40,
    ...STAGE_PRESETS.stage2,
    antilag: false,
    popsBangs: true
  };
}

export function getDisplacementCc(cfg) {
  const layout = ENGINE_LAYOUTS[cfg.layout];
  const rCm = (cfg.boreMm / 10) / 2;
  const strokeCm = cfg.strokeMm / 10;
  return Math.PI * rCm * rCm * strokeCm * layout.cylinders;
}

function findPart(category, id) {
  return PARTS_CATALOG[category].find(p => p.id === id) || PARTS_CATALOG[category][0];
}

// Compute steady-state or instantaneous engine physics at a given RPM, throttle (0..1), and current boostPsi
export function evaluateEnginePoint(cfg, rpm, throttle, currentBoostPsi, temps = null) {
  const layout = ENGINE_LAYOUTS[cfg.layout];
  const fuel = FUEL_TYPES[cfg.fuelType];
  const mode = DRIVE_MODES[cfg.driveMode];

  const intake = findPart('intake', cfg.intake);
  const ic = findPart('intercooler', cfg.intercooler);
  const turbo = findPart('turbo', cfg.turbo);
  const turboCool = findPart('turboCooling', cfg.turboCooling);
  const cam = findPart('camshaft', cfg.camshaft);
  const internals = findPart('internals', cfg.internals);
  const fuelSys = findPart('fuelSystem', cfg.fuelSystem);
  const exhaust = findPart('exhaust', cfg.exhaust);

  const dispCc = getDisplacementCc(cfg);
  const dispL = dispCc / 1000;
  const isDiesel = fuel.isDiesel;

  // Effective throttle shaped by drive mode
  const effThrottle = Math.pow(Math.max(0, Math.min(1, throttle)), mode.throttlePower);

  // Volumetric Efficiency (VE) curve
  const basePeakRpm = isDiesel ? 2350 : 4700;
  const peakRpm = basePeakRpm + (isDiesel ? cam.peakShift * 0.4 : cam.peakShift);
  const normRpm = Math.max(0.15, rpm / peakRpm);

  // Bell-shaped VE curve with low-end cam penalty & high-RPM breathing roll-off
  let baseVE = (isDiesel ? 0.90 : 0.88) - (isDiesel ? 0.34 : 0.28) * Math.pow(normRpm - 1.0, 2);
  if (isDiesel && rpm > 3400) {
    baseVE -= ((rpm - 3400) / 1400) * 0.22;
  }
  if (rpm < 2200) {
    baseVE -= cam.lowEndLoss * (1 - rpm / 2200);
  }
  baseVE += cam.vePeak * Math.exp(-Math.pow((rpm - peakRpm) / 2000, 2));
  baseVE += intake.veBonus + exhaust.veBonus;
  baseVE = Math.max(0.32, Math.min(1.16, baseVE));

  // Throttle plate restriction (Gasoline throttles air; Diesel runs unthrottled air, throttles fuel)
  const manifoldAirFactor = isDiesel ? 1.0 : (0.18 + 0.82 * effThrottle);

  // Target & available boost with compressor choke limit
  const effectiveMaxPsi = Math.min(cfg.boostTargetPsi * mode.boostCapMult, turbo.maxPsi);
  let targetBoostPsi = 0;
  if (turbo.type === 'turbo') {
    const spoolThresh = turbo.spoolRpm * (1 - exhaust.spoolGain - turboCool.spoolBonus);
    const spoolRatio = Math.max(0, Math.min(1, (rpm - spoolThresh * 0.45) / (spoolThresh * 0.75)));
    const loadFactor = isDiesel ? (0.35 + 0.65 * effThrottle) : effThrottle;
    targetBoostPsi = effectiveMaxPsi * Math.pow(spoolRatio, 1.35) * loadFactor;
    if (cfg.antilag && effThrottle < 0.15 && rpm > 3200) {
      targetBoostPsi = Math.max(targetBoostPsi, effectiveMaxPsi * 0.45);
    }
  } else if (turbo.type === 'sc') {
    const rpmRatio = Math.min(1, rpm / 5500);
    targetBoostPsi = effectiveMaxPsi * (0.45 + 0.55 * rpmRatio) * effThrottle;
  }

  let boostPsi = currentBoostPsi !== null && currentBoostPsi !== undefined ? currentBoostPsi : targetBoostPsi;
  // Compressor choke: small turbos taper boost at high RPM once mass airflow exceeds compressor wheel capacity
  const ambK = cfg.ambientTempC + 273.15;
  const estAirLbMin = dispL * (rpm / 120) * baseVE * ((cfg.ambientPressureKpa + Math.max(0, boostPsi) * 6.89476) / (0.287058 * ambK)) * manifoldAirFactor * 0.132277;
  let compEff = turbo.efficiency;
  if (turbo.type === 'turbo' && estAirLbMin > turbo.maxAirLbMin && boostPsi > 0) {
    const chokeRatio = turbo.maxAirLbMin / estAirLbMin;
    boostPsi *= Math.max(0.35, chokeRatio);
    targetBoostPsi *= Math.max(0.35, chokeRatio);
    compEff = Math.max(0.50, turbo.efficiency * chokeRatio);
  }
  const boostKpa = Math.max(0, boostPsi * 6.89476);

  // Intake manifold absolute pressure (MAP)
  const vacuumKpa = isDiesel ? 0 : (1 - effThrottle) * 58;
  const mapKpa = Math.max(28, cfg.ambientPressureKpa - vacuumKpa + boostKpa - ic.pressureDropPsi * 6.89476 * (boostPsi > 0 ? 1 : 0));

  // Compressor outlet temperature (ideal gas adiabatic heating) & Intercooler drop
  const pr = Math.max(1, (cfg.ambientPressureKpa + boostKpa) / cfg.ambientPressureKpa);
  const compOutletK = ambK * (1 + (Math.pow(pr, 0.2857) - 1) / Math.max(0.48, compEff));
  const icEff = turbo.type === 'na' ? 0 : ic.efficiency;
  const iatK = compOutletK - icEff * (compOutletK - ambK) + intake.iatDelta;
  const iatC = iatK - 273.15;

  // Air density in manifold (kg/m^3)
  const R_air = 287.058;
  const airDensity = (mapKpa * 1000) / (R_air * iatK);

  // Air mass flow (g/s) for 4-stroke engine: (Disp_L / 1000) * (RPM / 120) * VE * airDensity * 1000
  const airFlowGs = dispL * (rpm / 120) * baseVE * airDensity * manifoldAirFactor;
  const airFlowLbMin = airFlowGs * 0.132277;

  // Fueling & AFR
  let actualAFR = cfg.targetAFR;
  if (isDiesel) {
    // Diesel runs lean at idle/cruise (~45:1) down to ~18:1 at full load
    actualAFR = 45 - 27 * effThrottle;
  } else if (effThrottle < 0.35) {
    actualAFR = fuel.stoichAFR;
  }

  let requiredFuelGs = airFlowGs / Math.max(6, actualAFR);
  const maxFuelGs = (fuelSys.maxFlowLph * fuel.densityKgL * 1000) / 3600;
  let fuelStarved = false;
  if (requiredFuelGs > maxFuelGs) {
    fuelStarved = true;
    requiredFuelGs = maxFuelGs;
    actualAFR = airFlowGs / Math.max(0.01, requiredFuelGs);
  }
  const fuelFlowLph = (requiredFuelGs * 3600) / (fuel.densityKgL * 1000);

  // Thermal & Ignition efficiency
  const idealTiming = isDiesel ? 16 : (19 + (rpm / 8000) * 8 - Math.max(0, boostPsi) * 0.28);
  const effTiming = cfg.timingAdvance + mode.timingOffset;
  const timingDelta = effTiming - idealTiming;
  const timingEff = Math.max(0.72, 1.0 - 0.0022 * Math.pow(timingDelta, 2));

  // Compression ratio thermal efficiency (Otto / Diesel cycle approximation)
  const gamma = isDiesel ? 1.35 : 1.30;
  const ottoEff = 1 - 1 / Math.pow(cfg.compressionRatio, gamma - 1);
  const combustionEff = isDiesel ? 0.45 : 0.385;
  const crScale = ottoEff / (1 - 1 / Math.pow(10, 0.30));

  // AFR power multiplier (richer than stoich adds cooling/power up to ~12.2, leaner loses power)
  let afrPowerMult = 1.0;
  if (!isDiesel) {
    if (actualAFR < fuel.stoichAFR) {
      const richFactor = (fuel.stoichAFR - actualAFR) / fuel.stoichAFR;
      afrPowerMult = 1.0 + Math.min(0.06, richFactor * 0.32);
    } else {
      afrPowerMult = Math.max(0.65, 1.0 - (actualAFR - fuel.stoichAFR) * 0.08);
    }
  }

  // Indicated Power (Watts) limited by available oxygen (stoich air) or injected fuel
  const burnableFuelGs = isDiesel
    ? Math.min(requiredFuelGs, airFlowGs / 15.5)
    : Math.min(requiredFuelGs, airFlowGs / fuel.stoichAFR);
  const fuelPowerW = burnableFuelGs * fuel.energyMJkg * 1000;
  const indicatedW = fuelPowerW * combustionEff * crScale * timingEff * afrPowerMult;

  // Friction & Pumping Losses (FHP)
  const rpmK = rpm / 1000;
  const scParasiticW = turbo.type === 'sc' ? (boostPsi * 0.95 * rpmK * 120) : 0;
  const exhaustDrag = 1 + exhaust.backpressure * 0.14;
  const frictionW = (dispL * 1100 * (0.6 + 0.42 * rpmK + 0.095 * rpmK * rpmK) * layout.baseFriction * internals.frictionMult * exhaustDrag) + scParasiticW;

  const brakeW = Math.max(0, indicatedW - frictionW);

  // Convert to HP variants
  const W_PER_HP = 745.699872;
  const ihp = indicatedW / W_PER_HP;
  const fhp = frictionW / W_PER_HP;
  const bhp = brakeW / W_PER_HP;
  const ps = bhp * 1.013869665;

  // SAE J1349 Correction Factor (reference: 25°C, 99 kPa dry air)
  const dryPressureKpa = cfg.ambientPressureKpa - (cfg.humidityPct / 100) * 2.338;
  const saeCF = 1.176 * (99.0 / Math.max(70, dryPressureKpa)) * Math.sqrt((cfg.ambientTempC + 273.15) / 298.15) - 0.176;
  const saeHp = bhp * saeCF;

  // Wheel HP (WHP)
  const dtLoss = DRIVETRAINS[cfg.drivetrain].loss;
  const whp = bhp * (1 - dtLoss);

  // Torque (Nm & lb-ft)
  const omega = Math.max(1, (rpm * 2 * Math.PI) / 60);
  const crankTorqueNm = brakeW / omega;
  const crankTorqueLbFt = crankTorqueNm * 0.737562;
  const wheelTorqueNm = crankTorqueNm * (1 - dtLoss);
  const wheelTorqueLbFt = crankTorqueLbFt * (1 - dtLoss);

  // BMEP (bar) = (Torque_Nm * 4 * pi) / (Disp_m3 * 1e5) for 4-stroke
  const dispM3 = dispL / 1000;
  const bmepBar = (crankTorqueNm * 4 * Math.PI) / (dispM3 * 100000);

  // Peak cylinder pressure estimate (bar) & Knock risk (0..100%)
  const peakCylBar = (mapKpa / 100) * Math.pow(cfg.compressionRatio, 1.3) * (1 + 2.2 * effThrottle) * (1 + Math.max(0, timingDelta) * 0.015);
  let knockRisk = 0;
  if (!isDiesel) {
    const octaneMargin = fuel.octane - (85 + boostPsi * 0.75 + (cfg.compressionRatio - 9) * 3.2 + Math.max(0, timingDelta) * 0.7 + Math.max(0, iatC - 35) * 0.25);
    knockRisk = Math.max(0, Math.min(100, (1 - octaneMargin / 12) * 55 + (fuelStarved ? 45 : 0)));
  }

  // EGT estimate (°C)
  const baseEgt = isDiesel ? 220 : 340;
  const loadEgt = (isDiesel ? 460 : 540) * effThrottle * (0.55 + 0.45 * (rpm / 7500));
  const leanPenalty = !isDiesel && actualAFR > fuel.stoichAFR ? (actualAFR - fuel.stoichAFR) * 42 : 0;
  const retardPenalty = timingDelta < 0 ? Math.abs(timingDelta) * 11 : 0;
  const egtC = (baseEgt + loadEgt + leanPenalty + retardPenalty) * turboCool.tempMult / fuel.coolingEffect;

  // BSFC (g/kWh)
  const brakeKw = brakeW / 1000;
  const bsfc = brakeKw > 1 ? (requiredFuelGs * 3600) / brakeKw : 0;

  return {
    rpm,
    dispCc,
    dispL,
    ve: baseVE * 100,
    targetBoostPsi,
    boostPsi,
    mapKpa,
    iatC,
    airFlowGs,
    airFlowLbMin,
    actualAFR,
    fuelFlowLph,
    fuelStarved,
    ihp,
    fhp,
    bhp,
    ps,
    whp,
    saeHp,
    crankTorqueNm,
    crankTorqueLbFt,
    wheelTorqueNm,
    wheelTorqueLbFt,
    bmepBar,
    peakCylBar,
    maxCylBar: internals.maxCylBar,
    maxSafeRpm: internals.maxSafeRpmBase + cam.maxSafeRpmBonus,
    knockRisk,
    egtC,
    bsfc
  };
}

export function computeVehicleSpeedKmh(rpm, gearIndex, cfg) {
  if (gearIndex <= 0) return 0; // 0 = Neutral
  const gb = GEARBOX_PRESETS[cfg.gearbox];
  const ratio = gb.ratios[Math.min(gearIndex - 1, gb.ratios.length - 1)];
  const tireCircM = (gb.tireDiaMm / 1000) * Math.PI;
  const wheelRpm = rpm / (ratio * cfg.finalDrive);
  const speedMs = (wheelRpm * tireCircM) / 60;
  return speedMs * 3.6;
}

export function runDynoSweep(cfg) {
  const mode = DRIVE_MODES[cfg.driveMode];
  const maxRpm = Math.max(3500, cfg.revLimit + mode.revLimitOffset);
  const startRpm = 1500;
  const step = 250;
  const points = [];

  let peakBhp = { val: 0, rpm: 0 };
  let peakWhp = { val: 0, rpm: 0 };
  let peakTorqueNm = { val: 0, rpm: 0 };

  for (let rpm = startRpm; rpm <= maxRpm; rpm += step) {
    const res = evaluateEnginePoint(cfg, rpm, 1.0, null);
    points.push({
      rpm,
      bhp: res.bhp,
      whp: res.whp,
      ihp: res.ihp,
      saeHp: res.saeHp,
      torqueNm: res.crankTorqueNm,
      torqueLbFt: res.crankTorqueLbFt,
      boostPsi: res.boostPsi,
      afr: res.actualAFR,
      egtC: res.egtC
    });
    if (res.bhp > peakBhp.val) peakBhp = { val: res.bhp, rpm };
    if (res.whp > peakWhp.val) peakWhp = { val: res.whp, rpm };
    if (res.crankTorqueNm > peakTorqueNm.val) peakTorqueNm = { val: res.crankTorqueNm, rpm };
  }

  return { points, peakBhp, peakWhp, peakTorqueNm, maxRpm };
}
