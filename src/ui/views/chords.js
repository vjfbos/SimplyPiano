// Akkoorden: zoeken en inladen van akkoordenbladen, het blad lezen (met transponeren) en de akkoorden oefenen.
import { h, toast, stars } from '../dom.js';
import { searchChords, fetchChords } from '../../core/chordsource.js';
import { listSheets, getSheet, saveSheet, deleteSheet } from '../../core/sheets.js';
import { extractProgression, sheetLines, transposeChord, prefersFlats, simplifyChord } from '../../core/chordtext.js';
import { parseChordSheet, formatChordSheet, formatTime, isTimed, chordIndexAt, matchChord, ChordScorer, ChordCollector, chordSummary, chordPitchClasses } from '../../core/chordsheet.js';
import { parseChord } from '../../core/chords.js';
import { voiceChord } from '../../core/arrange.js';
import { noteLabel, midiToName } from '../../core/notes.js';
import { ManualClock } from '../../core/clock.js';
import { icon } from '../icons.js';
import { playSwitch } from './playnav.js';
import { hub } from '../../input/hub.js';
import { currentProfile, saveResult, addPracticeSeconds } from '../../core/profiles.js';
import { getAudio, perfToAudioTime, unlockAudio } from '../../audio/audio.js';
import { playAt } from '../../audio/synth.js';
import { click } from '../../audio/drums.js';
import { Scheduler } from '../../audio/scheduler.js';

const newId = () => 'ak-' + Date.now().toString(36);

/** Nieuw blad uit een akkoordenblad (tekst met akkoorden boven de songtekst, of alleen akkoorden). */
export function sheetFromContent({ title, artist = '', content, url = '', source = '', capo = 0, key = '' }) {
  const { text, count } = extractProgression(content);
  return { id: newId(), title: title || 'Naamloos', artist, raw: content, text, url, source, capo, key, transpose: 0, bpm: 90, beatsPerChord: 4, offset: 0, chordCount: count };
}

// ======================================================================= overzicht

