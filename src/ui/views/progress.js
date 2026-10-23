// Voortgang: oefenreeks, oefentijd deze week, behaalde lessen en recente resultaten.
import { h, stars, formatMinutes } from '../dom.js';
import { getPractice, getResults, bestByItem, computeStreak, weekSeconds, currentProfile } from '../../core/profiles.js';
import { loadPath, loadSongs } from '../../core/content.js';
import { listSheets } from '../../core/sheets.js';

const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export async function progressView() {
  const [practice, results, best, units, songs] = await Promise.all([getPractice(), getResults(), bestByItem(), loadPath(), loadSongs()]);
  const streak = computeStreak(practice);
  const week = weekSeconds(practice);
  const weekTotal = week.reduce((s, d) => s + d.seconds, 0);
  const maxDay = Math.max(600, ...week.map((d) => d.seconds));
  const lessons = units.flatMap((u) => u.lessons);
  const lessonsDone = lessons.filter((l) => best['les:' + l.id]?.stars > 0).length;
  const starTotal = Object.values(best).reduce((s, r) => s + r.stars, 0);
  const allTime = practice.reduce((s, r) => s + r.seconds, 0);

  const titles = {};
  lessons.forEach((l) => (titles['les:' + l.id] = `Les: ${l.title}`));
  songs.forEach((s) => s.levels.forEach((lv) => (titles[`lied:${s.id}:${lv.level}`] = `${s.title} (niveau ${lv.level})`)));
  (await listSheets().catch(() => [])).forEach((sh) => (titles['ak:' + sh.id] = titles['mee:' + sh.id] = `Akkoorden: ${sh.title}`));
  const recent = results.sort((a, b) => b.date - a.date).slice(0, 10);

  return h('div.view.progress',
    h('h1', `Voortgang van ${currentProfile().name}`),
    h('div.stat-row',
      stat('🔥', String(streak), streak === 1 ? 'dag op rij' : 'dagen op rij'),
      stat('⏱', formatMinutes(weekTotal), 'deze week'),
      stat('📘', `${lessonsDone}/${lessons.length}`, 'lessen gehaald'),
      stat('★', String(starTotal), 'sterren')),
    h('section.card',
      h('h2', 'Oefentijd deze week'),
      h('div.week-chart', { role: 'list' }, week.map((d, i) => h('div.day', { role: 'listitem', class: d.isToday ? 'today' : '', 'aria-label': `${DAYS[i]}: ${formatMinutes(d.seconds)}` },
        h('div.bar-wrap', h('div.bar', { style: { height: `${Math.round((d.seconds / maxDay) * 100)}%` } })),
        h('span.val', d.seconds ? Math.round(d.seconds / 60) + "'" : ''),
        h('span.lbl', DAYS[i])))),
      h('p.hint', `Totaal geoefend: ${formatMinutes(allTime)}. Tip: elke dag 10 minuten werkt beter dan één keer per week een uur.`)),
    h('section.card',
      h('h2', 'Lessen'),
      h('ul.lesson-progress', units.map((u) => h('li',
        h('span', `${u.icon || ''} ${u.title}`),
        h('progress', { max: u.lessons.length, value: u.lessons.filter((l) => best['les:' + l.id]?.stars > 0).length }),
        h('span.count', `${u.lessons.filter((l) => best['les:' + l.id]?.stars > 0).length}/${u.lessons.length}`))))),
    h('section.card',
      h('h2', 'Laatst gespeeld'),
      recent.length ? h('table.recent',
        h('thead', h('tr', h('th', 'Wat'), h('th', 'Wanneer'), h('th', 'Score'), h('th', 'Sterren'))),
        h('tbody', recent.map((r) => h('tr',
          h('td', titles[r.itemId] || r.itemId, { tempo: ' · tempo', wait: ' · wachten', wachten: ' · wachten', opname: ' · met opname' }[r.mode] || '', r.tempoPct < 100 ? ` · ${r.tempoPct}%` : ''),
          h('td', new Date(r.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })),
          h('td', String(r.score)),
          h('td', stars(r.stars)))))) : h('p', 'Nog niets gespeeld. Begin met de eerste les!')));
}

function stat(icon, value, label) {
  return h('div.stat', h('span.icon', { 'aria-hidden': 'true' }, icon), h('strong', value), h('span', label));
}
