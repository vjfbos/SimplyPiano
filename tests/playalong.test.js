import { describe, it, expect } from 'vitest';
import { parseChordSheet, formatChordSheet, parseTime, chordIndexAt, matchChord, ChordScorer, isTimed } from '../src/core/chordsheet.js';
import { parseChord } from '../src/core/chords.js';
import { SpotifyClock, ManualClock } from '../src/spotify/clock.js';
import { codeChallenge, redirectUri } from '../src/spotify/auth.js';

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
  it('Spotify-klok rekent door tussen de updates', async () => {
    let t = 1000;
    const clock = new SpotifyClock({ fetcher: async () => ({ track: { id: 'x', durationMs: 200000 }, progressMs: 10000, isPlaying: true }), now: () => t, interval: 100000 });
    const tracks = [];
    clock.addEventListener('track', (e) => tracks.push(e.detail.id));
    clock.start();
    await new Promise((r) => setTimeout(r, 0));
    t += 2500;
    expect(clock.position()).toBeCloseTo(12.5);
    clock.offset = -0.5;
    expect(clock.position()).toBeCloseTo(12);
    clock.nudge({ isPlaying: false });
    t += 5000;
    expect(clock.position()).toBeCloseTo(12);
    expect(tracks).toEqual(['x']);
    clock.stop();
  });
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
  });
});

describe('Spotify-login', () => {
  it('PKCE-challenge volgens RFC 7636', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('redirect-URI gebruikt 127.0.0.1 in plaats van localhost', () => {
    expect(redirectUri({ protocol: 'http:', hostname: 'localhost', port: '5173' })).toBe('http://127.0.0.1:5173/');
    expect(redirectUri({ protocol: 'https:', hostname: 'piano.netlify.app', port: '' })).toBe('https://piano.netlify.app/');
  });
});
