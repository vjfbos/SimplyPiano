// Minimale DOM-helper: h('div.klas#id', {attrs}, ...kinderen)
export function h(sel, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null) children.unshift(attrs);
    attrs = {};
  }
  const [tag, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const part of rest) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else if (part[0] === '#') el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') continue; // na de kinderen zetten (textarea/select)
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  // value als eigenschap: het attribuut doet niets bij <textarea> en <select> heeft eerst zijn opties nodig.
  if ('value' in attrs && attrs.value != null) el.value = attrs.value;
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function stars(n, max = 3, label = true) {
  return h('span.stars', { role: 'img', 'aria-label': label ? `${n} van ${max} sterren` : null },
    Array.from({ length: max }, (_, i) => h('span', { class: i < n ? 'on' : 'off', 'aria-hidden': 'true' }, i < n ? '★' : '☆')));
}

export function toast(text, kind = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div#toasts', { 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div.toast', { class: kind }, text);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3800);
}

export function formatMinutes(seconds) {
  if (seconds > 0 && seconds < 60) return '< 1 min';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} u ${m % 60} min`;
}
