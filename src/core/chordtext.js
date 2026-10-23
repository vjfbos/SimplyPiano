// Akkoordenbladen van websites (akkoorden boven de songtekst) begrijpen:
// akkoordregels herkennen, ongebruikelijke akkoorden vereenvoudigen, transponeren en
// de akkoordvolgorde eruit halen voor het oefenen.
import { parseChord } from './chords.js';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SYMBOL_RE = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/;
const SECTION_WORDS = /^(intro|verse|vers|couplet|chorus|refrein|pre-?chorus|bridge|brug|outro|solo|interlude|instrumental|coda|tag|hook|ending|einde)\b/i;

/** UG-opmaak ([ch]Am[/ch], [tab]) en HTML-entiteiten omzetten naar gewone tekst. */
export function normalizeContent(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\[ch\](.*?)\[\/ch\]/g, '$1')
    .replace(/\[\/?tab\]/g, '')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

/**
 * Maakt van een akkoordsymbool iets dat de app kent, zonder de grondtoon en het karakter
 * (groot/klein) te veranderen: "E7#9" -> "E7", "Am(maj7)" -> "Am", "Cadd2" -> "Cadd9", "G7sus4" -> "Gsus4".
 * Geeft null terug als het geen akkoord is.
 */
export function simplifyChord(raw) {
  let s = String(raw).trim().replace(/[()]/g, '').replace(/°/g, 'dim').replace(/ø/g, 'm7b5').replace(/Δ/g, 'maj7');
  if (!s) return null;
  if (parseChord(s)) return s;
  const m = SYMBOL_RE.exec(s);
  if (!m) return null;
  const root = m[1] + (m[2] || '');
  const q = m[3];
  const bass = m[4] ? `/${m[4]}${m[5] || ''}` : '';
  // Alleen tekens die in akkoordsymbolen voorkomen; zo wordt "Amen" of "Bed" geen akkoord.
  if (!/^(?:maj|ma|min|mi|m|M|dim|aug|sus|add|alt|no|omit|[0-9#b+-])*$/.test(q)) return null;
  let qual;
  if (/^(maj|M|ma)(7|9|11|13)/.test(q)) qual = 'maj7';
  else if (/^(m|min|mi|-)(?!aj)/.test(q)) qual = /maj/.test(q) ? 'm' : /^(m|min|mi|-)7?b5/.test(q) ? 'm7b5' : /(7|9|11|13)/.test(q) ? 'm7' : /6/.test(q) ? 'm6' : 'm';
  else if (/^dim/.test(q)) qual = /7/.test(q) ? 'dim7' : 'dim';
  else if (/^(aug|\+)/.test(q)) qual = 'aug';
  else if (/sus2/.test(q)) qual = 'sus2';
  else if (/sus/.test(q)) qual = 'sus4';
  else if (/^5$/.test(q)) qual = '5';
  else if (/^(7|9|11|13)/.test(q)) qual = '7';
  else if (/^6/.test(q)) qual = '6';
  else if (/^(add|2)/.test(q)) qual = 'add9';
  else if (/^(maj|M)$/.test(q)) qual = '';
  else return null; // onbekend achtervoegsel: waarschijnlijk geen akkoord (bijv. het woord "Am" in "Amen")
  for (const cand of [root + qual + bass, root + qual]) if (parseChord(cand)) return cand;
  return null;
}

/** Herhalingen, maatstrepen e.d. die op een akkoordregel mogen staan. */
function isFiller(tok) {
  return /^(\||\|\||\/|-+|%|\.+|…|x\d+|\d+x|\*+|n\.?c\.?|:\|\|?|\|\|?:|\(?x\d+\)?)$/i.test(tok);
}

function cleanToken(tok) {
  return tok.replace(/^[(\[{]+|[)\]},;]+$/g, '');
}

/** Is dit een regel met alleen akkoorden (eventueel met een label als "Intro:")? */
export function chordLineTokens(line) {
  let rest = line.trim();
  if (!rest) return null;
  const label = /^([A-Za-z][\w -]{0,20}):\s*/.exec(rest);
  if (label && !simplifyChord(label[1])) rest = rest.slice(label[0].length);
  const tokens = rest.split(/\s+/).filter(Boolean);
  const chords = [];
  let repeat = null;
  for (const t of tokens) {
    const c = cleanToken(t);
    if (!c) continue;
    if (isFiller(c) || isFiller(t)) {
      const r = /x(\d+)|(\d+)x/i.exec(c);
      if (r) repeat = Number(r[1] || r[2]);
      continue;
    }
    const s = simplifyChord(c);
    if (!s) return null;
    chords.push({ original: c, chord: s });
  }
  return chords.length ? { chords, repeat } : null;
}

export function sectionName(line) {
  const t = line.trim();
  const b = /^\[([^\]]+)\]$/.exec(t);
  if (b) return b[1].trim();
  if (t.length < 30 && SECTION_WORDS.test(t) && !chordLineTokens(t)) return t.replace(/:$/, '');
  return null;
}

/**
 * Haalt de akkoordvolgorde uit een akkoordenblad (akkoorden boven tekst).
 * Geeft tekst in het formaat van de app terug: kopjes als [Refrein] en per regel de akkoorden.
 */
export function extractProgression(raw) {
  const lines = normalizeContent(raw).split('\n');
  const out = [];
  let count = 0;
  for (const line of lines) {
    const sec = sectionName(line);
    if (sec) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(`[${sec}]`);
      continue;
    }
    const cl = chordLineTokens(line);
    if (!cl) continue;
    count += cl.chords.length * (cl.repeat || 1);
    out.push(cl.chords.map((c) => c.chord).join(' ') + (cl.repeat > 1 ? ` x${cl.repeat}` : ''));
  }
  // lege kopjes (zonder akkoorden eronder) weghalen
  const cleaned = out.filter((l, i) => !(l.startsWith('[') && (i === out.length - 1 || out[i + 1] === '' || out[i + 1]?.startsWith('['))));
  return { text: cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim(), count };
}

/** Akkoord n halve tonen verschuiven. */
export function transposeChord(sym, n, flats = false) {
  if (!n) return sym;
  const names = flats ? FLATS : SHARPS;
  return sym.replace(/^([A-G])(#|b)?/, (_, l, a) => names[(PC[l] + (a === '#' ? 1 : a === 'b' ? -1 : 0) + n + 120) % 12])
    .replace(/\/([A-G])(#|b)?$/, (_, l, a) => '/' + names[(PC[l] + (a === '#' ? 1 : a === 'b' ? -1 : 0) + n + 120) % 12]);
}

/** Of de originele akkoorden vooral mollen gebruiken (dan transponeren we ook naar mollen). */
export function prefersFlats(chords) {
  let f = 0;
  let s = 0;
  for (const c of chords) {
    if (/^[A-G]b/.test(c)) f++;
    if (/^[A-G]#/.test(c)) s++;
  }
  return f > s;
}

/**
 * Regels voor de weergave van het blad, met getransponeerde akkoorden op dezelfde plek boven de tekst.
 * [{ type: 'section'|'chords'|'lyrics'|'blank', text, chords?: [{ col, name }] }]
 */
export function sheetLines(raw, transpose = 0, flats = false) {
  return normalizeContent(raw).split('\n').map((line) => {
    if (!line.trim()) return { type: 'blank', text: '' };
    const sec = sectionName(line);
    if (sec) return { type: 'section', text: sec };
    if (chordLineTokens(line)) {
      const chords = [];
      let text = '';
      const re = /\S+/g;
      let m;
      while ((m = re.exec(line))) {
        const tok = m[0];
        const core = cleanToken(tok);
        const isChord = !isFiller(core) && !isFiller(tok) && simplifyChord(core);
        const shown = isChord ? tok.replace(core, transposeChord(core, transpose, flats)) : tok;
        const col = Math.max(m.index, text.length ? text.length + 1 : 0);
        text = text.padEnd(col, ' ') + shown;
        if (isChord) chords.push({ col, name: transposeChord(core, transpose, flats) });
      }
      return { type: 'chords', text, chords };
    }
    return { type: 'lyrics', text: line };
  });
}
