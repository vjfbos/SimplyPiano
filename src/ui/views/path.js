// Leerpad: units met lessen, sterren en vergrendeling.
import { h, stars } from '../dom.js';
import { loadPath } from '../../core/content.js';
import { bestByItem, currentProfile, getPractice, computeStreak } from '../../core/profiles.js';

export async function pathView() {
  const [units, best, practice] = await Promise.all([loadPath(), bestByItem(), getPractice()]);
  const profile = currentProfile();
  const unlockAll = profile.settings.unlockAll;
  const streak = computeStreak(practice);
  let prevDone = true;
  let nextUp = null;

  const unitEls = units.map((u, ui) => {
    const cards = u.lessons.map((l, li) => {
      const b = best['les:' + l.id];
      const done = b && b.stars > 0;
      const locked = !unlockAll && !prevDone;
      if (!done && !locked && !nextUp) nextUp = l.id;
      prevDone = done;
      const num = units.slice(0, ui).reduce((s, x) => s + x.lessons.length, 0) + li + 1;
      return h(locked ? 'div.lesson-card.locked' : 'a.lesson-card', {
        href: locked ? null : `#/les/${l.id}`,
        class: [done ? 'done' : '', nextUp === l.id ? 'next' : ''].join(' '),
        'aria-disabled': locked ? 'true' : null,
      },
      h('span.num', { 'aria-hidden': 'true' }, locked ? '🔒' : String(num)),
      h('span.l-body', h('span.l-title', l.title), h('span.l-sub', locked ? 'Rond eerst de vorige les af' : l.goal || '')),
      h('span.l-stars', stars(b?.stars || 0)));
    });
    const doneCount = u.lessons.filter((l) => best['les:' + l.id]?.stars > 0).length;
    return h('section.unit', { style: { '--unit-hue': u.hue ?? 30 } },
      h('header.unit-head',
        h('span.unit-icon', { 'aria-hidden': 'true' }, u.icon || '🎵'),
        h('div', h('h2', u.title), h('p', u.description)),
        h('span.unit-count', `${doneCount}/${u.lessons.length}`)),
      h('div.lesson-list', cards));
  });

  return h('div.view.path',
    h('div.hello',
      h('div', h('h1', `Hoi ${profile.name}!`), h('p', nextUp ? 'Klaar voor je volgende les?' : 'Alle lessen gehaald. Tijd voor liedjes!')),
      h('a.streak', { href: '#/voortgang', 'aria-label': `Oefenreeks: ${streak} dagen` }, h('span', { 'aria-hidden': 'true' }, '🔥'), h('strong', String(streak)), h('span', streak === 1 ? 'dag' : 'dagen'))),
    nextUp ? h('a.btn.primary.big.continue', { href: `#/les/${nextUp}` }, 'Verder met de volgende les') : h('a.btn.primary.big.continue', { href: '#/liedjes' }, 'Naar de liedjes'),
    unitEls);
}
