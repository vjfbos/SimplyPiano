// Meespelen: verbinden met Spotify, een nummer kiezen en de akkoorden oefenen terwijl het nummer speelt.
import { h, toast, stars } from '../dom.js';
import { getClientId, setClientId, redirectUri, login, logout, isLoggedIn } from '../../spotify/auth.js';
import { currentlyPlaying, searchTracks, play, pause, seek } from '../../spotify/api.js';
import { SpotifyClock, ManualClock } from '../../spotify/clock.js';
import { listSheets, getSheet, saveSheet, deleteSheet, sheetIdForTrack } from '../../core/sheets.js';
import { parseChordSheet, formatChordSheet, formatTime, isTimed, chordIndexAt, matchChord, ChordScorer, chordSummary } from '../../core/chordsheet.js';
import { parseChord } from '../../core/chords.js';
import { voiceChord } from '../../core/arrange.js';
import { noteLabel } from '../../core/notes.js';
import { hub } from '../../input/hub.js';
import { currentProfile, saveResult, addPracticeSeconds } from '../../core/profiles.js';

// ======================================================================= overzicht

export async function playalongView() {
  const sheets = await listSheets();
  const loggedIn = isLoggedIn();
  const clientId = getClientId();
  const view = h('div.view.playalong');
  const cleanups = [];
  view.destroy = () => cleanups.forEach((f) => f());

  const intro = h('p.lead', 'Speel de akkoorden mee met je favoriete muziek. De app volgt waar Spotify is in het nummer en laat zien welk akkoord je nu moet spelen.');

  // ---- verbinding ----
  let connection;
  if (!clientId) {
    const input = h('input', { type: 'text', placeholder: 'Client ID (32 tekens)', 'aria-label': 'Spotify Client ID', autocomplete: 'off', spellcheck: false });
    const uri = redirectUri();
    connection = h('section.card.spotify-setup',
      h('h2', 'Spotify koppelen (eenmalig)'),
      h('p', 'Spotify vraagt elke app om zich aan te melden. Dat doe je één keer zelf, het is gratis:'),
      h('ol',
        h('li', 'Ga naar ', h('a', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noopener' }, 'developer.spotify.com/dashboard'), ' en log in met je Spotify-account.'),
        h('li', 'Kies ', h('strong', 'Create app'), '. Naam en beschrijving mag je zelf kiezen; vink ', h('strong', 'Web API'), ' aan.'),
        h('li', 'Vul bij ', h('strong', 'Redirect URIs'), ' precies dit adres in: ', h('code.copy', uri), ' ',
          h('button.linklike', { type: 'button', onclick: () => navigator.clipboard?.writeText(uri).then(() => toast('Gekopieerd')) }, 'kopiëren')),
        h('li', 'Sla op, open de app-instellingen en kopieer de ', h('strong', 'Client ID'), ' hieronder.')),
      h('div.control-row', input, h('button.btn.primary', { type: 'button', onclick: () => {
        if (!/^[0-9a-f]{32}$/i.test(input.value.trim())) return toast('Dat lijkt geen geldige Client ID (32 tekens, 0-9 en a-f).', 'error');
        setClientId(input.value);
        location.hash = '#/meespelen?' + Date.now();
      } }, 'Opslaan')),
      h('p.hint', 'Een Client ID is geen wachtwoord; de app bewaart hem alleen in deze browser. Inloggen werkt alleen via https (bijv. Netlify) of http://127.0.0.1, niet via "localhost".'));
  } else if (!loggedIn) {
    connection = h('section.card',
      h('h2', 'Verbinden'),
      h('p', 'Log in bij Spotify. De app vraagt alleen toestemming om te zien wat er speelt en om het afspelen te bedienen.'),
      h('div.actions',
        h('button.btn.spotify', { type: 'button', onclick: () => login('#/meespelen').catch((e) => toast(e.message, 'error')) }, 'Verbinden met Spotify'),
        h('button.linklike', { type: 'button', onclick: () => { setClientId(''); location.hash = '#/meespelen?' + Date.now(); } }, 'Andere Client ID')));
  } else {
    // ---- nu aan het spelen ----
    const now = h('div.now-playing', h('p.hint', 'Even kijken wat er speelt…'));
    const clock = new SpotifyClock({ interval: 3000 });
    const renderNow = () => {
      const t = clock.track;
      if (clock.error) {
        now.replaceChildren(h('p.bad-text', clock.error.message), h('button.btn', { type: 'button', onclick: () => { logout(); location.hash = '#/meespelen?' + Date.now(); } }, 'Opnieuw verbinden'));
        return;
      }
      if (!t) {
        now.replaceChildren(h('p', 'Er speelt nu niets op Spotify. Start een nummer in de Spotify-app (op je telefoon, computer of speaker), of zoek hieronder een nummer.'));
        return;
      }
      const sid = sheetIdForTrack(t.id);
      const has = sheets.some((s) => s.id === sid);
      now.replaceChildren(trackCard(t, clock.isPlaying ? '▶ Speelt nu' : '⏸ Gepauzeerd'),
        h('a.btn.primary', { href: `#/meespelen/${sid}`, onclick: (e) => openSheet(e, t) }, has ? 'Akkoorden oefenen' : 'Akkoorden toevoegen'));
    };
    clock.addEventListener('track', renderNow);
    clock.addEventListener('update', renderNow);
    clock.addEventListener('error', renderNow);
    clock.start();
    cleanups.push(() => clock.stop());

    // ---- zoeken ----
    const results = h('div.track-results');
    const q = h('input.search', { type: 'search', placeholder: 'Zoek een nummer op Spotify…', 'aria-label': 'Zoek op Spotify' });
    let timer;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      if (q.value.trim().length < 2) return results.replaceChildren();
      timer = setTimeout(async () => {
        try {
          const tracks = await searchTracks(q.value.trim());
          results.replaceChildren(...(tracks.length ? tracks.map((t) => h('div.track-row', trackCard(t),
            h('div.track-actions',
              h('button.btn', { type: 'button', onclick: async () => {
                try {
                  await play(t.uri);
                  toast(`"${t.name}" wordt afgespeeld.`);
                } catch (e) {
                  toast(e.status === 404 ? 'Geen actief Spotify-apparaat. Open eerst Spotify ergens en probeer opnieuw.' : e.message, 'error');
                }
              } }, '▶ Afspelen'),
              h('a.btn', { href: `#/meespelen/${sheetIdForTrack(t.id)}`, onclick: (e) => openSheet(e, t) }, 'Akkoorden')))) : [h('p.hint', 'Niets gevonden.')]));
        } catch (e) {
          results.replaceChildren(h('p.bad-text', e.message));
        }
      }, 350);
    });
    connection = [
      h('section.card', h('h2', 'Nu op Spotify'), now),
      h('section.card', h('h2', 'Nummer zoeken'), h('div.search-bar', h('span.search-icon', { 'aria-hidden': 'true' }, '🔍'), q), results,
        h('p.hint', 'Afspelen vanuit de app werkt met Spotify Premium. Zonder Premium start je het nummer zelf in Spotify; de app volgt dan gewoon mee.')),
      h('p.hint', h('button.linklike', { type: 'button', onclick: () => { logout(); location.hash = '#/meespelen?' + Date.now(); } }, 'Verbinding met Spotify verbreken')),
    ];
  }

  // ---- opgeslagen bladen ----
  const list = h('section.card',
    h('h2', 'Mijn akkoordenbladen'),
    sheets.length ? h('ul.sheet-list', sheets.map((s) => h('li',
      h('a', { href: `#/meespelen/${s.id}` }, s.image ? h('img', { src: s.image, alt: '', width: 40, height: 40 }) : h('span.sheet-icon', '🎸'),
        h('span', h('strong', s.title), h('small', [s.artists, s.source === 'spotify' ? 'Spotify' : 'eigen klok'].filter(Boolean).join(' · ')))),
      h('button.icon-btn.danger', { type: 'button', 'aria-label': `Verwijder ${s.title}`, onclick: async (e) => {
        if (!confirm(`Akkoordenblad "${s.title}" verwijderen?`)) return;
        await deleteSheet(s.id);
        e.target.closest('li').remove();
      } }, '🗑')))) : h('p.hint', 'Nog geen bladen. Kies een nummer en zet de akkoorden erin.'),
    h('button.btn', { type: 'button', onclick: async () => {
      const title = prompt('Naam van het nummer (je oefent met een eigen klok, bijv. met een cd of YouTube):');
      if (!title) return;
      const s = await saveSheet({ id: 'hand-' + Date.now().toString(36), source: 'manual', title: title.trim(), text: '' });
      location.hash = `#/meespelen/${s.id}`;
    } }, '＋ Blad zonder Spotify'));

  view.append(h('h1', '🎧 Meespelen'), intro, ...[connection].flat(), list,
    h('p.hint.legal', 'Spotify levert zelf geen akkoorden, en de voorwaarden van Spotify verbieden het analyseren van de muziek. Daarom zet je de akkoorden er zelf in (bijv. uit een songboek); de app zorgt voor de timing en controleert je spel. Muziekgegevens en hoesjes: Spotify.'));
  return view;
}

