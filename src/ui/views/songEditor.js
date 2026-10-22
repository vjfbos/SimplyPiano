// Eigen nummer maken of bewerken: noten typen, inspelen op het keyboard, of een MIDI-bestand omzetten.
import { h, toast } from '../dom.js';
import { saveCustomSong, deleteCustomSong, getCustomSongRaw } from '../../core/content.js';
import { expandSong, usesFlats } from '../../core/arrange.js';
import { buildPiece } from '../../core/piece.js';
import { midiToName } from '../../core/notes.js';
import { hub } from '../../input/hub.js';

let draft = null;
/** Klaarzetten voor de volgende keer dat de editor opent (bijv. na een MIDI-import). */
export function setDraft(d) {
  draft = d;
}

const TIME_SIGS = ['4/4', '3/4', '2/4', '6/8', '3/8', '2/2', '5/4', '12/8'];
const KEYS = [
  ['C', 'C-groot / a-klein (geen voortekens)'], ['G', 'G-groot (1♯)'], ['D', 'D-groot (2♯)'], ['A', 'A-groot (3♯)'], ['E', 'E-groot (4♯)'],
  ['F', 'F-groot (1♭)'], ['Bb', 'Bes-groot (2♭)'], ['Eb', 'Es-groot (3♭)'], ['Ab', 'As-groot (4♭)'],
  ['Am', 'a-klein'], ['Em', 'e-klein (1♯)'], ['Bm', 'b-klein (2♯)'], ['Dm', 'd-klein (1♭)'], ['Gm', 'g-klein (2♭)'], ['Cm', 'c-klein (3♭)'],
];
const STEP_DURS = [['w', 'hele'], ['h', 'halve'], ['q', 'kwart'], ['8', 'achtste'], ['16', 'zestiende']];

