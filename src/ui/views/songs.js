// Liedjesbibliotheek met zoeken en filteren, eigen nummers, en het oefenen van één liedje.
import { h, stars, toast } from '../dom.js';
import { loadSongs, loadSong, loadIndex, isCustomSong, saveCustomSong, deleteCustomSong, getCustomSongRaw } from '../../core/content.js';
import { bestByItem } from '../../core/profiles.js';
import { setDraft } from './songEditor.js';
import { normalize, matchSong } from '../../core/search.js';

const LEVEL_NAMES = { 1: 'Starter', 2: 'Gevorderd', 3: 'Uitdaging' };
// Zoek- en filterkeuze blijft bewaard zolang de app open is.
const filters = { q: '', category: '', level: 0 };

export async function songsView() {
  const [songs, best, index] = await Promise.all([loadSongs(), bestByItem(), loadIndex()]);
  const categories = index.categories || [];

  const search = h('input.search', {
    type: 'search', placeholder: 'Zoek op titel, componist of genre…', 'aria-label': 'Zoek een liedje', value: filters.q, autocomplete: 'off',
    oninput: () => { filters.q = search.value; render(); },
  });
  const chipBox = h('div.chips', { role: 'radiogroup', 'aria-label': 'Categorie' });
  const chip = (id, label) => h('button.chip', {
    type: 'button', role: 'radio', 'aria-checked': String(filters.category === id),
    onclick: () => {
      filters.category = id;
      chipBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id)));
      render();
    },
    'data-id': id,
  }, label);
  chipBox.append(chip('', 'Alles'), ...categories.map((c) => chip(c.id, `${c.icon || ''} ${c.label}`)));
  const levelSel = h('select', { 'aria-label': 'Niveau', onchange: () => { filters.level = Number(levelSel.value); render(); } },
    h('option', { value: 0 }, 'Elk niveau'), [1, 2, 3].map((l) => h('option', { value: l }, `Niveau ${l}: ${LEVEL_NAMES[l]}`)));
  levelSel.value = filters.level;
  const count = h('p.result-count', { role: 'status', 'aria-live': 'polite' });
  const grid = h('div.song-grid');

  // ---- eigen nummer toevoegen ----
  const midiInput = h('input', { type: 'file', accept: '.mid,.midi,audio/midi,audio/x-midi', hidden: true, onchange: () => importMidi(midiInput.files[0]) });
  const jsonInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => importJson(jsonInput.files[0]) });
  const addMenu = h('details.add-menu',
    h('summary.btn.primary', '＋ Eigen nummer'),
    h('div.menu',
      h('button', { type: 'button', onclick: () => midiInput.click() }, h('strong', '🎹 MIDI-bestand importeren'), h('small', 'Een .mid-bestand dat je zelf hebt; de app maakt er noten voor links en rechts van.')),
      h('a', { href: '#/eigen/nieuw' }, h('strong', '✏️ Zelf noten invoeren'), h('small', 'Typ de noten of speel ze in op je keyboard.')),
      h('button', { type: 'button', onclick: () => jsonInput.click() }, h('strong', '📄 Nummerbestand openen'), h('small', 'Een .json-bestand dat iemand met Toetsentuin heeft geëxporteerd.'))),
    midiInput, jsonInput);

  async function importMidi(file) {
    if (!file) return;
    try {
      const { parseMidi } = await import('../../core/midifile.js');
      const midi = parseMidi(await file.arrayBuffer());
      if (!midi.notes.length) throw new Error('Er staan geen noten in dit bestand.');
      setDraft({ midi, fileName: file.name });
      location.hash = '#/eigen/nieuw';
    } catch (err) {
      toast('MIDI-bestand kon niet worden gelezen: ' + err.message, 'error');
    }
    midiInput.value = '';
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.title || !(data.melody || data.levels?.length)) throw new Error('dit is geen Toetsentuin-nummer');
      delete data.id;
      const saved = await saveCustomSong(data);
      toast(`"${saved.title}" toegevoegd aan je eigen nummers.`);
      location.hash = `#/lied/${saved.id}`;
    } catch (err) {
      toast('Bestand kon niet worden geopend: ' + err.message, 'error');
    }
    jsonInput.value = '';
  }

  function card(s) {
    const custom = isCustomSong(s.id);
    return h('article.song-card',
      h('div.song-art', { 'aria-hidden': 'true', style: { '--hue': s.hue ?? 200 } }, s.icon || (custom ? '⭐' : '🎼')),
      h('div.song-info',
        h('h2', s.title),
        h('p.composer', s.composer || (custom ? 'Eigen nummer' : '')),
        h('div.levels', s.levels.map((lv) => h('a.level-pill', { href: `#/lied/${s.id}/${lv.level}` },
          h('span', `${lv.level}. ${lv.label || LEVEL_NAMES[lv.level]}`),
          stars(best[`lied:${s.id}:${lv.level}`]?.stars || 0)))),
        custom ? h('div.card-actions',
          h('a', { href: `#/eigen/${s.id}` }, 'Bewerken'),
          h('button.linklike', { type: 'button', onclick: () => exportSong(s.id) }, 'Exporteren'),
          h('button.linklike.danger', { type: 'button', onclick: async () => {
            if (!confirm(`"${s.title}" verwijderen?`)) return;
            await deleteCustomSong(s.id);
            songs.splice(songs.indexOf(s), 1);
            render();
          } }, 'Verwijderen')) : null));
  }

  function render() {
    const list = songs.filter((s) =>
      (!filters.category || s.category === filters.category)
      && (!filters.level || s.levels.some((l) => l.level === filters.level))
      && matchSong(s, filters.q, categories));
    count.textContent = filters.q || filters.category || filters.level ? `${list.length} van ${songs.length} nummers` : `${songs.length} nummers`;
    if (list.length) {
      grid.replaceChildren(...list.map(card));
      return;
    }
    grid.replaceChildren(h('div.card.empty',
      h('h2', filters.q ? `Niets gevonden voor "${filters.q}"` : 'Geen nummers in deze selectie'),
      h('p', 'In de bibliotheek staan alleen nummers die vrij zijn van auteursrecht. Popsongs, zoals filmmuziek of hits van de radio, kunnen we daarom niet meeleveren.'),
      h('p', 'Je kunt elk nummer wel zelf toevoegen voor eigen gebruik: importeer een MIDI-bestand, of voer de noten in door ze op je keyboard te spelen. Het nummer blijft alleen op dit apparaat.'),
      h('div.actions',
        h('button.btn.primary', { type: 'button', onclick: () => midiInput.click() }, '🎹 MIDI importeren'),
        h('a.btn', { href: '#/eigen/nieuw', onclick: () => setDraft({ title: titleCase(filters.q) }) }, '✏️ Zelf invoeren'))));
  }
  render();

  return h('div.view.songs',
    h('div.songs-head',
      h('div', h('h1', 'Liedjes'), h('p.lead', 'Muziek uit het publieke domein in eigen bewerkingen, plus je eigen nummers.')),
      addMenu),
    h('div.search-bar', h('span.search-icon', { 'aria-hidden': 'true' }, '🔍'), search, levelSel),
    chipBox, count, grid);
}

