export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.lastTickAt = 0;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled && this.master) {
      this.master.gain.value = 0;
    } else if (this.master) {
      this.master.gain.value = 0.9;
    }
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  tone({ frequency = 440, duration = 0.08, type = 'sine', gain = 0.12, sweepTo = null }) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.value = 0.0001;

    osc.connect(amp);
    amp.connect(this.master);

    const now = ctx.currentTime;
    const attack = Math.min(0.01, duration * 0.25);
    const decay = Math.max(0.03, duration - attack);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    if (sweepTo != null) {
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), now + duration);
    }

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  hit(strength = 0.5) {
    const s = Math.max(0.15, Math.min(1, strength));
    this.tone({ frequency: 220 + s * 240, duration: 0.05 + s * 0.03, type: 'square', gain: 0.06 + s * 0.08, sweepTo: 110 });
  }

  kick(power = 0.5, type = 'shoot') {
    const s = Math.max(0.2, Math.min(1, power));
    let frequency = 120 + s * 140;
    let duration = 0.08 + s * 0.05;
    let gain = 0.08 + s * 0.1;
    let sweepTo = 60;
    let toneType = 'triangle';
    
    // Vary by kick type
    if (type === 'pass') {
      frequency *= 0.8; // Softer tone for passes
      duration *= 0.7;
      gain *= 0.7;
    } else if (type === 'shoot') {
      frequency *= 1.2; // Sharper tone for shoots
      duration *= 1.1;
      gain *= 1.1;
    }
    
    this.tone({ frequency, duration, type: toneType, gain, sweepTo });
  }

  applause() {
    // Simulate crowd applause with varied noise
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const freq = 120 + Math.random() * 200;
        this.tone({ frequency: freq, duration: 0.2 + Math.random() * 0.1, type: 'square', gain: 0.04, sweepTo: freq * 0.7 });
      }, i * 100);
    }
  }

  goalVoice() {
    // "GOL!" voice effect using frequency sweeps
    this.tone({ frequency: 392, duration: 0.15, type: 'sine', gain: 0.1, sweepTo: 330 });
    setTimeout(() => this.tone({ frequency: 523.25, duration: 0.2, type: 'sine', gain: 0.12, sweepTo: 440 }), 80);
    setTimeout(() => this.tone({ frequency: 659.25, duration: 0.25, type: 'sine', gain: 0.11, sweepTo: 523 }), 160);
  }

  goal() {
    this.tone({ frequency: 523.25, duration: 0.08, type: 'sine', gain: 0.09, sweepTo: 1046.5 });
    setTimeout(() => this.tone({ frequency: 659.25, duration: 0.09, type: 'sine', gain: 0.08, sweepTo: 1318.5 }), 90);
    setTimeout(() => this.tone({ frequency: 783.99, duration: 0.12, type: 'sine', gain: 0.08, sweepTo: 1567.98 }), 180);
  }

  power(type = 'precision') {
    const map = {
      superShot: { f: 392, g: 0.08, t: 'sawtooth' },
      powershot: { f: 880, g: 0.12, t: 'sawtooth' },
      curve: { f: 659.25, g: 0.06, t: 'triangle' },
      magnet: { f: 587.33, g: 0.06, t: 'sine' },
      slow: { f: 349.23, g: 0.06, t: 'square' },
      precision: { f: 880, g: 0.05, t: 'sine' },
    };
    const s = map[type] ?? map.precision;
    this.tone({ frequency: s.f, duration: 0.09, type: s.t, gain: s.g, sweepTo: s.f * 1.4 });
  }

  // Novo: Som de fundo da torcida usando ru\u00eddo branco filtrado
  crowd(intensity = 0.5) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    
    // Pequeno sopro de ru\u00eddo para simular o est\u00e1dio
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400 + intensity * 600;
    
    const amp = ctx.createGain();
    amp.gain.value = 0.01 + intensity * 0.02;

    whiteNoise.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    
    whiteNoise.start();
    whiteNoise.stop(ctx.currentTime + 1.5);
  }
}
