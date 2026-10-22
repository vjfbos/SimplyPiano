// Liedjesbibliotheek en het oefenen van één liedje op een gekozen niveau.
import { h, stars } from '../dom.js';
import { loadSongs, loadSong } from '../../core/content.js';
import { bestByItem } from '../../core/profiles.js';

const LEVEL_NAMES = { 1: 'Starter', 2: 'Gevorderd', 3: 'Uitdaging' };

export async function songsView() {
  const [songs, best] = await Promise.all([loadSongs(), bestByItem()]);
  return h('div.view.songs',
    h('h1', 'Liedjes'),
    h('p.lead', 'Bekende melodieën uit het publieke domein, in eigen bewerkingen. Kies een niveau dat bij je past.'),
    h('div.song-grid', songs.map((s) => h('article.song-card',
      h('div.song-art', { 'aria-hidden': 'true', style: { '--hue': s.hue ?? 200 } }, s.icon || '🎼'),
      h('div.song-info',
        h('h2', s.title),
        h('p.composer', s.composer),
        h('div.levels', s.levels.map((lv) => h('a.level-pill', { href: `#/lied/${s.id}/${lv.level}` },
          h('span', `${lv.level}. ${lv.label || LEVEL_NAMES[lv.level]}`),
          stars(best[`lied:${s.id}:${lv.level}`]?.stars || 0)))))))));
}

export async function songView(id, levelStr) {
  // De speler (met VexFlow en het muziekfont) wordt pas geladen als je een stuk opent.
  const [song, { createPlayer }] = await Promise.all([loadSong(id), import('../player.js')]);
  const level = Number(levelStr) || song.levels[0].level;
  const lv = song.levels.find((l) => l.level === level) || song.levels[0];
  const player = createPlayer({
    itemId: `lied:${id}:${lv.level}`,
    kind: 'song',
    def: { title: song.title, ...lv },
    mode: 'wait',
    stars: song.stars,
  });
  const view = h('div.view.song',
    h('nav.crumbs', h('a', { href: '#/liedjes' }, '← Liedjes')),
    h('header.song-head',
      h('div', h('h1', song.title), h('p.composer', `${song.composer} · ${lv.description || ''}`)),
      h('nav.level-tabs', { 'aria-label': 'Niveau' }, song.levels.map((l) => h('a', {
        href: `#/lied/${id}/${l.level}`,
        'aria-current': l.level === lv.level ? 'page' : null,
      }, `${l.level}. ${l.label || LEVEL_NAMES[l.level]}`)))),
    song.about ? h('details.about', h('summary', 'Over dit stuk'), h('p', song.about)) : null,
    player.el);
  view.destroy = () => player.destroy();
  return view;
}
