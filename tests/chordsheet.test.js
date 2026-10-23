import { describe, it, expect } from 'vitest';
import { parseChordSheet, formatChordSheet, parseTime, chordIndexAt, matchChord, ChordScorer, isTimed } from '../src/core/chordsheet.js';
import { parseChord } from '../src/core/chords.js';
import { ManualClock } from '../src/core/clock.js';

describe('akkoordenblad', () => {
  it('leest akkoorden, herhalingen, kopjes en tijden', () => {
    const { chords, errors } = parseChordSheet('[Couplet]\nAm F C G x2\n# commentaar\n1:02.5 Dm7 0:70 E');
    expect(errors).toEqual([]);
    expect(chords.map((c) => c.chord)).toEqual(['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Dm7', 'E']);
    expect(chords[8].time).toBe(62.5);
    expect(chords[9].time).toBe(70);
    expect(isTimed(chords)).toBe(false);
  });

  it('meldt onbekende akkoorden', () => {
    expect(parseChordSheet('Am Hm').errors[0]).toMatch(/Hm/);
  });

  it('schrijft en leest tijden terug', () => {
    const chords = [{ chord: 'C', time: 0 }, { chord: 'G/B', time: 65.25 }];
    const text = formatChordSheet(chords);
    expect(text).toBe('0:00.0 C\n1:05.3 G/B');
    expect(parseChordSheet(text).chords.map((c) => c.time)).toEqual([0, 65.3]);
    expect(parseTime('2:03')).toBe(123);
  });

  it('vindt het akkoord op een tijdstip', () => {
    const chords = [{ chord: 'C', time: 2 }, { chord: 'G', time: 4 }, { chord: 'Am', time: 6 }];
    expect(chordIndexAt(chords, 1)).toBe(-1);
    expect(chordIndexAt(chords, 4)).toBe(1);
    expect(chordIndexAt(chords, 99)).toBe(2);
  });
});

describe('akkoorden herkennen', () => {
  it('accepteert omkeringen en octaven', () => {
    expect(matchChord([64, 67, 72], 'C').ok).toBe(true);
    expect(matchChord([48, 52, 55, 60], 'C').ok).toBe(true);
    expect(matchChord([57, 60, 64], 'Am').ok).toBe(true);
  });
  it('meldt ontbrekende en foute tonen', () => {
    const m = matchChord([60, 64], 'C');
    expect(m.ok).toBe(false);
    expect(m.missing).toEqual([7]);
    expect(matchChord([60, 63, 67], 'C').extra).toEqual([3]);
  });
  it('septiemakkoord: kwint mag ontbreken, septiem niet', () => {
    expect(matchChord([55, 59, 65], 'G7').ok).toBe(true);
    expect(matchChord([55, 59, 62], 'G7').ok).toBe(false);
  });
  it('slash-akkoorden en extra soorten', () => {
    expect(parseChord('C/G').bassPc).toBe(7);
    expect(matchChord([43, 60, 64, 67], 'C/G').ok).toBe(true);
    expect(parseChord('Dsus2')).not.toBeNull();
    expect(parseChord('F#m7b5')).not.toBeNull();
    expect(matchChord([46, 60, 64, 67], 'C/Bb').ok).toBe(true); // basnoot buiten het akkoord
    expect(matchChord([55, 62], 'G5').ok).toBe(true);
  });
});

describe('score bij meespelen', () => {
  const chords = [{ chord: 'C', time: 0 }, { chord: 'F', time: 2 }, { chord: 'G', time: 4 }, { chord: 'C', time: 6 }];
  it('telt treffers, timing en gemiste akkoorden', () => {
    const s = new ChordScorer(chords);
    expect(s.tryHit([60, 64, 67], 0.2)).toMatchObject({ index: 0 });
    expect(s.tryHit([60, 64, 67], 0.5)).toBeNull(); // al gescoord
    expect(s.tryHit([60, 65, 69], 1.8)).toMatchObject({ index: 1 }); // net vóór de wissel mag
    expect(s.tryHit([55, 59, 62], 5.6)).toMatchObject({ index: 2 }); // laat
    const r = s.result(6.5);
    expect(r).toMatchObject({ total: 4, hit: 3, accuracy: 75 });
    expect(r.missed).toEqual(['C']);
    expect(r.timing).toBeLessThan(100);
  });
  it('telt alleen vanaf het startpunt', () => {
    const s = new ChordScorer(chords, { from: 3 });
    expect(s.result(7).total).toBe(3); // F (klinkt al op 3 s), G en C
    expect(s.tryHit([60, 65, 69], 3.2)).toMatchObject({ index: 1 });
  });
});

describe('klokken', () => {
  it('handmatige klok: start, pauze en spoelen', () => {
    let t = 0;
    const c = new ManualClock({ now: () => t });
    c.play();
    t = 3000;
    expect(c.position()).toBe(3);
    c.pause();
    t = 9000;
    expect(c.position()).toBe(3);
    c.seek(10);
    expect(c.position()).toBe(10);
    c.base = -2; // aftellen
    c.play();
    t += 500;
    expect(c.position()).toBe(-1.5);
  });
});

describe('akkoord-verzamelaar', () => {
  it('groepeert noten tot een pauze en negeert naklinkers na een goed akkoord', async () => {
    const { ChordCollector } = await import('../src/core/chordsheet.js');
    const c = new ChordCollector({ gap: 0.8, grace: 0.35 });
    expect([...c.add(61, 0)]).toEqual([61]); // foute noot
    expect([...c.add(58, 0.3)]).toEqual([61, 58]); // hoort nog bij dezelfde poging
    const set = c.add(62, 1.5); // na een pauze: nieuwe poging zonder de foute noot
    expect([...set]).toEqual([62]);
    c.add(65, 1.6);
    const ok = c.add(58, 1.7);
    expect(matchChord(ok, 'Bb').ok).toBe(true);
    c.success(ok, 1.7);
    expect(c.add(65, 1.8)).toBeNull(); // naklinker van Bb
    expect([...c.add(56, 1.9)]).toEqual([56]); // eerste noot van het volgende akkoord telt wel
    c.success(new Set([60, 63, 67]), 3); // Cm goed
    expect(c.add(63, 3.1, [], new Set([8, 0, 3]))).not.toBeNull(); // Es hoort ook bij Ab: niet negeren
    expect(c.add(67, 3.15, [], new Set([8, 0, 3]))).toBeNull(); // G hoort niet bij Ab: naklinker
  });
});

describe('doorspelen na een misser', () => {
  it('telt het akkoord als de laatste noten het vormen', async () => {
    const { ChordCollector } = await import('../src/core/chordsheet.js');
    const c = new ChordCollector();
    let set;
    for (const [m, t] of [[61, 0], [58, 0.2], [62, 0.4], [65, 0.6]]) set = c.add(m, t);
    expect(matchChord(set, 'Bb').ok).toBe(false); // Db zit er nog in
    const r = c.match('Bb', set);
    expect(r.ok).toBe(true);
    expect([...r.midis]).toEqual([58, 62, 65]);
  });
});
