// Oefenscherm: notenbalk + toetsenbord + bediening. Gebruikt door lessen en liedjes.
import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { tiko } from './mascot.js';
import { openSheet, toggle } from './sheet.js';
import { Staff } from './staff.js';
import { Keyboard } from './keyboard.js';
import { buildPiece } from '../core/piece.js';
import { noteLabel } from '../core/notes.js';
import { PracticeEngine } from '../practice/engine.js';
import { hub } from '../input/hub.js';
import { getAudio, perfToAudioTime, unlockAudio } from '../audio/audio.js';
import { playAt, allNotesOff } from '../audio/synth.js';
import { click } from '../audio/drums.js';
import { Scheduler } from '../audio/scheduler.js';
import { accompanimentItems, padChord } from '../audio/accompaniment.js';
import { currentProfile, saveResult, addPracticeSeconds } from '../core/profiles.js';
import { inputSummary } from '../input/manager.js';

const PRAISE = ['Goed zo!', 'Top!', 'Ja, precies!', 'Mooi!', 'Super!', 'Lekker bezig!'];
let praise = 0;

function makeSound(piece) {
  const scheduler = new Scheduler();
  return {
    playNotes(notes, beatSec) {
      const { ctx } = getAudio();
      notes.forEach((n) => playAt(n.midi, ctx.currentTime, n.dur * beatSec * 0.95, { bus: 'other', velocity: 0.6 }));
    },
    pad(beat) {
      padChord(piece, beat, getAudio().ctx.currentTime);
    },
    startTempo({ from, to, t0, beatSec, countBeats, passive, metronome, drums, chords }) {
      const t0a = perfToAudioTime(t0);
      const pulse = 4 / piece.ts.den;
      const items = [];
      for (let b = 0; b < countBeats - 1e-6; b += pulse) {
        const time = t0a - (countBeats - b) * beatSec;
        items.push({ time, fn: (t) => click(t, b === 0) });
      }
      items.push(...accompanimentItems(piece, { from, to, t0: t0a, beatSec, metronome, drums, chords }));
      for (const n of passive) {
        items.push({ time: t0a + (n.t - from) * beatSec, fn: (t) => playAt(n.midi, t, n.dur * beatSec * 0.95, { bus: 'other', velocity: 0.6 }) });
      }
      items.sort((a, b) => a.time - b.time);
      scheduler.start(items);
    },
    stopAll() {
      scheduler.stop();
      allNotesOff();
    },
  };
}

/**
 * opts: { itemId, def (stukdefinitie), title, hands (standaard), mode, allowModes, stars, onDone(result) }
 */
