// "Ik": jouw reeks, sterren, oefentijd en profiel. Instellingen zitten achter een ouderslot.
import { h, formatMinutes } from '../dom.js';
import { icon } from '../icons.js';
import { coach } from '../coach.js';
import { getPractice, getResults, bestByItem, computeStreak, weekSeconds, currentProfile } from '../../core/profiles.js';
import { loadPath, loadSongs } from '../../core/content.js';
import { listSheets } from '../../core/sheets.js';

const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export async function meView() {
  const [practice, results, best, units, songs, sheets] = await Promise.all([getPractice(), getResults(), bestByItem(), loadPath(), loadSongs(), listSheets().catch(() => [])]);
  const profile = currentProfile();
  const streak = computeStreak(practice);
  const week = weekSeconds(practice);
  const weekTotal = week.reduce((s, d) => s + d.seconds, 0);
  const goal = 10 * 60; // 10 minuten per dag is een mooi doel
  const lessons = units.flatMap((u) => u.lessons);
  const lessonsDone = lessons.filter((l) => best['les:' + l.id]?.stars > 0).length;
  const starTotal = Object.values(best).reduce((s, r) => s + r.stars, 0);

  const titles = {};
  lessons.forEach((l) => (titles['les:' + l.id] = l.title));
  songs.forEach((s) => s.levels.forEach((lv) => (titles[`lied:${s.id}:${lv.level}`] = s.title)));
  sheets.forEach((sh) => (titles['ak:' + sh.id] = titles['mee:' + sh.id] = `${sh.title} (akkoorden)`));
  const recent = results.sort((a, b) => b.date - a.date).slice(0, 6);

  const cheer = streak >= 3 ? `${streak} dagen op rij gespeeld. Houd het vol.`
    : streak > 0 ? 'Speel morgen weer, dan groeit je reeks.'
      : 'Tip: elke dag tien minuten spelen werkt beter dan één keer per week een uur.';

  return h('div.view.me',
    h('div.me-head',
      h('span.big-avatar', { 'aria-hidden': 'true' }, profile.avatar),
      h('div', h('h1', profile.name), h('a.btn.ghost.small', { href: '#/profielen' }, icon('user', { size: 18 }), 'Andere speler'))),
    coach(cheer, { tone: streak > 0 ? 'ok' : 'info', ic: streak > 0 ? 'flame' : 'sparkle' }),
    h('div.stat-row',
      stat('flame', String(streak), streak === 1 ? 'dag op rij' : 'dagen op rij', 'flame'),
      stat('star', String(starTotal), 'sterren', 'star'),
      stat('sprout', `${lessonsDone}/${lessons.length}`, 'lessen', 'sprout'),
      stat('clock', formatMinutes(weekTotal), 'deze week', 'clock')),
    h('section.card',
      h('h2', 'Deze week'),
      h('div.week-chart', { role: 'list' }, week.map((d, i) => {
        const pct = Math.min(1, d.seconds / goal);
        return h('div.day', { role: 'listitem', class: [d.isToday ? 'today' : '', pct >= 1 ? 'goal' : ''].join(' '), 'aria-label': `${DAYS[i]}: ${formatMinutes(d.seconds)}` },
          h('div.day-ring', { style: { '--p': pct } }, pct >= 1 ? icon('check', { size: 18 }) : d.seconds ? h('span', Math.round(d.seconds / 60)) : null),
          h('span.lbl', DAYS[i]));
      })),
      h('p.hint', 'Een vol rondje = 10 minuten gespeeld.')),
    recent.length ? h('section.card',
      h('h2', 'Laatst gespeeld'),
      h('ul.recent-list', recent.map((r) => h('li',
        h('span.r-title', titles[r.itemId] || 'Oefening'),
        h('span.mini-stars', { role: 'img', 'aria-label': `${r.stars} van 3 sterren` }, [1, 2, 3].map((i) => icon('star', { size: 16, cls: i <= r.stars ? 'on' : 'off' }))))))) : null,
    parentGate());
}

function stat(ic, value, label, cls) {
  return h('div.stat', { class: cls }, h('span.stat-ico', icon(ic, { size: 26 })), h('strong', value), h('span', label));
}

/** Ouderslot: knop 2 seconden vasthouden om de instellingen te openen. */
function parentGate() {
  let timer = null;
  const btn = h('button.hold-btn', { type: 'button', 'aria-label': 'Instellingen voor ouders: houd de knop 2 seconden ingedrukt' },
    h('span.hold-fill'), icon('lock', { size: 20 }), h('span', 'Voor ouders: houd ingedrukt'));
  const start = (e) => {
    e.preventDefault();
    btn.classList.add('holding');
    timer = setTimeout(() => (location.hash = '#/instellingen'), 2000);
  };
  const cancel = () => {
    btn.classList.remove('holding');
    clearTimeout(timer);
  };
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(e); });
  btn.addEventListener('keyup', cancel);
  return h('div.parent-zone', btn);
}
