// Eenvoudige, zelf ontworpen "piano-achtige" klank: een paar oscillatoren met een snel uitdovende
// omhullende en een filter dat meedooft. Geen samples nodig, dus werkt ook volledig offline.
import { getAudio } from './audio.js';
import { midiToFreq } from '../core/notes.js';

const active = new Map(); // midi -> voice (voor noteOff van ingedrukte toetsen)

function makeVoice(midi, { time, velocity = 0.8, bus = 'piano', soft = false }) {
  const { ctx, busses } = getAudio();
  const t = Math.max(time ?? ctx.currentTime, ctx.currentTime);
  const f = midiToFreq(midi);
  const out = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  const bright = Math.min(12000, f * (soft ? 3 : 7));
  filter.frequency.setValueAtTime(bright, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 300), t + 1.2);

  const partials = soft
    ? [[1, 'sine', 1], [2, 'sine', 0.15]]
    : [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12], [4.01, 'sine', 0.05]];
  const oscs = partials.map(([mult, type, amp]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    o.detune.value = (Math.random() - 0.5) * 4;
    const g = ctx.createGain();
    g.gain.value = amp;
    o.connect(g).connect(filter);
    o.start(t);
    return o;
  });
  filter.connect(out);
  out.connect(busses[bus] || busses.piano);

  // Lage noten klinken langer na dan hoge.
  const sustain = soft ? 1.2 : Math.max(0.8, 3.2 - (midi - 36) * 0.045);
  const peak = 0.28 * velocity * (midi < 48 ? 1.15 : 1);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(peak, t + (soft ? 0.03 : 0.006));
  out.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.25);
  out.gain.exponentialRampToValueAtTime(0.0001, t + sustain);
  oscs.forEach((o) => o.stop(t + sustain + 0.05));

  return {
    release(when) {
      const r = Math.max(when ?? ctx.currentTime, t + 0.02);
      out.gain.cancelScheduledValues(r);
      out.gain.setTargetAtTime(0.0001, r, 0.06);
      oscs.forEach((o) => {
        try {
          o.stop(r + 0.4);
        } catch {
          /* al gestopt */
        }
      });
    },
  };
}

/** Speel een noot vanaf een toets (blijft klinken tot noteOff). */
export function noteOn(midi, velocity = 0.8) {
  noteOff(midi);
  active.set(midi, makeVoice(midi, { velocity }));
}

export function noteOff(midi) {
  const v = active.get(midi);
  if (v) {
    v.release();
    active.delete(midi);
  }
}

/** Geplande noot met vaste duur (in seconden), voor begeleiding en voorspelen. */
export function playAt(midi, time, duration, opts = {}) {
  const v = makeVoice(midi, { time, ...opts });
  v.release(time + duration);
  return v;
}

export function allNotesOff() {
  active.forEach((v) => v.release());
  active.clear();
}
