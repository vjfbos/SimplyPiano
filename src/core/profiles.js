// Profielen (meerdere spelers op één apparaat) en hun voortgang.
import { db, prefs } from './store.js';

export const AVATARS = ['🦊', '🐼', '🐯', '🐬', '🦄', '🐉', '🎧', '🎸', '⚡', '🚀', '⚽', '🌙', '🦋', '🎮', '🏀', '🌸'];

export const DEFAULT_SETTINGS = {
  input: 'auto', // auto | midi | mic | screen
  noteLabels: 'letters', // letters | solfege | none
  showFingers: true,
  midiSound: true, // speel zelf geluid af bij MIDI (uit als je digitale piano zelf klinkt)
  volume: 0.8,
  micOctaveTolerant: true,
  latencyMs: 0, // correctie voor invoervertraging (vooral microfoon/Bluetooth)
  unlockAll: false,
};

let current = null;
const listeners = new Set();

export function onProfileChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentProfile() {
  return current;
}

export async function listProfiles() {
  const all = await db.all('profiles');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createProfile(name, avatar) {
  const p = {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim() || 'Speler',
    avatar: avatar || AVATARS[0],
    createdAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
  };
  await db.put('profiles', p);
  return p;
}

export async function selectProfile(id) {
  const p = id ? await db.get('profiles', id) : null;
  current = p ? { ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } } : null;
  prefs.set('profile', current?.id || null);
  listeners.forEach((fn) => fn(current));
  return current;
}

export async function restoreProfile() {
  const id = prefs.get('profile');
  if (id) {
    const p = await selectProfile(id);
    if (p) return p;
  }
  const all = await listProfiles();
  if (all.length === 1) return selectProfile(all[0].id);
  return null;
}

export async function updateSettings(patch) {
  if (!current) return;
  current.settings = { ...current.settings, ...patch };
  await db.put('profiles', current);
  listeners.forEach((fn) => fn(current));
}

export async function deleteProfile(id) {
  await db.delete('profiles', id);
  await db.deleteByIndex('results', 'profileId', id);
  await db.deleteByIndex('practice', 'profileId', id);
  if (current?.id === id) await selectProfile(null);
}

// ---------- Resultaten en oefentijd ----------

export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function saveResult(result) {
  if (!current) return;
  await db.put('results', { ...result, profileId: current.id, date: Date.now() });
}

export async function getResults(profileId = current?.id) {
  if (!profileId) return [];
  return db.byIndex('results', 'profileId', profileId);
}

/** Beste sterren per item (les of liedniveau). */
export async function bestByItem(profileId = current?.id) {
  const best = {};
  for (const r of await getResults(profileId)) {
    const b = best[r.itemId];
    if (!b || r.stars > b.stars || (r.stars === b.stars && r.score > b.score)) best[r.itemId] = r;
  }
  return best;
}

export async function addPracticeSeconds(seconds) {
  if (!current || seconds < 1) return;
  const day = dayKey();
  const key = [current.id, day];
  const existing = (await db.get('practice', key)) || { profileId: current.id, day, seconds: 0 };
  existing.seconds += Math.round(seconds);
  await db.put('practice', existing);
}

export async function getPractice(profileId = current?.id) {
  if (!profileId) return [];
  return db.byIndex('practice', 'profileId', profileId);
}

/** Aantal opeenvolgende dagen met oefening, tot en met vandaag (of gisteren als er vandaag nog niet geoefend is). */
export function computeStreak(practiceRows, today = new Date()) {
  const days = new Set(practiceRows.filter((r) => r.seconds > 0).map((r) => r.day));
  const d = new Date(today);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Oefenseconden voor maandag t/m zondag van de huidige week. */
export function weekSeconds(practiceRows, today = new Date()) {
  const byDay = Object.fromEntries(practiceRows.map((r) => [r.day, r.seconds]));
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { day: dayKey(d), seconds: byDay[dayKey(d)] || 0, isToday: dayKey(d) === dayKey(today) };
  });
}
