// Computertoetsenbord als piano (handig om op een laptop te testen).
// Onderste rij = witte toetsen vanaf C4, rij erboven = zwarte toetsen. Z / X = octaaf omlaag / omhoog.
import { hub } from './hub.js';

const MAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17 };
let octave = 4;
const down = new Map();

export function initComputerKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') return void (octave = Math.max(1, octave - 1));
    if (k === 'x') return void (octave = Math.min(7, octave + 1));
    if (!(k in MAP)) return;
    const midi = (octave + 1) * 12 + MAP[k];
    down.set(k, midi);
    hub.noteOn(midi, { source: 'keys', time: e.timeStamp || performance.now() });
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!down.has(k)) return;
    hub.noteOff(down.get(k), { source: 'keys' });
    down.delete(k);
  });
}
