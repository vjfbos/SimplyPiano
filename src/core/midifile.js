// Standaard MIDI-bestanden (.mid) inlezen en omzetten naar een liedje voor de app.
// Eigen parser volgens de openbare SMF-specificatie (formaat 0 en 1).
import { writePart } from './arrange.js';
import { parseTimeSignature } from './notes.js';

const MAJOR_SHARP = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const MAJOR_FLAT = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
const MINOR_SHARP = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
const MINOR_FLAT = ['Am', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'];

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.p = 0;
  }
  u8() { return this.b[this.p++]; }
  u16() { return (this.u8() << 8) | this.u8(); }
  u32() { return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8(); }
  str(n) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8()); return s; }
  vlq() {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const c = this.u8();
      v = (v << 7) | (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    return v;
  }
}

/** Leest een MIDI-bestand. Geeft noten in tellen (kwartnoten) terug, plus tempo, maatsoort en toonsoort. */
export function parseMidi(buffer) {
  const r = new Reader(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  if (r.str(4) !== 'MThd') throw new Error('Dit is geen MIDI-bestand.');
  const hlen = r.u32();
  const format = r.u16();
  const ntrks = r.u16();
  const division = r.u16();
  r.p = 8 + hlen;
  if (division & 0x8000) throw new Error('MIDI-bestanden met SMPTE-tijd worden niet ondersteund.');
  const meta = { tempo: null, timeSignature: null, key: null };
  const tracks = [];
  const notes = [];

  for (let t = 0; t < ntrks && r.p < r.b.length; t++) {
    const id = r.str(4);
    const len = r.u32();
    const end = r.p + len;
    if (id !== 'MTrk') { r.p = end; continue; }
    const track = { index: t, name: '', notes: 0, sum: 0, channels: new Set() };
    const open = new Map(); // `${ch}:${note}` -> start tick
    let tick = 0;
    let status = 0;
    while (r.p < end) {
      tick += r.vlq();
      let b = r.u8();
      if (b & 0x80) status = b;
      else r.p--; // running status
      if (status === 0xff) {
        const type = r.u8();
        const l = r.vlq();
        const start = r.p;
        if (type === 0x03) track.name = new TextDecoder().decode(r.b.slice(start, start + l));
        else if (type === 0x51 && meta.tempo === null) meta.tempo = 60e6 / ((r.b[start] << 16) | (r.b[start + 1] << 8) | r.b[start + 2]);
        else if (type === 0x58 && meta.timeSignature === null) meta.timeSignature = `${r.b[start]}/${2 ** r.b[start + 1]}`;
        else if (type === 0x59 && meta.key === null) {
          const sf = (r.b[start] << 24) >> 24;
          const minor = r.b[start + 1] === 1;
          const list = minor ? (sf < 0 ? MINOR_FLAT : MINOR_SHARP) : sf < 0 ? MAJOR_FLAT : MAJOR_SHARP;
          meta.key = list[Math.min(7, Math.abs(sf))];
        }
        r.p = start + l;
        if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { r.p += r.vlq(); continue; }
      const cmd = status & 0xf0;
      const ch = status & 0x0f;
      if (cmd === 0x90 || cmd === 0x80) {
        const note = r.u8();
        const vel = r.u8();
        const k = `${ch}:${note}`;
        if (cmd === 0x90 && vel > 0) {
          if (!open.has(k)) open.set(k, tick);
        } else if (open.has(k)) {
          const start = open.get(k);
          open.delete(k);
          if (ch === 9) continue; // kanaal 10 = drums
          notes.push({ midi: note, start: start / division, dur: Math.max(1, tick - start) / division, track: t, channel: ch });
          track.notes++;
          track.sum += note;
          track.channels.add(ch);
        }
      } else if (cmd === 0xc0 || cmd === 0xd0) r.p += 1;
      else r.p += 2; // overige kanaalberichten hebben twee databytes
    }
    r.p = end;
    tracks.push(track);
  }
  return {
    format,
    notes: notes.sort((a, b) => a.start - b.start || a.midi - b.midi),
    tracks: tracks.filter((tr) => tr.notes > 0).map((tr) => ({ index: tr.index, name: tr.name || `Spoor ${tr.index + 1}`, notes: tr.notes, avgPitch: tr.sum / tr.notes })),
    tempo: meta.tempo ? Math.round(meta.tempo) : 100,
    timeSignature: supportedTs(meta.timeSignature),
    key: meta.key || 'C',
  };
}

function supportedTs(ts) {
  if (!ts) return '4/4';
  const [n, d] = ts.split('/').map(Number);
  return [2, 4, 8].includes(d) && n >= 1 && n <= 12 ? ts : '4/4';
}

/** Standaard handverdeling: met twee of meer sporen het hoogste spoor rechts, anders splitsen op middel-C. */
export function defaultHands(midi) {
  if (midi.tracks.length >= 2) {
    const sorted = [...midi.tracks].sort((a, b) => b.avgPitch - a.avgPitch);
    return { mode: 'tracks', rh: [sorted[0].index], lh: [sorted[sorted.length - 1].index] };
  }
  return { mode: 'split', split: 60 };
}

/** Eén stem per hand: noten die tegelijk beginnen worden een akkoord, overlap wordt ingekort. */
function reduce(notes, pick, maxNotes) {
  const groups = [];
  for (const n of notes) {
    const start = Math.round(n.start * 4) / 4;
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.start - start) < 1e-6) g.notes.push(n);
    else groups.push({ start, notes: [n] });
  }
  return groups.map((g, i) => {
    const next = groups[i + 1]?.start ?? Infinity;
    const longest = Math.max(...g.notes.map((n) => Math.max(0.25, Math.round(n.dur * 4) / 4)));
    const midis = [...new Set(g.notes.map((n) => n.midi))].sort((a, b) => a - b);
    const chosen = pick === 'top' ? [midis[midis.length - 1]] : pick === 'bottom' ? [midis[0]] : pick === 'high' ? midis.slice(-maxNotes) : midis.slice(0, maxNotes);
    return { start: g.start, dur: Math.min(longest, next - g.start), midis: chosen };
  });
}

