// Eigen iconenset (24×24, lijnen met ronde uiteinden). Kleur volgt currentColor.
const P = {
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 10c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M7 21h10"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor" stroke-linejoin="round"/>',
  flame: '<path d="M12 2.5c.8 3.4 5.5 5.6 5.5 10.8a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.4 2.7-5.6.2 1.8 1 3 2.1 3.3-.3-3.1.2-5.9.7-8.5z" fill="currentColor" stroke-linejoin="round"/><path d="M12 20c-1.6 0-2.6-1.1-2.6-2.6 0-1.7 1.3-2.6 2.1-3.6.2 1 .9 1.6 1.6 1.8.9.7 1.5 1.3 1.5 2.1 0 1.3-1.1 2.3-2.6 2.3z" fill="#fff" stroke="none" opacity=".55"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
  turtle: '<path d="M3 15.5c0-4.6 3.4-8.3 7.6-8.3s7.6 3.7 7.6 8.3z" fill="currentColor"/><path d="M17.6 13.2c.6-1.9 2-2.7 3.2-2.2 1.2.6 1 2.6-.4 3.2-.9.4-1.8.2-2.8-.1z" fill="currentColor"/><path d="M5.6 15.5l-.6 3M15.4 15.5l.6 3" stroke-width="2.8"/>',
  rabbit: '<ellipse cx="9" cy="6.5" rx="1.8" ry="4.5" fill="currentColor"/><ellipse cx="14.5" cy="6.5" rx="1.8" ry="4.5" fill="currentColor"/><circle cx="11.8" cy="15.5" r="5.5" fill="currentColor"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  guitar: '<circle cx="8" cy="16" r="5"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><path d="M11.5 12.5L20 4"/><path d="M18 3l3 3"/>',
  piano: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M8 5v14M13 5v14M18 5v14"/><path d="M8 5v8M13 5v8" stroke-width="4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  metronome: '<path d="M9 3h6l4 18H5z" stroke-linejoin="round"/><path d="M12 15l5-8"/><path d="M7.5 15h9"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7S5 18.5 4 16l-1.5-3.5a1.5 1.5 0 0 1 2.6-1.4L8 14"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke-linejoin="round"/>',
  file: '<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
};

export function icon(name, { size = 24, label = null, cls = '' } = {}) {
  const span = document.createElement('span');
  span.className = `ico ${cls}`.trim();
  if (label) {
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', label);
  } else span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return span;
}
