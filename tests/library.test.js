import { describe, it, expect } from 'vitest';
import { expandSong, writePart, durationCodes, leftHandFromChords } from '../src/core/arrange.js';
import { parseMidi, partsFromMidi, defaultHands } from '../src/core/midifile.js';
import { buildPiece } from '../src/core/piece.js';
import { matchSong, normalize } from '../src/core/search.js';

describe('automatisch arrangeren', () => {
  it('splitst duren in schrijfbare noten', () => {
    expect(durationCodes(2.5).map(([, c]) => c)).toEqual(['h', '8']);
    expect(durationCodes(3).map(([, c]) => c)).toEqual(['h.']);
  });

  it('schrijft rusten, maatstrepen en knipt op de maatstreep', () => {
    const s = writePart([{ start: 1, dur: 4, midis: [60] }], { length: 8 });
    expect(s).toBe('r/q C4/h. | C4/q r/h.');
    expect(buildPiece({ parts: { rh: s } }).errors).toEqual([]);
  });

  it('maakt drie niveaus uit melodie en akkoorden', () => {
    const song = expandSong({ title: 't', melody: 'E4/q D4/q C4/h | G4/w', chords: 'C | G' });
    expect(song.levels.map((l) => l.level)).toEqual([1, 2, 3]);
    expect(song.levels[1].parts.lh).toBe('C3/w | G2/w');
    expect(song.levels[2].parts.lh).toBe('C3+E3+G3/w | B2+D3+G3/w');
    for (const lv of song.levels) expect(buildPiece(lv).errors).toEqual([]);
  });

  it('werkt met opmaat en 3/4', () => {
    const lh = leftHandFromChords('C | G', { timeSignature: '3/4', pickup: 1, length: 7, style: 'roots' });
    expect(lh).toBe('r/q | C3/h. | G2/h.');
    expect(buildPiece({ timeSignature: '3/4', pickup: 1, parts: { lh } }).errors).toEqual([]);
  });

  it('laat bestaande niveaus ongemoeid', () => {
    const s = { levels: [{ level: 1 }] };
    expect(expandSong(s)).toBe(s);
  });
});

// ---- mini MIDI-schrijver voor de test ----
function vlq(n) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
function track(events) {
  const data = events.flatMap(([dt, ...bytes]) => [...vlq(dt), ...bytes]).concat([0, 0xff, 0x2f, 0]);
  return [0x4d, 0x54, 0x72, 0x6b, (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255, ...data];
}
function smf(tracks, division = 480) {
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, division >> 8, division & 255, ...tracks.flat()]);
}
const q = 480;
const notes = (ch, list) => list.flatMap(([n, len, gap = 0]) => [[gap, 0x90 | ch, n, 90], [len, 0x80 | ch, n, 0]]);

describe('MIDI-import', () => {
  const file = smf([
    track([[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], [0, 0xff, 0x58, 4, 3, 2, 24, 8], [0, 0xff, 0x59, 2, 1, 0]]), // 120 bpm, 3/4, G-groot
    track([[0, 0xff, 0x03, 6, ...Array.from('Melody', (c) => c.charCodeAt(0))], ...notes(0, [[67, q], [69, q], [71, q], [74, q * 3]])]),
    track(notes(1, [[43, q * 3], [50, q * 3]])),
    track([[0, 0x99, 36, 100], [q, 0x89, 36, 0]]), // drums: genegeerd
  ]);

  it('leest tempo, maatsoort, toonsoort, sporen en noten', () => {
    const m = parseMidi(file);
    expect(m.tempo).toBe(120);
    expect(m.timeSignature).toBe('3/4');
    expect(m.key).toBe('G');
    expect(m.tracks.map((t) => t.name)).toEqual(['Melody', 'Spoor 3']);
    expect(m.notes).toHaveLength(6);
    expect(m.notes.find((n) => n.midi === 67)).toMatchObject({ start: 0, dur: 1, track: 1 });
  });

  it('verdeelt over de handen en schrijft geldige notatie', () => {
    const m = parseMidi(file);
    expect(defaultHands(m)).toMatchObject({ mode: 'tracks', rh: [1], lh: [2] });
    const p = partsFromMidi(m);
    expect(p.melody).toBe('G4/q A4/q B4/q | D5/h.');
    expect(p.lh).toBe('G2/h. | D3/h.');
    const song = expandSong({ title: 'x', melody: p.melody, lh: p.lh, timeSignature: p.timeSignature, key: p.key });
    for (const lv of song.levels) expect(buildPiece(lv).errors).toEqual([]);
  });

  it('weigert iets dat geen MIDI is', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4]))).toThrow(/geen MIDI/);
  });
});

describe('zoeken', () => {
  const song = { title: 'Für Elise', composer: 'Ludwig van Beethoven', aka: ['Voor Elise'], category: 'klassiek' };
  it('negeert hoofdletters en accenten', () => {
    expect(normalize('Für  Élise!')).toBe('fur elise');
    expect(matchSong(song, 'fur')).toBe(true);
    expect(matchSong(song, 'beethoven elise')).toBe(true);
    expect(matchSong(song, 'voor')).toBe(true);
    expect(matchSong(song, 'klassiek', [{ id: 'klassiek', label: 'Klassiek' }])).toBe(true);
    expect(matchSong(song, 'eye of the tiger')).toBe(false);
  });
});
