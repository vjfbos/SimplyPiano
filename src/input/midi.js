// MIDI-keyboard via de Web MIDI API (Chrome, Edge, Firefox, Android; niet in Safari/iOS).
import { hub } from './hub.js';

let access = null;
const state = { supported: 'requestMIDIAccess' in navigator, enabled: false, devices: [], error: null };

export function midiState() {
  return { ...state };
}

function handleMessage(e) {
  const [status, d1, d2] = e.data;
  const cmd = status & 0xf0;
  // e.timeStamp gebruikt dezelfde klok als performance.now()
  const time = e.timeStamp || performance.now();
  if (cmd === 0x90 && d2 > 0) hub.noteOn(d1, { velocity: d2 / 127, time, source: 'midi' });
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) hub.noteOff(d1, { time, source: 'midi' });
}

function refresh() {
  state.devices = [];
  access.inputs.forEach((input) => {
    input.onmidimessage = handleMessage;
    state.devices.push(input.name || 'MIDI-apparaat');
  });
  hub.status('midi', { ...state });
}

export async function enableMidi() {
  if (!state.supported) {
    state.error = 'Deze browser ondersteunt geen Web MIDI (bijv. Safari op iPad/iPhone). Gebruik de microfoon of het scherm-toetsenbord.';
    hub.status('midi', { ...state });
    return state;
  }
  if (access) return state;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = refresh;
    state.enabled = true;
    state.error = null;
    refresh();
  } catch (err) {
    state.error = 'Geen toegang tot MIDI: ' + (err.message || err.name);
    hub.status('midi', { ...state });
  }
  return state;
}
