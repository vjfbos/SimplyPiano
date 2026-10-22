// Verzamelpunt voor alle invoer (MIDI, microfoon, scherm-toetsenbord, computertoetsenbord).
// Iedereen luistert hier naar 'noteon' en 'noteoff' met { midi, velocity, time, source }.
// time is performance.now()-tijd in ms, zodat timing over bronnen heen vergelijkbaar is.
import { noteOn as synthOn, noteOff as synthOff } from '../audio/synth.js';

class InputHub extends EventTarget {
  constructor() {
    super();
    this.held = new Set();
    this.soundFor = { screen: true, keys: true, midi: true, mic: false };
    this.latencyMs = { midi: 0, mic: 0, screen: 0, keys: 0 };
  }

  noteOn(midi, { velocity = 0.8, time = performance.now(), source = 'screen' } = {}) {
    this.held.add(midi);
    if (this.soundFor[source]) synthOn(midi, velocity);
    const t = time - (this.latencyMs[source] || 0);
    this.dispatchEvent(new CustomEvent('noteon', { detail: { midi, velocity, time: t, source } }));
  }

  noteOff(midi, { time = performance.now(), source = 'screen' } = {}) {
    this.held.delete(midi);
    if (this.soundFor[source]) synthOff(midi);
    this.dispatchEvent(new CustomEvent('noteoff', { detail: { midi, time, source } }));
  }

  status(source, info) {
    this.dispatchEvent(new CustomEvent('status', { detail: { source, ...info } }));
  }

  on(type, fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }
}

export const hub = new InputHub();
