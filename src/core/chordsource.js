// Akkoorden zoeken en inladen via de Netlify-functie (zie netlify/functions/chords.mjs).
const ENDPOINT = '/.netlify/functions/chords';

async function get(params) {
  let res;
  try {
    res = await fetch(`${ENDPOINT}?${new URLSearchParams(params)}`);
  } catch {
    throw new Error('Geen verbinding. Zoeken naar akkoorden werkt alleen online.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || `Zoeken mislukt (${res.status}). Werkt de functie? Zie de README.`);
  return data;
}

export const searchChords = (q) => get({ q }).then((d) => d.results || []);
export const fetchChords = (url) => get({ url });
