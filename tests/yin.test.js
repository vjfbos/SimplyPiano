import { describe, it, expect } from 'vitest';
import { yin } from '../src/input/yin.js';
import { freqToMidiFloat, midiToFreq } from '../src/core/notes.js';

// Pianoachtig testsignaal: grondtoon plus boventonen die zwakker worden.
function tone(freq, sr, n, harmonics = [1, 0.6, 0.35, 0.2]) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin((2 * Math.PI * freq * (k + 1) * i) / sr)));
    buf[i] = v * 0.2;
  }
  return buf;
}

describe('YIN-toonhoogte', () => {
  const sr = 24000; // zoals in mic.js na halvering van 48 kHz
  for (const midi of [43, 48, 60, 64, 69, 76, 84, 96]) {
    it(`herkent MIDI ${midi}`, () => {
      const r = yin(tone(midiToFreq(midi), sr, 1024), sr, { minFreq: 55, maxFreq: 2100 });
      expect(r).not.toBeNull();
      expect(Math.round(freqToMidiFloat(r.freq))).toBe(midi);
    });
  }
  it('geeft niets bij ruis', () => {
    const noise = Float32Array.from({ length: 1024 }, () => Math.random() - 0.5);
    const r = yin(noise, sr, { threshold: 0.1 });
    expect(r === null || r.clarity < 0.75).toBe(true);
  });
});