export async function songEditorView(id) {
  const existing = id ? await getCustomSongRaw(id) : null;
  if (id && !existing) throw new Error('Dit eigen nummer bestaat niet (meer) op dit apparaat.');
  const d = draft || {};
  draft = null;
  const song = existing ? { ...existing } : {
    title: d.title || '', composer: '', tempo: 90, timeSignature: '4/4', key: 'C', pickup: 0, melody: '', lh: '', chords: '',
  };
  // Geïmporteerd nummer met vaste niveaus: bewerk de uitgebreidste versie.
  if (!song.melody && song.levels?.length) {
    const top = song.levels[song.levels.length - 1];
    Object.assign(song, { melody: top.parts?.rh || '', lh: top.parts?.lh || '', chords: top.chords || '', tempo: top.tempo, timeSignature: top.timeSignature, key: top.key, pickup: top.pickup || 0 });
  }

  // ---------- formulier ----------
  const field = (label, input, hint) => h('label.field', h('span.f-label', label), input, hint ? h('small', hint) : null);
  const title = h('input', { type: 'text', value: song.title, required: true, maxLength: 80, placeholder: 'Bijv. de titel van je lievelingsnummer' });
  const composer = h('input', { type: 'text', value: song.composer || '', maxLength: 80, placeholder: 'Artiest of componist (optioneel)' });
  const tempo = h('input', { type: 'number', min: 30, max: 240, value: song.tempo || 90 });
  const ts = h('select', TIME_SIGS.map((t) => h('option', { value: t }, t)));
  ts.value = TIME_SIGS.includes(song.timeSignature) ? song.timeSignature : '4/4';
  const key = h('select', KEYS.map(([k, label]) => h('option', { value: k }, label)));
  key.value = song.key || 'C';
  if (key.value !== song.key && song.key) key.append(h('option', { value: song.key, selected: true }, song.key));
  const pickup = h('input', { type: 'number', min: 0, max: 6, step: 0.25, value: song.pickup || 0 });
  const rh = h('textarea.notes', { rows: 4, spellcheck: false, placeholder: 'C4/q D4/q E4/q F4/q | G4/w', value: song.melody || '' });
  const lh = h('textarea.notes', { rows: 3, spellcheck: false, placeholder: 'C3/w | G2/w   (optioneel)', value: song.lh || '' });
  const chords = h('input.notes', { type: 'text', spellcheck: false, placeholder: 'C | G | Am F | G C   (optioneel)', value: song.chords || '' });
  let activeField = rh;
  [rh, lh].forEach((t) => t.addEventListener('focus', () => { activeField = t; markActive(); }));

  const status = h('div.validation', { role: 'status', 'aria-live': 'polite' });
  const preview = h('div.preview');
  const levelInfo = h('p.hint');

  // ---------- noten inspelen ----------
  let stepDur = 'q';
  let recording = false;
  const durBox = h('div.segmented', { role: 'radiogroup', 'aria-label': 'Notenwaarde' }, STEP_DURS.map(([code, label]) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(code === stepDur),
    onclick: (e) => {
      stepDur = code;
      durBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
    },
  }, label)));
  const dotted = h('input', { type: 'checkbox' });
  const recBtn = h('button.btn', { type: 'button', 'aria-pressed': 'false', onclick: () => {
    recording = !recording;
    recBtn.setAttribute('aria-pressed', String(recording));
    recBtn.textContent = recording ? '⏺ Inspelen staat aan' : '⏺ Inspelen';
    // Tijdens inspelen zijn de notenvakken alleen-lezen, zodat ook het computertoetsenbord als piano werkt.
    rh.readOnly = lh.readOnly = recording;
    markActive();
  } }, '⏺ Inspelen');
  const targetLabel = h('span.hint');
  function markActive() {
    rh.classList.toggle('recording', recording && activeField === rh);
    lh.classList.toggle('recording', recording && activeField === lh);
    targetLabel.textContent = recording ? `Je speelt in: ${activeField === rh ? 'rechterhand' : 'linkerhand'} (klik in een vak om te wisselen)` : '';
  }
  const append = (text) => {
    const v = activeField.value.trimEnd();
    activeField.value = (v ? v + ' ' : '') + text;
    scheduleCheck();
  };
  // Noten die vrijwel tegelijk binnenkomen worden één akkoord.
  let pending = [];
  let pendingTimer = null;
  const offNote = hub.on('noteon', ({ midi }) => {
    if (!recording) return;
    pending.push(midi);
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      const names = [...new Set(pending)].sort((a, b) => a - b).map((m) => midiToName(m, usesFlats(key.value)));
      pending = [];
      append(`${names.join('+')}/${stepDur}${dotted.checked ? '.' : ''}`);
    }, 70);
  });
  const stepTools = h('div.step-entry',
    h('div.control-row', recBtn, durBox, h('label.check', dotted, 'gepunteerd')),
    h('div.control-row',
      h('button.btn', { type: 'button', onclick: () => append(`r/${stepDur}${dotted.checked ? '.' : ''}`) }, 'Rust'),
      h('button.btn', { type: 'button', onclick: () => append('|') }, '| Maatstreep'),
      h('button.btn', { type: 'button', onclick: () => {
        activeField.value = activeField.value.trimEnd().replace(/\s*\S+$/, '');
        scheduleCheck();
      } }, '⌫ Laatste weg'),
      targetLabel),
    h('p.hint', 'Zet "Inspelen" aan, kies de notenwaarde en speel de noten op je MIDI-keyboard, het scherm-toetsenbord hieronder of je computertoetsenbord. Ingedrukte toetsen die tegelijk klinken worden een akkoord.'));

  // ---------- MIDI-import ----------
  let midiPanel = null;
  if (d.midi) midiPanel = await buildMidiPanel(d.midi, d.fileName, (parts) => {
    rh.value = parts.melody;
    lh.value = parts.lh;
    if (!title.value) title.value = (d.fileName || '').replace(/\.(mid|midi)$/i, '').replace(/[_-]+/g, ' ');
    tempo.value = parts.tempo;
    ts.value = TIME_SIGS.includes(parts.timeSignature) ? parts.timeSignature : '4/4';
    if (![...key.options].some((o) => o.value === parts.key)) key.append(h('option', { value: parts.key }, parts.key));
    key.value = parts.key;
    pickup.value = 0;
    scheduleCheck();
  });

  // ---------- controle en voorbeeld ----------
  const current = () => ({
    ...(existing || {}),
    title: title.value.trim(),
    composer: composer.value.trim(),
    tempo: Number(tempo.value) || 90,
    timeSignature: ts.value,
    key: key.value,
    pickup: Number(pickup.value) || 0,
    melody: rh.value.trim(),
    lh: lh.value.trim(),
    chords: chords.value.trim(),
    levels: undefined,
  });
  let timer = null;
  let staff = null;
  function scheduleCheck() {
    clearTimeout(timer);
    timer = setTimeout(check, 350);
  }
  async function check() {
    const s = current();
    const errors = [];
    if (!s.melody) errors.push('Vul minstens de rechterhand (melodie) in.');
    let expanded = null;
    if (s.melody) {
      try {
        expanded = expandSong(s);
        for (const lv of expanded.levels) errors.push(...buildPiece(lv).errors);
      } catch (err) {
        errors.push(err.message);
      }
    }
    const unique = [...new Set(errors)];
    status.className = 'validation ' + (unique.length ? 'bad' : 'ok');
    if (unique.length) {
      status.replaceChildren(h('strong', 'Nog niet goed:'), h('ul', unique.slice(0, 6).map((e) => h('li', e))));
    } else {
      const piece = buildPiece(expanded.levels[expanded.levels.length - 1]);
      status.replaceChildren(h('strong', `✓ In orde: ${piece.bars.length} maten, ${piece.events.length} momenten om te spelen.`));
      levelInfo.textContent = `Niveaus: ${expanded.levels.map((l) => `${l.level}. ${l.description}`).join(' · ')}`;
      const { Staff } = await import('../staff.js');
      staff ||= new Staff();
      if (!staff.el.isConnected) preview.replaceChildren(staff.el);
      await staff.render(piece, { activeHands: ['rh', 'lh'] });
      return;
    }
    levelInfo.textContent = '';
  }
  [title, composer, tempo, ts, key, pickup, rh, lh, chords].forEach((el) => el.addEventListener('input', scheduleCheck));

  async function save(play) {
    const s = current();
    if (!s.title) { title.focus(); return toast('Geef het nummer een titel.', 'error'); }
    if (status.classList.contains('bad')) { await check(); if (status.classList.contains('bad')) return toast('Los eerst de meldingen op.', 'error'); }
    delete s.levels;
    const saved = await saveCustomSong(s);
    toast(`"${saved.title}" is opgeslagen.`);
    location.hash = play ? `#/lied/${saved.id}` : '#/liedjes';
  }

  // scherm-toetsenbord om in te spelen
  const { Keyboard } = await import('../keyboard.js');
  const kb = new Keyboard({ low: 48, high: 83 });

  const view = h('div.view.editor',
    h('nav.crumbs', h('a', { href: '#/liedjes' }, '← Liedjes')),
    h('h1', existing ? 'Nummer bewerken' : 'Eigen nummer toevoegen'),
    h('p.notice', '🔒 Eigen nummers worden alleen op dit apparaat bewaard en niet gedeeld. Gebruik muziek waar auteursrecht op rust alleen voor jezelf.'),
    midiPanel,
    h('section.card',
      h('h2', 'Over het nummer'),
      h('div.form-grid',
        field('Titel', title),
        field('Artiest / componist', composer),
        field('Tempo (kwarten per minuut)', tempo),
        field('Maatsoort', ts),
        field('Toonsoort', key),
        field('Opmaat (tellen)', pickup, 'Bijv. 1 als het lied één tel vóór de eerste maat begint.'))),
    h('section.card',
      h('h2', 'Noten'),
      field('Rechterhand (melodie)', rh),
      field('Linkerhand', lh, 'Leeg laten mag: met akkoorden maakt de app zelf een linkerhand.'),
      field('Akkoorden per maat', chords, 'Voor begeleiding en automatische niveaus. Gebruik | tussen maten, bijv. "Am | F | C G".'),
      stepTools,
      h('details.cheatsheet',
        h('summary', 'Hoe schrijf ik noten?'),
        h('ul',
          h('li', h('code', 'C4/q'), ' kwartnoot middel-C · ', h('code', 'G4/h'), ' halve · ', h('code', 'E4/w'), ' hele · ', h('code', 'D4/8'), ' achtste · ', h('code', 'F4/16'), ' zestiende'),
          h('li', h('code', 'A4/q.'), ' gepunteerd · ', h('code', 'F#4/q'), ' kruis · ', h('code', 'Bb3/q'), ' mol · ', h('code', 'r/q'), ' rust'),
          h('li', h('code', 'C4+E4+G4/h'), ' akkoord · ', h('code', 'E4/q@3'), ' vingerzetting · ', h('code', '|'), ' maatstreep (wordt gecontroleerd)'),
          h('li', 'Middel-C is C4. De C daaronder is C3, de C erboven C5.')))),
    h('section.card',
      h('h2', 'Controle en voorbeeld'),
      status, levelInfo, preview),
    h('div.actions.sticky-actions',
      h('button.btn.primary', { type: 'button', onclick: () => save(true) }, 'Opslaan en spelen'),
      h('button.btn', { type: 'button', onclick: () => save(false) }, 'Opslaan'),
      existing ? h('button.btn.danger', { type: 'button', onclick: async () => {
        if (!confirm(`"${existing.title}" verwijderen?`)) return;
        await deleteCustomSong(existing.id);
        location.hash = '#/liedjes';
      } }, 'Verwijderen') : null),
    h('div.editor-keyboard', kb.el));

  view.destroy = () => {
    offNote();
    clearTimeout(timer);
    clearTimeout(pendingTimer);
    kb.destroy();
  };
  if (rh.value) setTimeout(check, 0);
  else status.replaceChildren('Typ of speel de noten in; hier zie je meteen of alles klopt.');
  return view;
}

