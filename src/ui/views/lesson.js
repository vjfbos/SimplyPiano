// Eén les: uitleg, oefening en beoordeling.
import { h, stars } from '../dom.js';
import { loadLesson, loadPath } from '../../core/content.js';
import { bestByItem } from '../../core/profiles.js';

export async function lessonView(id) {
  const [lesson, units, best, { createPlayer }] = await Promise.all([loadLesson(id), loadPath(), bestByItem(), import('../player.js')]);
  const flat = units.flatMap((u) => u.lessons);
  const idx = flat.findIndex((l) => l.id === id);
  const next = flat[idx + 1];
  const b = best['les:' + id];

  const ex = lesson.exercise;
  let player = null;
  const nextLink = h('a.btn.primary', { href: next ? `#/les/${next.id}` : '#/', hidden: !(b?.stars > 0) }, next ? `Volgende les: ${next.title}` : 'Terug naar het leerpad');

  const startExercise = () => {
    intro.hidden = true;
    practice.hidden = false;
    if (!player) {
      player = createPlayer({
        itemId: 'les:' + id,
        kind: 'lesson',
        def: { title: lesson.title, ...ex },
        hands: ex.hands === 'both' ? ['rh', 'lh'] : ex.hands ? [ex.hands] : undefined,
        mode: ex.mode,
        allowModes: ex.allowModes,
        stars: lesson.stars,
        onDone: (r, full) => {
          if (full && r.stars > 0) nextLink.hidden = false;
        },
      });
      practice.querySelector('.player-slot').append(player.el);
    }
  };

  const intro = h('article.lesson-intro',
    h('ol.explain', lesson.explanation.map((p) => h('li', paragraph(p)))),
    lesson.tip ? h('aside.tip', h('strong', 'Tip: '), lesson.tip) : null,
    h('div.actions', h('button.btn.primary.big', { type: 'button', onclick: startExercise }, 'Naar de oefening')));

  const practice = h('div.lesson-practice', { hidden: true },
    h('p.task', h('strong', 'Opdracht: '), ex.task || 'Speel de noten die oplichten.'),
    h('div.player-slot'),
    h('div.actions',
      h('button.btn', { type: 'button', onclick: () => { practice.hidden = true; intro.hidden = false; } }, 'Uitleg nog eens lezen'),
      nextLink));

  const view = h('div.view.lesson',
    h('nav.crumbs', h('a', { href: '#/' }, '← Leerpad')),
    h('header.lesson-head', h('h1', lesson.title), b ? stars(b.stars) : null, lesson.goal ? h('p.goal', lesson.goal) : null),
    intro, practice);
  view.destroy = () => player?.destroy();
  return view;
}

// **vet** in lesteksten
function paragraph(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part) => (part.startsWith('**') ? h('strong', part.slice(2, -2)) : part));
}
