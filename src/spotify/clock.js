// Afspeelpositie volgen. Spotify geeft de positie bij elke vraag; daartussen rekenen we zelf door,
// zodat de akkoorden vloeiend meelopen. Er is ook een handmatige klok voor oefenen zonder Spotify.
import { currentlyPlaying } from './api.js';

export class SpotifyClock extends EventTarget {
  constructor({ interval = 1500, fetcher = currentlyPlaying, now = () => performance.now() } = {}) {
    super();
    this.interval = interval;
    this.fetcher = fetcher;
    this.now = now;
    this.state = null; // { track, progressMs, isPlaying, at }
    this.offset = 0; // seconden, voor het corrigeren van vertraging
  }

  start() {
    this.stop();
    const poll = async () => {
      try {
        const s = await this.fetcher();
        const prevId = this.state?.track?.id;
        this.state = s ? { ...s, at: this.now() } : null;
        this.error = null;
        if ((s?.track?.id || null) !== (prevId || null)) this.dispatchEvent(new CustomEvent('track', { detail: s?.track || null }));
        this.dispatchEvent(new CustomEvent('update', { detail: this.state }));
      } catch (err) {
        this.error = err;
        this.dispatchEvent(new CustomEvent('error', { detail: err }));
      }
    };
    poll();
    this.timer = setInterval(poll, this.interval);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  get track() {
    return this.state?.track || null;
  }

  get isPlaying() {
    return !!this.state?.isPlaying;
  }

  /** Positie in seconden. */
  position() {
    if (!this.state) return 0;
    const elapsed = this.state.isPlaying ? (this.now() - this.state.at) / 1000 : 0;
    const dur = (this.state.track?.durationMs || Infinity) / 1000;
    return Math.min(dur, this.state.progressMs / 1000 + elapsed) + this.offset;
  }

  /** Na zelf afspelen/pauzeren/spoelen meteen bijwerken in plaats van op de volgende vraag te wachten. */
  nudge(patch) {
    if (!this.state) return;
    this.state = { ...this.state, progressMs: (this.position() - this.offset) * 1000, at: this.now(), ...patch };
  }
}

/** Handmatige klok met dezelfde vorm, voor oefenen zonder Spotify of met een andere muziekbron. */
export class ManualClock extends EventTarget {
  constructor({ now = () => performance.now(), durationSec = Infinity } = {}) {
    super();
    this.now = now;
    this.base = 0;
    this.startedAt = null;
    this.offset = 0;
    this.durationSec = durationSec;
  }
  start() {}
  stop() {
    this.pause();
  }
  get isPlaying() {
    return this.startedAt !== null;
  }
  get track() {
    return null;
  }
  play() {
    if (this.startedAt === null) this.startedAt = this.now();
    this.dispatchEvent(new CustomEvent('update'));
  }
  pause() {
    if (this.startedAt !== null) this.base += (this.now() - this.startedAt) / 1000;
    this.startedAt = null;
    this.dispatchEvent(new CustomEvent('update'));
  }
  seek(sec) {
    this.base = Math.max(0, sec);
    if (this.startedAt !== null) this.startedAt = this.now();
    this.dispatchEvent(new CustomEvent('update'));
  }
  position() {
    const p = this.base + (this.startedAt !== null ? (this.now() - this.startedAt) / 1000 : 0);
    return Math.min(p, this.durationSec) + this.offset;
  }
}
