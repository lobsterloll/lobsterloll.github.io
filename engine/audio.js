// Realistic Multi-Layer Web Audio API Engine, Turbo, BOV & Exhaust Synthesizer
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.oscFundamental = null;
    this.oscSub = null;
    this.oscHarmonic = null;
    this.oscDiesel = null;
    this.dieselGain = null;
    this.oscTurbo = null;
    this.turboGain = null;
    this.intakeNoiseGain = null;
    this.exhaustFilter = null;
    this.shaper = null;
    this.prevThrottle = 0;
    this.lastPopTime = 0;
    this.lastBovTime = 0;
  }

  enable() {
    if (!this.ctx) this._init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = true;
    this.masterGain.gain.setTargetAtTime(0.24, this.ctx.currentTime, 0.05);
    return true;
  }

  toggle() {
    if (!this.ctx) this._init();
    this.enabled = !this.enabled;
    if (this.ctx.state === 'suspended' && this.enabled) {
      this.ctx.resume();
    }
    this.masterGain.gain.setTargetAtTime(this.enabled ? 0.24 : 0, this.ctx.currentTime, 0.05);
    return this.enabled;
  }

  _makeDistortionCurve(amount = 28) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  _createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _init() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.ctx.destination);

    // Exhaust saturation + resonant lowpass
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = this._makeDistortionCurve(24);
    this.shaper.oversample = '2x';

    this.exhaustFilter = this.ctx.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.frequency.value = 340;
    this.exhaustFilter.Q.value = 3.2;

    this.shaper.connect(this.exhaustFilter);
    this.exhaustFilter.connect(this.masterGain);

    // 1. Fundamental firing pulse
    this.oscFundamental = this.ctx.createOscillator();
    this.oscFundamental.type = 'sawtooth';
    const fundGain = this.ctx.createGain();
    fundGain.gain.value = 0.55;
    this.oscFundamental.connect(fundGain);
    fundGain.connect(this.shaper);

    // 2. Sub-bass crank rumble (half firing freq)
    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'triangle';
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.45;
    this.oscSub.connect(subGain);
    subGain.connect(this.shaper);

    // 3. Upper mechanical/exhaust harmonic
    this.oscHarmonic = this.ctx.createOscillator();
    this.oscHarmonic.type = 'sawtooth';
    const harmGain = this.ctx.createGain();
    harmGain.gain.value = 0.22;
    this.oscHarmonic.connect(harmGain);
    harmGain.connect(this.shaper);

    // 4. Diesel clatter layer
    this.oscDiesel = this.ctx.createOscillator();
    this.oscDiesel.type = 'square';
    const dieselFilter = this.ctx.createBiquadFilter();
    dieselFilter.type = 'bandpass';
    dieselFilter.frequency.value = 1450;
    dieselFilter.Q.value = 2.0;
    this.dieselGain = this.ctx.createGain();
    this.dieselGain.gain.value = 0;
    this.oscDiesel.connect(dieselFilter);
    dieselFilter.connect(this.dieselGain);
    this.dieselGain.connect(this.masterGain);

    // 5. Intake induction roar (filtered white noise)
    this.noiseBuffer = this._createNoiseBuffer();
    const intakeNoise = this.ctx.createBufferSource();
    intakeNoise.buffer = this.noiseBuffer;
    intakeNoise.loop = true;
    const intakeFilter = this.ctx.createBiquadFilter();
    intakeFilter.type = 'bandpass';
    intakeFilter.frequency.value = 750;
    intakeFilter.Q.value = 1.1;
    this.intakeNoiseGain = this.ctx.createGain();
    this.intakeNoiseGain.gain.value = 0.02;
    intakeNoise.connect(intakeFilter);
    intakeFilter.connect(this.intakeNoiseGain);
    this.intakeNoiseGain.connect(this.masterGain);

    // 6. Turbocharger spool whistle
    this.oscTurbo = this.ctx.createOscillator();
    this.oscTurbo.type = 'sine';
    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.value = 0;
    this.oscTurbo.connect(this.turboGain);
    this.turboGain.connect(this.masterGain);

    this.oscFundamental.start();
    this.oscSub.start();
    this.oscHarmonic.start();
    this.oscDiesel.start();
    this.oscTurbo.start();
    intakeNoise.start();
  }

  _triggerBov(boostPsi) {
    const now = this.ctx.currentTime;
    if (now - this.lastBovTime < 0.45 || boostPsi < 3.5) return;
    this.lastBovTime = now;

    // BOV flutter / psshhh burst
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3200, now);
    bp.frequency.exponentialRampToValueAtTime(1100, now + 0.35);
    bp.Q.value = 3.5;

    const g = this.ctx.createGain();
    const amp = Math.min(0.28, boostPsi * 0.011);
    g.gain.setValueAtTime(amp, now);
    // Subtle flutter modulation
    g.gain.setValueAtTime(amp * 0.35, now + 0.07);
    g.gain.setValueAtTime(amp * 0.8, now + 0.13);
    g.gain.setValueAtTime(amp * 0.25, now + 0.20);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.4);
  }

  triggerStarter() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(165, now + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  _triggerPop() {
    const now = this.ctx.currentTime;
    if (now - this.lastPopTime < 0.09) return;
    this.lastPopTime = now;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650 + Math.random() * 500;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.26 + Math.random() * 0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    src.connect(lp);
    lp.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.09);
  }

  update(rpm, throttle, boostPsi, cylCount, isDiesel, exhaustId, popsBangs = false, camLope = 0, revCut = false) {
    if (!this.ctx || !this.enabled) return false;
    const now = this.ctx.currentTime;

    if (rpm < 50) {
      this.oscFundamental.frequency.setTargetAtTime(1, now, 0.05);
      this.oscSub.frequency.setTargetAtTime(1, now, 0.05);
      this.oscHarmonic.frequency.setTargetAtTime(1, now, 0.05);
      this.turboGain.gain.setTargetAtTime(0, now, 0.05);
      this.intakeNoiseGain.gain.setTargetAtTime(0, now, 0.05);
      return false;
    }

    // Idle cam lope modulation
    const lopeMod = rpm < 1300 ? Math.sin(now * 14) * camLope * 3.5 : 0;
    const firingHz = Math.max(16, ((rpm + lopeMod * 12) / 60) * (cylCount / 2));

    this.oscFundamental.frequency.setTargetAtTime(firingHz, now, 0.025);
    this.oscSub.frequency.setTargetAtTime(firingHz * 0.5, now, 0.025);
    this.oscHarmonic.frequency.setTargetAtTime(firingHz * (isDiesel ? 1.5 : 2.0), now, 0.025);
    this.oscDiesel.frequency.setTargetAtTime(firingHz * 1.0, now, 0.025);

    this.dieselGain.gain.setTargetAtTime(isDiesel ? 0.14 : 0, now, 0.04);

    const exhaustOpenness = exhaustId === 'titanium' ? 1.65 : exhaustId === 'turboback' ? 1.35 : exhaustId === 'catback' ? 1.15 : 0.82;
    const cutoff = revCut
      ? 120
      : (170 + rpm * 0.17 + throttle * 520) * exhaustOpenness;
    this.exhaustFilter.frequency.setTargetAtTime(Math.min(3800, cutoff), now, 0.03);

    // Intake induction noise
    this.intakeNoiseGain.gain.setTargetAtTime(0.015 + throttle * 0.11 * (rpm / 7500), now, 0.04);

    // Turbo spool whistle
    const turboLevel = Math.max(0, boostPsi) / 34;
    this.oscTurbo.frequency.setTargetAtTime(1250 + turboLevel * 3200, now, 0.04);
    this.turboGain.gain.setTargetAtTime(turboLevel * 0.12, now, 0.04);

    // Blow-off valve on throttle lift
    if (this.prevThrottle > 0.45 && throttle < 0.15) {
      this._triggerBov(boostPsi);
    }

    // Overrun pops & bangs / rev-cut backfire
    let popped = false;
    if ((popsBangs && throttle < 0.08 && rpm > 3400 && Math.random() < 0.22) || (revCut && Math.random() < 0.35)) {
      this._triggerPop();
      popped = true;
    }

    this.prevThrottle = throttle;
    return popped;
  }
}
