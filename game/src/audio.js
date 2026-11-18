// All sound is synthesized with WebAudio: engine hum, sirens, gunfire, crashes,
// UI blips and a looping synthwave-ish score. No audio files, no network.
export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.enabled = true;
    this.musicOn = true;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
  }

  start() {
    if (this.started) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.context = new Ctor();
    } catch (error) {
      return;
    }
    this.master = this.context.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.started = true;
    this.startEngineLoop();
    this.startSirenLoop();
    this.startMusic();
  }

  resume() {
    if (this.context && this.context.state === 'suspended') this.context.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.55 : 0;
  }

  setMusicOn(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.16 : 0;
  }

  now() {
    return this.context ? this.context.currentTime : 0;
  }

  // Continuous engine drone whose pitch follows the player's speed.
  startEngineLoop() {
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  setEngine(speedFraction, inCar) {
    if (!this.engineOsc) return;
    const target = inCar ? 0.05 + speedFraction * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.now(), 0.12);
    this.engineOsc.frequency.setTargetAtTime(50 + speedFraction * 130, this.now(), 0.1);
  }

  // Two-tone police siren, faded in while any police unit is close.
  startSirenLoop() {
    const osc = this.context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const lfo = this.context.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.9;
    const lfoGain = this.context.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = this.context.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.sirenOsc = osc;
    this.sirenGain = gain;
    this.sirenLfo = lfo;
  }

  setSirenAudible(audible) {
    if (!this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(audible ? 0.045 : 0, this.now(), 0.4);
  }

  noiseBuffer(duration) {
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  playNoise(duration, filterFreq, volume, type) {
    if (!this.context || !this.enabled) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer(duration);
    const filter = this.context.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, this.now());
    gain.gain.exponentialRampToValueAtTime(0.001, this.now() + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  playTone(freq, duration, volume, type, when, slideTo) {
    if (!this.context || !this.enabled) return;
    const start = when || this.now();
    const osc = this.context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  gunshot(big) {
    this.playNoise(big ? 0.22 : 0.13, big ? 900 : 1800, big ? 0.5 : 0.34, 'lowpass');
    this.playTone(big ? 90 : 140, 0.08, 0.2, 'square');
  }

  crash(intensity) {
    this.playNoise(0.25 + intensity * 0.2, 300 + intensity * 300, 0.25 + intensity * 0.35);
  }

  horn() {
    this.playTone(370, 0.28, 0.16, 'sawtooth');
    this.playTone(466, 0.28, 0.12, 'sawtooth');
  }

  pickup() {
    this.playTone(880, 0.09, 0.18, 'sine');
    this.playTone(1320, 0.14, 0.18, 'sine', this.now() + 0.08);
  }

  uiClick() {
    this.playTone(660, 0.06, 0.12, 'triangle');
  }

  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => this.playTone(freq, 0.22, 0.2, 'triangle', this.now() + i * 0.11));
  }

  missionFailed() {
    const notes = [392, 330, 262, 196];
    notes.forEach((freq, i) => this.playTone(freq, 0.26, 0.18, 'triangle', this.now() + i * 0.14));
  }

  explosion() {
    this.playNoise(0.9, 220, 0.6);
    this.playTone(55, 0.7, 0.4, 'sine', this.now(), 30);
  }

  reload() {
    this.playTone(300, 0.05, 0.12, 'square');
    this.playTone(220, 0.05, 0.12, 'square', this.now() + 0.12);
  }

  // A gentle 8-step loop: warm pad chords, a soft bass and a hat tick.
  startMusic() {
    const chords = [
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 293.7],
      [146.8, 220.0, 293.7],
    ];
    const bassLine = [110.0, 110.0, 87.3, 98.0, 110.0, 130.8, 98.0, 87.3];
    const stepMs = 300;
    this.musicTimer = window.setInterval(() => {
      if (!this.context || !this.musicOn || !this.enabled) return;
      const step = this.musicStep % 8;
      const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
      if (step === 0) {
        for (const freq of chord) {
          const osc = this.context.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          const gain = this.context.createGain();
          const t = this.now();
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.05, t + 0.4);
          gain.gain.linearRampToValueAtTime(0.0001, t + 2.3);
          osc.connect(gain);
          gain.connect(this.musicGain);
          osc.start(t);
          osc.stop(t + 2.4);
        }
      }
      const bass = this.context.createOscillator();
      bass.type = 'sine';
      bass.frequency.value = bassLine[step];
      const bassGain = this.context.createGain();
      const t = this.now();
      bassGain.gain.setValueAtTime(0.09, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      bass.connect(bassGain);
      bassGain.connect(this.musicGain);
      bass.start(t);
      bass.stop(t + 0.3);
      if (step % 2 === 0) {
        const hat = this.context.createBufferSource();
        hat.buffer = this.noiseBuffer(0.03);
        const hatFilter = this.context.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.value = 6000;
        const hatGain = this.context.createGain();
        hatGain.gain.value = 0.03;
        hat.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(this.musicGain);
        hat.start(t);
      }
      this.musicStep++;
    }, stepMs);
  }
}
