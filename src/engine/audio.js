// Procedural table sounds (WebAudio): card slide/flip, shuffle, dice hits, token clinks,
// turn chime, gong, wind/fire ambience... If the scene gives `sounds: { name: assetKey|url }`, that file plays.
const MUTE_KEY = 'tablecraft:mute';
const VOL_KEY = 'tablecraft:volume';

export class TableAudio {
  constructor() {
    this.ctx = null;
    this.custom = new Map(); // name -> AudioBuffer | Promise
    this.customUrls = {};
    this.ambienceKind = null;
    this.amb = null;
    this.last = new Map();
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; this.volume = Number(localStorage.getItem(VOL_KEY) || 0.8); } catch { this.muted = false; this.volume = 0.8; }
    this._unlock = () => this.ensure();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      // room reverb: generated impulse response for a subtle "at the table" acoustic
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = this._impulse(1.6, 2.8);
      this.wet = this.ctx.createGain(); this.wet.gain.value = 0.16;
      this.master.connect(this.verb); this.verb.connect(this.wet); this.wet.connect(comp);
      this.noise = this._noiseBuffer(2, false);
      this.brown = this._noiseBuffer(4, true);
      if (this.ambienceKind) this.ambience(this.ambienceKind, true);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  setVolume(v) {
    this.volume = v;
    try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* ignore */ }
    if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setCustom(map) {
    const next = map || {};
    if (JSON.stringify(next) === JSON.stringify(this.customUrls)) return;
    this.customUrls = next; this.custom.clear();
  }
  _customBuffer(name) {
    const url = this.customUrls[name];
    if (!url) return null;
    const c = this.custom.get(name);
    if (c instanceof AudioBuffer) return c;
    if (!c && this.ctx) {
      this.custom.set(name, fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => { this.custom.set(name, buf); }).catch(() => { this.custom.set(name, 'fail'); }));
    }
    return null;
  }

  _noiseBuffer(sec, brown) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  _impulse(sec, decay) {
    const c = this.ctx; const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1);
    }
    return b;
  }

  _env(node, t, a, peak, decay) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  _noiseHit(t, { freq = 2000, q = 1, dur = 0.08, peak = 0.3, type = 'bandpass', sweepTo = null, attack = 0.004 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const gn = c.createGain(); this._env(gn, t, attack, peak, dur);
    src.connect(f); f.connect(gn); gn.connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + attack + dur + 0.05);
  }

  _tone(t, { freq = 440, type = 'sine', dur = 0.3, peak = 0.2, attack = 0.005, detune = 0, to = null } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gn = c.createGain(); this._env(gn, t, attack, peak, dur);
    o.connect(gn); gn.connect(this.master);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  // prevents repeating the same sound too often
  _throttle(name, ms) {
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < ms) return true;
    this.last.set(name, now);
    return false;
  }

  play(name, opts = {}) {
    if (!this.ensure() || this.muted) return;
    const custom = this._customBuffer(name);
    if (custom) {
      const s = this.ctx.createBufferSource(); s.buffer = custom;
      const gn = this.ctx.createGain(); gn.gain.value = opts.vol ?? 1;
      s.connect(gn); gn.connect(this.master); s.start();
      return;
    }
    const t = this.ctx.currentTime + 0.005;
    const v = opts.vol ?? 1;
    switch (name) {
      case 'slide': if (this._throttle(name, 60)) return; this._noiseHit(t, { freq: 2600, sweepTo: 900, q: 0.8, dur: 0.14, peak: 0.16 * v }); break;
      case 'flip': if (this._throttle(name, 50)) return; this._noiseHit(t, { freq: 3500, q: 1.5, dur: 0.03, peak: 0.22 * v, type: 'highpass' }); this._noiseHit(t + 0.07, { freq: 2200, q: 1, dur: 0.05, peak: 0.16 * v }); break;
      case 'shuffle': for (let i = 0; i < 9; i++) this._noiseHit(t + i * 0.045 + Math.random() * 0.02, { freq: 2400 + Math.random() * 1500, q: 0.9, dur: 0.06, peak: 0.1 * v }); break;
      case 'tap': case 'click': this._tone(t, { freq: 1700, dur: 0.03, peak: 0.07 * v }); this._noiseHit(t, { freq: 4000, dur: 0.02, peak: 0.05 * v, type: 'highpass' }); break;
      case 'clink': case 'coin': {
        if (this._throttle(name, 35)) return;
        const base = 2100 + Math.random() * 500;
        [1, 1.58, 2.37].forEach((m, i) => this._tone(t, { freq: base * m, dur: 0.28 - i * 0.07, peak: (0.07 - i * 0.018) * v }));
        break;
      }
      case 'clack': case 'wood': if (this._throttle(name, 35)) return; this._noiseHit(t, { freq: 900, q: 3, dur: 0.05, peak: 0.25 * v }); this._tone(t, { freq: 380, dur: 0.06, peak: 0.08 * v }); break;
      case 'dice': this.impact(0.8 * v); break;
      case 'chime': [659.3, 830.6, 987.8].forEach((f, i) => this._tone(t + i * 0.12, { freq: f, dur: 0.9, peak: 0.08 * v, type: 'triangle' })); break;
      case 'good': this._tone(t, { freq: 523, dur: 0.18, peak: 0.1 * v, type: 'triangle' }); this._tone(t + 0.12, { freq: 784, dur: 0.35, peak: 0.1 * v, type: 'triangle' }); break;
      case 'bad': this._tone(t, { freq: 392, dur: 0.2, peak: 0.1 * v, type: 'triangle' }); this._tone(t + 0.14, { freq: 311, dur: 0.45, peak: 0.1 * v, type: 'triangle' }); break;
      case 'error': this._tone(t, { freq: 160, dur: 0.18, peak: 0.08 * v, type: 'square' }); break;
      case 'whoosh': this._noiseHit(t, { freq: 300, sweepTo: 3200, q: 0.7, dur: 0.45, peak: 0.12 * v, attack: 0.15 }); break;
      case 'gong': case 'banner':
        this._tone(t, { freq: 98, dur: 2.6, peak: 0.22 * v, attack: 0.01 }); this._tone(t, { freq: 196.5, dur: 1.8, peak: 0.1 * v }); this._tone(t, { freq: 293, dur: 1.2, peak: 0.05 * v, detune: 8 });
        this._noiseHit(t, { freq: 500, q: 0.5, dur: 1.2, peak: 0.05 * v, type: 'lowpass' }); break;
      case 'storm': case 'thunder': this._noiseHit(t, { freq: 180, q: 0.4, dur: 2.2, peak: 0.35 * v, type: 'lowpass', attack: 0.08 }); this._noiseHit(t + 0.05, { freq: 1200, sweepTo: 200, q: 0.5, dur: 0.6, peak: 0.12 * v }); break;
      case 'tick': this._tone(t, { freq: 1200, dur: 0.025, peak: 0.06 * v, type: 'square' }); break;
      case 'alarm': [0, 0.18, 0.36].forEach((d) => this._tone(t + d, { freq: 880, dur: 0.12, peak: 0.09 * v, type: 'square' })); break;
      case 'turn': // soft marimba: your turn
        [[587.3, 0], [880, 0.11], [1174.7, 0.22]].forEach(([f, d]) => { this._tone(t + d, { freq: f, dur: 0.55, peak: 0.09 * v, type: 'sine' }); this._tone(t + d, { freq: f * 4, dur: 0.08, peak: 0.02 * v, type: 'sine' }); });
        break;
      case 'deal': if (this._throttle(name, 40)) return; this._noiseHit(t, { freq: 3800, sweepTo: 1600, q: 1.1, dur: 0.07, peak: 0.14 * v, attack: 0.002 }); this._noiseHit(t + 0.05, { freq: 900, q: 2, dur: 0.03, peak: 0.08 * v }); break;
      case 'reveal': this._noiseHit(t, { freq: 500, sweepTo: 2600, q: 0.8, dur: 0.28, peak: 0.07 * v, attack: 0.08 }); this._tone(t + 0.16, { freq: 1046.5, dur: 0.5, peak: 0.045 * v, type: 'triangle' }); this._tone(t + 0.16, { freq: 1568, dur: 0.4, peak: 0.025 * v, type: 'sine' }); break;
      case 'notify': this._tone(t, { freq: 988, dur: 0.12, peak: 0.06 * v, type: 'triangle' }); this._tone(t + 0.09, { freq: 1319, dur: 0.25, peak: 0.06 * v, type: 'triangle' }); break;
      case 'hover': if (this._throttle(name, 90)) return; this._tone(t, { freq: 2400, dur: 0.015, peak: 0.018 * v }); break;
      case 'win': case 'fanfare':
        [[523.3, 0], [659.3, 0.14], [784, 0.28], [1046.5, 0.44]].forEach(([f, d], i) => { this._tone(t + d, { freq: f, dur: i === 3 ? 1.4 : 0.35, peak: 0.1 * v, type: 'triangle' }); this._tone(t + d, { freq: f / 2, dur: i === 3 ? 1.4 : 0.35, peak: 0.05 * v, type: 'sine' }); });
        this._noiseHit(t + 0.44, { freq: 6000, q: 0.6, dur: 0.9, peak: 0.03 * v, type: 'highpass' });
        break;
      default: break;
    }
  }

  // die / token hit: v 0..1
  impact(v = 0.5, material = 'dice') {
    if (!this.ensure() || this.muted || v < 0.04) return;
    if (this._throttle(`imp${material}`, 18)) return;
    const t = this.ctx.currentTime + 0.002;
    const p = Math.min(0.5, 0.06 + v * 0.4);
    if (material === 'dice') { this._noiseHit(t, { freq: 1600 + Math.random() * 1400, q: 2.2, dur: 0.035, peak: p }); this._tone(t, { freq: 180 + Math.random() * 60, dur: 0.05, peak: p * 0.35 }); } else this.play('clink', { vol: v });
  }

  // ambient sound: wind | fire | rain | sea | tavern | null
  ambience(kind, force = false) {
    if (kind === this.ambienceKind && !force) return;
    this.ambienceKind = kind;
    if (!this.ctx) return; // starts on first interaction
    if (this.amb) { const old = this.amb; old.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.6); setTimeout(() => old.stop(), 2500); this.amb = null; }
    if (!kind) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0.0001; out.connect(this.master);
    const nodes = [];
    const loop = (buf, filterType, freq, q) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      s.connect(f); f.connect(out); s.start(); nodes.push(s);
      return f;
    };
    let target = 0.05; let timer = null;
    if (kind === 'wind' || kind === 'winter') {
      const f = loop(this.brown, 'bandpass', 420, 0.7);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.09; const lg = c.createGain(); lg.gain.value = 220;
      lfo.connect(lg); lg.connect(f.frequency); lfo.start(); nodes.push(lfo);
      const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.05; const lg2 = c.createGain(); lg2.gain.value = 0.025;
      lfo2.connect(lg2); lg2.connect(out.gain); lfo2.start(); nodes.push(lfo2);
      target = 0.055;
    }
    if (kind === 'fire' || kind === 'tavern' || kind === 'winter') {
      loop(this.brown, 'lowpass', 160, 0.5);
      timer = setInterval(() => {
        if (this.muted || !this.ctx) return;
        const t = c.currentTime;
        for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) this._noiseHit(t + Math.random() * 0.25, { freq: 2500 + Math.random() * 3000, q: 4, dur: 0.012, peak: 0.02 + Math.random() * 0.04, type: 'bandpass' });
      }, 260);
      target = Math.max(target, 0.045);
    }
    if (kind === 'rain') { loop(this.noise, 'highpass', 1800, 0.3); target = 0.03; }
    if (kind === 'sea') {
      const f = loop(this.brown, 'lowpass', 500, 0.5);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); nodes.push(lfo);
      target = 0.06;
    }
    out.gain.setTargetAtTime(target, c.currentTime, 1.2);
    this.amb = { gain: out, stop: () => { nodes.forEach((n) => { try { n.stop(); } catch { /* */ } }); clearInterval(timer); out.disconnect(); } };
  }

  dispose() {
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    if (this.amb) this.amb.stop();
    if (this.ctx) this.ctx.close().catch(() => {});
  }
}