export async function chordsView() {
  const sheets = await listSheets();

  // ---- online zoeken ----
  const results = h('div.track-results', { 'aria-live': 'polite' });
  const q = h('input.search', { type: 'search', placeholder: 'Titel en/of artiest, bijv. "eye of the tiger"', 'aria-label': 'Zoek akkoorden', autocomplete: 'off' });
  const go = async () => {
    const term = q.value.trim();
    if (term.length < 2) return;
    results.replaceChildren(h('p.hint', 'Zoeken…'));
    try {
      const list = await searchChords(term);
      results.replaceChildren(...(list.length ? list.map(resultRow) : [h('p.hint', 'Geen akkoorden gevonden. Probeer een andere schrijfwijze, of plak ze hieronder zelf.')]));
    } catch (e) {
      results.replaceChildren(h('p.bad-text', e.message));
    }
  };
  q.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  function resultRow(r) {
    const btn = h('button.btn.primary', { type: 'button', onclick: async () => {
      btn.disabled = true;
      btn.textContent = 'Laden…';
      try {
        const tab = await fetchChords(r.url);
        const s = await saveSheet(sheetFromContent({ ...tab, title: tab.title || r.title, artist: tab.artist || r.artist, url: r.url }));
        location.hash = `#/akkoorden/${s.id}`;
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Inladen';
      }
    } }, 'Inladen');
    return h('div.track-row',
      h('div.track-card', h('span.sheet-icon', icon('guitar')),
        h('div', h('strong', `${r.title}${r.version > 1 ? ` (versie ${r.version})` : ''}`), h('small', [r.artist, r.key && `toonsoort ${r.key}`].filter(Boolean).join(' · ')),
          h('small.status', r.votes ? `★ ${r.rating} · ${r.votes} stemmen · ${r.source}` : r.source))),
      btn);
  }

  // ---- plakken of link ----
  const pTitle = h('input', { type: 'text', placeholder: 'Titel', 'aria-label': 'Titel' });
  const pArtist = h('input', { type: 'text', placeholder: 'Artiest (optioneel)', 'aria-label': 'Artiest' });
  const pText = h('textarea.notes', { rows: 8, spellcheck: false, placeholder: 'Plak hier een akkoordenblad van een website (akkoorden boven de tekst), of typ alleen de akkoorden:\n\n[Couplet]\nAm F C G x2' });
  const pUrl = h('input', { type: 'url', placeholder: 'https://tabs.ultimate-guitar.com/tab/…', 'aria-label': 'Link naar akkoordenpagina' });
  const pasteCard = h('div',
    h('div.control-row', pUrl, h('button.btn', { type: 'button', onclick: async () => {
      if (!pUrl.value.trim()) return pUrl.focus();
      try {
        const tab = await fetchChords(pUrl.value.trim());
        const s = await saveSheet(sheetFromContent({ ...tab, url: pUrl.value.trim() }));
        location.hash = `#/akkoorden/${s.id}`;
      } catch (e) {
        toast(e.message, 'error');
      }
    } }, 'Link inladen')),
    h('div.form-grid', pTitle, pArtist),
    pText,
    h('div.actions', h('button.btn.primary', { type: 'button', onclick: async () => {
      if (!pText.value.trim()) return pText.focus();
      const sheet = sheetFromContent({ title: pTitle.value.trim(), artist: pArtist.value.trim(), content: pText.value });
      if (!sheet.chordCount) return toast('Er zijn geen akkoorden gevonden in de geplakte tekst.', 'error');
      const s = await saveSheet(sheet);
      location.hash = `#/akkoorden/${s.id}`;
    } }, 'Opslaan en openen')),
    h('p.hint', 'De app herkent zelf welke regels akkoorden zijn en welke songtekst. Ongebruikelijke akkoorden (bijv. E7#9) worden voor het oefenen vereenvoudigd (E7).'));

  const list = h('section',
    h('h2.section-title', 'Mijn akkoorden'),
    sheets.length ? h('ul.sheet-list', sheets.map((s) => h('li',
      h('a', { href: `#/akkoorden/${s.id}` }, h('span.sheet-icon', icon('guitar')),
        h('span', h('strong', s.title), h('small', [s.artist, s.source].filter(Boolean).join(' · ')))),
      h('button.icon-btn.danger', { type: 'button', 'aria-label': `Verwijder ${s.title}`, onclick: async (e) => {
        if (!confirm(`Akkoordenblad "${s.title}" verwijderen?`)) return;
        await deleteSheet(s.id);
        e.target.closest('li').remove();
      } }, icon('trash', { size: 20 }))))) : h('p.hint', 'Nog niets bewaard. Zoek hierboven een liedje.'));

  // Doorgestuurd vanaf Liedjes met een zoekterm? Dan meteen zoeken.
  const preset = sessionStorage.getItem('akkoorden:q');
  if (preset) {
    sessionStorage.removeItem('akkoorden:q');
    q.value = preset;
    setTimeout(go, 0);
  }
  return h('div.view.chords',
    playSwitch('akkoorden'),
    h('h1', 'Akkoorden van elk liedje'),
    h('div.search-bar', icon('search', { cls: 'search-icon' }), q, h('button.btn.primary', { type: 'button', onclick: go }, 'Zoek')),
    results,
    list,
    h('details.card.paste-card', h('summary', icon('file', { size: 20 }), 'Zelf akkoorden plakken of een link gebruiken'), pasteCard));
}

// ======================================================================= één blad

