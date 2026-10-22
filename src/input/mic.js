// Microfoon-invoer: herkent één noot tegelijk (monofoon) met YIN en een eigen aanslagdetectie.
// Bedoeld voor akoestische piano's en voor iPad/iPhone waar Web MIDI ontbreekt.
import { hub } from './hub.js';
import { yin, rms } from './yin.js';
import { getAudio } from '../audio/audio.js';
import { freqToMidiFloat } from '../core/notes.js';

const FRAME_MS = 20;
const INTRINSIC_DELAY_MS = 45; // analysevenster + bevestigingsframes

let stream = null;
let analyser = null;
let timer = null;
let frameListeners = new Set();

const st = {
  current: null, // midi van de klinkende noot
  candidate: null,
  candidateCount: 0,
  candidateTime: 0,
  peak: 0,
  minSincePeak: 1,
  quietFrames: 0,
  unpitchedFrames: 0,
  noiseFloor: 0.004,
  sensitivity: 1,
};

export function micActive() {
  return !!stream;
}

export function onMicFrame(fn) {
  frameListeners.add(fn);
  return () => frameListeners.delete(fn);
}

export function setMicSensitivity(v) {
  st.sensitivity = v;
}

export async function enableMic() {
  if (stream) return { ok: true };
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: 'Deze browser geeft geen toegang tot de microfoon (gebruik https of localhost).' };
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    return { ok: false, error: 'Microfoon geweigerd of niet gevonden: ' + (err.message || err.name) };
  }
  const { ctx } = getAudio();
  if (ctx.state !== 'running') await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  src.connect(analyser); // niet naar de luidsprekers
  const raw = new Float32Array(analyser.fftSize);
  const half = new Float32Array(analyser.fftSize / 2);
  timer = setInterval(() => frame(raw, half, ctx.sampleRate / 2), FRAME_MS);
  hub.status('mic', { enabled: true });
  return { ok: true };
}

export function disableMic() {
  clearInterval(timer);
  timer = null;
  if (st.current !== null) hub.noteOff(st.current, { source: 'mic' });
  st.current = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  analyser = null;
  hub.status('mic', { enabled: false });
}

function frame(raw, half, sr) {
  analyser.getFloatTimeDomainData(raw);
  // Halveer de samplefrequentie (gemiddelde van 2 samples = simpel laagdoorlaatfilter). Scheelt 4x rekenwerk.
  for (let i = 0; i < half.length; i++) half[i] = (raw[2 * i] + raw[2 * i + 1]) * 0.5;
  const level = rms(half);
  const now = performance.now();

  // Ruisvloer volgt langzaam de stilste momenten.
  if (level < st.noiseFloor * 2) st.noiseFloor = st.noiseFloor * 0.98 + level * 0.02;
  const threshold = Math.max(0.006, st.noiseFloor * 3.5) / st.sensitivity;

  let midi = null;
  let freq = null;
  if (level > threshold) {
    const r = yin(half, sr, { minFreq: 55, maxFreq: 2100, threshold: 0.18 });
    if (r && r.clarity > 0.75) {
      freq = r.freq;
      midi = Math.round(freqToMidiFloat(r.freq));
    }
  }
  frameListeners.forEach((fn) => fn({ level, threshold, freq, midi, current: st.current }));

  // --- aanslag/loslaten ---
  if (level < threshold * 0.7) {
    if (++st.quietFrames >= 3 && st.current !== null) release(now);
  } else st.quietFrames = 0;

  if (midi === null) {
    st.candidate = null;
    st.candidateCount = 0;
    if (++st.unpitchedFrames >= 8 && st.current !== null) release(now);
    return;
  }
  st.unpitchedFrames = 0;

  if (st.current !== null) {
    st.peak = Math.max(st.peak, level);
    st.minSincePeak = Math.min(st.minSincePeak, level);
  }

  if (midi === st.candidate) st.candidateCount++;
  else {
    st.candidate = midi;
    st.candidateCount = 1;
    st.candidateTime = now;
  }
  if (st.candidateCount < 2) return;

  const isNew = st.current === null || midi !== st.current;
  // Zelfde noot opnieuw aangeslagen: niveau zakte duidelijk en springt nu weer omhoog.
  const reattack = !isNew && st.minSincePeak < st.peak * 0.55 && level > st.minSincePeak * 1.8;
  if (isNew || reattack) {
    if (st.current !== null) hub.noteOff(st.current, { source: 'mic', time: now });
    st.current = midi;
    st.peak = level;
    st.minSincePeak = level;
    const onsetTime = (isNew ? st.candidateTime : now) - INTRINSIC_DELAY_MS;
    hub.noteOn(midi, { velocity: Math.min(1, level * 8), time: onsetTime, source: 'mic' });
  }
}

function release(now) {
  hub.noteOff(st.current, { source: 'mic', time: now });
  st.current = null;
  st.peak = 0;
  st.minSincePeak = 1;
}
