// Laadt lessen en liedjes uit losse JSON-bestanden in /content.
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
export const loadSong = (id) => getJSON(`songs/${id}.json`);

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

export async function loadSongs() {
  const index = await loadIndex();
  return Promise.all(index.songs.map((id) => loadSong(id).then((s) => ({ ...s, id }))));
}
