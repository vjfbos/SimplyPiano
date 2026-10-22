// Laadt lessen en liedjes uit losse JSON-bestanden in /content, plus eigen nummers uit IndexedDB.
import { expandSong } from './arrange.js';
import { db } from './store.js';

const BASE = import.meta.env.BASE_URL + 'content/';
const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(BASE + path).then((r) => {
    if (!r.ok) throw new Error(`Kan ${path} niet laden (${r.status})`);
    return r.json();
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

export const loadIndex = () => getJSON('index.json');
export const loadLesson = (id) => getJSON(`lessons/${id}.json`);
export const isCustomSong = (id) => id.startsWith('eigen-');

export async function loadSong(id) {
  if (isCustomSong(id)) {
    const song = await db.get('songs', id);
    if (!song) throw new Error('Dit eigen nummer bestaat niet (meer) op dit apparaat.');
    return expandSong(song);
  }
  return expandSong({ ...(await getJSON(`songs/${id}.json`)), id });
}

export async function loadCustomSongs() {
  const all = await db.all('songs');
  return all.sort((a, b) => b.updatedAt - a.updatedAt).map((s) => expandSong({ ...s, category: 'eigen' }));
}

export async function saveCustomSong(song) {
  const id = song.id && isCustomSong(song.id) ? song.id : 'eigen-' + Date.now().toString(36);
  const record = { ...song, id, category: 'eigen', updatedAt: Date.now() };
  await db.put('songs', record);
  return record;
}

export const deleteCustomSong = (id) => db.delete('songs', id);
export const getCustomSongRaw = (id) => db.get('songs', id);

/** Alle lessen in volgorde van het leerpad, met unit-info. */
export async function loadPath() {
  const index = await loadIndex();
  const units = await Promise.all(
    index.units.map(async (u) => ({
      ...u,
      lessons: await Promise.all(u.lessons.map((id) => loadLesson(id).then((l) => ({ ...l, id, unitId: u.id })))),
    })),
  );
  return units;
}

/** Alle liedjes: eerst de bibliotheek, daarna de eigen nummers. */
export async function loadSongs() {
  const index = await loadIndex();
  const builtIn = await Promise.all(index.songs.map((id) => loadSong(id)));
  let custom = [];
  try {
    custom = await loadCustomSongs();
  } catch {
    /* geen IndexedDB beschikbaar */
  }
  return [...builtIn, ...custom];
}
