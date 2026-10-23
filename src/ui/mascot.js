// Tiko, de mascotte: een vrolijk plantje dat in korte zinnen uitlegt wat je moet doen.
// Eigen ontwerp. Stemmingen: blij, wow, juich, denk.
import { h } from './dom.js';

const MOUTH = {
  blij: '<path d="M41 62 q9 8 18 0" stroke="#3a2a1c" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  wow: '<ellipse cx="50" cy="64" rx="5" ry="6" fill="#3a2a1c"/>',
  juich: '<path d="M38 60 q12 14 24 0 z" fill="#3a2a1c"/><path d="M44 66 q6 4 12 0" fill="#f26d6d"/>',
  denk: '<path d="M43 64 h14" stroke="#3a2a1c" stroke-width="3.5" stroke-linecap="round"/>',
};

export function tiko(mood = 'blij', size = 72) {
  const eyes = mood === 'juich'
    ? '<path d="M34 48 q5 -6 10 0 M56 48 q5 -6 10 0" stroke="#3a2a1c" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    : '<circle cx="39" cy="48" r="4.5" fill="#3a2a1c"/><circle cx="61" cy="48" r="4.5" fill="#3a2a1c"/><circle cx="40.5" cy="46.5" r="1.4" fill="#fff"/><circle cx="62.5" cy="46.5" r="1.4" fill="#fff"/>';
  const wrap = document.createElement('span');
  wrap.className = `tiko tiko-${mood}`;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 100 100" width="${size}" height="${size}">
    <path d="M50 30 C50 18 44 10 30 8 C30 20 38 28 50 30Z" fill="#6cc08b"/>
    <path d="M50 30 C50 16 58 8 74 6 C74 20 64 28 50 30Z" fill="#4fa874"/>
    <path d="M50 22 V32" stroke="#3f8c5f" stroke-width="4" stroke-linecap="round"/>
    <circle cx="50" cy="58" r="32" fill="#7fd29b"/>
    <circle cx="50" cy="58" r="32" fill="url(#tg)"/>
    <defs><radialGradient id="tg" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="31" cy="62" r="5" fill="#ff9e8a" opacity=".7"/><circle cx="69" cy="62" r="5" fill="#ff9e8a" opacity=".7"/>
    ${eyes}${MOUTH[mood] || MOUTH.blij}
  </svg>`;
  return wrap;
}

/** Tiko met een tekstballon. */
export function tikoSays(text, { mood = 'blij', size = 64, cls = '' } = {}) {
  const bubble = h('div.bubble', { role: 'status', 'aria-live': 'polite' }, text);
  const el = h('div.tiko-says', { class: cls }, tiko(mood, size), bubble);
  el.say = (t, m) => {
    bubble.textContent = t;
    if (m) el.replaceChild(tiko(m, size), el.firstChild);
  };
  return el;
}
