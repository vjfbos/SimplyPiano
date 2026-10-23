// Liedjesbibliotheek met zoeken en filteren, eigen nummers, en het oefenen van één liedje.
import { h, toast } from '../dom.js';
import { loadSongs, loadSong, loadIndex, isCustomSong, saveCustomSong, deleteCustomSong, getCustomSongRaw } from '../../core/content.js';
import { bestByItem } from '../../core/profiles.js';
import { setDraft } from './songEditor.js';
import { normalize, matchSong } from '../../core/search.js';
import { icon } from '../icons.js';
import { playSwitch } from './playnav.js';

const LEVEL_NAMES = { 1: 'Makkelijk', 2: 'Gemiddeld', 3: 'Moeilijk' };
const levelName = (lv) => LEVEL_NAMES[lv.level] || lv.label;
const miniStars = (n) => h('span.mini-stars', { role: 'img', 'aria-label': `${n} van 3 sterren` }, [1, 2, 3].map((i) => icon('star', { size: 14, cls: i <= n ? 'on' : 'off' })));
const levelDots = (l) => h('span.level-dots', { 'aria-hidden': 'true' }, [1, 2, 3].map((i) => h('i', { class: i <= l ? 'on' : '' })));
// Zoek- en filterkeuze blijft bewaard zolang de app open is.
const filters = { q: '', category: '', level: 0 };

export async function songsView() {
  const [songs, best, index] = await Promise.all([loadSongs(), bestByItem(), loadIndex()]);
  const categories = index.categories || [];

  const search = h('input.search', {
    type: 'search', placeholder: 'Zoek een liedje…', 'aria-label': 'Zoek een liedje', value: filters.q, autocomplete: 'off',
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
  filters.level = 0;
  const count = h('p.result-count', { role: 'status', 'aria-live': 'polite' });
  const grid = h('div.song-grid');

  // ---- eigen nummer toevoegen ----
  const midiInput = h('input', { type: 'file', accept: '.mid,.midi,audio/midi,audio/x-midi', hidden: true, onchange: () => importMidi(midiInput.files[0]) });
  const jsonInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => importJson(jsonInput.files[0]) });
  const addMenu = h('details.add-menu',
    h('summary.btn.ghost', icon('plus'), h('span', 'Eigen liedje')),
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
        h('p.composer', s.composer || (custom ? 'Eigen nummer' : ''))),
      h('div.levels', s.levels.map((lv) => h('a.level-pill', { href: `#/lied/${s.id}/${lv.level}` },
          levelDots(lv.level), h('span', levelName(lv)),
          miniStars(best[`lied:${s.id}:${lv.level}`]?.stars || 0)))),
      custom ? h('div.card-actions',
          h('a', { href: `#/eigen/${s.id}` }, 'Bewerken'),
          h('button.linklike', { type: 'button', onclick: () => exportSong(s.id) }, 'Exporteren'),
          h('button.linklike.danger', { type: 'button', onclick: async () => {
            if (!confirm(`"${s.title}" verwijderen?`)) return;
            await deleteCustomSong(s.id);
            songs.splice(songs.indexOf(s), 1);
            render();
          } }, 'Verwijderen')) : null);
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
      h('span.empty-ico', icon('search', { size: 28 })),
      h('h2', filters.q ? `"${filters.q}" staat er nog niet in` : 'Hier staat nog niets'),
      h('p', 'Popsongs zitten niet in de bibliotheek. Zoek de akkoorden, of voeg het liedje zelf toe.'),
      h('div.actions.center',
        filters.q ? h('a.btn.primary', { href: '#/akkoorden', onclick: () => sessionStorage.setItem('akkoorden:q', filters.q) }, icon('guitar'), 'Zoek de akkoorden') : null,
        h('a.btn.ghost', { href: '#/eigen/nieuw', onclick: () => setDraft({ title: titleCase(filters.q) }) }, icon('plus'), 'Zelf toevoegen'))));
  }
  render();

  return h('div.view.songs',
    playSwitch('liedjes'),
    h('div.songs-head', h('h1', 'Kies een liedje'), addMenu),
    h('div.search-bar', icon('search', { cls: 'search-icon' }), search),
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
    nextHref: song.levels.some((l) => l.level === lv.level + 1) ? `#/lied/${id}/${lv.level + 1}` : '#/liedjes',
  });
  const custom = isCustomSong(id);
  const view = h('div.view.song',
    h('header.song-head',
      h('div', h('h1', song.title), h('p.composer', song.composer,
        custom ? h('a.edit-link', { href: `#/eigen/${id}` }, icon('edit', { size: 16 }), 'Bewerken') : null)),
      h('nav.level-tabs', { 'aria-label': 'Niveau' }, song.levels.map((l) => h('a', {
        href: `#/lied/${id}/${l.level}`,
        'aria-current': l.level === lv.level ? 'page' : null,
      }, levelDots(l.level), levelName(l))))),
    player.el,
    song.about ? h('details.about', h('summary', icon('info', { size: 18 }), 'Over dit liedje'), h('p', song.about)) : null);
  view.destroy = () => player.destroy();
  return view;
}
