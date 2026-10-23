// Beoordeling en tips na afloop. Pure functies, dus eenvoudig te testen.

export const DEFAULT_STARS = [60, 80, 95];

/** Timingvensters (ms) afhankelijk van het tempo. */
export function timingWindows(beatMs) {
  return {
    good: clamp(beatMs * 0.12, 70, 130),
    window: clamp(beatMs * 0.5, 200, 450),
  };
}

export function classifyTiming(dt, beatMs) {
  const { good, window } = timingWindows(beatMs);
  const abs = Math.abs(dt);
  if (abs > window) return null;
  if (abs <= good) return { result: 'ok', score: 1 };
  const score = 1 - 0.7 * ((abs - good) / (window - good));
  return { result: dt < 0 ? 'early' : 'late', score };
}

export function samePitch(expected, played, octaveTolerant = false) {
  return octaveTolerant ? expected % 12 === played % 12 : expected === played;
}

/**
 * stats = { mode, notes: [{hand, result, score?, dt?}], events?: {total, clean}, extra, wrong, seconds }
 */
export function computeResult(stats, thresholds = DEFAULT_STARS) {
  const notes = stats.notes || [];
  const count = (r) => notes.filter((n) => n.result === r).length;
  const byHand = {};
  for (const n of notes) {
    byHand[n.hand] ||= { total: 0, bad: 0 };
    byHand[n.hand].total++;
    if (n.result !== 'ok') byHand[n.hand].bad++;
  }
  let accuracy;
  let timing = null;
  if (stats.mode === 'wait') {
    const { total, clean } = stats.events;
    accuracy = total ? (clean / total) * 100 : 0;
  } else {
    const hits = notes.filter((n) => ['ok', 'early', 'late'].includes(n.result));
    const total = notes.length;
    accuracy = total ? (hits.length / (total + (stats.extra || 0) * 0.5)) * 100 : 0;
    timing = hits.length ? (hits.reduce((s, n) => s + n.score, 0) / hits.length) * 100 : 0;
  }
  const score = timing === null ? accuracy : accuracy * 0.6 + timing * 0.4;
  const stars = score >= thresholds[2] ? 3 : score >= thresholds[1] ? 2 : score >= thresholds[0] ? 1 : 0;

  const early = count('early');
  const late = count('late');
  const missed = count('missed');
  const result = {
    mode: stats.mode,
    score: Math.round(score),
    accuracy: Math.round(accuracy),
    timing: timing === null ? null : Math.round(timing),
    stars,
    counts: { ok: count('ok'), early, late, missed, wrong: stats.wrong || 0, extra: stats.extra || 0 },
    seconds: Math.round(stats.seconds || 0),
  };
  result.tips = makeTips(result, byHand, stats);
  return result;
}

function makeTips(r, byHand, stats) {
  const tips = [];
  const { early, late, missed, wrong, extra } = r.counts;
  const hits = r.counts.ok + early + late;
  if (r.stars === 3) tips.push('Wauw, alles goed! Probeer nu "Op de maat" of een moeilijker liedje.');
  if (r.mode === 'wait') {
    if (wrong > 0 && r.accuracy < 80) tips.push('Kijk eerst rustig naar de gekleurde toets. Snel worden komt later vanzelf.');
    if (r.accuracy >= 90) tips.push('Je kent de noten! Kies nu "Op de maat" en speel mee met de tikjes.');
  } else {
    if (late > early * 1.5 && late >= 3) tips.push('Je was vaak net te laat. Tel hardop mee: 1, 2, 3, 4. En kijk alvast naar de volgende noot.');
    if (early > late * 1.5 && early >= 3) tips.push('Je had een beetje haast. Wacht rustig op het tikje.');
    if (missed > hits * 0.3) tips.push('Ging het te snel? Kies bij Opties een lagere snelheid, of speel eerst "Rustig".');
    if (extra + wrong > 4) tips.push('Er klonken extra toetsen. Houd je vingers dicht bij de toetsen.');
  }
  const hands = Object.entries(byHand).filter(([, v]) => v.total >= 3);
  if (hands.length === 2) {
    const [a, b] = hands.map(([h, v]) => [h, v.bad / v.total]);
    const worst = a[1] > b[1] ? a : b;
    const other = worst === a ? b : a;
    if (worst[1] > other[1] + 0.2) tips.push(`Je ${worst[0] === 'lh' ? 'linkerhand' : 'rechterhand'} mag nog wat oefenen. Kies die hand even alleen.`);
  }
  if (stats.loopable && r.stars < 2) tips.push('Oefen het moeilijke stukje een paar keer (Opties → Een stukje oefenen).');
  if (!tips.length) tips.push('Goed bezig! Elke keer spelen maakt het makkelijker.');
  return tips;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
