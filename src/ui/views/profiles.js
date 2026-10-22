// Profielen kiezen, aanmaken en verwijderen.
import { h } from '../dom.js';
import { listProfiles, createProfile, selectProfile, deleteProfile, currentProfile, AVATARS } from '../../core/profiles.js';

export async function profilesView() {
  const profiles = await listProfiles();
  const cur = currentProfile();
  let avatar = AVATARS[profiles.length % AVATARS.length];

  const nameInput = h('input', { type: 'text', maxLength: 20, placeholder: 'Naam', required: true, 'aria-label': 'Naam', autocomplete: 'off' });
  const avatarBox = h('div.avatar-pick', { role: 'radiogroup', 'aria-label': 'Kies een plaatje' }, AVATARS.map((a) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(a === avatar), 'aria-label': a,
    onclick: (e) => {
      avatar = a;
      avatarBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
    },
  }, a)));

  const form = h('form.card.new-profile', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (!nameInput.value.trim()) return nameInput.focus();
      const p = await createProfile(nameInput.value, avatar);
      await selectProfile(p.id);
      location.hash = '#/';
    },
  },
  h('h2', profiles.length ? 'Nieuw profiel' : 'Wie gaat er spelen?'),
  h('p.hint', 'Alles wordt alleen op dit apparaat bewaard. Je hebt geen account nodig.'),
  nameInput, avatarBox,
  h('button.btn.primary', { type: 'submit' }, 'Profiel maken'));

  return h('div.view.profiles',
    h('h1', 'Profielen'),
    profiles.length ? h('div.profile-grid', profiles.map((p) => h('div.profile-card', { class: p.id === cur?.id ? 'current' : '' },
      h('button.profile-pick', {
        type: 'button',
        onclick: async () => {
          await selectProfile(p.id);
          location.hash = '#/';
        },
      }, h('span.avatar', { 'aria-hidden': 'true' }, p.avatar), h('span', p.name), p.id === cur?.id ? h('small', 'actief') : null),
      h('button.icon-btn.danger', {
        type: 'button', 'aria-label': `Verwijder ${p.name}`,
        onclick: async () => {
          if (!confirm(`Profiel "${p.name}" en alle voortgang verwijderen?`)) return;
          await deleteProfile(p.id);
          location.hash = '#/profielen?' + Date.now();
        },
      }, '🗑')))) : null,
    form);
}
