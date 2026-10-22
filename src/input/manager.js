// Kiest en activeert invoerbronnen op basis van de profielinstellingen.
import { hub } from './hub.js';
import { enableMidi, midiState } from './midi.js';
import { enableMic, disableMic, micActive } from './mic.js';
import { setVolume } from '../audio/audio.js';

export async function applyInputSettings(settings) {
  hub.soundFor.midi = settings.midiSound;
  hub.latencyMs.midi = settings.latencyMs;
  hub.latencyMs.mic = settings.latencyMs;
  setVolume(settings.volume);
  const result = { midi: null, mic: null };
  if (settings.input === 'mic') {
    result.mic = await enableMic();
  } else if (micActive()) {
    disableMic();
  }
  if ((settings.input === 'auto' || settings.input === 'midi') && midiState().supported) {
    result.midi = await enableMidi();
  }
  return result;
}

export function inputSummary(settings) {
  const m = midiState();
  if (settings.input === 'mic') return micActive() ? { icon: '🎤', text: 'Microfoon' } : { icon: '🎤', text: 'Microfoon (uit)' };
  if (m.enabled && m.devices.length) return { icon: '🎹', text: m.devices[0] };
  if (settings.input === 'midi') return { icon: '🎹', text: m.supported ? 'Geen MIDI-apparaat' : 'MIDI niet ondersteund' };
  return { icon: '👆', text: 'Scherm-toetsenbord' };
}
