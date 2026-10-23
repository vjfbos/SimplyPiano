// Schakelaar bovenaan het tabblad "Spelen": Liedjes of Akkoorden.
import { h } from '../dom.js';
import { icon } from '../icons.js';

export function playSwitch(active) {
  return h('nav.play-switch', { 'aria-label': 'Spelen' },
    h('a', { href: '#/liedjes', 'aria-current': active === 'liedjes' ? 'page' : null }, icon('music'), 'Liedjes'),
    h('a', { href: '#/akkoorden', 'aria-current': active === 'akkoorden' ? 'page' : null }, icon('guitar'), 'Akkoorden'));
}
