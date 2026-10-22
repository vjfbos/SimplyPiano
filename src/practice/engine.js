// De oefen-engine: wachtmodus en tempomodus, met handkeuze, tempo, herhalen en begeleiding.
// Communiceert alleen via events, zodat de weergave (notenbalk, toetsenbord) los staat van de logica.
import { computeResult, classifyTiming, samePitch, timingWindows, DEFAULT_STARS } from './scoring.js';

export const RESULT_TEXT = {
  ok: 'Goed',
  early: 'Te vroeg',
  late: 'Te laat',
  missed: 'Gemist',
  wrong: 'Fout',
};

/**
 * sound: { playNotes(notes[{midi,dur}], beatSec, perfTime?), pad(beat), startTempo(items...), stopAll(), countIn... }
 * Zie defaultSound() in player.js; tests geven een stub mee.
 */
export class PracticeEngine extends EventTarget {
  constructor(piece, opts, sound, clock = defaultClock) {
    super();
    this.piece = piece;
    this.sound = sound;
    this.clock = clock;
    this.opts = {
      mode: 'wait',
      hands: ['rh', 'lh'],
      tempoPct: 100,
      loop: null, // { fromBar, toBar }
      repeat: false,
      autoplayOther: true,
      metronome: true,
      drums: false,
      chords: false,
      octaveTolerant: false,
      stars: DEFAULT_STARS,
      ...opts,
    };
    this.running = false;
    this.pass = 0;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }

  get beatSec() {
    return 60 / (this.piece.tempo * (this.opts.tempoPct / 100));
  }

  range() {
    const { bars } = this.piece;
    const fromBar = this.opts.loop ? this.opts.loop.fromBar : 0;
    const toBar = this.opts.loop ? this.opts.loop.toBar : bars.length - 1;
    return { fromBar, toBar, from: bars[fromBar].start, to: bars[toBar].end };
  }

  start() {
    this.stop(false);
    this.running = true;
    const r = this.range();
    this.from = r.from;
    this.to = r.to;
    const hands = new Set(this.opts.hands);
    this.events = this.piece.events
      .filter((ev) => ev.t >= r.from - 1e-6 && ev.t < r.to - 1e-6)
      .map((ev) => ({
        ...ev,
        active: ev.notes.filter((n) => hands.has(n.hand)),
        passive: ev.notes.filter((n) => !hands.has(n.hand)),
      }));
    this.stats = { mode: this.opts.mode, notes: [], events: { total: 0, clean: 0 }, wrong: 0, extra: 0, seconds: 0, loopable: true };
    this.startedAt = this.clock.now();
    this.emit('start', { pass: this.pass, range: r });
    if (this.opts.mode === 'wait') this.startWait();
    else this.startTempo();
  }

  stop(emitStop = true) {
    const wasRunning = this.running;
    this.running = false;
    clearTimeout(this.waitTimer);
    this.clock.cancel(this.raf);
    this.sound?.stopAll();
    if (emitStop && wasRunning) this.emit('stop', {});
  }

  /** Resultaat tot nu toe (ook als er halverwege gestopt wordt). */
  currentResult() {
    if (!this.stats) return null;
    this.stats.seconds = (this.clock.now() - this.startedAt) / 1000;
    return computeResult(this.stats, this.opts.stars);
  }

  input({ midi, time }) {
    if (!this.running) return;
    if (this.opts.mode === 'wait') this.waitInput(midi);
    else this.tempoInput(midi, time);
  }

  // ------------------------------------------------------------------ wachtmodus
  startWait() {
    this.stats.events.total = this.events.filter((e) => e.active.length).length;
    this.lastBar = -1;
    this.enterEvent(0);
  }

  enterEvent(i) {
    if (!this.running) return;
    this.idx = i;
    const ev = this.events[i];
    if (!ev) return this.finish();
    this.need = new Map(); // midi -> lijst noten
    ev.active.forEach((n) => {
      if (!this.need.has(n.midi)) this.need.set(n.midi, []);
      this.need.get(n.midi).push(n);
    });
    this.got = new Set();
    this.hadError = false;
    this.emit('cursor', { index: ev.index, beat: ev.t, expected: ev.active, passive: ev.passive });
    if (this.opts.chords && ev.bar !== this.lastBar) this.sound?.pad(ev.t);
    this.lastBar = ev.bar;
    if (this.opts.autoplayOther && ev.passive.length) this.sound?.playNotes(ev.passive, this.beatSec);
    if (!ev.active.length) {
      // Alleen de andere hand speelt hier: ga na de nootduur vanzelf verder.
      const next = this.events[i + 1];
      const gap = next ? next.t - ev.t : Math.max(...ev.passive.map((n) => n.dur));
      const delay = this.opts.autoplayOther ? gap * this.beatSec * 1000 : 0;
      this.waitTimer = setTimeout(() => this.enterEvent(i + 1), delay);
    }
  }

