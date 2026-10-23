// Eén les: Tiko legt in kleine stapjes uit, daarna oefen je. Geen lappen tekst.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { tiko } from '../mascot.js';
import { loadLesson, loadPath } from '../../core/content.js';
import { bestByItem } from '../../core/profiles.js';

export async function lessonView(id) {
  const [lesson, units, best, { createPlayer }] = await Promise.all([loadLesson(id), loadPath(), bestByItem(), import('../player.js')]);
  const flat = units.flatMap((u) => u.lessons);
  const idx = flat.findIndex((l) => l.id === id);
  const next = flat[idx + 1];
  const ex = lesson.exercise;
  let player = null;

  // ---------- uitleg in stapjes ----------
  const steps = [...lesson.explanation, ...(lesson.tip ? [`Tip: ${lesson.tip}`] : [])];
  let step = 0;
  const bubble = h('div.big-bubble', { 'aria-live': 'polite' });
  const dots = h('div.step-dots', { 'aria-hidden': 'true' }, steps.map(() => h('span')));
  const prevBtn = h('button.btn.ghost', { type: 'button', onclick: () => go(step - 1) }, icon('back'), 'Terug');
  const nextBtn = h('button.btn.primary.xl', { type: 'button', onclick: () => (step < steps.length - 1 ? go(step + 1) : startPractice()) });
  const mascot = h('div.lesson-tiko');
  function go(i) {
    step = Math.max(0, Math.min(steps.length - 1, i));
    bubble.replaceChildren(...paragraph(steps[step]));
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
    dots.querySelectorAll('span').forEach((d, k) => d.classList.toggle('on', k <= step));
    prevBtn.hidden = step === 0;
    mascot.replaceChildren(tiko(step === steps.length - 1 ? 'juich' : step % 2 ? 'wow' : 'blij', 120));
    nextBtn.replaceChildren(...(step < steps.length - 1 ? ['Verder', icon('next')] : [icon('play'), 'Probeer het!']));
  }

  const intro = h('section.lesson-intro',
    h('p.kicker', `Les ${idx + 1}`), h('h1', lesson.title),
    h('div.lesson-stage', mascot, bubble),
    dots,
    h('div.actions.center', prevBtn, nextBtn),
    h('button.linklike', { type: 'button', onclick: startPractice }, 'Uitleg overslaan'));

  // ---------- oefenen ----------
  const done = h('div.lesson-done', { hidden: true },
    h('a.btn.primary.xl', { href: next ? `#/les/${next.id}` : '#/' }, next ? 'Volgende les' : 'Terug naar de tuin', icon('next')));
  const practice = h('section.lesson-practice', { hidden: true },
    h('div.task-bar', tiko('blij', 44), h('p', ex.task || 'Speel de toetsen die oplichten.'),
      h('button.btn.ghost.small', { type: 'button', onclick: () => { practice.hidden = true; intro.hidden = false; go(0); } }, icon('info', { size: 20 }), h('span', 'Uitleg'))),
    h('div.player-slot'), done);
  if (best['les:' + id]?.stars > 0) done.hidden = false;

  function startPractice() {
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
        nextHref: next ? `#/les/${next.id}` : '#/',
        onDone: (r, full) => {
          if (full && r.stars > 0) done.hidden = false;
        },
      });
      practice.querySelector('.player-slot').append(player.el);
    }
  }

  go(0);
  const view = h('div.view.lesson', intro, practice);
  view.destroy = () => player?.destroy();
  return view;
}

// **vet** in lesteksten
function paragraph(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part) => (part.startsWith('**') ? h('strong', part.slice(2, -2)) : part));
}
