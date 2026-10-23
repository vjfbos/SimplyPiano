// Akkoordenblad bij een opname (bijv. een Spotify-nummer): akkoorden met tijdstippen,
// en het controleren of de gespeelde noten een akkoord vormen.
import { parseChord } from './chords.js';

const TIME_RE = /^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/;

export function parseTime(text) {
  const m = TIME_RE.exec(text);
  if (!m) return null;
  return Number(m[1] || 0) * 60 + Number(m[2].replace(',', '.'));
}

export function formatTime(sec) {
  if (sec == null || Number.isNaN(sec)) return '–';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * Leest een akkoordenblad. Per regel:
 *   "0:12.5 Am"          akkoord met starttijd
 *   "Am F C G"           akkoorden zonder tijd (die tik je later in)
 *   "Am F C G x4"        regel vier keer herhalen
 *   "[Refrein]" / "# …"  kopjes en commentaar worden overgeslagen
 */
export function parseChordSheet(text) {
  const chords = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, ln) => {
    const line = raw.replace(/#.*/, '').replace(/\[[^\]]*\]/g, ' ').trim();
    if (!line) return;
    let words = line.split(/[\s|]+/).filter(Boolean);
    let repeat = 1;
    const rep = /^x(\d+)$/i.exec(words[words.length - 1]);
    if (rep) {
      repeat = Math.min(64, Number(rep[1]));
      words = words.slice(0, -1);
    }
    const items = [];
    let pendingTime = null;
    for (const w of words) {
      const t = parseTime(w);
      if (t !== null) {
        pendingTime = t;
        continue;
      }
      if (!parseChord(w)) {
        errors.push(`Regel ${ln + 1}: onbekend akkoord "${w}"`);
        continue;
      }
      items.push({ chord: w, time: pendingTime });
      pendingTime = null;
    }
    for (let r = 0; r < repeat; r++) items.forEach((it) => chords.push({ chord: it.chord, time: r === 0 ? it.time : null }));
  });
  return { chords, errors };
}

/** Tekst met één akkoord per regel, voorafgegaan door de tijd (als die bekend is). */
export function formatChordSheet(chords) {
  return chords.map((c) => (c.time != null ? `${formatTime(c.time)} ${c.chord}` : c.chord)).join('\n');
}

export function isTimed(chords) {
  return chords.length > 0 && chords.every((c) => c.time != null);
}

/** Index van het akkoord dat op tijd t klinkt (-1 vóór het eerste). Verwacht oplopende tijden. */
export function chordIndexAt(chords, t) {
  let lo = 0;
  let hi = chords.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Toonklassen (0-11) die minimaal gespeeld moeten worden: grondtoon, terts (of sus) en eventuele septiem/sext. De kwint mag ontbreken. */
export function chordPitchClasses(symbol) {
  const c = parseChord(symbol);
  if (!c) return null;
  const all = c.intervals.map((iv) => (c.root + iv) % 12);
  const fifth = c.intervals.includes(7) && c.intervals.length > 3 ? (c.root + 7) % 12 : null;
  return { all: new Set(all), required: new Set(all.filter((p) => p !== fifth)), root: c.root };
}

/**
 * Vergelijkt gespeelde noten (MIDI) met een akkoord. Omkeringen en octaven maken niet uit.
 * ok = alle vereiste tonen aanwezig en geen tonen die niet in het akkoord horen.
 */
export function matchChord(midis, symbol) {
  const target = chordPitchClasses(symbol);
  if (!target) return { ok: false, missing: [], extra: [] };
  const played = new Set([...midis].map((m) => ((m % 12) + 12) % 12));
  const missing = [...target.required].filter((p) => !played.has(p));
  const extra = [...played].filter((p) => !target.all.has(p));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/**
 * Houdt de score bij tijdens meespelen. Elk akkoordblok telt één keer:
 * goed als je het binnen het blok (of net ervoor) speelt; timing = hoe snel na de wissel.
 */
export class ChordScorer {
  constructor(chords, { from = 0, early = 0.35 } = {}) {
    this.chords = chords;
    this.early = early;
    // Het akkoord dat al klinkt op het startmoment telt ook mee.
    this.first = Math.max(0, chordIndexAt(chords, from));
    this.hits = new Map(); // index -> dt (s)
  }

  /** Probeer het akkoord op tijd t te scoren. Geeft {index, dt} terug bij een treffer. */
  tryHit(midis, t) {
    const i = chordIndexAt(this.chords, t);
    const candidates = [];
    // Net vóór een wissel mag je het volgende akkoord al spelen.
    const next = this.chords[i + 1];
    if (next && next.time - t <= this.early) candidates.push(i + 1);
    if (i >= 0) candidates.push(i);
    for (const idx of candidates) {
      if (this.hits.has(idx) || idx < this.first) continue;
      if (matchChord(midis, this.chords[idx].chord).ok) {
        const dt = t - this.chords[idx].time;
        this.hits.set(idx, dt);
        return { index: idx, dt };
      }
    }
    return null;
  }

  /** Resultaat over alle akkoorden tussen `from` en tijd t. */
  result(t) {
    const done = this.chords.map((c, i) => i).filter((i) => i >= this.first && this.chords[i].time <= t);
    const hit = done.filter((i) => this.hits.has(i));
    const timing = hit.length ? hit.reduce((s, i) => s + timingScore(this.hits.get(i)), 0) / hit.length : 0;
    const accuracy = done.length ? hit.length / done.length : 0;
    const score = Math.round((accuracy * 0.7 + timing * 0.3) * 100);
    return {
      total: done.length,
      hit: hit.length,
      accuracy: Math.round(accuracy * 100),
      timing: Math.round(timing * 100),
      score,
      stars: score >= 90 ? 3 : score >= 75 ? 2 : score >= 55 ? 1 : 0,
      missed: done.filter((i) => !this.hits.has(i)).map((i) => this.chords[i].chord),
    };
  }
}

/** 1 bij spelen binnen een halve seconde rond de wissel, aflopend tot 0.3 na 2 seconden. */
export function timingScore(dt) {
  const a = Math.abs(dt);
  if (a <= 0.5) return 1;
  return Math.max(0.3, 1 - ((a - 0.5) / 1.5) * 0.7);
}

/** Akkoorden die het vaakst voorkomen, voor een oefenlijstje. */
export function chordSummary(chords) {
  const count = new Map();
  chords.forEach((c) => count.set(c.chord, (count.get(c.chord) || 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([chord, n]) => ({ chord, n }));
}
