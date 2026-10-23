// Onderblad (bottom sheet) voor extra opties, zodat het hoofdscherm rustig blijft.
import { h } from './dom.js';
import { icon } from './icons.js';

export function openSheet(title, ...content) {
  const dlg = h('dialog.sheet', { 'aria-label': title },
    h('div.bs-head', h('h2', title), h('button.icon-btn', { type: 'button', 'aria-label': 'Sluiten', onclick: () => close() }, icon('close'))),
    h('div.bs-body', content));
  const close = () => {
    dlg.classList.add('closing');
    setTimeout(() => dlg.close(), 180);
  };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // klik op de achtergrond
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  return { dlg, close };
}

/** Schakelaar (aan/uit) met groot klikvlak. */
export function toggle(label, checked, onChange, { disabled = false, hint = null } = {}) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, disabled, onchange: (e) => onChange(e.target.checked) });
  return h('label.toggle', { class: disabled ? 'disabled' : '' }, h('span.toggle-text', h('span', label), hint ? h('small', hint) : null), input, h('span.switch', { 'aria-hidden': 'true' }));
}
