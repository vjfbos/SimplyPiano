import { describe, it, expect } from 'vitest';
import { buildPiece } from '../src/core/piece.js';
import { PracticeEngine } from '../src/practice/engine.js';
import { computeResult, classifyTiming } from '../src/practice/scoring.js';

const stubSound = { playNotes() {}, pad() {}, startTempo() {}, stopAll() {} };

function fakeClock() {
  let t = 1000;
  let cb = null;
  return {
    now: () => t,
    frame: (fn) => { cb = fn; return 1; },
    cancel: () => { cb = null; },
    advance(ms) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + 16);
        const f = cb; cb = null; f?.();
      }
    },
  };
}

function collect(engine) {
  const log = { notes: [], finish: null, cursor: [] };
  engine.on('note', (d) => log.notes.push(d.result));
  engine.on('finish', (r) => (log.finish = r));
  engine.on('cursor', (d) => log.cursor.push(d.index));
  return log;
}

describe('wachtmodus', () => {
  it('wacht op de juiste noot en geeft 3 sterren bij foutloos spel', () => {
    const piece = buildPiece({ parts: { rh: 'C4/q D4/q E4/h' } });
    const e = new PracticeEngine(piece, { mode: 'wait', hands: ['rh'] }, stubSound, fakeClock());
    const log = collect(e);
    e.start();
    e.input({ midi: 60 });
    e.input({ midi: 62 });
    expect(log.finish).toBeNull();
    e.input({ midi: 64 });
    expect(log.finish).toMatchObject({ stars: 3, accuracy: 100 });
  });

  it('telt fouten en gaat pas verder bij de goede noot', () => {
    const piece = buildPiece({ parts: { rh: 'C4/q D4/q E4/h' } });
    const e = new PracticeEngine(piece, { mode: 'wait', hands: ['rh'] }, stubSound, fakeClock());
    const log = collect(e);
    e.start();
    e.input({ midi: 61 });
    expect(log.cursor).toEqual([0]);
    e.input({ midi: 60 });
    e.input({ midi: 62 });
    e.input({ midi: 64 });
    expect(log.finish.counts.wrong).toBe(1);
    expect(log.finish.accuracy).toBe(67);
  });

  it('akkoord: alle noten nodig, volgorde maakt niet uit', () => {
    const piece = buildPiece({ parts: { rh: 'C4+E4+G4/w' } });
    const e = new PracticeEngine(piece, { mode: 'wait', hands: ['rh'] }, stubSound, fakeClock());
    const log = collect(e);
    e.start();
    e.input({ midi: 67 });
    e.input({ midi: 60 });
    expect(log.finish).toBeNull();
    e.input({ midi: 64 });
    expect(log.finish.stars).toBe(3);
  });

  it('octaaftolerantie voor microfoon', () => {
    const piece = buildPiece({ parts: { rh: 'C4/w' } });
    const e = new PracticeEngine(piece, { mode: 'wait', hands: ['rh'], octaveTolerant: true }, stubSound, fakeClock());
    const log = collect(e);
    e.start();
    e.input({ midi: 72 });
    expect(log.finish.stars).toBe(3);
  });

  it('alleen rechterhand oefenen: linkerhand-events worden overgeslagen', () => {
    const piece = buildPiece({ parts: { rh: 'C4/h r/h', lh: 'r/h C3/h' } });
    const e = new PracticeEngine(piece, { mode: 'wait', hands: ['rh'], autoplayOther: false }, stubSound, fakeClock());
    const log = collect(e);
    e.start();
    e.input({ midi: 60 });
    return new Promise((res) => setTimeout(() => {
      expect(log.finish.stars).toBe(3);
      res();
    }, 10));
  });
});

describe('tempomodus', () => {
  it('beoordeelt timing: goed, te laat, gemist', () => {
    const piece = buildPiece({ tempo: 60, parts: { rh: 'C4/q D4/q E4/q F4/q' } });
    const clock = fakeClock();
    const e = new PracticeEngine(piece, { mode: 'tempo', hands: ['rh'] }, stubSound, clock);
    const log = collect(e);
    e.start();
    const t0 = e.t0; // 1 tel = 1000 ms
    clock.advance(t0 - clock.now());
    e.input({ midi: 60, time: t0 + 20 }); // goed
    clock.advance(1000);
    e.input({ midi: 62, time: t0 + 1000 + 250 }); // te laat
    clock.advance(1000);
    e.input({ midi: 64, time: t0 + 2000 - 200 }); // te vroeg
    // F4 wordt niet gespeeld -> gemist
    clock.advance(2500);
    expect(log.notes).toEqual(['ok', 'late', 'early', 'missed']);
    expect(log.finish).not.toBeNull();
    expect(log.finish.counts).toMatchObject({ ok: 1, late: 1, early: 1, missed: 1 });
  });

  it('extra noten tellen als fout', () => {
    const piece = buildPiece({ tempo: 60, parts: { rh: 'C4/w' } });
    const clock = fakeClock();
    const e = new PracticeEngine(piece, { mode: 'tempo', hands: ['rh'] }, stubSound, clock);
    const log = collect(e);
    e.start();
    clock.advance(e.t0 - clock.now());
    e.input({ midi: 60, time: e.t0 });
    e.input({ midi: 65, time: e.t0 + 500 });
    clock.advance(5000);
    expect(log.finish.counts.extra).toBe(1);
  });
});

describe('beoordeling', () => {
  it('timingvensters', () => {
    expect(classifyTiming(0, 1000).result).toBe('ok');
    expect(classifyTiming(-300, 1000).result).toBe('early');
    expect(classifyTiming(300, 1000).result).toBe('late');
    expect(classifyTiming(900, 1000)).toBeNull();
  });
  it('tips over te laat spelen', () => {
    const notes = Array.from({ length: 10 }, () => ({ hand: 'rh', result: 'late', score: 0.6 }));
    const r = computeResult({ mode: 'tempo', notes, extra: 0 });
    expect(r.tips.join(' ')).toMatch(/te laat/);
  });
});
