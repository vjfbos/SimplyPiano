// Coach-regel: een korte aanwijzing met een icoon. Zakelijk genoeg voor een 11-jarige, duidelijk genoeg voor een 8-jarige.
import { h } from './dom.js';
import { icon } from './icons.js';

const ICON = { info: 'sparkle', ok: 'check', wrong: 'close', warn: 'clock', idle: 'music' };

export function coach(text, { tone = 'info', ic = null, cls = '' } = {}) {
  const badge = h('span.coach-ico');
  const msg = h('span.coach-text', text);
  const el = h('div.coach', { class: `tone-${tone} ${cls}`, role: 'status', 'aria-live': 'polite' }, badge, msg);
  el.say = (t, tn = tone, i = null) => {
    el.className = `coach tone-${tn} ${cls}`.trim();
    badge.replaceChildren(icon(i || ICON[tn] || 'sparkle', { size: 20 }));
    msg.textContent = t;
  };
  el.say(text, tone, ic);
  return el;
}
