// Notenamen, MIDI-nummers en de compacte notatie die in de JSON-content gebruikt wordt.
//
// Notatie per token (gescheiden door spaties, maatstrepen met "|"):
//   E4/q        kwartnoot E4
//   F#4/h.      gepunteerde halve noot Fis4
//   Bb3/8       achtste Bes3
//   C4+E4+G4/w  akkoord (hele noot)
//   r/q         rust
//   E4/q@3      vingerzetting 3 (bij akkoorden: @1+3+5)

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOLFEGE = ['do', 'do#', 're', 're#', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'la#', 'si'];

// Duur in kwartnoot-tellen.
export const DURATIONS = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25 };

const EPS = 1e-6;

export function parseNoteName(name) {
  const m = /^([A-Ga-g])(##|#|bb|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] || '';
  const octave = Number(m[3]);
  const accVal = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 }[acc];
  return { letter, acc, octave, midi: (octave + 1) * 12 + LETTERS[letter] + accVal };
}

export function nameToMidi(name) {
  const p = parseNoteName(name);
  return p ? p.midi : null;
}

export function midiToName(midi, flats = false) {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}

/** Label zoals de gebruiker het wil zien: 'letters' (C4) of 'solfege' (do). */
export function noteLabel(midi, style = 'letters', withOctave = true) {
  if (style === 'solfege') return SOLFEGE[midi % 12];
  const n = SHARP_NAMES[midi % 12];
  return withOctave ? n + (Math.floor(midi / 12) - 1) : n;
}

export function isBlack(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiFloat(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function parseTimeSignature(ts = '4/4') {
  const [num, den] = ts.split('/').map(Number);
  if (!num || !den) throw new Error(`Ongeldige maatsoort: ${ts}`);
  return { num, den, beatsPerBar: num * (4 / den) };
}

function parseDuration(code) {
  const m = /^(w|h|q|8|16)(\.{0,2})$/.exec(code);
  if (!m) return null;
  const base = DURATIONS[m[1]];
  const dots = m[2].length;
  let dur = base;
  let add = base;
  for (let i = 0; i < dots; i++) {
    add /= 2;
    dur += add;
  }
  return { code: m[1], dots, dur };
}

/** Maatgrenzen: met opmaat is maat 0 korter. */
export function barStartFor(barIndex, beatsPerBar, pickup = 0) {
  if (!pickup) return barIndex * beatsPerBar;
  return barIndex === 0 ? 0 : pickup + (barIndex - 1) * beatsPerBar;
}

export function barIndexAt(beat, beatsPerBar, pickup = 0) {
  if (!pickup) return Math.floor((beat + EPS) / beatsPerBar);
  if (beat < pickup - EPS) return 0;
  return 1 + Math.floor((beat - pickup + EPS) / beatsPerBar);
}

/**
 * Parseert één partij (rechterhand of linkerhand).
 * Geeft tokens terug met starttijd (in tellen), duur, noten en maatnummer, plus een lijst fouten.
 */
export function parsePart(str, { beatsPerBar = 4, pickup = 0 } = {}) {
  const tokens = [];
  const errors = [];
  let t = 0;
  let barMarks = 0;
  const words = String(str || '').trim().split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word === '|' || word === '||') {
      barMarks++;
      const expected = barStartFor(barMarks, beatsPerBar, pickup);
      if (Math.abs(t - expected) > EPS) {
        errors.push(`Maat ${barMarks} klopt niet: ${fmt(t - barStartFor(barMarks - 1, beatsPerBar, pickup))} tellen i.p.v. ${fmt(expected - barStartFor(barMarks - 1, beatsPerBar, pickup))}`);
        t = expected; // herstel zodat volgende maten correct gemeld worden
      }
      continue;
    }
    const [pitchPart, rest] = word.split('/');
    if (!rest) {
      errors.push(`Token "${word}" mist een duur (bijv. ${word}/q)`);
      continue;
    }
    const [durCode, fingerPart] = rest.split('@');
    const d = parseDuration(durCode);
    if (!d) {
      errors.push(`Onbekende duur in "${word}"`);
      continue;
    }
    const token = { start: t, dur: d.dur, code: d.code, dots: d.dots, rest: false, notes: [] };
    if (pitchPart.toLowerCase() === 'r') {
      token.rest = true;
    } else {
      const names = pitchPart.split('+');
      const fingers = fingerPart ? fingerPart.split('+').map(Number) : [];
      names.forEach((n, i) => {
        const p = parseNoteName(n);
        if (!p) {
          errors.push(`Onbekende noot "${n}" in "${word}"`);
          return;
        }
        token.notes.push({ ...p, name: n, finger: fingers[i] || null });
      });
      if (!token.notes.length) continue;
    }
    token.bar = barIndexAt(t, beatsPerBar, pickup);
    const barEnd = barStartFor(token.bar + 1, beatsPerBar, pickup);
    if (t + d.dur > barEnd + EPS) {
      errors.push(`"${word}" loopt over de maatstreep van maat ${token.bar + 1}`);
    }
    tokens.push(token);
    t += d.dur;
  }
  return { tokens, length: t, errors };
}

function fmt(n) {
  return Math.round(n * 1000) / 1000;
}
