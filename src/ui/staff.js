// Notenbalk met VexFlow. Tekent het stuk in regels van een paar maten, houdt per noot de
// positie bij en kan noten kleuren (goed/fout) en een cursor tonen.
import {
  Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Beam, StaveConnector,
  FretHandFinger, Modifier, Dot, Fraction,
} from 'vexflow/bravura';
import { h } from './dom.js';

let fontsReady = null;
function waitForFonts() {
  fontsReady ||= (document.fonts?.load ? Promise.all([
    document.fonts.load('30px Bravura'),
    document.fonts.load('12px Academico'),
  ]).catch(() => {}) : Promise.resolve());
  return fontsReady;
}

const REST_KEY = { treble: 'b/4', bass: 'd/3' };
const KEY_ACCIDENTALS = { C: 0, G: 1, D: 2, A: 3, F: 1, Bb: 2, Eb: 3, Am: 0, Em: 1, Dm: 1 };

export class Staff {
  constructor() {
    this.el = h('div.staff', { role: 'img', 'aria-label': 'Notenbalk' });
    this.canvas = h('div.staff-canvas');
    this.cursor = h('div.staff-cursor', { 'aria-hidden': 'true' });
    this.el.append(this.canvas, this.cursor);
    this.notes = new Map(); // tokenId -> { note, el }
    this.eventPos = []; // event index -> { x, row }
    this.rows = [];
  }

  async render(piece, { activeHands = ['rh', 'lh'], showFingers = true } = {}) {
    await waitForFonts();
    this.piece = piece;
    this.canvas.replaceChildren();
    this.notes.clear();
    this.eventPos = [];
    this.rows = [];
    const pxWidth = Math.max(300, this.el.clientWidth || 600);
    // Op grote schermen alles iets groter tekenen, zodat noten goed leesbaar zijn.
    const scale = pxWidth >= 900 ? 1.3 : pxWidth >= 600 ? 1.15 : 1;
    this.scale = scale;
    const width = pxWidth / scale;
    const hands = ['rh', 'lh'].filter((hd) => piece.parts[hd]);
    const grand = hands.length === 2;
    const staveGap = 95;
    const rowHeight = grand ? 230 : 135;
    const perRow = Math.max(1, Math.min(4, Math.floor((width - 20) / 210)));
    const rowCount = Math.ceil(piece.bars.length / perRow);
    const renderer = new Renderer(this.canvas, Renderer.Backends.SVG);
    renderer.resize(pxWidth, (rowCount * rowHeight + 10) * scale);
    const ctx = renderer.getContext();
    ctx.scale(scale, scale);
    const keyAcc = KEY_ACCIDENTALS[piece.key] ?? 0;

    for (let r = 0; r < rowCount; r++) {
      const y = r * rowHeight + 15;
      const barsInRow = piece.bars.slice(r * perRow, (r + 1) * perRow);
      const extra = 45 + keyAcc * 11 + (r === 0 ? 30 : 0) + (grand ? 15 : 0);
      const left = grand ? 25 : 10;
      const base = (width - left - 10 - extra) / perRow;
      let x = left;
      const rowStaves = [];
      this.rows.push({ y, height: rowHeight, top: y + 20, bottom: y + (grand ? staveGap : 0) + 100 });

      barsInRow.forEach((bar, bi) => {
        const w = base + (bi === 0 ? extra : 0);
        const staves = hands.map((hand, hi) => {
          const stave = new Stave(x, y + hi * staveGap, w);
          const clef = piece.parts[hand].clef;
          if (bi === 0) {
            stave.addClef(clef);
            if (piece.key !== 'C' && piece.key !== 'Am') stave.addKeySignature(piece.key);
          }
          if (bar.index === 0) stave.addTimeSignature(piece.timeSignature);
          if (bar.index === piece.bars.length - 1) stave.setEndBarType(3); // slotstreep
          stave.setContext(ctx);
          return stave;
        });
        Stave.formatBegModifiers(staves);
        const voices = hands.map((hand) => this.buildVoice(piece, hand, bar, showFingers));
        const formatter = new Formatter();
        voices.forEach((v) => formatter.joinVoices([v.voice]));
        const noteWidth = Math.min(...staves.map((s) => s.getNoteEndX() - s.getNoteStartX())) - 15;
        formatter.format(voices.map((v) => v.voice), Math.max(40, noteWidth));
        staves.forEach((s) => s.draw());
        voices.forEach((v, i) => {
          v.voice.draw(ctx, staves[i]);
          v.beams.forEach((b) => b.setContext(ctx).draw());
        });
        if (grand) {
          new StaveConnector(staves[0], staves[1]).setType('singleRight').setContext(ctx).draw();
          if (bi === 0) {
            new StaveConnector(staves[0], staves[1]).setType('brace').setContext(ctx).draw();
            new StaveConnector(staves[0], staves[1]).setType('singleLeft').setContext(ctx).draw();
          }
        }
        rowStaves.push(staves);
        bar.geom = { row: r, x0: staves[0].getNoteStartX(), x1: staves[0].getNoteEndX() };
        x += w;
      });
    }

    // Posities en DOM-elementen ophalen.
    for (const entry of this.notes.values()) {
      entry.el = entry.note.getSVGElement();
      const ev = entry.token.eventIndex;
      if (ev == null) continue;
      const cx = entry.note.getAbsoluteX() + 6;
      const row = piece.bars[entry.token.bar].geom.row;
      if (!this.eventPos[ev] || cx < this.eventPos[ev].x) this.eventPos[ev] = { x: cx, row };
      if (!activeHands.includes(entry.token.hand)) entry.el?.classList.add('st-inactive');
      entry.el?.classList.add(entry.token.hand === 'lh' ? 'st-lh' : 'st-rh');
    }
    this.cursor.style.display = 'none';
  }

