import './styles.css';
import { h, clear } from './ui/dom.js';
import { restoreProfile, currentProfile, onProfileChange } from './core/profiles.js';
import { applyInputSettings } from './input/manager.js';
import { initComputerKeys } from './input/computerKeys.js';
import { unlockAudio } from './audio/audio.js';
import { pathView } from './ui/views/path.js';
import { lessonView } from './ui/views/lesson.js';
import { songsView, songView } from './ui/views/songs.js';
import { songEditorView } from './ui/views/songEditor.js';
import { progressView } from './ui/views/progress.js';
import { profilesView } from './ui/views/profiles.js';
import { settingsView } from './ui/views/settings.js';

const routes = [
  [/^\/?$/, pathView, 'pad'],
  [/^\/les\/([\w-]+)$/, lessonView, 'pad'],
  [/^\/liedjes$/, songsView, 'liedjes'],
  [/^\/lied\/([\w-]+)(?:\/(\d))?$/, songView, 'liedjes'],
  [/^\/eigen\/nieuw$/, () => songEditorView(null), 'liedjes'],
  [/^\/eigen\/(eigen-[\w-]+)$/, songEditorView, 'liedjes'],
  [/^\/voortgang$/, progressView, 'voortgang'],
  [/^\/instellingen$/, settingsView, 'instellingen'],
  [/^\/profielen$/, profilesView, 'profielen'],
];

const main = h('main#main', { tabIndex: -1 });
const profileBtn = h('a.profile-btn', { href: '#/profielen', 'aria-label': 'Profiel wisselen' });
const navItems = [
  ['pad', '#/', '🌱', 'Leerpad'],
  ['liedjes', '#/liedjes', '🎼', 'Liedjes'],
  ['voortgang', '#/voortgang', '📈', 'Voortgang'],
  ['instellingen', '#/instellingen', '⚙️', 'Instellingen'],
];
const nav = h('nav.tabs', { 'aria-label': 'Hoofdmenu' }, navItems.map(([key, href, icon, label]) =>
  h('a', { href, 'data-key': key }, h('span.ti', { 'aria-hidden': 'true' }, icon), h('span.tl', label))));

document.getElementById('app').replaceChildren(
  h('a.skip', { href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Naar de inhoud'),
  h('header.topbar',
    h('a.brand', { href: '#/' }, h('img', { src: import.meta.env.BASE_URL + 'icons/icon.svg', alt: '', width: 32, height: 32 }), h('span', 'Toetsentuin')),
    nav, profileBtn),
  main);

let currentView = null;
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  if (!currentProfile() && path !== '/profielen') {
    location.replace('#/profielen');
    return;
  }
  const [re, view, tab] = routes.find(([r]) => r.test(path)) || routes[0];
  const args = path.match(re)?.slice(1) || [];
  nav.querySelectorAll('a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.key === tab));
  if (nav.querySelector('[aria-current]')) nav.querySelector('[aria-current]').setAttribute('aria-current', 'page');
  try {
    const el = await view(...args);
    if (token !== renderToken) return el.destroy?.();
    currentView?.destroy?.();
    currentView = el;
    clear(main).append(el);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    clear(main).append(h('div.view', h('h1', 'Oeps'), h('p', 'Er ging iets mis bij het laden: ' + err.message), h('a.btn', { href: '#/' }, 'Naar het leerpad')));
  }
}

function updateProfileBtn(p) {
  profileBtn.replaceChildren(h('span.avatar', { 'aria-hidden': 'true' }, p ? p.avatar : '👤'), h('span.pname', p ? p.name : 'Profiel'));
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
