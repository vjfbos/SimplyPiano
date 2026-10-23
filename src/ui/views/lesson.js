// Eén les: korte uitleg in stappen, daarna oefenen.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { loadLesson, loadPath } from '../../core/content.js';
import { bestByItem } from '../../core/profiles.js';

export async function lessonView(id) {
  const [lesson, units, best, { createPlayer }] = await Promise.all([loadLesson(id), loadPath(), bestByItem(), import('../player.js')]);
  const flat = units.flatMap((u) => u.lessons);
  const idx = flat.findIndex((l) => l.id === id);
  const next = flat[idx + 1];
  const unit = units.find((u) => u.lessons.some((l) => l.id === id));
  const ex = lesson.exercise;
  let player = null;

  // ---------- uitleg in stappen ----------
  const steps = [...lesson.explanation, ...(lesson.tip ? [`Tip: ${lesson.tip}`] : [])];
  let step = 0;
  const counter = h('span.step-count');
  const body = h('p.step-text', { 'aria-live': 'polite' });
  const bar = h('div.step-bar', { 'aria-hidden': 'true' }, steps.map(() => h('span')));
  const prevBtn = h('button.btn.ghost', { type: 'button', onclick: () => go(step - 1) }, icon('back'), 'Terug');
  const nextBtn = h('button.btn.primary.big', { type: 'button', onclick: () => (step < steps.length - 1 ? go(step + 1) : startPractice()) });
  function go(i) {
    step = Math.max(0, Math.min(steps.length - 1, i));
    body.replaceChildren(...paragraph(steps[step]));
    body.classList.remove('fade');
    void body.offsetWidth;
    body.classList.add('fade');
    counter.textContent = `Stap ${step + 1} van ${steps.length}`;
    bar.querySelectorAll('span').forEach((d, k) => d.classList.toggle('on', k <= step));
    prevBtn.disabled = step === 0;
    nextBtn.replaceChildren(...(step < steps.length - 1 ? ['Volgende', icon('next')] : [icon('play'), 'Oefenen']));
  }

  const intro = h('section.lesson-intro',
    h('p.kicker', `Les ${idx + 1} · ${unit?.title || ''}`),
    h('h1', lesson.title),
    lesson.goal ? h('p.lead', lesson.goal) : null,
    h('div.step-card', bar, counter, body,
      h('div.step-actions', prevBtn, nextBtn)),
    h('button.linklike', { type: 'button', onclick: startPractice }, 'Uitleg overslaan'));

  // ---------- oefenen ----------
  const done = h('div.lesson-done', { hidden: true },
    h('a.btn.primary.big', { href: next ? `#/les/${next.id}` : '#/' }, next ? 'Volgende les' : 'Terug naar het overzicht', icon('next')));
  const practice = h('section.lesson-practice', { hidden: true },
    h('div.task-bar',
      h('div', h('p.kicker', `Les ${idx + 1}`), h('p.task-text', ex.task || 'Speel de gemarkeerde toetsen.')),
      h('button.btn.ghost.small', { type: 'button', onclick: () => { practice.hidden = true; intro.hidden = false; go(0); } }, icon('info', { size: 18 }), h('span', 'Uitleg'))),
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
