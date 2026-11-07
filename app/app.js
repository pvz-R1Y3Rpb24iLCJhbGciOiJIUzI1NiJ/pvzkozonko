// Kozonko — одно приложение, разделы переключаются без перезагрузки (#раздел/параметр).
import { esc, icon, closeDrawer } from './ui.js';
import * as D from './data.js';

const SECTIONS = [
  { id: 'today', title: 'Сегодня', icon: 'today', load: () => import('./s-today.js') },
  { id: 'pvz', title: 'Пункты', icon: 'pvz', load: () => import('./s-pvz.js') },
  { id: 'people', title: 'Сотрудники', icon: 'people', load: () => import('./s-people.js') },
  { id: 'schedule', title: 'График и зарплата', icon: 'schedule', load: () => import('./s-embed.js'), embed: 'schedule' },
  { id: 'claims', title: 'Претензии и удержания', icon: 'claims', load: () => import('./s-claims.js') },
  { id: 'supplies', title: 'Расходники', icon: 'supplies', load: () => import('./s-supplies.js') },
  { id: 'returns', title: 'Возвраты', icon: 'returns', load: () => import('./s-embed.js'), embed: 'returns' },
  { id: 'analytics', title: 'Аналитика', icon: 'analytics', load: () => import('./s-embed.js'), embed: 'analytics' },
  { id: 'logs', title: 'Журнал', icon: 'logs', load: () => import('./s-logs.js') },
  { id: 'settings', title: 'Настройки', icon: 'settings', load: () => import('./s-embed.js'), embed: 'settings' }
];

const root = document.getElementById('app');
root.innerHTML = `
  <div class="shell">
    <aside class="side" aria-label="Разделы">
      <a class="brand" href="#today"><span class="brand-mark">K</span>Kozonko</a>
      <nav class="nav">${SECTIONS.map(s => `<a href="#${s.id}" data-id="${s.id}">${icon(s.icon)}<span>${esc(s.title)}</span><span class="badge" hidden></span></a>`).join('')}</nav>
      <div class="side-foot">
        <a href="../supplies_staff_2col.html" target="_blank" rel="noopener">${icon('ext')}Панель ПВЗ для сотрудников</a>
        <button type="button" id="logout">${icon('out')}Выйти</button>
      </div>
    </aside>
    <div class="main">
      <nav class="mnav" aria-label="Разделы">${SECTIONS.map(s => `<a href="#${s.id}" data-id="${s.id}">${esc(s.title)}</a>`).join('')}<a href="../supplies_staff_2col.html" target="_blank" rel="noopener">Панель ПВЗ ↗</a><a href="#" id="logout-m">Выйти</a></nav>
      <header class="topbar"><div><h1 id="v-title"></h1><div class="sub" id="v-sub"></div></div><div class="grow"></div><div class="row" id="v-actions"></div></header>
      <main class="view" id="view"></main>
    </div>
  </div>`;
document.getElementById('logout').addEventListener('click', () => window.KZ.logout());
document.getElementById('logout-m').addEventListener('click', e => { e.preventDefault(); window.KZ.logout(); });

const view = document.getElementById('view');
let cleanup = null, seq = 0;

// Меняет только переданные поля (повторный вызов с sub не стирает кнопки)
export function setHeader({ title, sub, actions }) {
  if (title != null) document.getElementById('v-title').textContent = title;
  if (sub != null) document.getElementById('v-sub').innerHTML = sub;
  if (actions != null) document.getElementById('v-actions').innerHTML = actions;
}
export function go(hash) { location.hash = hash; }

async function route() {
  const [id, ...rest] = (location.hash.slice(1) || 'today').split('/');
  const sec = SECTIONS.find(s => s.id === id) || SECTIONS[0];
  for (const a of document.querySelectorAll('.nav a, .mnav a')) a.toggleAttribute('aria-current', a.dataset.id === sec.id);
  document.querySelector(`.mnav a[data-id="${sec.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  const my = ++seq;
  if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
  closeDrawer();
  document.title = `${sec.title} · Kozonko`;
  setHeader({ title: sec.title, sub: '', actions: '' });
  view.innerHTML = '<div class="bento"><div class="skeleton s12" style="min-height:160px"></div><div class="skeleton s6"></div><div class="skeleton s6"></div></div>';
  try {
    await window.KZ.ready;
    const mod = (await sec.load()).default;
    if (my !== seq) return;
    view.innerHTML = '';
    cleanup = await mod.render(view, { params: rest.map(decodeURIComponent), section: sec, setHeader, go, refreshBadges }) || null;
  } catch (e) {
    console.error(e);
    if (my === seq) view.innerHTML = `<div class="tile"><b>Не удалось открыть раздел</b><span class="muted">${esc(e.message || e)}</span><div><button class="btn" onclick="location.reload()">Обновить страницу</button></div></div>`;
  }
}
window.addEventListener('hashchange', route);

// Счётчики в меню: что требует внимания
export async function refreshBadges() {
  const setBadge = (id, n) => { for (const b of document.querySelectorAll(`.nav a[data-id="${id}"] .badge`)) { b.hidden = !n; b.textContent = n; } };
  try {
    const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const [cl, req] = await Promise.all([D.claims(), D.load('/supplies/requests')]);
    setBadge('claims', cl.filter(c => !c.closed && !c.resp?.kind && c.date >= since).length);
    setBadge('supplies', D.values(req).filter(D.freshPending).length);
  } catch (e) { console.warn('badges', e); }
}

window.KZ.ready.then(() => { route(); refreshBadges(); });
