// Virtueel pianotoetsenbord: speelbaar met muis/touch (meerdere vingers, glijden), en
// toont welke toets(en) je nu moet spelen, met hand en vingernummer als tekst naast de kleur.
import { h } from './dom.js';
import { isBlack, noteLabel } from '../core/notes.js';
import { hub } from '../input/hub.js';

export class Keyboard {
  constructor({ low = 48, high = 83, labels = 'letters', playable = true } = {}) {
    this.labels = labels;
    this.playable = playable;
    this.el = h('div.keyboard-wrap');
    this.inner = h('div.keyboard', { role: 'group', 'aria-label': 'Pianotoetsenbord' });
    this.el.append(this.inner);
    this.keys = new Map();
    this.pointers = new Map(); // pointerId -> midi
    this.setRange(low, high);
    if (playable) this.bindPointer();
    this.unsub = [
      hub.on('noteon', ({ midi }) => this.keys.get(midi)?.classList.add('down')),
      hub.on('noteoff', ({ midi }) => this.keys.get(midi)?.classList.remove('down')),
    ];
  }

  /** Bereik afronden op hele octaven (C t/m B), minimaal twee octaven. */
  static rangeFor([lo, hi], minOctaves = 2) {
    let low = Math.floor(lo / 12) * 12;
    let high = Math.ceil((hi + 1) / 12) * 12 - 1;
    while ((high - low + 1) / 12 < minOctaves) {
      if (low > 36 && (high > 84 || (60 - low) < (high - 59))) low -= 12;
      else high += 12;
    }
    return [low, high];
  }

  setRange(low, high) {
    this.low = low;
    this.high = high;
    this.inner.replaceChildren();
    this.keys.clear();
    const whites = [];
    for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
    this.inner.style.setProperty('--whites', whites.length);
    let wi = 0;
    for (let m = low; m <= high; m++) {
      const black = isBlack(m);
      const key = h('div.key', {
        class: black ? 'black' : 'white',
        'data-midi': m,
        role: 'button',
        'aria-label': noteLabel(m),
      });
      if (black) key.style.setProperty('--pos', wi);
      else {
        wi++;
        if (this.labels !== 'none') key.append(h('span.label', noteLabel(m, this.labels, m % 12 === 0 && this.labels === 'letters')));
        if (m === 60) key.classList.add('middle-c');
      }
      key.append(h('span.badge'));
      this.keys.set(m, key);
      this.inner.append(key);
    }
  }

  bindPointer() {
    const midiAt = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.('.key');
      return el && this.inner.contains(el) ? Number(el.dataset.midi) : null;
    };
    this.inner.addEventListener('pointerdown', (e) => {
      const midi = midiAt(e.clientX, e.clientY);
      if (midi == null) return;
      e.preventDefault();
      this.inner.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, midi);
      hub.noteOn(midi, { source: 'screen', time: e.timeStamp || performance.now() });
    });
    this.inner.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const midi = midiAt(e.clientX, e.clientY);
      const prev = this.pointers.get(e.pointerId);
      if (midi == null || midi === prev) return;
      hub.noteOff(prev, { source: 'screen' });
      this.pointers.set(e.pointerId, midi);
      hub.noteOn(midi, { source: 'screen' });
    });
    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      hub.noteOff(this.pointers.get(e.pointerId), { source: 'screen' });
      this.pointers.delete(e.pointerId);
    };
    this.inner.addEventListener('pointerup', end);
    this.inner.addEventListener('pointercancel', end);
    this.inner.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** notes: [{midi, hand, finger}] */
  showNext(notes, { showFingers = true } = {}) {
    for (const k of this.keys.values()) {
      k.classList.remove('next-rh', 'next-lh', 'next-other');
      k.querySelector('.badge').textContent = '';
    }
    for (const n of notes) {
      const k = this.keys.get(n.midi);
      if (!k) continue;
      k.classList.add(n.passive ? 'next-other' : n.hand === 'lh' ? 'next-lh' : 'next-rh');
      if (!n.passive) k.querySelector('.badge').textContent = (n.hand === 'lh' ? 'L' : 'R') + (showFingers && n.finger ? n.finger : '');
    }
    const first = notes.find((n) => !n.passive);
    if (first) this.scrollTo(first.midi);
  }

  flash(midi, result) {
    const k = this.keys.get(midi);
    if (!k) return;
    const cls = result === 'ok' ? 'flash-ok' : result === 'wrong' ? 'flash-bad' : 'flash-warn';
    k.classList.remove('flash-ok', 'flash-bad', 'flash-warn');
    void k.offsetWidth; // animatie opnieuw starten
    k.classList.add(cls);
  }

  scrollTo(midi) {
    const k = this.keys.get(midi);
    if (!k || this.el.scrollWidth <= this.el.clientWidth) return;
    const kr = k.getBoundingClientRect();
    const wr = this.el.getBoundingClientRect();
    if (kr.left < wr.left + 30 || kr.right > wr.right - 30) {
      this.el.scrollBy({ left: kr.left - wr.left - wr.width / 2, behavior: 'smooth' });
    }
  }

  destroy() {
    this.unsub.forEach((u) => u());
    this.el.remove();
  }
}
