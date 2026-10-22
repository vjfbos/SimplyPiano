// Zet een stukdefinitie uit JSON om naar een speelbaar model met tijdlijn.
import { parsePart, parseTimeSignature, barStartFor } from './notes.js';
import { parseChordLine } from './chords.js';

export const HANDS = ['rh', 'lh'];
const DEFAULT_CLEF = { rh: 'treble', lh: 'bass' };

/**
 * def = { title, tempo, timeSignature, key, pickup, parts: { rh: "..." | {notes, clef}, lh: ... }, chords }
 */
export function buildPiece(def) {
  const ts = parseTimeSignature(def.timeSignature || '4/4');
  const pickup = def.pickup || 0;
  const errors = [];
  const parts = {};
  let length = 0;
  for (const hand of HANDS) {
    const raw = def.parts?.[hand];
    if (!raw) continue;
    const notes = typeof raw === 'string' ? raw : raw.notes;
    const clef = (typeof raw === 'object' && raw.clef) || DEFAULT_CLEF[hand];
    const parsed = parsePart(notes, { beatsPerBar: ts.beatsPerBar, pickup });
    parsed.errors.forEach((e) => errors.push(`${hand === 'rh' ? 'Rechterhand' : 'Linkerhand'}: ${e}`));
    parts[hand] = { hand, clef, tokens: parsed.tokens, length: parsed.length };
    length = Math.max(length, parsed.length);
  }
  if (!Object.keys(parts).length) errors.push('Stuk heeft geen partijen (parts.rh / parts.lh)');

  // Maten
  const bars = [];
  for (let i = 0; ; i++) {
    const start = barStartFor(i, ts.beatsPerBar, pickup);
    if (start >= length - 1e-6) break;
    bars.push({ index: i, start, end: barStartFor(i + 1, ts.beatsPerBar, pickup) });
  }

  const chords = parseChordLine(def.chords, { beatsPerBar: ts.beatsPerBar, pickup, bars: bars.length });
  (chords.errors || []).forEach((e) => errors.push(`Akkoorden: ${e}`));

  // Gecombineerde tijdlijn: alles wat op hetzelfde moment begint vormt één event.
  const map = new Map();
  for (const part of Object.values(parts)) {
    part.tokens.forEach((token, ti) => {
      token.hand = part.hand;
      token.id = `${part.hand}-${ti}`;
      if (token.rest) return;
      const key = Math.round(token.start * 1e4);
      if (!map.has(key)) map.set(key, { t: token.start, notes: [], tokens: [] });
      const ev = map.get(key);
      ev.tokens.push(token);
      token.notes.forEach((n) => ev.notes.push({ midi: n.midi, hand: part.hand, finger: n.finger, dur: token.dur, tokenId: token.id }));
    });
  }
  const events = [...map.values()].sort((a, b) => a.t - b.t);
  events.forEach((ev, i) => {
    ev.index = i;
    ev.bar = bars.findIndex((b) => ev.t >= b.start - 1e-6 && ev.t < b.end - 1e-6);
    ev.tokens.forEach((tk) => (tk.eventIndex = i));
  });

  let lo = 127;
  let hi = 0;
  events.forEach((ev) => ev.notes.forEach((n) => { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }));

  return {
    title: def.title || '',
    tempo: def.tempo || 80,
    timeSignature: def.timeSignature || '4/4',
    ts,
    key: def.key || 'C',
    pickup,
    parts,
    bars,
    chords,
    events,
    length,
    range: events.length ? [lo, hi] : [60, 72],
    errors,
  };
}

/** Events binnen een maatbereik (inclusief), voor het herhalen van een passage. */
export function eventsInBars(piece, fromBar, toBar) {
  return piece.events.filter((ev) => ev.bar >= fromBar && ev.bar <= toBar);
}