/** Blad aanmaken (of bijwerken) en pas daarna openen. */
async function openSheet(e, t) {
  e.preventDefault();
  await ensureSheet(t);
  location.hash = `#/meespelen/${sheetIdForTrack(t.id)}`;
}

async function ensureSheet(t) {
  const id = sheetIdForTrack(t.id);
  const existing = await getSheet(id);
  await saveSheet({ ...(existing || { text: '' }), id, source: 'spotify', trackId: t.id, uri: t.uri, title: t.name, artists: t.artists, image: t.image, url: t.url, durationMs: t.durationMs });
}

function trackCard(t, status) {
  return h('div.track-card',
    t.image ? h('img', { src: t.image, alt: '', width: 56, height: 56 }) : h('span.sheet-icon', '🎵'),
    h('div', h('strong', t.name), h('small', t.artists), status ? h('small.status', status) : null),
    h('a.spotify-link', { href: t.url, target: '_blank', rel: 'noopener', title: 'Openen in Spotify' }, 'Open in Spotify'));
}

// ======================================================================= één blad

export async function sheetView(id) {
  const sheet = await getSheet(id);
  if (!sheet) throw new Error('Dit akkoordenblad bestaat niet (meer).');
  const spotify = sheet.source === 'spotify';
  if (spotify && !isLoggedIn()) {
    return h('div.view', h('h1', sheet.title), h('p', 'Verbind eerst met Spotify om mee te spelen.'), h('a.btn.primary', { href: '#/meespelen' }, 'Naar Meespelen'));
  }
  const settings = currentProfile()?.settings || {};
  const clock = spotify ? new SpotifyClock({ interval: 1500 }) : new ManualClock({ durationSec: sheet.durationMs ? sheet.durationMs / 1000 : Infinity });
  clock.offset = sheet.offset || 0;
  let chords = parseChordSheet(sheet.text).chords;
  const cleanups = [];

  // ---------- bediening van de bron ----------
  const sourceBar = h('div.source-bar');
  const posOut = h('output.pos', '0:00.0');
  const transport = spotify
    ? h('div.control-row',
      h('button.btn', { type: 'button', onclick: () => safe(async () => {
        if (clock.track?.id === sheet.trackId && clock.isPlaying) { await pause(); clock.nudge({ isPlaying: false }); } else if (clock.track?.id === sheet.trackId) { await play(); clock.nudge({ isPlaying: true }); } else await play(sheet.uri);
      }) }, '⏯ Afspelen/pauze'),
      h('button.btn', { type: 'button', onclick: () => safe(async () => { await seek(0); clock.nudge({ progressMs: 0 }); }) }, '⏮ Begin'),
      h('button.btn', { type: 'button', onclick: () => safe(async () => { const p = Math.max(0, clock.position() - clock.offset - 10); await seek(p * 1000); clock.nudge({ progressMs: p * 1000 }); }) }, '−10 s'),
      posOut)
    : h('div.control-row',
      h('button.btn', { type: 'button', onclick: () => (clock.isPlaying ? clock.pause() : clock.play()) }, '⏯ Start/pauze'),
      h('button.btn', { type: 'button', onclick: () => clock.seek(0) }, '⏮ Begin'),
      h('button.btn', { type: 'button', onclick: () => clock.seek(Math.max(0, clock.position() - clock.offset - 10)) }, '−10 s'),
      posOut,
      h('span.hint', 'Start je muziek en deze klok tegelijk.'));
  function renderSource() {
    if (!spotify) return;
    if (clock.error) return sourceBar.replaceChildren(h('p.bad-text', clock.error.message));
    if (clock.track?.id !== sheet.trackId) {
      sourceBar.replaceChildren(h('p.warn-text', clock.track ? `Spotify speelt nu "${clock.track.name}". Start dit nummer om mee te spelen.` : 'Start dit nummer in Spotify om mee te spelen.'),
        h('a.spotify-link', { href: sheet.url, target: '_blank', rel: 'noopener' }, 'Open in Spotify'));
    } else sourceBar.replaceChildren(h('p.ok-text', clock.isPlaying ? '▶ Gekoppeld: de akkoorden lopen mee met Spotify.' : '⏸ Gekoppeld, Spotify staat op pauze.'));
  }
  clock.addEventListener('update', renderSource);
  clock.addEventListener('error', renderSource);
  clock.start();
  cleanups.push(() => clock.stop());
  const synced = () => !spotify || clock.track?.id === sheet.trackId;

  // ---------- tab: akkoorden invoeren / meetikken ----------
  const text = h('textarea.notes.sheet-text', { rows: 12, spellcheck: false, value: chords.some((c) => c.time != null) ? formatChordSheet(chords) : sheet.text,
    placeholder: '[Couplet]\nAm F C G x2\n\n[Refrein]\nF G Am Am\n\n# of met tijden:\n0:12.0 Am\n0:14.3 F' });
  const errorsOut = h('div.validation', { role: 'status', 'aria-live': 'polite' });
  const summary = h('p.hint');
  const offset = h('input', { type: 'range', min: -1.5, max: 1.5, step: 0.1, value: clock.offset, 'aria-label': 'Akkoorden eerder of later' });
  const offsetOut = h('output', `${clock.offset.toFixed(1)} s`);
  offset.addEventListener('input', () => {
    clock.offset = Number(offset.value);
    offsetOut.textContent = `${clock.offset > 0 ? '+' : ''}${clock.offset.toFixed(1)} s`;
    persist();
  });
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSheet({ ...sheet, text: text.value, offset: clock.offset }), 400);
  }
  function reparse() {
    const r = parseChordSheet(text.value);
    chords = r.chords;
    const times = chords.filter((c) => c.time != null).map((c) => c.time);
    const sorted = times.every((t, i) => i === 0 || t >= times[i - 1]);
    const msgs = [...r.errors];
    if (!sorted) msgs.push('De tijden lopen niet steeds op. Tik opnieuw of verbeter de tijden.');
    errorsOut.className = 'validation ' + (msgs.length ? 'bad' : chords.length ? 'ok' : '');
    errorsOut.replaceChildren(msgs.length ? h('ul', msgs.slice(0, 5).map((m) => h('li', m)))
      : chords.length ? (isTimed(chords) ? `✓ ${chords.length} akkoorden met tijden: klaar om mee te spelen.` : `${chords.length} akkoorden, ${chords.filter((c) => c.time == null).length} nog zonder tijd. Tik ze in tijdens het afspelen.`)
        : 'Nog geen akkoorden.');
    summary.textContent = chords.length ? 'Akkoorden in dit nummer: ' + chordSummary(chords).map((c) => `${c.chord} (${c.n}×)`).join(', ') : '';
    tapLabel();
    persist();
  }
  text.addEventListener('input', reparse);

  // meetikken
  let tapIndex = -1;
  const tapBtn = h('button.btn.primary.big.tap-btn', { type: 'button', onclick: () => tap() }, 'Tik');
  const tapInfo = h('p.tap-info', { 'aria-live': 'polite' });
  function tapLabel() {
    if (tapIndex < 0) tapIndex = chords.findIndex((c) => c.time == null);
    const c = chords[tapIndex];
    tapBtn.disabled = !c;
    tapBtn.textContent = c ? `Tik bij: ${c.chord}` : 'Alle akkoorden hebben een tijd';
    tapInfo.textContent = c ? `Akkoord ${tapIndex + 1} van ${chords.length}. Tik (of druk op de spatiebalk) precies op het moment dat ${c.chord} begint.` : '';
  }
  function tap() {
    if (!chords[tapIndex]) return;
    if (!synced()) return toast('Start eerst dit nummer in Spotify.', 'error');
    chords[tapIndex].time = Math.max(0, clock.position() - clock.offset);
    tapIndex = chords.findIndex((c, i) => i > tapIndex && c.time == null);
    if (tapIndex === -1) tapIndex = chords.length;
    text.value = formatChordSheet(chords);
    reparse();
  }
  const onKey = (e) => {
    if (e.code === 'Space' && tabs.value === 'invoer' && document.activeElement !== text) {
      e.preventDefault();
      tap();
    }
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));

  const editTab = h('div.tab-panel',
    h('p', 'Typ of plak de akkoorden in de volgorde waarin ze klinken. Herhalingen kun je met ', h('code', 'x4'), ' achter een regel schrijven. Daarna geef je ze een tijd: start het nummer vanaf het begin en tik bij elke akkoordwissel.'),
    text, errorsOut, summary,
    h('div.tap-box', tapBtn, tapInfo,
      h('div.control-row',
        h('button.btn', { type: 'button', onclick: () => {
          const before = chords.findLastIndex?.((c) => c.time != null) ?? -1;
          if (before < 0) return;
          chords[before].time = null;
          tapIndex = before;
          text.value = formatChordSheet(chords);
          reparse();
        } }, '↶ Laatste tik terug'),
        h('button.btn', { type: 'button', onclick: () => {
          if (!confirm('Alle tijden wissen en opnieuw tikken?')) return;
          chords.forEach((c) => (c.time = null));
          tapIndex = 0;
          text.value = formatChordSheet(chords);
          reparse();
        } }, 'Opnieuw tikken'))),
    h('label.range', 'Synchronisatie: akkoorden eerder/later ', offset, offsetOut),
    h('p.hint', 'Komen de akkoorden steeds iets te laat of te vroeg? Schuif dan de synchronisatie. Spotify meldt de positie elke anderhalve seconde; daartussen rekent de app zelf door.'));

  // ---------- tab: meespelen ----------
  const curName = h('div.chord-now', '–');
  const curNotes = h('div.chord-notes');
  const nextName = h('div.chord-next');
  const bar = h('div.chord-bar', h('div.chord-bar-fill'));
  const strip = h('div.chord-strip', { 'aria-hidden': 'true' });
  const fb = h('div.feedback', { role: 'status', 'aria-live': 'polite' }, h('span.fb-symbol', '♪'), h('span.fb-text', 'Start het nummer en speel mee.'));
  const scoreOut = h('div.live-score');
  const handSel = h('div.segmented', { role: 'radiogroup', 'aria-label': 'Ligging' });
  let hand = 'rh';
  [['rh', 'Rechts'], ['lh', 'Links'], ['both', 'Beide']].forEach(([v, l]) => handSel.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === hand), onclick: (e) => {
    hand = v;
    handSel.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
    lastShown = -2;
  } }, l)));
  const { Keyboard } = await import('../keyboard.js');
  const kb = new Keyboard({ low: 36, high: 83, labels: settings.noteLabels || 'letters' });
  cleanups.push(() => kb.destroy());

  let scorer = null;
  let practiceStart = 0;
  const resetScore = () => {
    scorer = new ChordScorer(timedChords(), { from: Math.max(0, clock.position() - clock.offset) });
    practiceStart = performance.now();
  };
  const practiceTab = h('div.tab-panel',
    h('div.chord-display', h('div', h('small', 'Nu'), curName, curNotes), h('div.next-wrap', h('small', 'Straks'), nextName, bar)),
    strip,
    fb,
    h('div.control-row', handSel, scoreOut,
      h('button.btn', { type: 'button', onclick: () => { resetScore(); toast('Score opnieuw gestart vanaf hier.'); } }, 'Score opnieuw'),
      h('button.btn.primary', { type: 'button', onclick: () => showResult() }, 'Klaar: bekijk score')),
    kb.el,
    h('p.hint', 'Speel het akkoord zodra het verschijnt. Omkeringen tellen ook, en met de microfoon mag je de noten kort na elkaar spelen. Zet het geluid van de muziek niet te hard als je de microfoon gebruikt.'));

  // ---------- tabs ----------
  const tabs = { value: isTimed(chords) ? 'spelen' : 'invoer' };
  const tabBar = h('div.segmented.tabs-switch', { role: 'tablist' });
  const showTab = (v) => {
    tabs.value = v;
    editTab.hidden = v !== 'invoer';
    practiceTab.hidden = v !== 'spelen';
    tabBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
    if (v === 'spelen') {
      if (!isTimed(chords)) toast('Nog niet alle akkoorden hebben een tijd: alleen de getikte akkoorden lopen mee.');
      resetScore();
    }
  };
  [['invoer', '✏️ Akkoorden en timing'], ['spelen', '🎹 Meespelen']].forEach(([v, l]) => tabBar.append(h('button', { type: 'button', role: 'tab', 'data-v': v, onclick: () => showTab(v) }, l)));

  // ---------- invoer van de speler ----------
  const recent = [];
  const offNote = hub.on('noteon', ({ midi }) => {
    if (tabs.value !== 'spelen' || !scorer) return;
    const nowMs = performance.now();
    recent.push({ midi, at: nowMs });
    while (recent.length && nowMs - recent[0].at > 1200) recent.shift();
    const midis = new Set([...hub.held, ...recent.map((r) => r.midi)]);
    const t = clock.position() - clock.offset;
    const list = scorer.chords;
    const hit = list.length ? scorer.tryHit(midis, t) : null;
    if (hit) {
      setFb('ok', `Goed: ${list[hit.index].chord}${Math.abs(hit.dt) > 0.6 ? ` (${hit.dt > 0 ? 'iets laat' : 'iets vroeg'})` : ''}`);
      kb.flash(midi, 'ok');
      recent.length = 0;
      return;
    }
    const i = chordIndexAt(list, t);
    const cur = list[i];
    if (!cur) return;
    const m = matchChord(midis, cur.chord);
    if (scorer.hits.has(i) || (m.ok && i < scorer.first)) return setFb('ok', `${cur.chord} ✓`);
    const pcs = new Set([...midis].map((x) => x % 12));
    if (m.extra.length) {
      setFb('wrong', `Niet in ${cur.chord}: ${m.extra.map((p) => noteLabel(60 + p, labelStyle(), false)).join(', ')}`);
      kb.flash(midi, 'wrong');
    } else if (pcs.size >= 2) setFb('early', `Bijna! Nog nodig: ${m.missing.map((p) => noteLabel(60 + p, labelStyle(), false)).join(', ')}`);
  });
  cleanups.push(offNote);
  const labelStyle = () => (settings.noteLabels === 'solfege' ? 'solfege' : 'letters');
  function setFb(kind, msg) {
    fb.className = 'feedback fb-' + kind;
    fb.querySelector('.fb-symbol').textContent = { ok: '✓', wrong: '✗', early: '…' }[kind] || '♪';
    fb.querySelector('.fb-text').textContent = msg;
  }
  const timedChords = () => (isTimed(chords) ? chords : chords.filter((c) => c.time != null));

  // ---------- animatie ----------
  let lastShown = -2;
  let raf;
  let practiceSec = 0;
  let lastTick = performance.now();
  const loop = () => {
    const nowMs = performance.now();
    if (clock.isPlaying && tabs.value === 'spelen' && synced()) practiceSec += (nowMs - lastTick) / 1000;
    lastTick = nowMs;
    const t = clock.position() - clock.offset;
    posOut.textContent = formatTime(Math.max(0, t));
    const list = timedChords();
    if (tabs.value === 'spelen' && list.length) {
      const i = chordIndexAt(list, t);
      const cur = list[i];
      const next = list[i + 1];
      if (i !== lastShown) {
        lastShown = i;
        showChord(cur, next, list, i);
      }
      const span = next && cur ? next.time - cur.time : 1;
      const frac = cur && next ? Math.min(1, (t - cur.time) / span) : 0;
      bar.firstChild.style.width = `${Math.round(frac * 100)}%`;
      if (scorer) {
        const r = scorer.result(t);
        scoreOut.textContent = r.total ? `${r.hit}/${r.total} goed` : '';
      }
      const dur = sheet.durationMs ? sheet.durationMs / 1000 : null;
      if (dur && t > dur - 0.5 && scorer && !shownEnd) {
        shownEnd = true;
        showResult();
      }
    }
    raf = requestAnimationFrame(loop);
  };
  let shownEnd = false;
  raf = requestAnimationFrame(loop);
  cleanups.push(() => cancelAnimationFrame(raf));

  function showChord(cur, next, list, i) {
    curName.textContent = cur ? cur.chord : (list[0] ? `Wacht… (${list[0].chord} begint op ${formatTime(list[0].time)})` : '–');
    nextName.textContent = next ? next.chord : '–';
    const notes = cur ? voicing(cur.chord) : [];
    curNotes.textContent = notes.map((n) => noteLabel(n.midi, labelStyle(), false)).join(' – ');
    kb.showNext(notes, { showFingers: false });
    strip.replaceChildren(...list.slice(Math.max(0, i), Math.max(0, i) + 8).map((c, k) => h('span', { class: k === 0 && cur ? 'cur' : '' }, c.chord)));
  }

  function voicing(symbol) {
    const c = parseChord(symbol);
    if (!c) return [];
    const base = voiceChord(c, null); // rond C3
    const rh = base.map((m) => ({ midi: m + 12, hand: 'rh' }));
    const lhChord = base.map((m) => ({ midi: m, hand: 'lh' }));
    let bass = 36 + c.bassPc;
    if (bass < 40) bass += 12;
    if (hand === 'rh') return rh;
    if (hand === 'lh') return lhChord;
    return [{ midi: bass, hand: 'lh' }, ...rh];
  }

  async function showResult() {
    if (!scorer) return;
    const r = scorer.result(clock.position() - clock.offset);
    if (practiceSec > 5) addPracticeSeconds(practiceSec);
    practiceSec = 0;
    if (r.total >= 4) await saveResult({ itemId: 'mee:' + sheet.id, kind: 'playalong', score: r.score, stars: r.stars, accuracy: r.accuracy, timing: r.timing, mode: 'meespelen', tempoPct: 100, hands: hand, seconds: Math.round((performance.now() - practiceStart) / 1000) });
    const dlg = h('dialog.results',
      h('h2', r.stars >= 2 ? 'Lekker meegespeeld!' : 'Goed bezig!'),
      stars(r.stars),
      h('div.res-grid',
        h('div', h('strong', `${r.hit}/${r.total}`), h('span', 'akkoorden goed')),
        h('div', h('strong', `${r.accuracy}%`), h('span', 'nauwkeurig')),
        h('div', h('strong', `${r.timing}%`), h('span', 'timing'))),
      !r.total ? h('p', 'Er zijn nog geen akkoorden voorbijgekomen sinds je begon. Start het nummer en speel mee.')
        : r.missed.length ? h('p', 'Oefen deze akkoorden nog even los: ', h('strong', [...new Set(r.missed)].slice(0, 6).join(', '))) : h('p', 'Alle akkoorden gehaald!'),
      h('p.hint', r.timing < 70 ? 'Tip: kijk naar "Straks" en zet je hand alvast klaar voordat de wissel komt.' : 'Tip: probeer nu de ligging "Beide" met een basnoot links.'),
      h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => dlg.close() }, 'Sluiten')));
    dlg.addEventListener('close', () => { dlg.remove(); resetScore(); shownEnd = false; });
    document.body.append(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }

  async function safe(fn) {
    try {
      await fn();
    } catch (e) {
      toast(e.status === 404 ? 'Geen actief Spotify-apparaat. Open Spotify ergens en probeer opnieuw.' : e.message, 'error');
    }
  }

  const view = h('div.view.sheet',
    h('nav.crumbs', h('a', { href: '#/meespelen' }, '← Meespelen')),
    h('header.sheet-head',
      sheet.image ? h('img', { src: sheet.image, alt: '', width: 72, height: 72 }) : h('span.sheet-icon.big', '🎸'),
      h('div', h('h1', sheet.title), h('p.composer', sheet.artists || 'Eigen klok'),
        spotify ? h('a.spotify-link', { href: sheet.url, target: '_blank', rel: 'noopener' }, 'Open in Spotify') : null)),
    sourceBar, transport, tabBar, editTab, practiceTab);
  view.destroy = () => {
    clearTimeout(saveTimer);
    saveSheet({ ...sheet, text: text.value, offset: clock.offset });
    if (practiceSec > 5) addPracticeSeconds(practiceSec);
    cleanups.forEach((f) => f());
  };
  reparse();
  showTab(tabs.value);
  renderSource();
  return view;
}