export async function chordSheetView(id) {
  const sheet = await getSheet(id);
  if (!sheet) throw new Error('Dit akkoordenblad bestaat niet (meer).');
  const settings = currentProfile()?.settings || {};
  const labelStyle = settings.noteLabels === 'solfege' ? 'solfege' : 'letters';
  const cleanups = [];
  let chords = parseChordSheet(sheet.text).chords; // originele toonsoort
  const flats = () => prefersFlats(chords.map((c) => c.chord));
  const tr = (c) => transposeChord(c, sheet.transpose || 0, flats());
  // Notennaam zonder octaaf; bij mol-akkoorden (Bb, Eb …) ook mollen tonen.
  const nm = (midi, symbol = '') => (labelStyle === 'solfege' ? noteLabel(midi, 'solfege')
    : midiToName(midi, /^[A-G]b/.test(symbol) || /^[A-G]#/.test(symbol) ? !/^[A-G]#/.test(symbol) : flats()).replace(/-?\d+$/, ''));
  let saveTimer;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSheet(sheet), 400);
  };

  const { Keyboard } = await import('../keyboard.js');
  const kb = new Keyboard({ low: 36, high: 83, labels: settings.noteLabels || 'letters' });
  cleanups.push(() => kb.destroy());
  let hand = 'rh';

  /** Ligging van een akkoord op het toetsenbord. */
  function voicing(symbol) {
    const c = parseChord(simplifyChord(symbol) || symbol);
    if (!c) return [];
    // powerchord (G5): alleen grondtoon en kwint
    const base = c.intervals.length === 2 ? [48 + c.root, 55 + c.root] : voiceChord(c, null);
    let bass = 36 + c.bassPc;
    if (bass < 40) bass += 12;
    if (hand === 'lh') return base.map((m) => ({ midi: m, hand: 'lh' }));
    const rh = base.map((m) => ({ midi: m + 12, hand: 'rh' }));
    return hand === 'both' ? [{ midi: bass, hand: 'lh' }, ...rh] : rh;
  }
  function sound(symbol, when, dur = 1.2) {
    voicing(symbol).forEach((n) => playAt(n.midi, when ?? getAudio().ctx.currentTime, dur, { bus: 'accomp', velocity: 0.55, soft: true }));
  }

  // ---------- kop en transponeren ----------
  const trOut = h('output.pos');
  const updateTr = () => (trOut.textContent = sheet.transpose ? `${sheet.transpose > 0 ? '+' : ''}${sheet.transpose}` : '0');
  const setTranspose = (n) => {
    sheet.transpose = Math.max(-11, Math.min(11, n));
    updateTr();
    persist();
    renderSheet();
    renderSummary();
    resetPractice();
  };
  updateTr();
  const header = h('header.sheet-head',
    h('span.sheet-icon.big', icon('guitar', { size: 36 })),
    h('div', h('h1', sheet.title), h('p.composer', [sheet.artist, sheet.key && `toonsoort ${sheet.key}`, sheet.capo ? `capo ${sheet.capo}` : ''].filter(Boolean).join(' · ')),
      sheet.url ? h('a.source-link', { href: sheet.url, target: '_blank', rel: 'noopener noreferrer' }, `Bron: ${sheet.source || new URL(sheet.url).hostname}`) : null));
  const toolbar = h('div.control-row',
    h('span', 'Transponeren'),
    h('button.btn', { type: 'button', 'aria-label': 'Halve toon omlaag', onclick: () => setTranspose((sheet.transpose || 0) - 1) }, '−'),
    trOut,
    h('button.btn', { type: 'button', 'aria-label': 'Halve toon omhoog', onclick: () => setTranspose((sheet.transpose || 0) + 1) }, '+'),
    sheet.capo ? h('button.btn', { type: 'button', title: 'Gitaarcapo omrekenen naar piano', onclick: () => setTranspose(sheet.capo) }, `Capo ${sheet.capo} → piano`) : null,
    h('span.hint', 'Te hoog of te laag om mee te zingen? Transponeer, of maak het makkelijker met minder zwarte toetsen.'));

  // ---------- tab: blad ----------
  const sheetBox = h('div.chord-sheet');
  const summaryBox = h('div.chord-chips');
  function renderSheet() {
    const src = sheet.raw || sheet.text;
    sheetBox.replaceChildren(...sheetLines(src, sheet.transpose || 0, flats()).map((l) => {
      if (l.type === 'section') return h('div.cs-section', l.text);
      if (l.type === 'blank') return h('div.cs-blank');
      if (l.type === 'lyrics') return h('div.cs-lyrics', l.text);
      const row = h('div.cs-chords');
      let pos = 0;
      for (const c of l.chords) {
        if (c.col > pos) row.append(l.text.slice(pos, c.col));
        row.append(h('button.cs-chord', { type: 'button', onclick: () => showChord(c.name) }, c.name));
        pos = c.col + c.name.length;
      }
      row.append(l.text.slice(pos));
      return row;
    }));
  }
  function renderSummary() {
    summaryBox.replaceChildren(...chordSummary(chords).map(({ chord }) => h('button.chip', { type: 'button', onclick: () => showChord(tr(chord)) }, tr(chord))));
  }
  function showChord(name) {
    unlockAudio();
    kb.showNext(voicing(name), { showFingers: false });
    sound(name);
    selected.textContent = `${name}: ${voicing(name).map((n) => nm(n.midi, name)).join(' – ')}`;
  }
  const selected = h('p.chord-notes', { 'aria-live': 'polite' }, 'Tik op een akkoord om het te horen en te zien.');
  const sheetTab = h('div.tab-panel',
    h('h3', 'Akkoorden in dit nummer'), summaryBox, selected,
    sheetBox);

  // ---------- tab: oefenen ----------
  let mode = isTimed(chords) ? 'opname' : 'wachten';
  const modeSel = segmented('Hoe wil je oefenen?', [['wachten', [icon('hand', { size: 20 }), 'Stap voor stap']], ['tempo', [icon('metronome', { size: 20 }), 'Op tempo']], ['opname', [icon('headphones', { size: 20 }), 'Met opname']]], mode, (v) => { mode = v; resetPractice(); });
  const handSel = segmented('Welke hand?', [['lh', h('span.hand-badge.lh', 'L')], ['both', [h('span.hand-badge.lh', 'L'), h('span.hand-badge.rh', 'R')]], ['rh', h('span.hand-badge.rh', 'R')]], hand, (v) => { hand = v; lastShown = null; });
  const bpm = h('input', { type: 'number', min: 30, max: 220, value: sheet.bpm || 90, 'aria-label': 'Tempo in tellen per minuut', onchange: () => { sheet.bpm = Number(bpm.value) || 90; persist(); } });
  const beats = h('select', { 'aria-label': 'Tellen per akkoord', onchange: () => { sheet.beatsPerChord = Number(beats.value); persist(); } },
    [1, 2, 3, 4, 6, 8].map((b) => h('option', { value: b }, `${b} ${b === 1 ? 'tel' : 'tellen'} per akkoord`)));
  beats.value = sheet.beatsPerChord || 4;
  const metro = h('input', { type: 'checkbox', checked: true });
  const backing = h('input', { type: 'checkbox', checked: true });
  const tempoOpts = h('div.control-row', h('label', 'Tempo ', bpm, ' bpm'), beats, h('label.check', metro, 'Metronoom'), h('label.check', backing, 'Akkoorden zacht laten meeklinken'));
  const clock = new ManualClock(); // klok bij een opname (ook voor het intikken)
  clock.offset = sheet.offset || 0;
  const tempoClock = new ManualClock(); // klok voor "Op tempo"
  const pclock = () => (mode === 'tempo' ? tempoClock : clock);
  const pt = () => pclock().position() - pclock().offset;
  const posOut = h('output.pos', '0:00.0');
  const offset = h('input', { type: 'range', min: -1.5, max: 1.5, step: 0.1, value: clock.offset, 'aria-label': 'Akkoorden eerder of later' });
  const offsetOut = h('output', `${clock.offset.toFixed(1)} s`);
  offset.addEventListener('input', () => {
    clock.offset = sheet.offset = Number(offset.value);
    offsetOut.textContent = `${clock.offset > 0 ? '+' : ''}${clock.offset.toFixed(1)} s`;
    persist();
  });
  const recOpts = h('div',
    h('div.control-row',
      h('button.btn', { type: 'button', onclick: () => (clock.isPlaying ? clock.pause() : clock.play()) }, '⏯ Klok start/pauze'),
      h('button.btn', { type: 'button', onclick: () => clock.seek(0) }, '⏮ Begin'),
      h('button.btn', { type: 'button', onclick: () => clock.seek(Math.max(0, clock.position() - clock.offset - 10)) }, '−10 s'),
      posOut),
    h('label.range', 'Akkoorden eerder/later ', offset, offsetOut),
    h('p.hint', 'Start de opname (bijv. op YouTube, Spotify of cd) en tegelijk deze klok. De akkoorden lopen mee op de tijden die je bij "Bewerken" hebt ingetikt.'));

  const curName = h('div.chord-now', '–');
  const curNotes = h('div.chord-notes');
  const nextName = h('div.chord-next', '–');
  const bar = h('div.chord-bar', h('div.chord-bar-fill'));
  const strip = h('div.chord-strip', { 'aria-hidden': 'true' });
  const fb = h('div.feedback', { role: 'status', 'aria-live': 'polite' }, h('span.fb-symbol', '♪'), h('span.fb-text', 'Druk op Start.'));
  const scoreOut = h('div.live-score');
  const startBtn = h('button.play-btn', { type: 'button', 'aria-label': 'Start', onclick: () => (running ? stop(true) : start()) }, icon('play', { size: 34 }));
  const practiceTab = h('div.tab-panel',
    h('div.control-row', modeSel, handSel),
    tempoOpts, recOpts,
    h('div.control-row', startBtn, scoreOut),
    h('div.chord-display', h('div', h('small', 'Nu'), curName, curNotes), h('div.next-wrap', h('small', 'Straks'), nextName, bar)),
    strip, fb);

  // ---------- oefenlogica ----------
  let running = false;
  let seq = []; // { chord (getransponeerd), time? }
  let idx = 0;
  let clean = 0;
  let firstTry = true;
  let scorer = null;
  let raf = null;
  let lastShown = null;
  let practiceStart = 0;
  const scheduler = new Scheduler();
  let collector = new ChordCollector();
  cleanups.push(() => { scheduler.stop(); cancelAnimationFrame(raf); });

  function resetPractice() {
    if (running) stop(false);
    tempoOpts.hidden = mode !== 'tempo';
    recOpts.hidden = mode !== 'opname';
    const timed = chords.filter((c) => c.time != null);
    if (mode === 'opname' && !timed.length) setFb('', 'Er zijn nog geen tijden ingetikt. Ga naar "Bewerken" en tik de akkoordwissels in.');
    else setFb('', mode === 'wachten' ? 'Wachtmodus: het volgende akkoord komt pas als je het huidige goed speelt.' : 'Druk op Start.');
    seq = chords.map((c) => ({ chord: tr(c.chord), time: c.time }));
    idx = 0;
    display(0, null);
  }

  async function start() {
    await unlockAudio();
    if (!chords.length) return toast('Er staan nog geen akkoorden in dit blad.', 'error');
    running = true;
    startBtn.replaceChildren(icon('stop', { size: 34 }));
    startBtn.classList.add('stop');
    startBtn.setAttribute('aria-label', 'Stop');
    practiceStart = performance.now();
    collector = new ChordCollector();
    idx = 0;
    clean = 0;
    firstTry = true;
    if (mode === 'wachten') {
      display(0);
      setFb('', 'Speel het akkoord.');
    } else if (mode === 'tempo') {
      const spb = 60 / (Number(bpm.value) || 90);
      const per = Number(beats.value) || 4;
      seq = chords.map((c, i) => ({ chord: tr(c.chord), time: i * per * spb }));
      scorer = new ChordScorer(seq, { from: 0 });
      const countIn = 4 * spb;
      tempoClock.pause();
      tempoClock.base = -countIn - 0.15; // negatieve tijd = aftellen
      tempoClock.play();
      const t0 = perfToAudioTime(performance.now()) + countIn + 0.15; // audio-tijd van het eerste akkoord
      const items = [];
      for (let k = 0; k < 4; k++) items.push({ time: t0 - (4 - k) * spb, fn: (t) => click(t, k === 0) });
      const total = seq.length * per;
      if (metro.checked) for (let b = 0; b < total; b++) items.push({ time: t0 + b * spb, fn: (t) => click(t, b % per === 0) });
      if (backing.checked) seq.forEach((c) => items.push({ time: t0 + c.time, fn: (t) => sound(c.chord, t, per * spb * 0.9) }));
      scheduler.start(items.sort((a, b) => a.time - b.time));
      tempoEnd = seq.length * per * spb;
      setFb('', 'Tel mee… en speel elk akkoord zodra het verschijnt!');
    } else {
      seq = chords.filter((c) => c.time != null).map((c) => ({ chord: tr(c.chord), time: c.time }));
      if (!seq.length) return stop(false);
      scorer = new ChordScorer(seq, { from: Math.max(0, pt()) });
      tempoEnd = Infinity;
      setFb('', 'Speel mee met de muziek!');
    }
    if (mode !== 'wachten') loop();
  }
  let tempoEnd = Infinity;

  function stop(showResult) {
    running = false;
    startBtn.replaceChildren(icon('play', { size: 34 }));
    startBtn.classList.remove('stop');
    startBtn.setAttribute('aria-label', 'Start');
    scheduler.stop();
    cancelAnimationFrame(raf);
    if (mode === 'tempo') tempoClock.pause();
    const secs = (performance.now() - practiceStart) / 1000;
    if (secs > 5) addPracticeSeconds(secs);
    if (showResult) result();
  }

  function loop() {
    const t = pt();
    if (mode === 'opname') posOut.textContent = formatTime(Math.max(0, t));
    if (t < 0) {
      curName.textContent = String(Math.ceil(-t / (60 / (Number(bpm.value) || 90))));
      curNotes.textContent = 'aftellen…';
      nextName.textContent = seq[0]?.chord || '–';
      lastShown = null;
    } else {
      const i = chordIndexAt(seq, t);
      if (i !== lastShown) display(i);
      const cur = seq[i];
      const next = seq[i + 1];
      const end = next ? next.time : mode === 'tempo' ? tempoEnd : cur ? cur.time + 2 : 1;
      bar.firstChild.style.width = cur ? `${Math.min(100, ((t - cur.time) / Math.max(0.1, end - cur.time)) * 100)}%` : '0%';
      const r = scorer.result(t);
      scoreOut.textContent = r.total ? `${r.hit}/${r.total} goed` : '';
      if (t >= tempoEnd) return stop(true);
    }
    raf = requestAnimationFrame(loop);
  }

  function display(i) {
    lastShown = i;
    const cur = seq[i];
    const next = seq[i + 1];
    curName.textContent = cur ? cur.chord : seq[0] ? '…' : '–';
    nextName.textContent = next ? next.chord : cur ? '(einde)' : seq[0]?.chord || '–';
    const notes = cur ? voicing(cur.chord) : [];
    curNotes.textContent = notes.map((n) => nm(n.midi, cur.chord)).join(' – ');
    kb.showNext(notes, { showFingers: false });
    strip.replaceChildren(...seq.slice(Math.max(0, i), Math.max(0, i) + 10).map((c, k) => h('span', { class: k === 0 && cur ? 'cur' : '' }, c.chord)));
    bar.firstChild.style.width = '0%';
  }

  function setFb(kind, msg) {
    fb.className = 'feedback' + (kind ? ' fb-' + kind : '');
    fb.querySelector('.fb-symbol').textContent = { ok: '✓', wrong: '✗', early: '…' }[kind] || '♪';
    fb.querySelector('.fb-text').textContent = msg;
  }

  const names = (pcs) => pcs.map((p) => nm(60 + p)).join(', ');
  const offNote = hub.on('noteon', ({ midi }) => {
    if (!running || tabs.value !== 'oefenen') return;
    const now = performance.now() / 1000;
    // het akkoord dat nu (of zo meteen) verwacht wordt
    const ti = mode === 'wachten' ? idx : Math.max(0, chordIndexAt(seq, pt()));
    const wanted = new Set([seq[ti], seq[ti + 1]].filter(Boolean).flatMap((c) => [...(chordPitchClasses(c.chord)?.all || [])]));
    const midis = collector.add(midi, now, [...hub.held], mode === 'wachten' ? new Set(chordPitchClasses(seq[idx]?.chord || 'C')?.all) : wanted);
    if (!midis) return; // naklinker van het vorige (goede) akkoord
    if (mode === 'wachten') {
      const cur = seq[idx];
      if (!cur) return;
      const m = collector.match(cur.chord, midis, [...hub.held]);
      if (m.ok) {
        if (firstTry) clean++;
        kb.flash(midi, 'ok');
        setFb('ok', `Goed: ${cur.chord}`);
        idx++;
        firstTry = true;
        collector.success(m.midis, now);
        if (idx >= seq.length) return stop(true);
        display(idx);
      } else if (m.extra.length) {
        firstTry = false;
        kb.flash(midi, 'wrong');
        setFb('wrong', `Niet in ${cur.chord}: ${names(m.extra)}`);
      } else if (new Set([...midis].map((x) => x % 12)).size >= 2) setFb('early', `Bijna! Nog nodig: ${names(m.missing)}`);
      return;
    }
    const t = pt();
    let hit = null;
    let used = midis;
    for (const cand of collector.candidates(midis, [...hub.held])) {
      hit = scorer.tryHit(cand, t);
      if (hit) { used = cand; break; }
    }
    if (hit) {
      kb.flash(midi, 'ok');
      setFb('ok', `Goed: ${seq[hit.index].chord}${Math.abs(hit.dt) > 0.6 ? (hit.dt > 0 ? ' (iets laat)' : ' (iets vroeg)') : ''}`);
      collector.success(used, now);
      return;
    }
    const i = chordIndexAt(seq, t);
    const cur = seq[i];
    if (!cur) return;
    const m = collector.match(cur.chord, midis, [...hub.held]);
    if (scorer.hits.has(i) || (m.ok && i < scorer.first)) return setFb('ok', `${cur.chord} ✓`);
    if (m.extra.length) {
      kb.flash(midi, 'wrong');
      setFb('wrong', `Niet in ${cur.chord}: ${names(m.extra)}`);
    } else if (new Set([...midis].map((x) => x % 12)).size >= 2) setFb('early', `Bijna! Nog nodig: ${names(m.missing)}`);
  });
  cleanups.push(offNote);

  async function result() {
    let r;
    if (mode === 'wachten') {
      const done = Math.min(idx, seq.length);
      const accuracy = done ? Math.round((clean / done) * 100) : 0;
      r = { total: done, hit: clean, accuracy, timing: null, score: accuracy, stars: accuracy >= 90 ? 3 : accuracy >= 75 ? 2 : accuracy >= 55 ? 1 : 0, missed: [] };
    } else r = scorer.result(pt());
    if (r.total >= 4) await saveResult({ itemId: 'ak:' + sheet.id, kind: 'chords', score: r.score, stars: r.stars, accuracy: r.accuracy, timing: r.timing, mode, tempoPct: 100, hands: hand, seconds: Math.round((performance.now() - practiceStart) / 1000) });
    const dlg = h('dialog.results',
      h('h2', r.stars >= 2 ? 'Lekker gespeeld!' : 'Goed bezig!'),
      stars(r.stars),
      h('div.res-grid',
        h('div', h('strong', `${r.hit}/${r.total}`), h('span', mode === 'wachten' ? 'in één keer goed' : 'akkoorden goed')),
        h('div', h('strong', `${r.accuracy}%`), h('span', 'nauwkeurig')),
        r.timing !== null ? h('div', h('strong', `${r.timing}%`), h('span', 'timing')) : null),
      !r.total ? h('p', 'Er zijn nog geen akkoorden voorbijgekomen.')
        : r.missed.length ? h('p', 'Oefen deze akkoorden nog even los: ', h('strong', [...new Set(r.missed)].slice(0, 6).join(', '))) : null,
      h('p.hint', mode === 'wachten' ? (r.accuracy >= 90 ? 'Tip: probeer nu "Op tempo" met een rustig tempo.' : 'Tip: tik bij "Lezen" op een akkoord om te zien welke toetsen erbij horen.')
        : r.timing < 70 ? 'Tip: kijk naar "Straks" en zet je hand alvast klaar voordat de wissel komt.' : 'Tip: zet het tempo iets hoger, of speel met allebei je handen (L R).'),
      h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => dlg.close() }, 'Sluiten')));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }

  // ---------- tab: bewerken ----------
  const eTitle = h('input', { type: 'text', value: sheet.title, 'aria-label': 'Titel', oninput: () => { sheet.title = eTitle.value; persist(); } });
  const eArtist = h('input', { type: 'text', value: sheet.artist || '', 'aria-label': 'Artiest', oninput: () => { sheet.artist = eArtist.value; persist(); } });
  const text = h('textarea.notes.sheet-text', { rows: 12, spellcheck: false, value: sheet.text });
  const errorsOut = h('div.validation', { role: 'status', 'aria-live': 'polite' });
  function reparse() {
    const r = parseChordSheet(text.value);
    chords = r.chords;
    sheet.text = text.value;
    const times = chords.filter((c) => c.time != null).map((c) => c.time);
    const msgs = [...r.errors];
    if (!times.every((t, i) => i === 0 || t >= times[i - 1])) msgs.push('De tijden lopen niet steeds op. Tik opnieuw of verbeter de tijden.');
    errorsOut.className = 'validation ' + (msgs.length ? 'bad' : chords.length ? 'ok' : '');
    errorsOut.replaceChildren(msgs.length ? h('ul', msgs.slice(0, 5).map((m) => h('li', m)))
      : chords.length ? `✓ ${chords.length} akkoorden${times.length ? `, ${times.length} met een tijd` : ''}.` : 'Nog geen akkoorden.');
    tapLabel();
    persist();
    renderSummary();
    if (!sheet.raw) renderSheet();
  }
  text.addEventListener('input', reparse);
  const raw = h('textarea.notes', { rows: 10, spellcheck: false, value: sheet.raw || '', oninput: () => { sheet.raw = raw.value; persist(); renderSheet(); } });

  // meetikken met de klok
  const tapClock = clock;
  let tapIndex = -1;
  const tapBtn = h('button.btn.primary.big.tap-btn', { type: 'button', onclick: () => tap() }, 'Tik');
  const tapInfo = h('p.tap-info', { 'aria-live': 'polite' });
  function tapLabel() {
    if (tapIndex < 0 || tapIndex > chords.length) tapIndex = chords.findIndex((c) => c.time == null);
    const c = chords[tapIndex];
    tapBtn.disabled = !c;
    tapBtn.textContent = c ? `Tik bij: ${c.chord}` : 'Alle akkoorden hebben een tijd';
    tapInfo.textContent = c ? `Akkoord ${tapIndex + 1} van ${chords.length}. Druk op "Klok start", start tegelijk de opname, en tik (of druk op de spatiebalk) als ${c.chord} begint.` : '';
  }
  function tap() {
    if (!chords[tapIndex]) return;
    if (!tapClock.isPlaying) return toast('Start eerst de klok (en tegelijk de opname).', 'error');
    chords[tapIndex].time = Math.max(0, tapClock.position() - tapClock.offset);
    tapIndex = chords.findIndex((c, i) => i > tapIndex && c.time == null);
    if (tapIndex === -1) tapIndex = chords.length;
    text.value = formatChordSheet(chords);
    reparse();
  }
  const onKey = (e) => {
    if (e.code === 'Space' && tabs.value === 'bewerken' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      tap();
    }
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));
  const tapPos = h('output.pos', '0:00.0');
  const tapTimer = setInterval(() => {
    tapPos.textContent = formatTime(Math.max(0, tapClock.position() - tapClock.offset));
    if (mode === 'opname') posOut.textContent = tapPos.textContent;
  }, 100);
  cleanups.push(() => clearInterval(tapTimer));

  const editTab = h('div.tab-panel',
    h('div.form-grid', h('label.field', h('span.f-label', 'Titel'), eTitle), h('label.field', h('span.f-label', 'Artiest'), eArtist)),
    h('label.field', h('span.f-label', 'Akkoordvolgorde om te oefenen'), text,
      h('small', 'Eén of meer akkoorden per regel; "x4" achter een regel herhaalt die. Kopjes zoals [Refrein] mogen. Met een tijd ervoor ("1:02.5 Am") loopt het mee met een opname.')),
    errorsOut,
    sheet.raw ? h('button.btn', { type: 'button', onclick: () => {
      if (!confirm('Akkoordvolgorde opnieuw uit het originele blad halen? Je wijzigingen en tijden in de volgorde gaan verloren.')) return;
      text.value = extractProgression(sheet.raw).text;
      reparse();
    } }, 'Opnieuw uit het blad halen') : null,
    h('h3', 'Tijden intikken (voor "Met opname")'),
    h('div.tap-box',
      h('div.control-row',
        h('button.btn', { type: 'button', onclick: () => (tapClock.isPlaying ? tapClock.pause() : tapClock.play()) }, '⏯ Klok start/pauze'),
        h('button.btn', { type: 'button', onclick: () => tapClock.seek(0) }, '⏮ Klok naar 0'),
        tapPos),
      tapBtn, tapInfo,
      h('div.control-row',
        h('button.btn', { type: 'button', onclick: () => {
          let before = -1;
          chords.forEach((c, i) => { if (c.time != null) before = i; });
          if (before < 0) return;
          chords[before].time = null;
          tapIndex = before;
          text.value = formatChordSheet(chords);
          reparse();
        } }, '↶ Laatste tik terug'),
        h('button.btn', { type: 'button', onclick: () => {
          if (!confirm('Alle tijden wissen?')) return;
          chords.forEach((c) => (c.time = null));
          tapIndex = 0;
          text.value = formatChordSheet(chords);
          reparse();
        } }, 'Tijden wissen'))),
    h('details', h('summary', 'Origineel blad (met songtekst) bewerken'), raw));

  // ---------- tabs ----------
  const tabs = { value: 'blad' };
  const panels = { blad: sheetTab, oefenen: practiceTab, bewerken: editTab };
  const tabBar = h('div.segmented.tabs-switch', { role: 'tablist' });
  const showTab = (v) => {
    if (running) stop(false);
    tabs.value = v;
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== v;
    tabBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
    if (v === 'oefenen') resetPractice();
    if (v === 'blad') renderSheet();
  };
  [['blad', 'book', 'Lezen'], ['oefenen', 'piano', 'Oefenen'], ['bewerken', 'edit', 'Aanpassen']].forEach(([v, ic, l]) => tabBar.append(h('button', { type: 'button', role: 'tab', 'data-v': v, onclick: () => showTab(v) }, icon(ic, { size: 20 }), l)));

  const view = h('div.view.sheet',
    header, toolbar, tabBar, sheetTab, practiceTab, editTab, kb.el);
  view.destroy = () => {
    if (running) stop(false);
    clearTimeout(saveTimer);
    saveSheet(sheet);
    cleanups.forEach((f) => f());
  };
  reparse();
  renderSheet();
  showTab(sheet.text ? 'blad' : 'bewerken');
  return view;
}

function segmented(label, options, value, onChange) {
  const box = h('div.segmented', { role: 'radiogroup', 'aria-label': label });
  options.forEach(([v, l]) => box.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), onclick: (e) => {
    box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
    onChange(v);
  } }, l)));
  return box;
}
