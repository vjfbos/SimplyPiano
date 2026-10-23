// Eenvoudige oefenklok met start/pauze/spoelen, in seconden.
export class ManualClock extends EventTarget {
  constructor({ now = () => performance.now(), durationSec = Infinity } = {}) {
    super();
    this.now = now;
    this.base = 0;
    this.startedAt = null;
    this.offset = 0; // seconden, om alles een fractie eerder of later te laten lopen
    this.durationSec = durationSec;
  }

  get isPlaying() {
    return this.startedAt !== null;
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

  /** Positie in seconden (inclusief de correctie). */
  position() {
    const p = this.base + (this.startedAt !== null ? (this.now() - this.startedAt) / 1000 : 0);
    return Math.min(p, this.durationSec) + this.offset;
  }
}
