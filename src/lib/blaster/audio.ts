// Blaster Duel — synthesized sound effects.
//
// All SFX are generated at runtime with the Web Audio API (oscillators + noise
// bursts), so there are zero audio asset files to load. The context is created
// lazily on the first user gesture to satisfy browser autoplay policies.

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  /** Call from a user gesture (e.g. the Play button) to unlock audio. */
  ensureStarted() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private tone(opts: {
    type: OscillatorType;
    from: number;
    to?: number;
    dur: number;
    gain?: number;
    delay?: number;
  }) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
    const peak = opts.gain ?? 0.25;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  private noise(opts: { dur: number; gain?: number; freq?: number; delay?: number }) {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = opts.freq ?? 1200;
    filter.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.02);
  }

  shoot(mine: boolean) {
    this.tone({ type: "sawtooth", from: mine ? 720 : 520, to: mine ? 180 : 140, dur: 0.16, gain: 0.22 });
    this.tone({ type: "square", from: mine ? 1200 : 900, to: 300, dur: 0.09, gain: 0.09 });
  }

  hit(mine: boolean) {
    // `mine` = the local player got hit (lower, punchier).
    this.noise({ dur: 0.18, gain: mine ? 0.4 : 0.28, freq: mine ? 500 : 1400 });
    this.tone({ type: "triangle", from: mine ? 220 : 420, to: mine ? 90 : 180, dur: 0.16, gain: 0.18 });
  }

  wallHit() {
    this.noise({ dur: 0.08, gain: 0.12, freq: 2200 });
  }

  reloadStart() {
    this.tone({ type: "square", from: 300, to: 500, dur: 0.1, gain: 0.12 });
  }
  reloadDone() {
    this.tone({ type: "square", from: 500, to: 820, dur: 0.12, gain: 0.14 });
    this.tone({ type: "triangle", from: 880, dur: 0.06, gain: 0.1, delay: 0.1 });
  }
  empty() {
    this.tone({ type: "square", from: 160, to: 120, dur: 0.07, gain: 0.1 });
  }

  countdownBeep(final: boolean) {
    this.tone({ type: "square", from: final ? 880 : 520, dur: final ? 0.28 : 0.14, gain: 0.18 });
  }

  uiClick() {
    this.tone({ type: "square", from: 620, to: 880, dur: 0.07, gain: 0.12 });
  }

  matchWin() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: "triangle", from: f, dur: 0.22, gain: 0.2, delay: i * 0.12 }));
  }
  matchLose() {
    [440, 349, 262].forEach((f, i) => this.tone({ type: "sawtooth", from: f, to: f * 0.9, dur: 0.3, gain: 0.16, delay: i * 0.16 }));
  }
}
