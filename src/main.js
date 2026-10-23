import './styles.css';
import { h, clear } from './ui/dom.js';
import { restoreProfile, currentProfile, onProfileChange, getPractice, computeStreak } from './core/profiles.js';
import { applyInputSettings } from './input/manager.js';
import { initComputerKeys } from './input/computerKeys.js';
import { unlockAudio } from './audio/audio.js';
import { pathView } from './ui/views/path.js';
import { lessonView } from './ui/views/lesson.js';
import { songsView, songView } from './ui/views/songs.js';
import { songEditorView } from './ui/views/songEditor.js';
import { meView } from './ui/views/progress.js';
import { profilesView } from './ui/views/profiles.js';
import { settingsView } from './ui/views/settings.js';
import { chordsView, chordSheetView } from './ui/views/chords.js';
import { icon } from './ui/icons.js';

const redirect = (to) => () => {
  location.replace(to);
  return h('div');
};

// [patroon, view, tabblad, focus] — focus = tijdens het spelen geen menu, alleen een terugknop
const routes = [
  [/^\/?$/, pathView, 'leren'],
  [/^\/les\/([\w-]+)$/, lessonView, 'leren', '#/'],
  [/^\/liedjes$/, songsView, 'spelen'],
  [/^\/lied\/([\w-]+)(?:\/(\d))?$/, songView, 'spelen', '#/liedjes'],
  [/^\/eigen\/nieuw$/, () => songEditorView(null), 'spelen'],
  [/^\/eigen\/(eigen-[\w-]+)$/, songEditorView, 'spelen'],
  [/^\/akkoorden$/, chordsView, 'spelen'],
  [/^\/akkoorden\/([\w-]+)$/, chordSheetView, 'spelen'],
  [/^\/meespelen(?:\/.*)?$/, redirect('#/akkoorden'), 'spelen'],
  [/^\/ik$/, meView, 'ik'],
  [/^\/voortgang$/, redirect('#/ik'), 'ik'],
  [/^\/instellingen$/, settingsView, 'ik'],
  [/^\/profielen$/, profilesView, 'ik'],
];

const main = h('main#main', { tabIndex: -1 });
const profileBtn = h('a.profile-btn', { href: '#/ik', 'aria-label': 'Mijn pagina' });
const streakPill = h('a.streak-pill', { href: '#/ik', hidden: true });
const backBtn = h('a.back-btn', { href: '#/', 'aria-label': 'Terug' }, icon('back', { size: 26 }));
const navItems = [
  ['leren', '#/', 'sprout', 'Leren'],
  ['spelen', '#/liedjes', 'music', 'Spelen'],
  ['ik', '#/ik', 'user', 'Ik'],
];
const nav = h('nav.tabs', { 'aria-label': 'Hoofdmenu' }, navItems.map(([key, href, ic, label]) =>
  h('a', { href, 'data-key': key }, icon(ic, { size: 26 }), h('span.tl', label))));

document.getElementById('app').replaceChildren(
  h('a.skip', { href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Naar de inhoud'),
  h('header.topbar',
    backBtn,
    h('a.brand', { href: '#/' }, h('img', { src: import.meta.env.BASE_URL + 'icons/icon.svg', alt: '', width: 34, height: 34 }), h('span', 'Toetsentuin')),
    nav, h('div.top-right', streakPill, profileBtn)),
  main);

async function updateStreak() {
  if (!currentProfile()) return void (streakPill.hidden = true);
  const n = computeStreak(await getPractice());
  streakPill.hidden = false;
  streakPill.setAttribute('aria-label', `${n} ${n === 1 ? 'dag' : 'dagen'} op rij geoefend`);
  streakPill.classList.toggle('lit', n > 0);
  streakPill.replaceChildren(icon('flame', { size: 20 }), h('strong', String(n)));
}

let currentView = null;
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  if (!currentProfile() && path !== '/profielen') {
    location.replace('#/profielen');
    return;
  }
  const [re, view, tab, focusBack] = routes.find(([r]) => r.test(path)) || routes[0];
  const args = path.match(re)?.slice(1) || [];
  nav.querySelectorAll('a').forEach((a) => (a.dataset.key === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.body.classList.toggle('focus', !!focusBack);
  if (focusBack) backBtn.href = focusBack;
  updateStreak();
  try {
    const el = await view(...args);
    if (token !== renderToken) return el.destroy?.();
    currentView?.destroy?.();
    currentView = el;
    clear(main).append(el);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    clear(main).append(h('div.view.center', h('h1', 'Oeps!'), h('p', 'Er ging iets mis bij het laden: ' + err.message), h('a.btn.primary', { href: '#/' }, 'Naar de tuin')));
  }
}

function updateProfileBtn(p) {
  profileBtn.replaceChildren(h('span.avatar', { 'aria-hidden': 'true' }, p ? p.avatar : '🙂'), h('span.pname', p ? p.name : 'Profiel'));
}

onProfileChange((p) => {
  updateProfileBtn(p);
  if (p) applyInputSettings(p.settings);
});

// Audio mag pas starten na een gebaar van de gebruiker (iOS/Safari).
const unlockOnce = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', unlockOnce, true);
  window.removeEventListener('keydown', unlockOnce, true);
};
window.addEventListener('pointerdown', unlockOnce, true);
window.addEventListener('keydown', unlockOnce, true);

initComputerKeys();
window.addEventListener('hashchange', render);

(async () => {
  const p = await restoreProfile();
  updateProfileBtn(p);
  render();
})();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}));
}
