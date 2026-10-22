// Zoeken in de liedjesbibliotheek.

/** Kleine letters, zonder accenten en leestekens: "Für Elise" -> "fur elise". */
export function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Alle zoekwoorden moeten ergens in titel, componist, alternatieve titels of categorie voorkomen. */
export function matchSong(song, query, categories = []) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const cat = categories.find((c) => c.id === song.category)?.label || '';
  const hay = normalize([song.title, song.composer, ...(song.aka || []), cat].join(' '));
  return words.every((w) => hay.includes(w));
}
