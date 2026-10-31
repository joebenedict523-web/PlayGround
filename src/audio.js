export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientGain = null;
    this.gloveOsc = null;
    this.gloveGain = null;
    this.enabled = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(this.ctx.destination);
    this.enabled = true;
    this.noiseBuffer = this.makeNoise(2.2);
    this.startAmbient();
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      data[i] = white * 0.6 + last * 2.4;
    }
    return buffer;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone(freq, duration, type = 'sine', gain = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  noise(duration, filterType, freq, gain = 0.2, slideTo = null, delay = 0, q = 1) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  startAmbient() {
    if (!this.ctx) return;
    const t = this.now();
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.24;
    this.ambientGain.connect(this.master);

    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 43;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 140;
    droneFilter.Q.value = 4;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.16;
    drone.connect(droneFilter).connect(droneGain).connect(this.ambientGain);
    drone.start(t);

    const fifth = this.ctx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.value = 64.5;
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.05;
    fifth.connect(fifthGain).connect(this.ambientGain);
    fifth.start(t);

    this.ambientLfo = this.ctx.createOscillator();
    this.ambientLfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.1;
    this.ambientLfo.connect(lfoGain).connect(droneGain.gain);
    this.ambientLfo.start(t);

    // distant wind
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 320;
    windFilter.Q.value = 0.6;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.055;
    wind.connect(windFilter).connect(windGain).connect(this.ambientGain);
    wind.start(t);

    const lfo2 = this.ctx.createOscillator();
    lfo2.frequency.value = 0.045;
    const lfo2g = this.ctx.createGain();
    lfo2g.gain.value = 0.035;
    lfo2.connect(lfo2g).connect(windGain.gain);
    lfo2.start(t);
  }

  duck(value) {
    if (!this.ambientGain) return;
    this.ambientGain.gain.cancelScheduledValues(this.now());
    this.ambientGain.gain.linearRampToValueAtTime(value, this.now() + 0.4);
  }

  shoot() {
    this.noise(0.14, 'bandpass', 1800, 0.42, 500, 0, 0.9);
    this.tone(290, 0.12, 'square', 0.12, 70);
    this.noise(0.05, 'highpass', 2600, 0.18);
  }

  dry() {
    this.tone(900, 0.04, 'square', 0.05, 500);
    this.noise(0.05, 'highpass', 1800, 0.12);
  }

  reload() {
    this.noise(0.05, 'highpass', 2200, 0.16);
    this.tone(160, 0.05, 'square', 0.05, 90, 0.02);
    this.noise(0.06, 'bandpass', 900, 0.14, 400, 0.24);
    this.tone(220, 0.05, 'square', 0.06, 140, 0.3);
  }

  grab() {
    this.tone(160, 0.26, 'sine', 0.12, 760);
    this.tone(520, 0.18, 'triangle', 0.05, 1040, 0.04);
    this.noise(0.24, 'bandpass', 1200, 0.06, 300, 0, 2);
  }

  release() {
    this.noise(0.3, 'bandpass', 700, 0.16, 2400, 0, 1.4);
    this.tone(300, 0.25, 'sine', 0.06, 120);
  }

  throwSound() {
    this.noise(0.32, 'bandpass', 500, 0.24, 3200, 0, 1.8);
    this.tone(140, 0.3, 'sine', 0.1, 60);
  }

  impact(strength = 1) {
    this.tone(85, 0.18, 'sine', 0.16 * strength, 38);
    this.noise(0.14, 'lowpass', 700, 0.13 * strength, 180);
  }

  hitmark() {
    this.tone(1320, 0.045, 'square', 0.045, 900);
  }

  kill() {
    this.noise(0.4, 'lowpass', 1200, 0.2, 200);
    this.tone(220, 0.25, 'square', 0.05, 90);
  }

  explode() {
    this.noise(0.8, 'lowpass', 1400, 0.5, 70, 0, 0.8);
    this.tone(120, 0.6, 'sine', 0.3, 28);
    this.noise(0.2, 'highpass', 2400, 0.16);
  }

  hurt() {
    this.tone(150, 0.3, 'sawtooth', 0.1, 55);
    this.noise(0.25, 'lowpass', 500, 0.16, 120);
  }

  pickup() {
    this.tone(680, 0.12, 'sine', 0.09, 700);
    this.tone(1020, 0.18, 'sine', 0.07, 1040, 0.09);
  }

  waveAlarm() {
    this.tone(220, 0.24, 'square', 0.06, 220);
    this.tone(180, 0.34, 'square', 0.05, 180, 0.3);
    this.noise(0.7, 'bandpass', 500, 0.05, 900, 0, 1.6);
  }

  spawn() {
    this.tone(380, 0.18, 'sine', 0.06, 980);
    this.noise(0.28, 'bandpass', 700, 0.06, 2200, 0, 2.2);
  }

  victory() {
    [330, 415, 494, 660].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.09, f, i * 0.14));
  }

  gameover() {
    [220, 174, 138, 92].forEach((f, i) => this.tone(f, 0.7, 'sawtooth', 0.06, f * 0.9, i * 0.22));
    this.noise(1.6, 'lowpass', 500, 0.12, 60);
  }

  ui() {
    this.tone(760, 0.05, 'square', 0.04, 1100);
  }

  gloveHum(on) {
    if (!this.ctx) return;
    if (on && !this.gloveOsc) {
      const t = this.now();
      this.gloveOsc = this.ctx.createOscillator();
      this.gloveOsc.type = 'sawtooth';
      this.gloveOsc.frequency.value = 76;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      this.gloveGain = this.ctx.createGain();
      this.gloveGain.gain.setValueAtTime(0.0001, t);
      this.gloveGain.gain.exponentialRampToValueAtTime(0.035, t + 0.12);
      this.gloveOsc.connect(f).connect(this.gloveGain).connect(this.master);
      this.gloveOsc.start(t);
    } else if (!on && this.gloveOsc) {
      const t = this.now();
      this.gloveGain.gain.cancelScheduledValues(t);
      this.gloveGain.gain.linearRampToValueAtTime(0.0001, t + 0.1);
      this.gloveOsc.stop(t + 0.14);
      this.gloveOsc = null;
      this.gloveGain = null;
    }
  }
}
