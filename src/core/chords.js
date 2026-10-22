// Akkoordsymbolen voor de begeleiding: "C", "Am", "G7", "Dm", "F", "D7", "Cmaj7" ...
import { barStartFor } from './notes.js';

const ROOTS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  sus4: [0, 5, 7],
};

export function parseChord(symbol) {
  const m = /^([A-G])(#|b)?(maj7|m7|m|7|dim|sus4)?$/.exec(symbol);
  if (!m) return null;
  const root = (ROOTS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const intervals = QUALITIES[m[3] || ''];
  // Bas in octaaf 2 (MIDI 36-47), akkoord compact rond C3-C4.
  const bass = 36 + root;
  const chord = intervals.map((iv) => {
    let n = 48 + ((root + iv) % 12);
    if (n < 52) n += 12; // houd de klank boven E3 zodat het niet modderig wordt
    return n;
  }).sort((a, b) => a - b);
  return { symbol, root, bass, notes: chord };
}

/**
 * "C | G7 | C F | G C" -> lijst {symbol, start, dur} (meerdere akkoorden in een maat delen die gelijk).
 */
export function parseChordLine(line, { beatsPerBar, pickup = 0, bars }) {
  if (!line) return [];
  const result = [];
  const errors = [];
  const barsText = line.split('|').map((s) => s.trim());
  barsText.forEach((text, i) => {
    if (!text) return;
    const barIndex = pickup ? i + 1 : i; // akkoorden beginnen bij de eerste volle maat
    if (bars && barIndex >= bars) return;
    const start = barStartFor(barIndex, beatsPerBar, pickup);
    const symbols = text.split(/\s+/).filter(Boolean);
    const each = beatsPerBar / symbols.length;
    symbols.forEach((s, j) => {
      if (s === '-' || s === '%') return; // geen akkoord
      const c = parseChord(s);
      if (!c) {
        errors.push(`Onbekend akkoord "${s}"`);
        return;
      }
      result.push({ ...c, start: start + j * each, dur: each });
    });
  });
  result.errors = errors;
  return result;
}