  buildVoice(piece, hand, bar, showFingers) {
    const part = piece.parts[hand];
    const clef = part.clef;
    const tokens = part.tokens.filter((t) => t.bar === bar.index);
    const notes = [];
    if (!tokens.length) {
      notes.push(new StaveNote({ keys: [REST_KEY[clef]], duration: 'wr', clef, alignCenter: true }));
    }
    for (const t of tokens) {
      const keys = t.rest ? [REST_KEY[clef]] : t.notes.map((n) => `${n.letter.toLowerCase()}${n.acc}/${n.octave}`);
      const note = new StaveNote({ keys, duration: t.code + (t.rest ? 'r' : ''), dots: t.dots, clef, autoStem: true });
      if (t.dots) Dot.buildAndAttach([note], { all: true });
      if (!t.rest && showFingers) {
        t.notes.forEach((n, i) => {
          if (!n.finger) return;
          const f = new FretHandFinger(String(n.finger));
          f.setPosition(hand === 'lh' ? Modifier.Position.BELOW : Modifier.Position.ABOVE);
          note.addModifier(f, i);
        });
      }
      note.setAttribute('id', 'n-' + t.id);
      this.notes.set(t.id, { note, token: t });
      notes.push(note);
    }
    const voice = new Voice({ numBeats: piece.ts.num, beatValue: piece.ts.den }).setMode(Voice.Mode.SOFT);
    voice.addTickables(notes);
    Accidental.applyAccidentals([voice], piece.key);
    // In x/8-maten per drie achtsten balken, anders per kwart.
    const groups = piece.ts.den === 8 ? [new Fraction(3, 8)] : undefined;
    const beams = Beam.generateBeams(notes.filter((n) => !n.isRest()), { groups });
    return { voice, beams };
  }

  /** Markeer een gespeelde noot: 'ok', 'early', 'late', 'missed', 'wrong'. */
  mark(tokenId, result) {
    const el = this.notes.get(tokenId)?.el;
    if (!el) return;
    el.classList.remove('st-ok', 'st-warn', 'st-bad');
    el.classList.add(result === 'ok' ? 'st-ok' : result === 'missed' ? 'st-bad' : 'st-warn');
  }

  clearMarks() {
    for (const { el } of this.notes.values()) el?.classList.remove('st-ok', 'st-warn', 'st-bad', 'st-current');
  }

  setCurrent(eventIndex) {
    for (const { el, token } of this.notes.values()) {
      el?.classList.toggle('st-current', token.eventIndex === eventIndex);
    }
    const p = this.eventPos[eventIndex];
    if (p) this.placeCursor(p.x, p.row);
  }

  /** Vloeiende cursor in tempomodus. */
  setBeat(beat) {
    const piece = this.piece;
    if (!piece) return;
    const evs = piece.events;
    let i = evs.findIndex((e) => e.t > beat) - 1;
    if (i === -2) i = evs.length - 1;
    if (i < 0) {
      const p = this.eventPos[0];
      if (p) this.placeCursor(p.x, p.row);
      return;
    }
    const a = this.eventPos[i];
    const b = this.eventPos[i + 1];
    if (!a) return;
    if (!b || b.row !== a.row) {
      const bar = piece.bars[evs[i].bar];
      const endT = b ? evs[i + 1].t : bar.end;
      const frac = Math.min(1, (beat - evs[i].t) / Math.max(0.01, endT - evs[i].t));
      const x1 = bar.geom ? piece.bars.filter((bb) => bb.geom?.row === a.row).pop().geom.x1 : a.x;
      this.placeCursor(a.x + (x1 - a.x) * frac, a.row);
      return;
    }
    const frac = Math.min(1, (beat - evs[i].t) / (evs[i + 1].t - evs[i].t));
    this.placeCursor(a.x + (b.x - a.x) * frac, a.row);
  }

  placeCursor(x, row) {
    const r = this.rows[row];
    if (!r) return;
    this.cursor.style.display = 'block';
    const s = this.scale || 1;
    this.cursor.style.transform = `translate(${x * s - 3}px, ${(r.top - 10) * s}px)`;
    this.cursor.style.height = `${(r.bottom - r.top + 10) * s}px`;
    if (this.lastRow !== row) {
      this.lastRow = row;
      const top = (r.y - 5) * (this.scale || 1);
      if (top < this.el.scrollTop || top + r.height * (this.scale || 1) > this.el.scrollTop + this.el.clientHeight) {
        this.el.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }

  hideCursor() {
    this.cursor.style.display = 'none';
    this.lastRow = null;
    this.el.scrollTo({ top: 0 });
  }
}
