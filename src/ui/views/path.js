// Leren: hoofdstukken met genummerde levels op een pad. Klaar = vinkje en sterren.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { loadPath } from '../../core/content.js';
import { bestByItem, currentProfile } from '../../core/profiles.js';

const starRow = (n, size = 16) => h('span.mini-stars', { role: 'img', 'aria-label': `${n} van 3 sterren` },
  [1, 2, 3].map((i) => icon('star', { size, cls: i <= n ? 'on' : 'off' })));

export async function pathView() {
  const [units, best] = await Promise.all([loadPath(), bestByItem()]);
  const profile = currentProfile();
  const unlockAll = profile.settings.unlockAll;
  let prevDone = true;
  let nextUp = null;
  let nextUnit = null;
  let n = 0;
  let doneTotal = 0;
  let total = 0;

  const unitEls = units.map((u, ui) => {
    const nodes = u.lessons.map((l) => {
      n++;
      total++;
      const starsNow = best['les:' + l.id]?.stars || 0;
      const done = starsNow > 0;
      if (done) doneTotal++;
      const locked = !unlockAll && !prevDone && !done; // gehaald = nooit meer op slot
      const isNext = !done && !locked && !nextUp;
      if (isNext) {
        nextUp = { ...l, n };
        nextUnit = u;
      }
      prevDone = done;
      const x = [0, 1, 0, -1][n % 4]; // zigzag
      return h(locked ? 'div.node.locked' : 'a.node', {
        href: locked ? null : `#/les/${l.id}`,
        class: [done ? 'done' : '', isNext ? 'next' : ''].join(' '),
        style: { '--x': x },
        'aria-label': `Les ${n}: ${l.title}${locked ? ', op slot' : done ? `, ${starsNow} van 3 sterren` : ''}`,
      },
      h('span.node-circle', locked ? icon('lock', { size: 24 }) : done ? icon('check', { size: 34 }) : h('span.node-num', String(n))),
      isNext ? h('span.node-go', 'Speel') : null,
      h('span.node-title', l.title),
      done ? starRow(starsNow) : null);
    });
    const doneCount = u.lessons.filter((l) => best['les:' + l.id]?.stars > 0).length;
    return h('section.unit', { style: { '--unit-hue': u.hue ?? 30 } },
      h('header.unit-banner',
        h('div', h('p.kicker', `Hoofdstuk ${ui + 1}`), h('h2', u.title), h('p', u.description)),
        h('div.ring', { style: { '--p': doneCount / u.lessons.length }, 'aria-label': `${doneCount} van ${u.lessons.length} klaar` },
          h('span', `${doneCount}/${u.lessons.length}`))),
      h('div.garden-path', nodes));
  });

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Hoi' : 'Goedenavond';
  const next = nextUp
    ? h('a.next-card', { href: `#/les/${nextUp.id}` },
      h('div.next-info',
        h('p.kicker', `Volgende · les ${nextUp.n} · ${nextUnit.title}`),
        h('h2', nextUp.title),
        nextUp.goal ? h('p', nextUp.goal) : null),
      h('span.btn.primary.big', icon('play', { size: 20 }), 'Verder'))
    : h('a.next-card', { href: '#/liedjes' },
      h('div.next-info', h('p.kicker', 'Alle lessen gehaald'), h('h2', 'Tijd voor je eigen muziek'), h('p', 'Kies een liedje of zoek de akkoorden van je favoriete nummer.')),
      h('span.btn.primary.big', icon('music', { size: 20 }), 'Spelen'));

  return h('div.view.path',
    h('div.page-head',
      h('div', h('h1', `${hello}, ${profile.name}`), h('p.lead', `${doneTotal} van ${total} lessen gehaald`)),
      h('div.progress-bar', { 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.round((doneTotal / total) * 100)}%` } }))),
    next,
    unitEls);
}
