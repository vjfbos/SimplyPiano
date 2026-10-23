// Netlify-functie: akkoorden zoeken en inladen van akkoordensites.
// De browser kan die sites niet rechtstreeks lezen (CORS), daarom loopt het via deze functie.
//   GET /.netlify/functions/chords?q=<zoekterm>   -> { results: [{ title, artist, rating, votes, url, version, source }] }
//   GET /.netlify/functions/chords?url=<pagina>   -> { title, artist, content, capo, key, url, source }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
// Alleen deze sites mogen worden opgehaald (voorkomt dat de functie als open proxy wordt gebruikt).
export const ALLOWED_HOSTS = ['ultimate-guitar.com', 'e-chords.com', 'chordie.com', 'azchords.com', 'guitaretab.com', 'cifraclub.com', 'chordu.com', 'boiteachansons.net'];
const MAX_BYTES = 3_000_000;

export function isAllowedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

export function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Ultimate Guitar zet alle paginadata als JSON in <div class="js-store" data-content="…">. */
export function ugStore(html) {
  const m = /class="js-store"[^>]*data-content="([^"]*)"/.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(decodeEntities(m[1]));
  } catch {
    return null;
  }
}

export function parseUgSearch(html) {
  const store = ugStore(html);
  const results = store?.store?.page?.data?.results || [];
  return results
    .filter((r) => r && r.tab_url && /chord/i.test(r.type || '') && !r.marketing_type)
    .map((r) => ({
      title: r.song_name,
      artist: r.artist_name,
      version: r.version || 1,
      rating: Math.round((r.rating || 0) * 10) / 10,
      votes: r.votes || 0,
      url: r.tab_url,
      key: r.tonality_name || '',
      source: 'Ultimate Guitar',
    }))
    .sort((a, b) => b.votes * b.rating - a.votes * a.rating);
}

export function parseUgTab(html) {
  const data = ugStore(html)?.store?.page?.data;
  const content = data?.tab_view?.wiki_tab?.content;
  if (!content) return null;
  return {
    title: data.tab?.song_name || '',
    artist: data.tab?.artist_name || '',
    content,
    capo: data.tab_view?.meta?.capo || 0,
    key: data.tab?.tonality_name || data.tab_view?.meta?.tonality || '',
    source: 'Ultimate Guitar',
  };
}

/** Andere sites: de akkoorden staan bijna altijd in <pre>-blokken. */
export function parseGenericPage(html) {
  const pres = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) => decodeEntities(m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));
  const content = pres.sort((a, b) => b.length - a.length)[0];
  if (!content || content.trim().length < 10) return null;
  const title = decodeEntities((/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim()).replace(/\s*[-|–].*$/, '');
  return { title, artist: '', content, capo: 0, key: '', source: '' };
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en,nl;q=0.8' }, signal: ctrl.signal, redirect: 'follow' });
    if (!isAllowedUrl(res.url || url)) throw Object.assign(new Error('Doorgestuurd naar een niet-toegestane site.'), { status: 400 });
    if (!res.ok) throw Object.assign(new Error(`De site antwoordde met ${res.status}.`), { status: 502 });
    const text = await res.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } finally {
    clearTimeout(timer);
  }
}

const json = (body, status = 200, cache = 'public, max-age=3600') => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status === 200 ? cache : 'no-store' },
});

export default async function handler(req) {
  const params = new URL(req.url).searchParams;
  const q = (params.get('q') || '').trim();
  const url = (params.get('url') || '').trim();
  try {
    if (q) {
      if (q.length > 100) return json({ error: 'Zoekterm te lang.' }, 400);
      const html = await fetchPage(`https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`);
      const results = parseUgSearch(html);
      if (!results.length && !ugStore(html)) return json({ error: 'De zoekpagina kon niet worden gelezen (misschien blokkeert de site automatische verzoeken). Plak de akkoorden dan zelf.' }, 502);
      return json({ results: results.slice(0, 30) });
    }
    if (url) {
      if (!isAllowedUrl(url)) return json({ error: `Alleen pagina's van ${ALLOWED_HOSTS.join(', ')} kunnen worden ingeladen.` }, 400);
      const html = await fetchPage(url);
      const host = new URL(url).hostname.replace(/^www\./, '');
      const tab = host.endsWith('ultimate-guitar.com') ? parseUgTab(html) : parseGenericPage(html);
      if (!tab) return json({ error: 'Op deze pagina zijn geen akkoorden gevonden. Plak ze dan zelf.' }, 422);
      return json({ ...tab, source: tab.source || host, url }, 200, 'public, max-age=86400');
    }
    return json({ error: 'Geef ?q=zoekterm of ?url=pagina mee.' }, 400);
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'De site reageerde niet op tijd.'
      : err.message === 'fetch failed' ? 'De akkoordensite is op dit moment niet bereikbaar. Probeer het later, of plak de akkoorden zelf.' : err.message;
    return json({ error: msg }, err.status || 502);
  }
}
