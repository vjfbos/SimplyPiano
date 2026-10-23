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
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 2],
};
const ALIASES = { maj: '', min: 'm', '-': 'm', M7: 'maj7', '+': 'aug', sus: 'sus4' };
const NOTE = '([A-G])(#|b)?';
const CHORD_RE = new RegExp(`^${NOTE}(maj7|m7b5|dim7|add9|sus2|sus4|sus|maj|min|m6|m7|M7|dim|aug|m|7|6|\\+|-)?(?:/${NOTE})?$`);

function pc(letter, acc) {
  return (ROOTS[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
}

/** "Am", "G7", "Fmaj7", "Dsus4", "C/G" (slash = andere basnoot) ... */
export function parseChord(symbol) {
  const m = CHORD_RE.exec(String(symbol).trim());
  if (!m) return null;
  const root = pc(m[1], m[2]);
  const quality = ALIASES[m[3]] ?? m[3] ?? '';
  const intervals = QUALITIES[quality];
  const bassPc = m[4] ? pc(m[4], m[5]) : root;
  // Bas in octaaf 2 (MIDI 36-47), akkoord compact rond C3-C4.
  const bass = 36 + bassPc;
  const chord = intervals.map((iv) => {
    let n = 48 + ((root + iv) % 12);
    if (n < 52) n += 12; // houd de klank boven E3 zodat het niet modderig wordt
    return n;
  }).sort((a, b) => a - b);
  return { symbol, root, bass, bassPc, quality, intervals, notes: chord };
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
