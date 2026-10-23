import { describe, it, expect } from 'vitest';
import { simplifyChord, chordLineTokens, extractProgression, sheetLines, transposeChord, normalizeContent } from '../src/core/chordtext.js';
import { parseChordSheet } from '../src/core/chordsheet.js';
import { parseUgSearch, parseUgTab, parseGenericPage, isAllowedUrl, decodeEntities } from '../netlify/functions/chords.mjs';
import handler from '../netlify/functions/chords.mjs';

describe('akkoorden herkennen in een blad', () => {
  it('vereenvoudigt ongebruikelijke akkoorden', () => {
    expect(simplifyChord('E7#9')).toBe('E7');
    expect(simplifyChord('Cadd2')).toBe('Cadd9');
    expect(simplifyChord('F#m11')).toBe('F#m7');
    expect(simplifyChord('Bbmaj9')).toBe('Bbmaj7');
    expect(simplifyChord('Am(maj7)')).toBe('Am');
    expect(simplifyChord('Em7/D')).toBe('Em7/D');
    expect(simplifyChord('C°')).toBe('Cdim');
  });
  it('ziet songtekst niet als akkoorden', () => {
    for (const w of ['Amen', 'Bed', 'Do', 'Eat', 'I']) expect(simplifyChord(w)).toBeNull();
    expect(chordLineTokens('A day in the life')).toBeNull();
    expect(chordLineTokens('Am I wrong')).toBeNull();
    expect(chordLineTokens('Am   F   C   G  (x2)')).toMatchObject({ repeat: 2 });
    expect(chordLineTokens('Intro: | Dm | C | Bb | N.C. |').chords.map((c) => c.chord)).toEqual(['Dm', 'C', 'Bb']);
  });
  it('haalt de akkoordvolgorde met kopjes uit een blad', () => {
    const raw = '[Intro]\nCm  Bb  Ab (x4)\n\n[Verse 1]\nCm            Bb\nRising up, back on the street\n\n[Chorus]\n[ch]Cm[/ch]      [ch]Ab[/ch]\nIt\'s the eye\n\n[Solo]\n';
    const { text, count } = extractProgression(raw);
    expect(text).toBe('[Intro]\nCm Bb Ab x4\n\n[Verse 1]\nCm Bb\n\n[Chorus]\nCm Ab');
    expect(count).toBe(16);
    const parsed = parseChordSheet(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.chords).toHaveLength(16);
  });
  it('transponeert met behoud van de positie boven de tekst', () => {
    expect(transposeChord('C#m7/G#', 1)).toBe('Dm7/A');
    expect(transposeChord('A', 1, true)).toBe('Bb');
    const lines = sheetLines('Am      F\nHello there', 2);
    expect(lines[0]).toMatchObject({ type: 'chords', text: 'Bm      G' });
    expect(lines[0].chords.map((c) => c.col)).toEqual([0, 8]);
    expect(lines[1].type).toBe('lyrics');
  });
  it('maakt UG-opmaak schoon', () => {
    expect(normalizeContent('[tab][ch]G[/ch] &amp; [ch]D[/ch][/tab]')).toBe('G & D');
  });
});

// Nagemaakte Ultimate Guitar-pagina's (dezelfde opbouw als de echte: JSON in een js-store-div).
const store = (data) => `<html><div class="js-store" data-content="${JSON.stringify({ store: { page: { data } } }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div></html>`;
const searchHtml = store({ results: [
  { song_name: 'Eye Of The Tiger', artist_name: 'Survivor', type: 'Chords', version: 1, rating: 4.83, votes: 2100, tab_url: 'https://tabs.ultimate-guitar.com/tab/survivor/eye-of-the-tiger-chords-1', tonality_name: 'Cm' },
  { song_name: 'Eye Of The Tiger', artist_name: 'Survivor', type: 'Tabs', tab_url: 'https://tabs.ultimate-guitar.com/tab/x' },
  { song_name: 'Eye Of The Tiger', artist_name: 'Survivor', type: 'Chords', version: 2, rating: 4.5, votes: 30, tab_url: 'https://tabs.ultimate-guitar.com/tab/survivor/eye-of-the-tiger-chords-2' },
  { marketing_type: 'TabProAd', type: 'Pro' },
] });
const tabHtml = store({ tab: { song_name: 'Eye Of The Tiger', artist_name: 'Survivor', tonality_name: 'Cm' }, tab_view: { meta: { capo: 0 }, wiki_tab: { content: '[Intro]\n[tab][ch]Cm[/ch]  [ch]Bb[/ch]  [ch]Ab[/ch][/tab]\n"Rising" & up' } } });

describe('Netlify-functie: akkoordensites lezen', () => {
  it('leest zoekresultaten (alleen akkoorden, beste eerst)', () => {
    const r = parseUgSearch(searchHtml);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: 'Eye Of The Tiger', artist: 'Survivor', version: 1, rating: 4.8, key: 'Cm' });
  });
  it('leest een akkoordenpagina', () => {
    const t = parseUgTab(tabHtml);
    expect(t).toMatchObject({ title: 'Eye Of The Tiger', artist: 'Survivor', key: 'Cm' });
    expect(t.content).toContain('[ch]Cm[/ch]');
    expect(t.content).toContain('"Rising" & up');
    expect(extractProgression(t.content).text).toBe('[Intro]\nCm Bb Ab');
  });
  it('leest <pre>-blokken van andere sites', () => {
    const t = parseGenericPage('<title>Song - Chords</title><pre>Am <b>F</b>\nla &amp; la</pre>');
    expect(t).toMatchObject({ title: 'Song', content: 'Am F\nla & la' });
  });
  it('haalt alleen toegestane sites op', () => {
    expect(isAllowedUrl('https://tabs.ultimate-guitar.com/tab/a')).toBe(true);
    expect(isAllowedUrl('https://evil-ultimate-guitar.com/')).toBe(false);
    expect(isAllowedUrl('http://169.254.169.254/latest')).toBe(false);
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
    expect(decodeEntities('&#233;&#x27;')).toBe("é'");
  });
  it('handler: zoeken en inladen (met nagebootste fetch)', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) => ({ ok: true, status: 200, url, text: async () => (String(url).includes('search.php') ? searchHtml : tabHtml) });
    try {
      const s = await (await handler(new Request('http://x/.netlify/functions/chords?q=eye%20of%20the%20tiger'))).json();
      expect(s.results).toHaveLength(2);
      const t = await (await handler(new Request('http://x/?url=' + encodeURIComponent(s.results[0].url)))).json();
      expect(t.title).toBe('Eye Of The Tiger');
      const bad = await handler(new Request('http://x/?url=https://example.com/'));
      expect(bad.status).toBe(400);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