  waitInput(midi) {
    const ev = this.events[this.idx];
    if (!ev || !ev.active.length) return;
    const key = [...this.need.keys()].find((m) => !this.got.has(m) && samePitch(m, midi, this.opts.octaveTolerant));
    if (key !== undefined) {
      this.got.add(key);
      for (const n of this.need.get(key)) {
        this.stats.notes.push({ hand: n.hand, result: this.hadError ? 'retry' : 'ok' });
        this.emit('note', { tokenId: n.tokenId, midi, result: 'ok', hand: n.hand });
      }
      if (this.got.size === this.need.size) {
        if (!this.hadError) this.stats.events.clean++;
        this.emit('feedback', { result: 'ok', text: this.hadError ? 'Gevonden!' : 'Goed!' });
        this.enterEvent(this.idx + 1);
      } else {
        this.emit('feedback', { result: 'ok', text: 'Goed, nog ' + (this.need.size - this.got.size) + ' noot' });
      }
      return;
    }
    // Al gespeelde noot van dit akkoord nogmaals: niet straffen.
    if ([...this.got].some((m) => samePitch(m, midi, this.opts.octaveTolerant))) return;
    this.hadError = true;
    this.stats.wrong++;
    const missing = [...this.need.keys()].filter((m) => !this.got.has(m));
    this.emit('note', { tokenId: null, midi, result: 'wrong' });
    this.emit('feedback', { result: 'wrong', text: 'Fout', played: midi, expected: missing });
  }

  // ------------------------------------------------------------------ tempomodus
  startTempo() {
    const beatMs = this.beatSec * 1000;
    this.windows = timingWindows(beatMs);
    const countBeats = this.piece.ts.beatsPerBar;
    const lead = 150; // ms om alles klaar te zetten
    this.t0 = this.clock.now() + lead + countBeats * beatMs; // perf-tijd van tel `from`
    this.expected = [];
    for (const ev of this.events) {
      for (const n of ev.active) {
        this.expected.push({ ...n, ev: ev.index, time: this.t0 + (ev.t - this.from) * beatMs, matched: false });
      }
    }
    this.cursorIdx = -1;
    this.sound?.startTempo({
      piece: this.piece,
      from: this.from,
      to: this.to,
      t0: this.t0,
      beatSec: this.beatSec,
      countBeats,
      passive: this.opts.autoplayOther ? this.events.flatMap((ev) => ev.passive.map((n) => ({ ...n, t: ev.t }))) : [],
      metronome: this.opts.metronome,
      drums: this.opts.drums,
      chords: this.opts.chords,
    });
    const loop = () => {
      if (!this.running) return;
      this.tempoTick();
      if (this.running) this.raf = this.clock.frame(loop);
    };
    this.raf = this.clock.frame(loop);
  }

  tempoTick() {
    const now = this.clock.now();
    const beatMs = this.beatSec * 1000;
    const beat = this.from + (now - this.t0) / beatMs;
    if (beat < this.from) {
      const left = Math.ceil((this.from - beat) / (4 / this.piece.ts.den));
      this.emit('countin', { left });
      this.countingIn = true;
    } else if (this.countingIn) {
      this.countingIn = false;
      this.emit('countin', { left: 0 });
    }
    this.emit('progress', { beat });
    // cursor: laatste event dat begonnen is (of het eerste tijdens het aftellen)
    let ci = 0;
    while (ci + 1 < this.events.length && this.events[ci + 1].t <= beat + 0.05) ci++;
    if (ci !== this.cursorIdx && this.events[ci]) {
      this.cursorIdx = ci;
      const ev = this.events[ci];
      this.emit('cursor', { index: ev.index, beat: ev.t, expected: ev.active, passive: ev.passive });
    }
    for (const x of this.expected) {
      if (!x.matched && now > x.time + this.windows.window) {
        x.matched = true;
        this.stats.notes.push({ hand: x.hand, result: 'missed' });
        this.emit('note', { tokenId: x.tokenId, midi: x.midi, result: 'missed', hand: x.hand });
        this.emit('feedback', { result: 'missed', text: 'Gemist' });
      }
    }
    if (beat >= this.to + 0.02 && this.expected.every((x) => x.matched)) this.finish();
  }

  tempoInput(midi, time) {
    let best = null;
    for (const x of this.expected) {
      if (x.matched || !samePitch(x.midi, midi, this.opts.octaveTolerant)) continue;
      const dt = time - x.time;
      if (Math.abs(dt) <= this.windows.window && (!best || Math.abs(dt) < Math.abs(best.dt))) best = { x, dt };
    }
    if (!best) {
      if (time < this.t0 - this.windows.window) return; // tijdens aftellen niet meetellen
      this.stats.extra++;
      this.emit('note', { tokenId: null, midi, result: 'wrong' });
      this.emit('feedback', { result: 'wrong', text: 'Fout', played: midi });
      return;
    }
    const c = classifyTiming(best.dt, this.beatSec * 1000);
    best.x.matched = true;
    this.stats.notes.push({ hand: best.x.hand, result: c.result, score: c.score, dt: best.dt });
    this.emit('note', { tokenId: best.x.tokenId, midi, result: c.result, hand: best.x.hand, dt: best.dt });
    this.emit('feedback', { result: c.result, text: RESULT_TEXT[c.result], dt: Math.round(best.dt) });
  }

  // ------------------------------------------------------------------ einde
  finish() {
    const result = this.currentResult();
    this.pass++;
    if (this.opts.repeat) {
      this.emit('loop', result);
      this.stop(false);
      this.running = true;
      this.waitTimer = setTimeout(() => this.start(), this.opts.mode === 'wait' ? 700 : 300);
      return;
    }
    this.stop(false);
    this.emit('finish', result);
  }
}

const defaultClock = {
  now: () => performance.now(),
  frame: (fn) => requestAnimationFrame(fn),
  cancel: (id) => cancelAnimationFrame(id),
};
