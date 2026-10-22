// Vooruitkijkende planner: zet geluiden net op tijd klaar in de Web Audio-klok,
// zodat stoppen en herhalen direct werken en de timing strak blijft.
import { getAudio } from './audio.js';

export class Scheduler {
  constructor() {
    this.items = []; // { time (audio s), fn(time) }
    this.pos = 0;
    this.timer = null;
  }

  /** items moeten op tijd gesorteerd zijn. */
  start(items) {
    this.stop();
    this.items = items;
    this.pos = 0;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  add(items) {
    this.items.push(...items);
    this.items.sort((a, b) => a.time - b.time);
  }

  tick() {
    const { ctx } = getAudio();
    const horizon = ctx.currentTime + 0.15;
    while (this.pos < this.items.length && this.items[this.pos].time < horizon) {
      const it = this.items[this.pos++];
      if (it.time >= ctx.currentTime - 0.05) it.fn(Math.max(it.time, ctx.currentTime));
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.items = [];
    this.pos = 0;
  }
}