export function createPlayer(opts) {
  const profile = currentProfile();
  const settings = profile?.settings || {};
  const piece = buildPiece(opts.def);
  const hasHands = ['rh', 'lh'].filter((x) => piece.parts[x]);
  const state = {
    mode: opts.mode || 'wait',
    hands: (opts.hands || hasHands).filter((x) => hasHands.includes(x)),
    tempoPct: 100,
    repeat: false,
    fromBar: 0,
    toBar: piece.bars.length - 1,
    autoplayOther: true,
    metronome: true,
    drums: false,
    chords: piece.chords.length > 0 && !!opts.def.accompaniment,
    listening: false,
  };
  if (!state.hands.length) state.hands = hasHands;
  const allowModes = opts.allowModes || ['wait', 'tempo'];

  const staff = new Staff();
  const kb = new Keyboard({ ...rangeObj(Keyboard.rangeFor(piece.range)), labels: settings.noteLabels || 'letters' });
  const feedback = h('div.feedback', { role: 'status', 'aria-live': 'polite' }, h('span.fb-face'), h('span.fb-text'));
  const countin = h('div.countin', { 'aria-live': 'assertive' });

  // ---------- bediening: alleen het belangrijkste in beeld, de rest in een onderblad ----------
  const choice = (name, options, value, onChange) => {
    const box = h('div.choice', { role: 'radiogroup', 'aria-label': name });
    options.forEach(([val, content, label, disabled]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(val === value), 'aria-label': label, title: label, disabled: !!disabled, onclick: () => {
        box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        onChange(val);
      } }, content);
      box.append(b);
    });
    return box;
  };
  const modeSeg = choice('Hoe wil je spelen?', [
    ['wait', [icon('turtle', { size: 22 }), h('span', 'Rustig')], 'Rustig: het liedje wacht op jou', !allowModes.includes('wait')],
    ['tempo', [icon('rabbit', { size: 22 }), h('span', 'Op de maat')], 'Op de maat: het liedje loopt door', !allowModes.includes('tempo')],
  ], state.mode, (v) => {
    state.mode = v;
    reset();
  });
  const handValue = state.hands.length === 2 ? 'both' : state.hands[0];
  const handSeg = hasHands.length > 1 ? choice('Welke hand?', [
    ['lh', h('span.hand-badge.lh', 'L'), 'Alleen links'],
    ['both', [h('span.hand-badge.lh', 'L'), h('span.hand-badge.rh', 'R')], 'Allebei'],
    ['rh', h('span.hand-badge.rh', 'R'), 'Alleen rechts'],
  ], handValue, (v) => {
    state.hands = v === 'both' ? hasHands : [v];
    redraw();
  }) : null;

  const startBtn = h('button.play-btn', { type: 'button', 'aria-label': 'Start', onclick: () => (engine?.running ? stopPlaying(true) : startPlaying()) });
  const listenBtn = h('button.round-btn', { type: 'button', onclick: () => (engine?.running ? stopPlaying(false) : startPlaying(true)) });
  const optsBtn = h('button.round-btn', { type: 'button', onclick: () => openOptions() }, icon('sliders'), h('span', 'Opties'));
  const setButtons = (running, listening) => {
    startBtn.replaceChildren(icon(running && !listening ? 'stop' : 'play', { size: 34 }));
    startBtn.setAttribute('aria-label', running && !listening ? 'Stop' : 'Start');
    startBtn.classList.toggle('stop', running && !listening);
    startBtn.disabled = !!listening;
    listenBtn.replaceChildren(icon(listening ? 'stop' : 'headphones'), h('span', listening ? 'Stop' : 'Luister'));
  };
  setButtons(false, false);

  function openOptions() {
    const tempoOut = h('output.tempo-out');
    const showTempo = () => (tempoOut.textContent = `${state.tempoPct}%`);
    showTempo();
    const tempo = h('input.big-range', { type: 'range', min: 50, max: 100, step: 5, value: state.tempoPct, 'aria-label': 'Snelheid', oninput: () => { state.tempoPct = Number(tempo.value); showTempo(); } });
    const barOptions = () => piece.bars.map((b) => h('option', { value: b.index }, `maat ${b.index + (piece.pickup ? 0 : 1)}`));
    const fromSel = h('select', { 'aria-label': 'Van maat', value: state.fromBar, onchange: () => { state.fromBar = Number(fromSel.value); if (state.toBar < state.fromBar) toSel.value = state.toBar = state.fromBar; } }, barOptions());
    const toSel = h('select', { 'aria-label': 'Tot en met maat', value: state.toBar, onchange: () => { state.toBar = Number(toSel.value); if (state.toBar < state.fromBar) fromSel.value = state.fromBar = state.toBar; } }, barOptions());
    const s = currentProfile()?.settings || settings;
    const inp = inputSummary(s);
    openSheet('Opties',
      h('div.opt-group', h('h3', 'Snelheid'),
        h('div.tempo-row', icon('turtle', { size: 28 }), tempo, icon('rabbit', { size: 28 }), tempoOut)),
      h('div.opt-group', h('h3', 'Een stukje oefenen'),
        toggle('Steeds herhalen', state.repeat, (v) => (state.repeat = v), { hint: 'Na het einde begint het stukje opnieuw' }),
        h('div.control-row', h('label', 'Van ', fromSel), h('label', 'tot en met ', toSel))),
      h('div.opt-group', h('h3', 'Muziek erbij'),
        toggle('Metronoom', state.metronome, (v) => (state.metronome = v), { hint: 'Tikjes op de maat (bij "Op de maat")' }),
        toggle('Drums', state.drums, (v) => (state.drums = v)),
        toggle('Akkoorden', state.chords, (v) => (state.chords = v), { disabled: !piece.chords.length }),
        hasHands.length > 1 ? toggle('De andere hand speelt mee', state.autoplayOther, (v) => (state.autoplayOther = v)) : null),
      h('div.opt-group', h('h3', 'Hoe speel je?'),
        h('a.input-row', { href: '#/instellingen' }, icon(s.input === 'mic' ? 'mic' : 'piano'), h('span', inp.text), icon('next'))));
  }

  // Bovenaan: hoe spelen (links) en de grote speelknop (rechts). Daaronder noten, Tiko en het toetsenbord.
  const toolbar = h('div.player-bar',
    h('div.bar-left', modeSeg, handSeg),
    h('div.bar-right', optsBtn, listenBtn, startBtn));
  const stage = h('div.stage', staff.el, countin);
  const rotateTip = h('p.rotate-tip', icon('info', { size: 18 }), 'Tip: draai je telefoon, dan zie je meer toetsen.');
  const el = h('section.player', toolbar, stage, feedback, kb.el, rotateTip);

  // ---------- engine ----------
  let engine = null;
  let unsubs = [];
  let practiceTimer = null;
  let lastInput = 0;
  let pendingSeconds = 0;

  const FACE = { ok: 'juich', retry: 'blij', early: 'wow', late: 'wow', missed: 'denk', wrong: 'denk' };
  function setFeedback(result, text) {
    feedback.className = 'feedback fb-' + (result || 'idle');
    feedback.querySelector('.fb-face').replaceChildren(tiko(FACE[result] || 'blij', 40));
    feedback.querySelector('.fb-text').textContent = text;
  }

  async function redraw() {
    stopPlaying(false);
    await staff.render(piece, { activeHands: state.hands, showFingers: settings.showFingers !== false });
    showFirst();
  }

  function showFirst() {
    const ev = piece.events.find((e) => e.bar >= state.fromBar) || piece.events[0];
    if (!ev) return;
    const hands = new Set(state.hands);
    kb.showNext(ev.notes.map((n) => ({ ...n, passive: !hands.has(n.hand) })), { showFingers: settings.showFingers !== false });
    staff.setCurrent(ev.index);
  }

  function reset() {
    stopPlaying(false);
    staff.clearMarks();
    showFirst();
    setFeedback('', state.mode === 'wait' ? 'Druk op de groene knop en speel de gekleurde toets. Ik wacht op je!' : 'Op de maat: na 4 tikjes loopt het liedje door. Speel mee!');
  }

  async function startPlaying(listen = false) {
    await unlockAudio();
    stopPlaying(false);
    staff.clearMarks();
    state.listening = listen;
    engine = new PracticeEngine(piece, {
      mode: listen ? 'tempo' : state.mode,
      hands: listen ? [] : state.hands,
      tempoPct: state.tempoPct,
      loop: { fromBar: state.fromBar, toBar: state.toBar },
      repeat: !listen && state.repeat,
      autoplayOther: listen || state.autoplayOther,
      metronome: !listen && state.metronome,
      drums: state.drums,
      chords: state.chords,
      octaveTolerant: settings.input === 'mic' && settings.micOctaveTolerant,
      stars: opts.stars,
    }, makeSound(piece));

    unsubs.push(
      engine.on('cursor', ({ index, expected, passive }) => {
        if (engine.opts.mode === 'wait') staff.setCurrent(index);
        else for (const { el: e, token } of staff.notes.values()) e?.classList.toggle('st-current', token.eventIndex === index);
        // Bij luisteren tonen we de voorgespeelde noten in de kleur van hun hand.
        kb.showNext([...expected, ...passive.map((n) => ({ ...n, passive: !state.listening }))], { showFingers: settings.showFingers !== false });
      }),
      engine.on('progress', ({ beat }) => staff.setBeat(beat)),
      engine.on('countin', ({ left }) => {
        countin.textContent = left > 0 ? String(left) : '';
        countin.classList.toggle('show', left > 0);
      }),
      engine.on('note', ({ tokenId, midi, result }) => {
        if (tokenId) staff.mark(tokenId, result);
        if (result !== 'missed') kb.flash(midi, result);
      }),
      engine.on('feedback', ({ result, played, expected }) => {
        const name = (m) => noteLabel(m, settings.noteLabels === 'solfege' ? 'solfege' : 'letters', false);
        let t;
        if (result === 'wrong' && played != null) {
          t = `Oeps, dat was ${name(played)}.`;
          if (expected?.length) t += ` Zoek de gekleurde toets${expected.length > 1 ? 'en' : ''}!`;
        } else if (result === 'ok') t = PRAISE[(praise = (praise + 1) % PRAISE.length)];
        else t = { early: 'Iets te vroeg!', late: 'Iets te laat!', missed: 'Gemist, speel gewoon door!' }[result] || '';
        setFeedback(result, t);
      }),
      engine.on('loop', (r) => {
        toast(`Rondje klaar: ${'★'.repeat(r.stars) || 'nog een keer!'}`);
        staff.clearMarks();
        flushPractice();
      }),
      engine.on('finish', (r) => finished(r)),
      engine.on('stop', () => finishUi()),
    );
    countin.classList.remove('show');
    setButtons(true, listen);
    el.classList.add('running');
    if (!listen) {
      practiceTimer = setInterval(() => {
        if (performance.now() - lastInput < 30000) pendingSeconds += 5;
      }, 5000);
      lastInput = performance.now();
    }
    setFeedback('', listen ? 'Luister goed en kijk mee…' : state.mode === 'wait' ? 'Speel de gekleurde toets!' : 'Tel mee: 1, 2, 3, 4…');
    bringIntoView();
    engine.start();
  }

  // Zorg dat notenbalk én toetsenbord zichtbaar zijn tijdens het spelen.
  function bringIntoView() {
    const nav = document.querySelector('.tabs');
    const bottomBar = nav && getComputedStyle(nav).position === 'fixed' ? nav.offsetHeight : 0;
    const kbBottom = kb.el.getBoundingClientRect().bottom;
    const overflow = kbBottom - (window.innerHeight - bottomBar);
    if (overflow > 0) {
      const top = document.querySelector('.topbar');
      const headerH = top && getComputedStyle(top).position === 'sticky' ? top.offsetHeight : 0;
      const maxScroll = stage.getBoundingClientRect().top - headerH - 8;
      window.scrollBy({ top: Math.min(overflow + 8, maxScroll), behavior: 'smooth' });
    }
  }

  function finishUi() {
    setButtons(false, false);
    countin.classList.remove('show');
    el.classList.remove('running');
    clearInterval(practiceTimer);
    unsubs.forEach((u) => u());
    unsubs = [];
    flushPractice();
  }

  function flushPractice() {
    if (pendingSeconds > 0) addPracticeSeconds(pendingSeconds);
    pendingSeconds = 0;
  }

  function stopPlaying(showResult) {
    if (!engine) return;
    const wasRunning = engine.running;
    const listen = state.listening;
    const partial = wasRunning && showResult && !listen ? engine.currentResult() : null;
    engine.stop();
    finishUi();
    engine = null;
    if (partial && partial.counts.ok + partial.counts.early + partial.counts.late > 0) showResults(partial, true);
  }

  async function finished(result) {
    const listen = state.listening;
    finishUi();
    engine = null;
    if (listen) return setFeedback('ok', 'Klaar met luisteren. Nu jij!');
    staff.hideCursor();
    const full = state.fromBar === 0 && state.toBar === piece.bars.length - 1 && state.hands.length === hasHands.length;
    if (full) {
      await saveResult({ itemId: opts.itemId, kind: opts.kind, score: result.score, stars: result.stars, accuracy: result.accuracy, timing: result.timing, mode: result.mode, tempoPct: state.tempoPct, hands: state.hands.join('+'), seconds: result.seconds });
    }
    showResults(result, false, full);
    opts.onDone?.(result, full);
  }

  function showResults(r, partial, saved) {
    const head = partial ? 'Tussenstand' : ['Bijna! Nog een keer?', 'Goed bezig!', 'Knap gedaan!', 'Fantastisch!'][r.stars];
    const facts = [h('span.fact.ok', icon('check', { size: 18 }), `${r.counts.ok} goed`)];
    if (r.mode === 'tempo') {
      if (r.counts.early + r.counts.late) facts.push(h('span.fact.warn', icon('clock', { size: 18 }), `${r.counts.early + r.counts.late} net niet op tijd`));
      if (r.counts.missed + r.counts.extra) facts.push(h('span.fact.bad', icon('close', { size: 18 }), `${r.counts.missed + r.counts.extra} foutjes`));
    } else if (r.counts.wrong) facts.push(h('span.fact.bad', icon('close', { size: 18 }), `${r.counts.wrong} foutje${r.counts.wrong === 1 ? '' : 's'}`));
    const goNext = !partial && saved && r.stars > 0 && opts.nextHref;
    const dlg = h('dialog.results', { 'aria-labelledby': 'res-title', class: r.stars === 3 && !partial ? 'party' : '' },
      r.stars === 3 && !partial ? h('div.confetti', { 'aria-hidden': 'true' }, Array.from({ length: 24 }, (_, i) => h('i', { style: { '--i': i } }))) : null,
      h('div.res-tiko', tiko(r.stars >= 2 ? 'juich' : r.stars === 1 ? 'blij' : 'denk', 96)),
      h('h2#res-title', head),
      h('div.res-stars', { role: 'img', 'aria-label': `${r.stars} van 3 sterren` }, [1, 2, 3].map((i) => icon('star', { size: 54, cls: i <= r.stars ? 'on' : 'off' }))),
      h('p.res-score', h('strong', String(r.score)), ' punten'),
      h('div.facts', facts),
      r.tips[0] ? h('p.res-tip', r.tips[0]) : null,
      !partial && !saved ? h('p.hint', 'Je oefende een stukje of één hand. Speel alles om sterren te verdienen.') : null,
      h('div.actions.center',
        h('button.btn.ghost', { type: 'button', onclick: () => { dlg.close(); startPlaying(); } }, icon('repeat'), 'Nog een keer'),
        goNext ? h('a.btn.primary', { href: opts.nextHref, onclick: () => dlg.close() }, 'Verder', icon('next'))
          : h('button.btn.primary', { type: 'button', onclick: () => dlg.close(), autofocus: true }, 'Klaar')),
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }

  // invoer koppelen
  const offOn = hub.on('noteon', (d) => {
    lastInput = performance.now();
    engine?.input(d);
  });

  // eerste weergave zodra het element in de pagina staat
  requestAnimationFrame(() => redraw().then(reset));
  let lastWidth = 0;
  const ro = new ResizeObserver(() => {
    const w = stage.clientWidth;
    if (Math.abs(w - lastWidth) > 40 && !engine?.running) {
      lastWidth = w;
      staff.render(piece, { activeHands: state.hands, showFingers: settings.showFingers !== false }).then(showFirst);
    }
  });
  ro.observe(stage);
  lastWidth = stage.clientWidth;

  return {
    el,
    piece,
    destroy() {
      stopPlaying(false);
      offOn();
      ro.disconnect();
      kb.destroy();
    },
  };
}

function rangeObj([low, high]) {
  return { low, high };
}
