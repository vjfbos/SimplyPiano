// Automatisch arrangeren: van melodie + akkoorden naar 2-3 moeilijkheidsniveaus,
// en het omzetten van losse noten (bijv. uit een MIDI-bestand) naar de notatie van de app.
import { parsePart, parseTimeSignature, midiToName, barStartFor } from './notes.js';
import { parseChordLine } from './chords.js';

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);
const DUR_CODES = [[4, 'w'], [3, 'h.'], [2, 'h'], [1.5, 'q.'], [1, 'q'], [0.75, '8.'], [0.5, '8'], [0.25, '16']];
const EPS = 1e-6;

export function usesFlats(key) {
  return FLAT_KEYS.has(key);
}

/** Splits een duur (veelvoud van 0.25) in schrijfbare notenwaarden. */
export function durationCodes(beats) {
  const out = [];
  let left = Math.round(beats * 4) / 4;
  while (left > EPS) {
    const d = DUR_CODES.find(([v]) => v <= left + EPS);
    if (!d) break;
    out.push(d);
    left -= d[0];
  }
  return out;
}

/**
 * Schrijft segmenten { start, dur, midis: [] } (leeg = rust) als notatiestring,
 * met maatstrepen, rusten in de gaten en opsplitsing bij de maatstreep.
 */
export function writePart(segments, { timeSignature = '4/4', pickup = 0, length, key = 'C', fingers = null } = {}) {
  const { beatsPerBar } = parseTimeSignature(timeSignature);
  const flats = usesFlats(key);
  const segs = segments
    .map((s) => ({ ...s, start: q(s.start), end: q(s.start + s.dur) }))
    .filter((s) => s.end > s.start + EPS)
    .sort((a, b) => a.start - b.start);
  const total = length ?? Math.max(0, ...segs.map((s) => s.end));
  const words = [];
  let t = 0;
  let bar = 0;
  const nextBarStart = () => barStartFor(bar + 1, beatsPerBar, pickup);
  const emit = (from, to, midis, finger) => {
    // knip op maatstrepen
    while (to - from > EPS) {
      const barEnd = nextBarStart();
      const end = Math.min(to, barEnd);
      for (const [, code] of durationCodes(end - from)) {
        const pitch = midis?.length ? midis.slice().sort((a, b) => a - b).map((m) => midiToName(m, flats)).join('+') : 'r';
        words.push(`${pitch}/${code}${finger && midis?.length ? '@' + finger : ''}`);
      }
      from = end;
      if (Math.abs(from - barEnd) < EPS && from < total - EPS) {
        words.push('|');
        bar++;
      }
    }
  };
  for (const s of segs) {
    if (s.start < t - EPS) continue; // overlap: sla over
    if (s.start > t + EPS) emit(t, s.start, null);
    emit(s.start, s.end, s.midis, fingers ? s.finger : null);
    t = s.end;
  }
  if (total > t + EPS) emit(t, total, null);
  return words.join(' ');
}

function q(v) {
  return Math.round(v * 4) / 4;
}

/** Basnoot tussen F2 en E3. */
function bassNote(root) {
  let n = 36 + root;
  if (n < 41) n += 12;
  return n;
}

/** Akkoordligging rond C3-G3, met zo weinig mogelijk beweging t.o.v. het vorige akkoord. */
export function voiceChord(chord, prev) {
  // Drieklank (grondtoon, terts, kwint); een septiem laten we weg voor de eenvoud.
  const pcs = new Set(chord.notes.map((n) => n % 12));
  const pick = (ivs) => (chord.root + (ivs.find((iv) => pcs.has((chord.root + iv) % 12)) ?? ivs[0])) % 12;
  const triad = [chord.root, pick([4, 3, 5, 2]), pick([7, 6, 8])];
  const options = [];
  for (let inv = 0; inv < 3; inv++) {
    const order = [...triad.slice(inv), ...triad.slice(0, inv)];
    for (let base = 45; base <= 56; base++) {
      if (base % 12 !== order[0]) continue;
      const v = [base];
      for (const pc of order.slice(1)) {
        let n = v[v.length - 1] + 1;
        while (n % 12 !== pc) n++;
        v.push(n);
      }
      if (v[2] <= 60) options.push(v);
    }
  }
  if (!options.length) return chord.notes;
  if (!prev) return options.sort((a, b) => Math.abs(a[0] - 48) - Math.abs(b[0] - 48))[0];
  const dist = (v) => v.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0);
  return options.sort((a, b) => dist(a) - dist(b))[0];
}

/** Linkerhandpartij uit een akkoordregel: 'roots' (basnoten) of 'blocks' (akkoorden). */
export function leftHandFromChords(chordsLine, { timeSignature = '4/4', pickup = 0, length, key = 'C', style = 'roots' }) {
  const { beatsPerBar } = parseTimeSignature(timeSignature);
  const chords = parseChordLine(chordsLine, { beatsPerBar, pickup });
  let prev = null;
  const segs = chords
    .filter((c) => c.start < length - EPS)
    .map((c) => {
      const start = q(c.start);
      const end = Math.min(length, q(c.start + c.dur));
      const midis = style === 'blocks' ? (prev = voiceChord(c, prev)) : [bassNote(c.root)];
      return { start, dur: end - start, midis };
    });
  return writePart(segs, { timeSignature, pickup, length, key });
}

/**
 * Een liedje met alleen `melody` (+ optioneel `chords`, `lh`) krijgt automatisch niveaus:
 *   1 melodie rechts (met akkoordbegeleiding), 2 + basnoten links, 3 + akkoorden links (of de opgegeven lh).
 */
export function expandSong(song) {
  if (song.levels?.length || !song.melody) return song;
  const base = {
    tempo: song.tempo || 90,
    timeSignature: song.timeSignature || '4/4',
    key: song.key || 'C',
    pickup: song.pickup || 0,
  };
  const { beatsPerBar } = parseTimeSignature(base.timeSignature);
  const length = parsePart(song.melody, { beatsPerBar, pickup: base.pickup }).length;
  const levels = [{ level: 1, label: 'Starter', description: 'Melodie rechts', ...base, accompaniment: !!song.chords, parts: { rh: song.melody }, chords: song.chords }];
  if (song.chords) {
    const opts = { ...base, length };
    levels.push({ level: 2, label: 'Gevorderd', description: 'Melodie rechts, basnoten links', ...base, parts: { rh: song.melody, lh: leftHandFromChords(song.chords, { ...opts, style: 'roots' }) }, chords: song.chords });
    levels.push({ level: 3, label: 'Uitdaging', description: song.lh ? 'Beide handen' : 'Melodie rechts, akkoorden links', ...base, parts: { rh: song.melody, lh: song.lh || leftHandFromChords(song.chords, { ...opts, style: 'blocks' }) }, chords: song.chords });
  } else if (song.lh) {
    levels.push({ level: 2, label: 'Gevorderd', description: 'Beide handen', ...base, parts: { rh: song.melody, lh: song.lh } });
  }
  return { ...song, levels };
}
