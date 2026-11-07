// Общие элементы интерфейса: экранирование, форматирование, иконки, шторка, тосты, диалог.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const rub = (n, exact) => (exact ? nf2 : nf0).format(exact ? n : Math.round(n || 0)) + ' ₽';
export const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
export const isoDate = x => { const s = String(x || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
export const ruDate = (d, withYear) => { d = isoDate(d); if (!d) return '—'; return `${d.slice(8, 10)}.${d.slice(5, 7)}${withYear ? '.' + d.slice(2, 4) : ''}`; };
export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Время МСК независимо от часового пояса компьютера
export function msk() { const d = new Date(); return new Date(d.getTime() + (d.getTimezoneOffset() + 180) * 60000); }
const p2 = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayMsk = () => ymd(msk());
export const tzOffset = tz => { const m = String(tz || '').match(/([+\-−])\s*(\d+)/); return m ? (m[1] === '+' ? 1 : -1) * Number(m[2]) * 60 : 0; };
export const toMin = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };

export const initials = e => (e?.fullName || e?.name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const empName = e => e?.fullName || e?.name || 'Без имени';
export function avatar(e, cls = '') {
  return e?.avatarUrl ? `<span class="av ${cls}"><img src="${esc(e.avatarUrl)}" alt="" loading="lazy"></span>`
    : `<span class="av ${cls}" style="${e?.color ? `background:${esc(e.color)}22;color:${esc(e.color)}` : ''}">${esc(initials(e))}</span>`;
}

const ICONS = {
  today: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  pvz: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.8.2 4.8 2 5.5 5.4"/>',
  schedule: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h3M13.5 13.5h3M7.5 17h3"/>',
  claims: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>',
  supplies: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  returns: '<path d="M4 7h11a5 5 0 0 1 0 10H8"/><path d="M8 3 4 7l4 4"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  logs: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5M15 12H4"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), err ? 5000 : 2600);
}

// Диалог подтверждения внутри страницы
export function confirmBox({ title, text, ok = 'Подтвердить', danger = false, typeToConfirm = '' }) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p class="muted" style="margin:0">${esc(text || '')}</p>
      ${typeToConfirm ? `<label class="field"><span>Введите «${esc(typeToConfirm)}», чтобы подтвердить</span><input class="input" id="cf-in"></label>` : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn" data-a="0">Отмена</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="1">${esc(ok)}</button></div></div>`;
    document.body.appendChild(back);
    const okBtn = back.querySelector('[data-a="1"]'), inp = back.querySelector('#cf-in');
    if (inp) { okBtn.disabled = true; inp.addEventListener('input', () => { okBtn.disabled = inp.value.trim() !== typeToConfirm; }); inp.focus(); } else okBtn.focus();
    const done = v => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', e => { if (e.target === back) done(false); const a = e.target.closest('[data-a]'); if (a && !a.disabled) done(a.dataset.a === '1'); });
  });
}