async function buildMidiPanel(midi, fileName, apply) {
  const { defaultHands, partsFromMidi } = await import('../../core/midifile.js');
  const def = defaultHands(midi);
  const multi = midi.tracks.length >= 2;
  const roles = new Map(midi.tracks.map((t) => [t.index, def.mode === 'tracks' ? (def.rh.includes(t.index) ? 'rh' : def.lh.includes(t.index) ? 'lh' : 'none') : 'split']));
  const first = partsFromMidi(midi, { hands: def });
  const fromBar = h('input', { type: 'number', min: 1, max: first.totalBars, value: first.fromBar + 1 });
  const toBar = h('input', { type: 'number', min: 1, max: first.totalBars, value: first.toBar });
  const detail = h('select', h('option', { value: 'simple' }, 'Eenvoudig: één noot per hand'), h('option', { value: 'full' }, 'Volledig: met akkoorden'));
  const splitMode = h('select', { disabled: !multi },
    h('option', { value: 'tracks' }, 'Per spoor (instrument)'), h('option', { value: 'split' }, 'Splitsen op middel-C'));
  splitMode.value = def.mode;
  const trackRows = midi.tracks.map((t) => {
    const sel = h('select', { 'aria-label': `Hand voor ${t.name}` },
      h('option', { value: 'rh' }, 'Rechterhand'), h('option', { value: 'lh' }, 'Linkerhand'), h('option', { value: 'none' }, 'Niet gebruiken'));
    sel.value = roles.get(t.index) === 'split' ? 'rh' : roles.get(t.index);
    sel.addEventListener('change', () => roles.set(t.index, sel.value));
    return h('li', h('span', `${t.name} · ${t.notes} noten`), sel);
  });
  const trackList = h('ul.track-list', { hidden: !multi || def.mode !== 'tracks' }, trackRows);
  splitMode.addEventListener('change', () => (trackList.hidden = splitMode.value !== 'tracks'));

  const convert = () => {
    const hands = splitMode.value === 'tracks'
      ? { mode: 'tracks', rh: [...roles].filter(([, r]) => r === 'rh').map(([i]) => i), lh: [...roles].filter(([, r]) => r === 'lh').map(([i]) => i) }
      : { mode: 'split', split: 60 };
    const parts = partsFromMidi(midi, { hands, fromBar: Number(fromBar.value) - 1, toBar: Number(toBar.value), detail: detail.value });
    fromBar.value = parts.fromBar + 1;
    toBar.value = parts.toBar;
    apply(parts);
  };
  setTimeout(convert, 0);
  return h('section.card.midi-panel',
    h('h2', `🎹 MIDI-import: ${fileName || 'bestand'}`),
    h('p.hint', `${midi.tracks.length} spoor/sporen · ${first.totalBars} maten · ${midi.timeSignature} · ${midi.tempo} bpm. Lange stukken kun je in delen oefenen: kies hieronder welke maten je wilt.`),
    h('div.form-grid',
      h('label.field', h('span.f-label', 'Handen verdelen'), splitMode),
      h('label.field', h('span.f-label', 'Van maat'), fromBar),
      h('label.field', h('span.f-label', 'Tot en met maat'), toBar),
      h('label.field', h('span.f-label', 'Detail'), detail)),
    trackList,
    h('button.btn', { type: 'button', onclick: convert }, 'Opnieuw omzetten'),
    h('p.hint', 'De app rondt het ritme af op zestienden en splitst lange noten bij de maatstreep. Kijk het resultaat na en pas zo nodig de noten aan.'));
}
