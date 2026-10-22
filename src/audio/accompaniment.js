// Begeleiding: metronoom, drumgroove en/of akkoorden. Levert schedule-items voor de Scheduler.
import { click, kick, snare, hihat } from './drums.js';
import { playAt } from './synth.js';

/**
 * @param piece   model uit buildPiece
 * @param opts    { from, to (tellen), t0 (audio s voor tel `from`), beatSec, metronome, drums, chords }
 */
export function accompanimentItems(piece, { from, to, t0, beatSec, metronome, drums, chords }) {
  const items = [];
  const at = (beat) => t0 + (beat - from) * beatSec;
  const { num, den } = piece.ts;
  const pulse = 4 / den; // duur van één tel van de maatsoort, in kwarten (3/8 -> 0.5)
  const compound = den === 8 && num % 3 === 0; // 6/8, 3/8: accent per drie achtsten

  if (metronome || drums) {
    for (const bar of piece.bars) {
      if (bar.end <= from + 1e-6 || bar.start >= to - 1e-6) continue;
      for (let b = bar.start, i = 0; b < bar.end - 1e-6; b += pulse, i++) {
        if (b < from - 1e-6 || b >= to - 1e-6) continue;
        // in een opmaatmaat tellen we vanaf het einde, zodat tel 1 op de eerste volle maat valt
        const posInBar = bar.index === 0 && piece.pickup ? Math.round((piece.ts.beatsPerBar - (bar.end - b)) / pulse) : i;
        const strong = posInBar === 0;
        const time = at(b);
        if (metronome) items.push({ time, fn: (t) => click(t, strong) });
        if (drums) {
          const mid = compound ? posInBar % 3 === 0 && !strong : posInBar % 2 === 1;
          if (strong || (!compound && num >= 4 && posInBar === 2)) items.push({ time, fn: (t) => kick(t) });
          else if (mid) items.push({ time, fn: (t) => snare(t) });
          items.push({ time, fn: (t) => hihat(t) });
          if (!compound) items.push({ time: at(b + pulse / 2), fn: (t) => hihat(t) });
        }
      }
    }
  }

  if (chords) {
    for (const c of piece.chords) {
      if (c.start + c.dur <= from + 1e-6 || c.start >= to - 1e-6) continue;
      const start = Math.max(c.start, from);
      const end = Math.min(c.start + c.dur, to);
      items.push({ time: at(start), fn: (t) => playAt(c.bass, t, (end - start) * beatSec * 0.95, { bus: 'accomp', velocity: 0.7, soft: true }) });
      // akkoord op elke tel behalve de eerste: licht "oom-pa" patroon
      for (let b = start; b < end - 1e-6; b += pulse) {
        const isFirst = Math.abs(b - c.start) < 1e-6;
        if (isFirst && end - start > pulse + 1e-6) continue;
        const dur = Math.min(pulse, end - b) * beatSec * 0.85;
        c.notes.forEach((n) => items.push({ time: at(b), fn: (t) => playAt(n, t, dur, { bus: 'accomp', velocity: 0.45, soft: true }) }));
      }
    }
  }
  return items.sort((a, b) => a.time - b.time);
}

/** In wachtmodus: speel het akkoord van de huidige maat zacht aan als een "pad". */
export function padChord(piece, beat, time, seconds = 1.6) {
  const c = piece.chords.find((ch) => beat >= ch.start - 1e-6 && beat < ch.start + ch.dur - 1e-6);
  if (!c) return;
  playAt(c.bass, time, seconds, { bus: 'accomp', velocity: 0.55, soft: true });
  c.notes.forEach((n) => playAt(n, time, seconds, { bus: 'accomp', velocity: 0.35, soft: true }));
}
