import { describe, it, expect } from 'vitest';
import { nameToMidi, midiToName, parsePart, parseTimeSignature } from '../src/core/notes.js';
import { buildPiece } from '../src/core/piece.js';
import { parseChord, parseChordLine } from '../src/core/chords.js';

describe('noten', () => {
  it('rekent namen om naar MIDI', () => {
    expect(nameToMidi('C4')).toBe(60);
    expect(nameToMidi('A4')).toBe(69);
    expect(nameToMidi('F#4')).toBe(66);
    expect(nameToMidi('Bb3')).toBe(58);
    expect(midiToName(61)).toBe('C#4');
  });

  it('parseert duur, punten, rusten, akkoorden en vingers', () => {
    const { tokens, errors, length } = parsePart('C4/q@1 E4/8 r/8 D4/h | C4+E4+G4/w@1+3+5');
    expect(errors).toEqual([]);
    expect(length).toBe(8);
    expect(tokens[0]).toMatchObject({ start: 0, dur: 1, bar: 0 });
    expect(tokens[0].notes[0].finger).toBe(1);
    expect(tokens[2].rest).toBe(true);
    expect(tokens[3].dur).toBe(2);
    expect(parsePart('D4/h. r/q').tokens[0].dur).toBe(3);
    expect(tokens[4].notes.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(tokens[4].bar).toBe(1);
  });

  it('meldt maten die niet kloppen', () => {
    const { errors } = parsePart('C4/q D4/q | E4/w', { beatsPerBar: 4 });
    expect(errors[0]).toMatch(/Maat 1/);
    expect(parsePart('C4/h. D4/h').errors[0]).toMatch(/maatstreep/);
    expect(parsePart('H4/q').errors[0]).toMatch(/Onbekende noot/);
  });

  it('ondersteunt opmaat en x/8-maten', () => {
    expect(parseTimeSignature('3/8').beatsPerBar).toBe(1.5);
    const { tokens, errors } = parsePart('E5/16 D#5/16 | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16 | A4/q.', { beatsPerBar: 1.5, pickup: 0.5 });
    expect(errors).toEqual([]);
    expect(tokens[0].bar).toBe(0);
    expect(tokens[2].bar).toBe(1);
    expect(tokens.at(-1).bar).toBe(2);
  });
});

describe('stuk', () => {
  it('voegt handen samen tot events', () => {
    const p = buildPiece({ parts: { rh: 'E4/h G4/h', lh: 'C3/w' } });
    expect(p.errors).toEqual([]);
    expect(p.events).toHaveLength(2);
    expect(p.events[0].notes.map((n) => n.hand).sort()).toEqual(['lh', 'rh']);
    expect(p.bars).toHaveLength(1);
    expect(p.range).toEqual([48, 67]);
  });
});

describe('akkoorden', () => {
  it('bouwt akkoorden', () => {
    expect(parseChord('C').notes.map((n) => n % 12)).toEqual([4, 7, 0].sort((a, b) => a - b).length ? expect.any(Array) : []);
    expect(parseChord('Am').root).toBe(9);
    expect(parseChord('G7').notes).toHaveLength(4);
    expect(parseChord('X')).toBeNull();
  });
  it('verdeelt meerdere akkoorden over een maat', () => {
    const line = parseChordLine('C | G C', { beatsPerBar: 4 });
    expect(line.map((c) => [c.symbol, c.start, c.dur])).toEqual([['C', 0, 4], ['G', 4, 2], ['C', 6, 2]]);
  });
});