// Шторка справа: открыть с HTML; возвращает {el, body, foot, close}
let openDrawer = null;
export function drawer({ title, sub = '', body = '', foot = '', onClose }) {
  closeDrawer();
  const back = document.createElement('div'); back.className = 'drawer-back';
  const d = document.createElement('aside'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="drawer-head"><div style="display:grid;gap:4px;min-width:0"><h2>${title}</h2>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>
    <button class="x" aria-label="Закрыть">${icon('close')}</button></div><div class="drawer-body">${body}</div>${foot ? `<div class="drawer-foot">${foot}</div>` : ''}`;
  document.body.append(back, d);
  requestAnimationFrame(() => { back.classList.add('on'); d.classList.add('on'); });
  const close = () => {
    if (!d.isConnected) return;
    back.classList.remove('on'); d.classList.remove('on');
    setTimeout(() => { back.remove(); d.remove(); }, 230);
    document.removeEventListener('keydown', onKey);
    openDrawer = null; onClose && onClose();
  };
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.modal-back')) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', close);
  d.querySelector('.x').addEventListener('click', close);
  openDrawer = { el: d, body: d.querySelector('.drawer-body'), foot: d.querySelector('.drawer-foot'), close };
  return openDrawer;
}
export function closeDrawer() { if (openDrawer) openDrawer.close(); }

export function bars(groups, max = 8, fmt = rub) {
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  const m = top[0]?.[1] || 1;
  return top.length ? `<div class="bars">${top.map(([k, v]) => `<div class="bar"><span class="l" title="${esc(k)}">${esc(k)}</span><span class="v">${fmt(v)}</span><span class="tr"><span class="fl" style="width:${Math.max(3, v / m * 100)}%"></span></span></div>`).join('')}</div>`
    : '<div class="empty">Пока пусто</div>';
}

export function downloadCsv(name, head, rows) {
  const body = '﻿' + [head, ...rows].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const formData = root => Object.fromEntries($$('[name]', root).map(el => [el.name, el.type === 'checkbox' ? el.checked : el.value]));

// ── визуальные компоненты ──────────────────────────────────────────────────
// Кольцо прогресса: pct 0..1, center — HTML в середине
export function ring(pct, { size = 140, stroke = 14, color = 'currentColor', track = 'rgba(255,255,255,.22)', center = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, pct || 0));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}"/></svg>
    <div class="ring-c">${center}</div></div>`;
}

// Плавная кривая через точки (Catmull-Rom → Безье)
function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}
// «Волна»: несколько слоёв (снизу вверх суммируются), как на референсе
export function waves(series, { w = 640, h = 170, colors = ['#4f2fe0', '#7c63f7', '#b9a9fb'], labels = [] } = {}) {
  const n = Math.max(...series.map(s => s.length), 2);
  const stacked = series.map((_, k) => Array.from({ length: n }, (_, i) => series.slice(0, k + 1).reduce((a, s) => a + (s[i] || 0), 0)));
  const max = Math.max(1, ...stacked[stacked.length - 1]);
  const x = i => (i / (n - 1)) * w, y = v => h - 8 - (v / max) * (h - 28);
  const layers = stacked.map((vals, k) => ({ k, d: smooth(vals.map((v, i) => [x(i), y(v)])) })).reverse();
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${layers.map(({ k, d }) => `<path d="${d} L${w},${h} L0,${h} Z" fill="${colors[k % colors.length]}" opacity="${k === 0 ? 1 : .85}"/>`).join('')}
    ${labels.map((l, i) => l ? `<text x="${x(i)}" y="${h - 4}" font-size="11" fill="rgba(255,255,255,.75)" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(l)}</text>` : '').join('')}
  </svg>`;
}
export function miniBars(vals, labels, hi = vals.length - 1) {
  const m = Math.max(1, ...vals);
  return `<div class="mini-bars">${vals.map((v, i) => `<span class="${i === hi ? 'on' : ''}" style="height:${Math.max(7, v / m * 100)}%" title="${esc(labels[i])}: ${rub(v)}"></span>`).join('')}</div>
    <div class="mini-bars-l">${labels.map(l => `<span>${esc(l)}</span>`).join('')}</div>`;
}
export function stack(emps, max = 4) {
  const list = emps.filter(Boolean);
  return `<div class="stack">${list.slice(0, max).map(e => avatar(e)).join('')}${list.length > max ? `<span class="more">+${list.length - max}</span>` : ''}</div>`;
}
export function delta(cur, prev, { invert = false, suffix = '' } = {}) {
  if (!prev) return '';
  const pct = Math.round((cur - prev) / prev * 100);
  const good = invert ? pct <= 0 : pct >= 0;
  return `<span class="delta ${pct === 0 ? 'flat' : good ? '' : 'down'}">${pct > 0 ? '+' : ''}${pct}%${suffix}</span>`;
}
// Декоративная «пружина»/звезда для акцентных плиток
export function deco(kind = 'star', { size = 150, color = 'rgba(255,255,255,.9)', style = 'right:-18px;bottom:-22px' } = {}) {
  if (kind === 'coil') {
    let d = ''; for (let i = 0; i < 9; i++) { const x = 20 + i * 13; d += `<ellipse cx="${x}" cy="${60 + i * 6}" rx="16" ry="34" transform="rotate(35 ${x} ${60 + i * 6})" fill="none" stroke="${color}" stroke-width="9"/>`; }
    return `<svg class="deco" style="${style};width:${size}px;height:${size}px" viewBox="0 0 160 160" aria-hidden="true">${d}</svg>`;
  }
  const arms = Array.from({ length: 6 }, (_, i) => `<rect x="68" y="12" width="24" height="68" rx="12" fill="${color}" transform="rotate(${i * 30} 80 80)"/>`).join('');
  return `<svg class="deco" style="${style};width:${size}px;height:${size}px" viewBox="0 0 160 160" aria-hidden="true">${arms}${Array.from({ length: 6 }, (_, i) => `<rect x="68" y="80" width="24" height="68" rx="12" fill="${color}" transform="rotate(${i * 30} 80 80)"/>`).join('')}</svg>`;
}