/**
 * Zet (een deel van) een MIDI-bestand om naar notatie per hand.
 * opts: { hands (zie defaultHands), fromBar (0-based), toBar (exclusief), detail: 'simple' | 'full' }
 * Geeft { melody, lh, timeSignature, key, tempo, bars, totalBars } terug.
 */
export function partsFromMidi(midi, opts = {}) {
  const ts = midi.timeSignature;
  const { beatsPerBar } = parseTimeSignature(ts);
  const hands = opts.hands || defaultHands(midi);
  const isRh = (n) => (hands.mode === 'tracks' ? hands.rh.includes(n.track) : n.midi >= (hands.split ?? 60));
  const isLh = (n) => (hands.mode === 'tracks' ? hands.lh.includes(n.track) : n.midi < (hands.split ?? 60));
  const totalBars = Math.ceil(Math.max(0, ...midi.notes.map((n) => n.start + n.dur)) / beatsPerBar);
  const firstBar = midi.notes.length ? Math.floor(midi.notes[0].start / beatsPerBar) : 0;
  const fromBar = Math.max(0, opts.fromBar ?? firstBar);
  const toBar = Math.max(fromBar + 1, Math.min(opts.toBar ?? fromBar + 16, totalBars));
  const from = fromBar * beatsPerBar;
  const to = toBar * beatsPerBar;
  const inRange = midi.notes
    .filter((n) => n.start >= from - 0.01 && n.start < to - 0.01)
    .map((n) => ({ ...n, start: n.start - from, dur: Math.min(n.dur, to - n.start) }));
  const length = (toBar - fromBar) * beatsPerBar;
  const full = opts.detail === 'full';
  const write = (notes, pick) => (notes.length ? writePart(reduce(notes, pick, 3), { timeSignature: ts, key: midi.key, length }) : '');
  return {
    melody: write(inRange.filter(isRh), full ? 'high' : 'top'),
    lh: write(inRange.filter(isLh), full ? 'low' : 'bottom'),
    timeSignature: ts,
    key: midi.key,
    tempo: midi.tempo,
    fromBar,
    toBar,
    totalBars,
  };
}
