// Oefenscherm: notenbalk + toetsenbord + bediening. Gebruikt door lessen en liedjes.
import { h, stars, toast } from './dom.js';
import { Staff } from './staff.js';
import { Keyboard } from './keyboard.js';
import { buildPiece } from '../core/piece.js';
import { noteLabel } from '../core/notes.js';
import { PracticeEngine, RESULT_TEXT } from '../practice/engine.js';
import { hub } from '../input/hub.js';
import { getAudio, perfToAudioTime, unlockAudio } from '../audio/audio.js';
import { playAt, allNotesOff } from '../audio/synth.js';
import { click } from '../audio/drums.js';
import { Scheduler } from '../audio/scheduler.js';
import { accompanimentItems, padChord } from '../audio/accompaniment.js';
import { currentProfile, saveResult, addPracticeSeconds } from '../core/profiles.js';
import { inputSummary } from '../input/manager.js';

const SYMBOL = { ok: '✓', early: '«', late: '»', missed: '○', wrong: '✗', retry: '✓' };

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
  const feedback = h('div.feedback', { role: 'status', 'aria-live': 'polite' }, h('span.fb-symbol', '♪'), h('span.fb-text', 'Druk op Start en speel de oplichtende noot.'));
  const countin = h('div.countin', { 'aria-live': 'assertive' });
  const inputChip = h('button.chip.input-chip', { type: 'button', title: 'Invoer wijzigen', onclick: () => (location.hash = '#/instellingen') });
  const updateChip = () => {
    const s = inputSummary(currentProfile()?.settings || settings);
    inputChip.replaceChildren(h('span', { 'aria-hidden': 'true' }, s.icon), ' ', s.text);
  };
  updateChip();

  // ---------- bediening ----------
  const seg = (name, options, value, onChange) => {
    const box = h('div.segmented', { role: 'radiogroup', 'aria-label': name });
    options.forEach(([val, label, disabled]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(val === value), disabled: !!disabled, onclick: () => {
        box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        onChange(val);
      } }, label);
      box.append(b);
    });
    return box;
  };
  const modeSeg = seg('Oefenmodus', [['wait', 'Wachten', !allowModes.includes('wait')], ['tempo', 'Op tempo', !allowModes.includes('tempo')]], state.mode, (v) => {
    state.mode = v;
    reset();
  });
  const handValue = state.hands.length === 2 ? 'both' : state.hands[0];
  const handSeg = seg('Handen', [
    ['lh', 'Links', !hasHands.includes('lh')],
    ['rh', 'Rechts', !hasHands.includes('rh')],
    ['both', 'Beide', hasHands.length < 2],
  ], handValue, (v) => {
    state.hands = v === 'both' ? hasHands : [v];
    redraw();
  });
  const tempoOut = h('output', '100%');
  const tempoInput = h('input', { type: 'range', min: 50, max: 100, step: 5, value: 100, 'aria-label': 'Tempo', oninput: () => {
    state.tempoPct = Number(tempoInput.value);
    tempoOut.textContent = `${state.tempoPct}% · ${Math.round(piece.tempo * state.tempoPct / 100)} bpm`;
  } });
  tempoOut.textContent = `100% · ${piece.tempo} bpm`;

  const barOptions = () => piece.bars.map((b) => h('option', { value: b.index }, `maat ${b.index + (piece.pickup ? 0 : 1)}`));
  const fromSel = h('select', { 'aria-label': 'Van maat', onchange: () => {
    state.fromBar = Number(fromSel.value);
    if (state.toBar < state.fromBar) toSel.value = state.toBar = state.fromBar;
  } }, barOptions());
  const toSel = h('select', { 'aria-label': 'Tot en met maat', onchange: () => {
    state.toBar = Number(toSel.value);
    if (state.toBar < state.fromBar) fromSel.value = state.fromBar = state.toBar;
  } }, barOptions());
  toSel.value = state.toBar;
  const check = (label, key, disabled = false) => h('label.check', h('input', { type: 'checkbox', checked: state[key], disabled, onchange: (e) => (state[key] = e.target.checked) }), label);

  const startBtn = h('button.btn.primary.big', { type: 'button', onclick: () => (engine?.running ? stopPlaying(true) : startPlaying()) }, 'Start');
  const listenBtn = h('button.btn', { type: 'button', onclick: () => (engine?.running ? stopPlaying(false) : startPlaying(true)) }, '▶ Luister');

  const controls = h('div.controls',
    h('div.control-row', modeSeg, handSeg, inputChip),
    h('div.control-row', h('label.tempo', 'Tempo ', tempoInput, tempoOut)),
    h('details.more',
      h('summary', 'Meer opties: herhalen en begeleiding'),
      h('div.control-row',
        check('Passage herhalen', 'repeat'),
        h('label', 'van ', fromSel), h('label', 't/m ', toSel)),
      h('div.control-row',
        check('Andere hand speelt mee', 'autoplayOther'),
        check('Metronoom', 'metronome'),
        check('Drums', 'drums'),
        check('Akkoorden', 'chords', !piece.chords.length)),
      h('p.hint', 'Metronoom en drums klinken in de tempomodus. Akkoorden klinken in beide modi.')),
    h('div.control-row.actions', startBtn, listenBtn),
  );

  const stage = h('div.stage', staff.el, countin);
  const el = h('section.player', controls, stage, feedback, kb.el);

  // ---------- engine ----------
  let engine = null;
  let unsubs = [];
  let practiceTimer = null;
  let lastInput = 0;
  let pendingSeconds = 0;

  function setFeedback(result, text) {
    feedback.className = 'feedback fb-' + result;
    feedback.querySelector('.fb-symbol').textContent = SYMBOL[result] || '♪';
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
    setFeedback('', state.mode === 'wait' ? 'Wachtmodus: het stuk wacht tot je de juiste noot speelt.' : 'Tempomodus: na vier tikken aftellen loopt het stuk mee met de maat.');
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
      engine.on('feedback', ({ result, text, played, expected, dt }) => {
        let t = text;
        if (result === 'wrong' && played != null) {
          t = `Fout: je speelde ${noteLabel(played, settings.noteLabels === 'solfege' ? 'solfege' : 'letters')}`;
          if (expected?.length) t += ` · zoek ${expected.map((m) => noteLabel(m, settings.noteLabels === 'solfege' ? 'solfege' : 'letters')).join(' + ')}`;
        } else if ((result === 'early' || result === 'late') && dt != null) {
          t = `${RESULT_TEXT[result]} (${Math.abs(dt)} ms)`;
        }
        setFeedback(result, t);
      }),
      engine.on('loop', (r) => {
        toast(`Ronde klaar: ${r.score} punten ${'★'.repeat(r.stars)}`);
        staff.clearMarks();
        flushPractice();
      }),
      engine.on('finish', (r) => finished(r)),
      engine.on('stop', () => finishUi()),
    );
    countin.classList.remove('show');
    startBtn.textContent = listen ? 'Start' : 'Stop';
    listenBtn.textContent = listen ? '■ Stop' : '▶ Luister';
    startBtn.disabled = listen;
    el.classList.add('running');
    if (!listen) {
      practiceTimer = setInterval(() => {
        if (performance.now() - lastInput < 30000) pendingSeconds += 5;
      }, 5000);
      lastInput = performance.now();
    }
    setFeedback('', listen ? 'Luister en kijk mee…' : state.mode === 'wait' ? 'Speel de oplichtende noot.' : 'Tel mee…');
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
    startBtn.textContent = 'Start';
    listenBtn.textContent = '▶ Luister';
    startBtn.disabled = false;
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
    if (listen) return setFeedback('', 'Klaar met luisteren. Nu jij!');
    staff.hideCursor();
    const full = state.fromBar === 0 && state.toBar === piece.bars.length - 1 && state.hands.length === hasHands.length;
    if (full) {
      await saveResult({ itemId: opts.itemId, kind: opts.kind, score: result.score, stars: result.stars, accuracy: result.accuracy, timing: result.timing, mode: result.mode, tempoPct: state.tempoPct, hands: state.hands.join('+'), seconds: result.seconds });
    }
    showResults(result, false, full);
    opts.onDone?.(result, full);
  }

  function showResults(r, partial, saved) {
    const dlg = h('dialog.results', { 'aria-labelledby': 'res-title' },
      h('h2#res-title', partial ? 'Tussenstand' : r.stars >= 2 ? 'Knap gedaan!' : r.stars === 1 ? 'Goed bezig!' : 'Blijf oefenen!'),
      stars(r.stars),
      h('div.res-grid',
        h('div', h('strong', `${r.score}`), h('span', 'punten')),
        h('div', h('strong', `${r.accuracy}%`), h('span', 'nauwkeurig')),
        r.timing !== null ? h('div', h('strong', `${r.timing}%`), h('span', 'timing')) : null),
      h('ul.res-counts',
        h('li.ok', `✓ goed: ${r.counts.ok}`),
        r.mode === 'tempo' ? [h('li.warn', `« te vroeg: ${r.counts.early}`), h('li.warn', `» te laat: ${r.counts.late}`), h('li.bad', `○ gemist: ${r.counts.missed}`), h('li.bad', `✗ extra/fout: ${r.counts.extra}`)]
          : h('li.bad', `✗ foute noten: ${r.counts.wrong}`)),
      h('h3', 'Tips'),
      h('ul.tips', r.tips.map((t) => h('li', t))),
      !partial && !saved ? h('p.hint', 'Dit resultaat telt niet mee voor de sterren, omdat je een deel of één hand oefende.') : null,
      h('div.actions',
        h('button.btn', { type: 'button', onclick: () => { dlg.close(); startPlaying(); } }, 'Opnieuw'),
        h('button.btn.primary', { type: 'button', onclick: () => dlg.close(), autofocus: true }, 'Sluiten')),
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
  const offStatus = hub.on('status', updateChip);

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
      offStatus();
      ro.disconnect();
      kb.destroy();
    },
  };
}

function rangeObj([low, high]) {
  return { low, high };
}
