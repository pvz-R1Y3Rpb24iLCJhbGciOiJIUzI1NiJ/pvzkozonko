// Журнал: события ботов, панели ПВЗ, правки расходников и аудит смен в одной ленте.
// Заменяет «Логи системы ПВЗ» (две копии страницы).
import { esc, icon } from './ui.js';
import * as D from './data.js';

const SOURCES = [['/system_logs', 'sys'], ['/logs', 'log'], ['/supplies/edit_log', 'edit'], ['/supplies/shift_audit_log', 'audit']];
const KINDS = [['', 'Всё'], ['error', 'Ошибки'], ['shift', 'Смены'], ['supply', 'Расходники'], ['audit', 'Аудит смен'], ['bot', 'Бот']];

function kind(l, src) {
  const lvl = String(l.level || l.type || '').toUpperCase(), s = String(l.src || l.source || '').toLowerCase(), m = String(l.msg || l.message || l.action || '').toLowerCase();
  if (src === 'audit') return 'audit';
  if (lvl === 'ERROR' || lvl === 'WARN' || /ошибк|error|traceback|не удалось/.test(m)) return 'error';
  if (src === 'edit' || /расход|supply|inventory|заявк/.test(s + m)) return 'supply';
  if (/смен|open|close|открыт|закрыт|приём|приемк|panel/.test(s + m)) return 'shift';
  return 'bot';
}
// Время события в миллисекундах: из ключа (Date.now()_...), из msk «YYYY-MM-DD HH:MM» или из timestamp
function stamp(k, l) {
  const t = l.msk || l.msk_datetime || l.timestamp || l.ts || l.time;
  const iso = String(t || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4] - 3, +iso[5]);   // МСК
  if (typeof t === 'number' && t > 1e12) return t;
  const ms = parseInt(String(k).split('_')[0], 10);
  return ms > 1e12 ? ms : 0;
}
const fmt = ms => ms ? new Date(ms).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
function message(l) {
  if (Array.isArray(l.changes)) return `${l.source || 'Сотрудник'}: ${l.changes.map(c => `${c.name} — ${({ ok: 'есть', low: 'мало', warn: 'заканчивается' })[c.status] || c.status}`).join(', ')}`;
  if (l.msg || l.message) return l.msg || l.message;
  if (l.action) return [l.action, l.username].filter(Boolean).join(' · ');
  return JSON.stringify(l).slice(0, 200);
}

export default {
  async render(view, { setHeader }) {
    setHeader({ title: 'Журнал', sub: 'Что делали бот, сотрудники и управляющие', actions: `<button class="btn" id="lg-r">Обновить</button>` });
    let k = '', q = '';
    const pvzs = await D.pvzList();
    const pvzName = Object.fromEntries(pvzs.map(p => [p.id, D.pvzShort(p)]));
    const load = async () => {
      await window.KZ.ready;
      const parts = await Promise.all(SOURCES.map(([p, src]) => window.KZ.db().ref(p).orderByKey().limitToLast(300).once('value').then(s => Object.entries(s.val() || {}).map(([key, l]) => ({ key, l, src }))).catch(() => [])));
      return parts.flat().filter(x => x.l && typeof x.l === 'object').map(x => { const t = stamp(x.key, x.l); return { ...x, kind: kind(x.l, x.src), t, at: fmt(t) }; }).sort((a, b) => b.t - a.t);
    };
    let items = await load();
    view.innerHTML = `<div class="row"><div class="seg" id="lg-k">${KINDS.map(([v, n]) => `<button data-k="${v}" aria-pressed="${v === k}">${n}</button>`).join('')}</div>
      <label class="search">${icon('search')}<input class="input" id="lg-q" type="search" placeholder="Текст, пункт, сотрудник"></label></div>
      <div class="tile table-tile"><div class="table-wrap" style="max-height:none"><table class="t"><thead><tr><th style="width:120px">Когда</th><th style="width:120px">Тип</th><th>Событие</th><th style="width:170px">Пункт</th></tr></thead><tbody id="lg-tb"></tbody></table></div></div>`;
    const LBL = { error: ['Ошибка', 'crit'], shift: ['Смена', 'lime'], supply: ['Расходники', 'lav'], audit: ['Аудит', 'dark'], bot: ['Бот', ''] };
    const draw = () => {
      const f = items.filter(x => (!k || x.kind === k) && (!q || JSON.stringify(x.l).toLowerCase().includes(q))).slice(0, 600);
      view.querySelector('#lg-tb').innerHTML = f.map(x => {
        const l = x.l, msg = message(l);
        return `<tr style="cursor:default"><td class="num small">${esc(x.at)}</td><td><span class="chip ${LBL[x.kind][1]}">${LBL[x.kind][0]}</span></td><td style="overflow-wrap:anywhere">${esc(msg)}</td><td class="small muted">${esc(pvzName[l.pvz || l.pvz_id] || l.pvz_name || l.pvz || '')}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="empty">Событий нет</td></tr>';
    };
    view.querySelector('#lg-k').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; k = b.dataset.k; for (const x of view.querySelectorAll('#lg-k button')) x.setAttribute('aria-pressed', String(x === b)); draw(); });
    view.querySelector('#lg-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    document.getElementById('lg-r').onclick = async () => { items = await load(); draw(); };
    draw();
  }
};
