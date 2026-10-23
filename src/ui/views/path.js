// Leren: het leerpad als tuinpad. Elke les is een plantje dat groeit met je sterren.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { tikoSays } from '../mascot.js';
import { loadPath } from '../../core/content.js';
import { bestByItem, currentProfile } from '../../core/profiles.js';

const SOIL = '<ellipse cx="40" cy="62" rx="24" ry="7" fill="#b98a5e"/><ellipse cx="40" cy="60" rx="20" ry="5" fill="#cfa074"/>';
// Groeistadia: 0 = zaadje (nog te doen), 1-3 = sterren
const PLANTS = [
  `${SOIL}<path d="M40 58v-8" stroke="#5a9e6e" stroke-width="4" stroke-linecap="round"/><path d="M40 52c-6 0-9-4-9-8 5 0 9 3 9 8z" fill="#7cc993"/>`,
  `${SOIL}<path d="M40 58V40" stroke="#4f9566" stroke-width="4" stroke-linecap="round"/><path d="M40 48c-9 0-13-5-13-11 8 0 13 5 13 11z" fill="#7cc993"/><path d="M40 44c8 0 12-5 12-10-7 0-12 4-12 10z" fill="#62b47e"/>`,
  `${SOIL}<path d="M40 58V32" stroke="#4f9566" stroke-width="4" stroke-linecap="round"/><path d="M40 50c-9 0-13-5-13-11 8 0 13 5 13 11z" fill="#7cc993"/><path d="M40 46c8 0 12-5 12-10-7 0-12 4-12 10z" fill="#62b47e"/><ellipse cx="40" cy="27" rx="7" ry="9" fill="#ff8f6b"/><path d="M33 29c3 3 11 3 14 0" stroke="#4f9566" stroke-width="3" fill="none"/>`,
  `${SOIL}<path d="M40 58V34" stroke="#4f9566" stroke-width="4" stroke-linecap="round"/><path d="M40 52c-9 0-13-5-13-11 8 0 13 5 13 11z" fill="#7cc993"/><path d="M40 48c8 0 12-5 12-10-7 0-12 4-12 10z" fill="#62b47e"/>
   <g transform="translate(40 24)">${[0, 72, 144, 216, 288].map((r) => `<ellipse rx="6.5" ry="10" cy="-9" fill="#ff7a59" transform="rotate(${r})"/>`).join('')}<circle r="6.5" fill="#ffc845"/></g>`,
];

function plant(stage, locked) {
  const span = document.createElement('span');
  span.className = 'plant';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 80 72" width="80" height="72">${locked ? SOIL : PLANTS[stage]}</svg>`;
  return span;
}

export async function pathView() {
  const [units, best] = await Promise.all([loadPath(), bestByItem()]);
  const profile = currentProfile();
  const unlockAll = profile.settings.unlockAll;
  let prevDone = true;
  let nextUp = null;
  let n = 0;

  const unitEls = units.map((u) => {
    const nodes = u.lessons.map((l) => {
      n++;
      const b = best['les:' + l.id];
      const starsNow = b?.stars || 0;
      const done = starsNow > 0;
      const locked = !unlockAll && !prevDone && !done; // gehaald = nooit meer op slot
      const isNext = !done && !locked && !nextUp;
      if (isNext) nextUp = l;
      prevDone = done;
      // zigzag: links - midden - rechts - midden
      const x = [0, 1, 0, -1][n % 4];
      const label = `${l.title}${locked ? ', nog op slot' : done ? `, ${starsNow} van 3 sterren` : ''}`;
      return h(locked ? 'div.node.locked' : 'a.node', {
        href: locked ? null : `#/les/${l.id}`,
        class: [done ? 'done' : '', isNext ? 'next' : ''].join(' '),
        style: { '--x': x },
        'aria-label': label,
      },
      h('span.node-circle', plant(starsNow, locked), locked ? h('span.node-lock', icon('lock', { size: 18 })) : null),
      isNext ? h('span.node-go', 'Start!') : null,
      h('span.node-title', l.title),
      done ? h('span.node-stars', [1, 2, 3].map((i) => icon('star', { size: 16, cls: i <= starsNow ? 'on' : 'off' }))) : null);
    });
    const doneCount = u.lessons.filter((l) => best['les:' + l.id]?.stars > 0).length;
    return h('section.unit', { style: { '--unit-hue': u.hue ?? 30 } },
      h('header.unit-banner',
        h('div', h('h2', u.title), h('p', u.description)),
        h('div.unit-progress', { 'aria-label': `${doneCount} van ${u.lessons.length} lessen klaar` },
          h('div.ring', { style: { '--p': doneCount / u.lessons.length } }, h('span', `${doneCount}/${u.lessons.length}`)))),
      h('div.garden-path', nodes));
  });

  const hello = nextUp
    ? tikoSays(`Hoi ${profile.name}! Je volgende plantje is "${nextUp.title}". Zullen we?`, { size: 76 })
    : tikoSays(`Wauw ${profile.name}, je hele tuin bloeit! Speel nu je favoriete liedjes.`, { mood: 'juich', size: 76 });

  return h('div.view.path',
    h('div.hero', hello,
      nextUp ? h('a.btn.primary.xl', { href: `#/les/${nextUp.id}` }, icon('play', { size: 22 }), 'Verder spelen')
        : h('a.btn.primary.xl', { href: '#/liedjes' }, icon('music', { size: 22 }), 'Naar de liedjes')),
    unitEls);
}
