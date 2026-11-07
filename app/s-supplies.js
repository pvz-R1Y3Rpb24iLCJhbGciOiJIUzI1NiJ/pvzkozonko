// Расходники: заявки пунктов, остатки по всем пунктам, рекомендации ИИ.
// Заменяет «Обзор / Запросы» в админке и страницу «Лог чатов снабжения».
import { esc, icon, toast, plural, drawer, ring } from './ui.js';
import * as D from './data.js';

const TABS = [['', 'Заявки'], ['stock', 'Остатки'], ['ai', 'Рекомендации ИИ']];
const RS = { pending: ['Ждёт заказа', 'crit'], ordered: ['Заказано', 'warn'], received: ['Получено', 'ok'] };
const tsOf = r => { const m = String(r.id || '').match(/_(\d{12,})/); return m ? +m[1] : 0; };

export default {
  async render(view, { params, setHeader, go, refreshBadges }) {
    const tab = TABS.some(t => t[0] === params[0]) ? params[0] : '';
    setHeader({ title: 'Расходники', sub: 'Заявки сотрудников и остатки на пунктах', actions: `<a class="btn" href="#settings">Список расходников и пороги</a>` });
    const [reqRaw, inv, cfgGlobal, cfgPvz, pvzs] = await Promise.all([D.load('/supplies/requests', { fresh: true }), D.load('/supplies/inventory'), D.load('/supplies/config/global'), D.load('/supplies/config/pvz'), D.pvzList()]);
    const reqs = Object.entries(reqRaw || {}).filter(([, r]) => r && typeof r === 'object').map(([k, r]) => ({ ...r, _k: k, status: r.status || 'pending' })).sort((a, b) => tsOf(b) - tsOf(a));
    const live = pvzs.filter(p => !p.test);
    const lowPvz = live.filter(p => Object.values(inv?.[p.id] || {}).some(x => x?.status === 'low'));
    const fresh = r => Date.now() - tsOf(r) < 30 * 86400000;
    const stale = reqs.filter(r => r.status === 'pending' && !fresh(r)).length;
    const cnt = s => reqs.filter(r => r.status === s && (s !== 'pending' || fresh(r))).length;

    view.innerHTML = `
      <section class="bento">
        <a class="tile coral s4" href="#supplies"><div class="tile-head"><span class="icon-circle">${icon('supplies')}</span><span class="label">Ждут заказа</span></div><span class="huge">${cnt('pending')}</span><span class="note">${plural(cnt('pending'), 'заявка', 'заявки', 'заявок')} от пунктов за месяц</span></a>
        <div class="tile lav s4"><div class="tile-head"><span class="icon-circle">${icon('returns')}</span><span class="label">Заказано, едет</span></div><span class="huge">${cnt('ordered')}</span><span class="note">отметьте «Получено», когда привезут</span></div>
        <a class="tile lime s4" href="#supplies/stock" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:18px">
          ${ring(live.length ? (live.length - lowPvz.length) / live.length : 1, { size: 120, stroke: 13, color: 'var(--v1)', track: '#fff', center: `<div><b>${live.length - lowPvz.length}</b><small>из ${live.length}</small></div>` })}
          <div style="display:grid;gap:6px;min-width:0"><span class="label">Запасов хватает</span><span class="note">${lowPvz.length ? 'Нехватка: ' + lowPvz.slice(0, 4).map(p => esc(D.pvzShort(p))).join(', ') + (lowPvz.length > 4 ? '…' : '') : 'Во всех пунктах'}</span></div>
        </a>
      </section>
      <div class="row"><div class="seg">${TABS.map(([k, n]) => `<button data-t="${k}" aria-pressed="${k === tab}">${n}</button>`).join('')}</div></div>
      <div id="pane"></div>`;
    view.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) go('#supplies' + (b.dataset.t ? '/' + b.dataset.t : '')); });
    const pane = view.querySelector('#pane');

    if (tab === '') {
      let f = 'pending';
      pane.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="seg" id="rs">${[['pending', 'Ждут'], ['ordered', 'Заказано'], ['received', 'Получено'], ['', 'Все']].map(([k, n]) => `<button data-f="${k}" aria-pressed="${k === f}">${n}</button>`).join('')}</div></div><div class="cards" id="rl"></div>`;
      const draw = () => {
        pane.querySelector('#rl').innerHTML = reqs.filter(r => !f || (r.status === f && (f !== 'pending' || fresh(r)))).slice(0, 200).map(r => {
          const items = r.items && typeof r.items === 'object' ? Object.entries(r.items).map(([n, q]) => `${n}${q && q !== true ? ' — ' + q : ''}`) : [];
          return `<div class="card" style="cursor:default">
            <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="title grow">${esc(r.pvz_name || r.pvz_id)}</span><span class="chip ${RS[r.status]?.[1] || ''}">${RS[r.status]?.[0] || esc(r.status)}</span></div>
            <div style="overflow-wrap:anywhere">${items.length ? items.map(esc).join('<br>') : esc(r.free_text || r.text || '—')}</div>
            <div class="meta"><span>${esc(r.created_at || '')}</span>${r.ordered_at ? `<span>заказано ${esc(r.ordered_at)}</span>` : ''}</div>
            ${r.status === 'pending' ? `<div class="row"><button class="btn sm primary" data-act="ordered" data-k="${esc(r._k)}">Заказано</button></div>` : r.status === 'ordered' ? `<div class="row"><button class="btn sm lime" data-act="received" data-k="${esc(r._k)}">Получено</button></div>` : ''}
          </div>`;
        }).join('') || '<div class="empty">Заявок нет</div>';
        if (f === 'pending' && stale) pane.querySelector('#rl').insertAdjacentHTML('beforeend', `<div class="card" style="cursor:default;background:var(--tile-2);box-shadow:none"><b>${stale} ${plural(stale, 'старая заявка', 'старые заявки', 'старых заявок')} без отметки</b><span class="small muted">Старше месяца — скорее всего давно выполнены. Видны во вкладке «Все».</span><div class="row"><button class="btn sm" id="rs-arch">Отметить все полученными</button></div></div>`);
      };
      pane.querySelector('#rs').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; f = b.dataset.f; for (const x of pane.querySelectorAll('#rs button')) x.setAttribute('aria-pressed', String(x === b)); draw(); });
      pane.addEventListener('click', async e => {
        if (e.target.id === 'rs-arch') {
          e.target.disabled = true;
          const old = reqs.filter(r => r.status === 'pending' && !fresh(r)), at = new Date().toLocaleString('ru-RU');
          try {
            await D.ref('/supplies/requests').update(Object.fromEntries(old.flatMap(r => [[`${r._k}/status`, 'received'], [`${r._k}/received_at`, at], [`${r._k}/closed_note`, 'архив: старше месяца']])));
            old.forEach(r => { r.status = 'received'; }); D.invalidate('/supplies/requests'); toast(`Закрыто ${old.length}`); draw(); refreshBadges();
          } catch (err) { toast(err.message, true); e.target.disabled = false; }
          return;
        }
        const b = e.target.closest('[data-act]'); if (!b) return;
        b.disabled = true;
        const st = b.dataset.act, at = new Date().toLocaleString('ru-RU');
        try {
          await D.update(`/supplies/requests/${b.dataset.k}`, st === 'ordered' ? { status: 'ordered', ordered_at: at } : { status: 'received', received_at: at });
          Object.assign(reqs.find(r => r._k === b.dataset.k), { status: st, [st + '_at']: at });
          toast(st === 'ordered' ? 'Отмечено: заказано' : 'Отмечено: получено'); draw(); refreshBadges();
        } catch (err) { toast(err.message, true); b.disabled = false; }
      });
      draw();
    }

    if (tab === 'stock') {
      const names = Object.keys(cfgGlobal || {}).filter(n => cfgGlobal[n] && typeof cfgGlobal[n] === 'object').sort((a, b) => a.localeCompare(b, 'ru'));
      const cell = (p, n) => {
        if (cfgPvz?.[p.id]?.[n]?.enabled === false) return '<td class="muted" style="text-align:center">·</td>';
        const v = inv?.[p.id]?.[n];
        const s = v?.status;
        return `<td style="text-align:center" title="${esc(n)}${v?.last_updated ? ' · ' + esc(v.last_updated) : ''}">${s === 'low' ? '<span class="chip crit">мало</span>' : s === 'warn' ? '<span class="chip warn">заканч.</span>' : s === 'ok' ? '<span class="chip ok">есть</span>' : '<span class="muted">—</span>'}</td>`;
      };
      pane.innerHTML = `<div class="tile table-tile"><div class="table-wrap"><table class="t" style="min-width:${300 + names.length * 96}px"><thead><tr><th>Пункт</th>${names.map(n => `<th style="text-align:center;text-transform:none;letter-spacing:0">${esc(n)}</th>`).join('')}</tr></thead>
        <tbody>${live.map(p => `<tr style="cursor:default"><td><b>${esc(D.pvzShort(p))}</b></td>${names.map(n => cell(p, n)).join('')}</tr>`).join('')}</tbody></table></div></div>
        <p class="muted small" style="margin:0">Остатки отмечают сотрудники в панели ПВЗ. «·» — расходник отключён для пункта в настройках.</p>`;
    }

    if (tab === 'ai') {
      const raw = (await D.load('/supplies/ai_actions', { fresh: true })) || {};
      const acts = Object.entries(raw).filter(([, v]) => v && typeof v === 'object').sort((a, b) => +b[0] - +a[0]).slice(0, 120);
      const draw = () => {
        pane.innerHTML = acts.length ? `<div class="cards">${acts.map(([k, v]) => `<div class="card" style="cursor:default">
          <div class="row"><span class="small muted grow">${new Date(+k || Date.now()).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>${v.ordered ? '<span class="chip ok">заказано</span>' : '<span class="chip">не заказано</span>'}</div>
          <div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px">${esc(v.text || '')}</div>
          ${v.ordered ? '' : `<div class="row"><button class="btn sm primary" data-k="${esc(k)}">Отметить заказанным</button></div>`}</div>`).join('')}</div>`
          : '<div class="empty">ИИ-агент ещё ничего не записал</div>';
      };
      pane.addEventListener('click', async e => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        b.disabled = true;
        try { await D.update(`/supplies/ai_actions/${b.dataset.k}`, { ordered: true, ordered_at: Date.now() }); acts.find(a => a[0] === b.dataset.k)[1].ordered = true; toast('Отмечено'); draw(); }
        catch (err) { toast(err.message, true); b.disabled = false; }
      });
      draw();
    }
  }
};