function titleCase(s) {
  return s.trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

async function exportSong(id) {
  const raw = await getCustomSongRaw(id);
  const { id: _id, updatedAt: _u, ...data } = raw;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${normalize(raw.title).replace(/ /g, '-') || 'nummer'}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function songView(id, levelStr) {
  // De speler (met VexFlow en het muziekfont) wordt pas geladen als je een stuk opent.
  const [song, { createPlayer }] = await Promise.all([loadSong(id), import('../player.js')]);
  if (!song.levels?.length) throw new Error('Dit nummer heeft nog geen noten.');
  const level = Number(levelStr) || song.levels[0].level;
  const lv = song.levels.find((l) => l.level === level) || song.levels[0];
  const player = createPlayer({
    itemId: `lied:${id}:${lv.level}`,
    kind: 'song',
    def: { title: song.title, ...lv },
    mode: 'wait',
    stars: song.stars,
  });
  const custom = isCustomSong(id);
  const view = h('div.view.song',
    h('nav.crumbs', h('a', { href: '#/liedjes' }, '← Liedjes'), custom ? h('a', { href: `#/eigen/${id}` }, '✏️ Bewerken') : null),
    h('header.song-head',
      h('div', h('h1', song.title), h('p.composer', [song.composer, lv.description].filter(Boolean).join(' · '))),
      h('nav.level-tabs', { 'aria-label': 'Niveau' }, song.levels.map((l) => h('a', {
        href: `#/lied/${id}/${l.level}`,
        'aria-current': l.level === lv.level ? 'page' : null,
      }, `${l.level}. ${l.label || LEVEL_NAMES[l.level]}`)))),
    song.about ? h('details.about', h('summary', 'Over dit stuk'), h('p', song.about)) : null,
    player.el);
  view.destroy = () => player.destroy();
  return view;
}
