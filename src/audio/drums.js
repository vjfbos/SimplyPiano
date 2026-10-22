// Gesynthetiseerde drums en metronoomklik.
import { getAudio, getNoise } from './audio.js';

export function click(time, accent = false) {
  const { ctx, busses } = getAudio();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  o.connect(g).connect(busses.click);
  o.start(time);
  o.stop(time + 0.06);
}

export function kick(time) {
  const { ctx, busses } = getAudio();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, time);
  o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  g.gain.setValueAtTime(0.9, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
  o.connect(g).connect(busses.drums);
  o.start(time);
  o.stop(time + 0.32);
}

function noiseHit(time, { freq, q = 1, type = 'highpass', decay, gain }) {
  const { ctx, busses } = getAudio();
  const s = ctx.createBufferSource();
  s.buffer = getNoise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  s.connect(f).connect(g).connect(busses.drums);
  s.start(time, Math.random() * 0.5);
  s.stop(time + decay + 0.02);
}

export function snare(time) {
  noiseHit(time, { freq: 1800, type: 'bandpass', q: 0.8, decay: 0.18, gain: 0.55 });
  const { ctx, busses } = getAudio();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 190;
  g.gain.setValueAtTime(0.3, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
  o.connect(g).connect(busses.drums);
  o.start(time);
  o.stop(time + 0.1);
}

export function hihat(time, open = false) {
  noiseHit(time, { freq: 7000, decay: open ? 0.2 : 0.045, gain: 0.25 });
}
