// Претензии и удержания — один раздел вместо «Претензий», «Отчётов по удержаниям», «Удержаний» и моста.
// Очередь: претензия → пункт и смена → кто работал → «Удержать» / «За счёт компании» / «Оспорить».
import { esc, icon, avatar, empName, rub, plural, drawer, toast, formData, todayMsk, ruDate, bars, downloadCsv, MONTHS, confirmBox, ring, miniBars, stack, deco } from './ui.js';
import * as D from './data.js';

const TABS = [['', 'Ждут решения'], ['all', 'Все претензии'], ['ledger', 'Удержания']];
const ST = { due: ['К выплате', 'lav'], pending: ['Не учтено', 'warn'], written: ['Списано', 'ok'] };

export default {
  async render(view, { params, setHeader, go, refreshBadges }) {
    const tab = TABS.some(t => t[0] === params[0]) ? params[0] : '';
    // перерисовать раздел с новыми данными (тот же адрес не вызывает hashchange сам)
    const rerender = target => { if (location.hash === target || (target === '#claims' && !location.hash.startsWith('#claims/'))) window.dispatchEvent(new HashChangeEvent('hashchange')); else go(target); };
    setHeader({
      title: 'Претензии и удержания',
      actions: `<a class="btn" href="../scripts/claims-assistant.user.js" title="Скрипт Tampermonkey: сохраняет претензию из ТурбоПВЗ в базу одной кнопкой">${icon('download')}Скрипт для ТурбоПВЗ</a><button class="btn primary" id="ded-manual">${icon('plus')}Удержание вручную</button>`
    });
    const [claims, emps, pvzs, shiftPvz] = await Promise.all([D.claims(), D.employees(), D.pvzList(), D.shiftIndex()]);
    const pvzName = Object.fromEntries(pvzs.map(p => [p.id, D.pvzTitle(p)]));
    const tabs = await D.load('/appData/tabs', { ttl: 120_000 });
    for (const [id, t] of Object.entries(tabs || {})) if (!pvzName[id] && t?.name) pvzName[id] = t.name;
    const empById = Object.fromEntries(emps.map(e => [e.id, e]));
    const rows = D.ledger(emps, pvzName, shiftPvz);
    const today = todayMsk(), since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const queue = claims.filter(c => !c.closed && !c.resp?.kind && c.date >= since).sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
    const due = rows.filter(r => r.status === 'due');
    const ym = today.slice(0, 7);
    const solvedMonth = claims.filter(c => c.resp?.confirmed_at?.slice(0, 7) === ym || (c.raw.processing?.completed_at || '').slice(0, 7) === ym);
    const disputed = claims.filter(c => c.internal === 'disputed');
    setHeader({ sub: `Претензии маркетплейсов и удержания с сотрудников в одном месте` });

    const d30 = since;   // те же 60 дней, что и у очереди
    const last30 = claims.filter(c => c.date >= d30), dec30 = last30.filter(c => c.closed || c.resp?.kind);
    const urgent = queue.filter(c => c.deadline && (new Date(c.deadline) - new Date(today)) / 86400000 <= 3);
    const mKeys = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
    const byMonth = mKeys.map(k => rows.filter(r => (r.shift || '').startsWith(k)).reduce((x, r) => x + r.amount, 0));
    const dueEmps = [...new Set(due.map(r => r.empId))].map(id => empById[id]);
    view.innerHTML = `
      <section class="bento">
        <a class="tile coral s4" href="#claims">
          <div class="tile-head"><span class="icon-circle">${icon('claims')}</span><span class="label">Ждут решения</span></div>
          <span class="huge">${queue.length}</span>
          <span class="note">${rub(queue.reduce((x, c) => x + c.sum, 0))} за 60 дней</span>
          ${urgent.length ? `<span class="float-pill" style="right:18px;bottom:18px">🔥 ${urgent.length} ${plural(urgent.length, 'срочная', 'срочные', 'срочных')}</span>` : ''}
        </a>
        <a class="tile lav s4" href="#claims/ledger">
          <span class="label">К ближайшей выплате</span>
          <div class="row" style="align-items:flex-end"><span class="big">${rub(due.reduce((x, r) => x + r.amount, 0))}</span></div>
          <div class="row">${stack(dueEmps, 5)}<span class="note">${due.length} ${plural(due.length, 'удержание', 'удержания', 'удержаний')}</span></div>
          ${miniBars(byMonth, mKeys.map(k => MONTHS[+k.slice(5) - 1].slice(0, 3)))}
        </a>
        <div class="tile lime s4" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:18px">
          ${ring(last30.length ? dec30.length / last30.length : 0, { size: 132, stroke: 14, color: 'var(--v1)', track: '#fff', center: `<div><b>${last30.length ? Math.round(dec30.length / last30.length * 100) : 0}%</b><small>разобрано</small></div>` })}
          <div style="display:grid;gap:8px;min-width:0"><span class="label">За 60 дней</span><span class="big" style="font-size:40px">${dec30.length}<span style="opacity:.4">/${last30.length}</span></span>
            <span class="note">${disputed.length ? `${disputed.length} в споре на ${rub(disputed.reduce((x, c) => x + c.sum, 0))}` : 'споров нет'} · решено в этом месяце: ${solvedMonth.length}</span></div>
        </div>
      </section>
      <div class="row"><div class="seg" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-t="${k}" aria-pressed="${k === tab}">${n}${k === '' ? `<span class="cnt">${queue.length}</span>` : ''}</button>`).join('')}</div></div>
      <div id="pane"></div>`;
    view.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) go('#claims' + (b.dataset.t ? '/' + b.dataset.t : '')); });
    document.getElementById('ded-manual').onclick = () => manualDeduction();
    const pane = view.querySelector('#pane');

    if (tab === '') renderQueue(); else if (tab === 'all') renderAll(); else renderLedger();
    const openKey = tab === '' ? params[0] : params[1];
    if (openKey && openKey.includes(':')) { const c = claims.find(x => x.key === openKey); if (c) openClaim(c); }

    // ── очередь ──
    function renderQueue() {
      pane.innerHTML = queue.length ? `<div class="cards">${queue.map(card).join('')}</div>`
        : `<div class="tile lime"><span class="label">Очередь пуста</span><span class="big" style="font-size:30px">Все претензии разобраны</span><span class="note">Новые появятся здесь, как только скрипт в ТурбоПВЗ их сохранит</span></div>`;
      pane.addEventListener('click', e => { const c = e.target.closest('[data-key]'); if (c) openClaim(claims.find(x => x.key === c.dataset.key)); });
    }
    function card(c) {
      const left = c.deadline ? Math.ceil((new Date(c.deadline) - new Date(today)) / 86400000) : null;
      const dl = left == null ? '' : left < 0 ? '<span class="chip crit">срок прошёл</span>' : left <= 3 ? `<span class="chip crit">${left} ${plural(left, 'день', 'дня', 'дней')}</span>` : `<span class="chip">до ${ruDate(c.deadline)}</span>`;
      return `<button class="card${left != null && left <= 3 ? ' flag' : ''}" data-key="${esc(c.key)}">
        <div class="row" style="flex-wrap:nowrap"><span class="chip ${c.mp === 'ozon' ? 'dark' : c.mp === 'wb' ? 'lav' : 'lime'}">${esc(D.MP[c.mp])}</span><span class="small muted">№${esc(c.id)}</span><span class="grow"></span>${dl}</div>
        <div style="font-size:26px;font-weight:800;letter-spacing:-.02em" class="num">${c.sum ? rub(c.sum, true) : '—'}</div>
        <div class="small" style="overflow-wrap:anywhere">${esc(c.product || c.reason || 'Без описания')}</div>
        <div class="meta"><span>${esc(c.pvzText || 'Пункт не указан')}</span><span>${ruDate(c.date)}</span>${c.guessName ? `<span>Агент: ${esc(c.guessName)}</span>` : ''}</div>
      </button>`;
    }

    // ── все претензии ──
    function renderAll() {
      let mp = '', st = 'open', q = '';
      pane.innerHTML = `<div class="tile table-tile"><div class="row" style="padding:14px 16px">
          <select class="select" id="f-mp" style="width:auto"><option value="">Все площадки</option>${Object.entries(D.MP).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
          <select class="select" id="f-st" style="width:auto"><option value="open">Открытые</option><option value="">Все</option>${Object.entries(D.INTERNAL).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
          <label class="search">${icon('search')}<input class="input" id="f-q" type="search" placeholder="Номер, пункт, товар"></label><span class="grow"></span><span class="muted small" id="f-n"></span></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Дата</th><th>Площадка</th><th>№</th><th>Пункт</th><th>Товар / причина</th><th class="r">Сумма</th><th>Статус</th><th>Решение</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
      const tb = pane.querySelector('#tb');
      const draw = () => {
        const f = claims.filter(c => (!mp || c.mp === mp) && (!st || (st === 'open' ? !c.closed : c.internal === st)) && (!q || `${c.id} ${c.pvzText} ${c.product} ${c.reason}`.toLowerCase().includes(q)));
        pane.querySelector('#f-n').textContent = `${f.length} · ${rub(f.reduce((s, c) => s + c.sum, 0))}`;
        tb.innerHTML = f.slice(0, 500).map(c => `<tr data-key="${esc(c.key)}"><td>${ruDate(c.date, true)}</td><td>${esc(D.MP[c.mp])}</td><td>${esc(c.id)}</td><td class="clip">${esc(c.pvzText || '—')}</td>
          <td class="clip">${esc(c.product || c.reason || '—')}</td><td class="r">${c.sum ? rub(c.sum, true) : '—'}</td><td><span class="chip">${esc(c.ext || D.INTERNAL[c.internal])}</span></td>
          <td>${decisionChip(c)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Ничего не найдено</td></tr>';
      };
      pane.querySelector('#f-mp').onchange = e => { mp = e.target.value; draw(); };
      pane.querySelector('#f-st').onchange = e => { st = e.target.value; draw(); };
      pane.querySelector('#f-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
      tb.addEventListener('click', e => { const r = e.target.closest('[data-key]'); if (r) openClaim(claims.find(x => x.key === r.dataset.key)); });
      draw();
    }
    function decisionChip(c) {
      if (c.resp?.kind === 'employee') return `<span class="chip lav">${esc(empName(empById[c.resp.employee_id]) || 'сотрудник')}</span>`;
      if (c.resp?.kind === 'company') return '<span class="chip">за счёт компании</span>';
      if (c.internal === 'disputed') return '<span class="chip warn">оспариваем</span>';
      if (c.closed) return '<span class="chip ok">закрыта</span>';
      return '<span class="chip crit">ждёт</span>';
    }

    // ── карточка претензии ──
    async function openClaim(c) {
      if (!c) return;
      const guess = D.matchPvz(c.pvzText, pvzs.filter(p => !p.test));
      const shiftDate = c.eventDate || c.date || today;
      const hist = Object.values(c.raw.history || {}).filter(h => h && (h.text || h.type)).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      const left = c.deadline ? Math.ceil((new Date(c.deadline) - new Date(today)) / 86400000) : null;
      const decided = !!c.resp?.kind;
      const d = drawer({
        title: `${esc(D.MP[c.mp])} №${esc(c.id)}`,
        sub: `${esc(c.ext || D.INTERNAL[c.internal])} · от ${ruDate(c.date, true)}`,
        body: `
          <div class="bento">
            <div class="tile dark s6" style="padding:16px"><span class="label">Сумма претензии</span><span class="big" style="font-size:32px">${c.sum ? rub(c.sum, true) : '—'}</span></div>
            <div class="tile ${left != null && left <= 3 ? 'coral' : 'soft'} s6" style="padding:16px"><span class="label">Срок ответа</span><span class="big" style="font-size:32px">${c.deadline ? ruDate(c.deadline) : '—'}</span>${left != null ? `<span class="note">${left < 0 ? 'просрочен' : `осталось ${left} ${plural(left, 'день', 'дня', 'дней')}`}</span>` : ''}</div>
          </div>
          <div class="box"><dl class="kv">
            <dt>Пункт</dt><dd>${esc(c.pvzText || '—')}</dd>
            ${c.product ? `<dt>Товар</dt><dd>${esc(c.product)}</dd>` : ''}
            ${c.reason ? `<dt>Причина</dt><dd>${esc(c.reason)}</dd>` : ''}
            ${c.eventDate ? `<dt>Дата события</dt><dd>${ruDate(c.eventDate, true)}</dd>` : ''}
            ${c.guessName ? `<dt>Агент считает</dt><dd>${esc(c.guessName)}</dd>` : ''}
            ${c.url ? `<dt>Источник</dt><dd><a href="${esc(c.url)}" target="_blank" rel="noopener">Открыть в кабинете ↗</a></dd>` : ''}
          </dl></div>
          ${decided ? decisionBox(c) : `
          <form class="box" id="dec" autocomplete="off">
            <b>Кто отвечает</b>
            <div class="fields">
              <label class="field"><span>Пункт</span><select class="select" name="pvzId"><option value="">— выберите —</option>${pvzs.filter(p => !p.test).map(p => `<option value="${esc(p.id)}" ${guess?.id === p.id ? 'selected' : ''}>${esc(D.pvzTitle(p))}</option>`).join('')}</select>${guess ? '<span class="hint">Подобран по адресу из претензии</span>' : ''}</label>
              <label class="field"><span>Дата смены</span><input class="input" type="date" name="shiftDate" value="${esc(shiftDate)}"></label>
              <div class="field wide"><span>Работали в эту смену</span><div class="row" id="cands"><span class="muted small">Выберите пункт и дату</span></div></div>
              <label class="field"><span>Сотрудник</span><select class="select" name="employeeId"><option value="">— выберите —</option>${emps.filter(e => !e.hidden).sort((a, b) => empName(a).localeCompare(empName(b), 'ru')).map(e => `<option value="${esc(e.id)}">${esc(empName(e))}</option>`).join('')}</select></label>
              <label class="field"><span>Сумма удержания, ₽</span><input class="input" name="amount" inputmode="decimal" value="${c.sum ? String(c.sum).replace('.', ',') : ''}"></label>
              <label class="field wide"><span>Комментарий для табеля</span><input class="input" name="comment" value="${esc((c.product || c.reason || '').slice(0, 160))}"></label>
              <label class="check wide"><input type="checkbox" name="accounted" checked>Учесть в ближайшую выплату</label>
            </div>
          </form>`}
          ${hist.length ? `<div class="box"><b>История</b><div class="timeline">${hist.slice(0, 20).map(h => `<div><time>${ruDate(String(h.ts).slice(0, 10), true)}</time><span>${esc(h.text || h.type)}</span></div>`).join('')}</div></div>` : ''}`,
        foot: decided ? `<button class="btn" id="c-reopen">Вернуть в работу</button>` :
          `<button class="btn primary" id="c-emp">Удержать с сотрудника</button><button class="btn" id="c-company">За счёт компании</button><button class="btn" id="c-dispute">${c.internal === 'disputed' ? 'Оспаривание идёт' : 'Оспорить'}</button><span class="grow"></span><button class="btn danger" id="c-close">Закрыть без удержания</button>`,
        onClose: () => { const h = location.hash; if (h.includes(':')) history.replaceState(null, '', h.slice(0, h.lastIndexOf('/')) || '#claims'); }
      });

      const done = async (msg) => { toast(msg); d.close(); D.invalidate('/claims'); D.invalidate('/appData/employees'); refreshBadges(); rerender(tab ? '#claims/' + tab : '#claims'); };
      const now = () => new Date().toISOString();
      const form = d.el.querySelector('#dec');
      if (form) {
        const cands = d.el.querySelector('#cands');
        const upd = async () => {
          const f = formData(form);
          if (!f.pvzId || !f.shiftDate) { cands.innerHTML = '<span class="muted small">Выберите пункт и дату</span>'; return; }
          const ids = await D.whoWorked(f.pvzId, f.shiftDate);
          cands.innerHTML = ids.length ? ids.map(id => empById[id]).filter(Boolean).map(e => `<button type="button" class="chip" data-emp="${esc(e.id)}" style="border:0;cursor:pointer;padding:6px 12px">${esc(empName(e))}</button>`).join('') : '<span class="muted small">По графику никого — выберите вручную</span>';
          if (ids.length === 1) { form.employeeId.value = ids[0]; mark(); }
        };
        const mark = () => { for (const b of cands.querySelectorAll('[data-emp]')) b.className = 'chip' + (b.dataset.emp === form.employeeId.value ? ' dark' : ''); };
        cands.addEventListener('click', e => { const b = e.target.closest('[data-emp]'); if (b) { form.employeeId.value = b.dataset.emp; mark(); } });
        form.pvzId.addEventListener('change', upd); form.shiftDate.addEventListener('change', upd); form.employeeId.addEventListener('change', mark);
        upd();

        d.foot.querySelector('#c-emp').onclick = async ev => {
          const f = formData(form);
          if (!f.employeeId) { toast('Выберите сотрудника', true); return; }
          if (!f.pvzId) { toast('Выберите пункт', true); return; }
          ev.currentTarget.disabled = true;
          try {
            const ded = await D.addDeduction({ employeeId: f.employeeId, pvzId: f.pvzId, pvzName: pvzName[f.pvzId], shiftDate: f.shiftDate, decisionDate: today, amount: f.amount,
              marketplace: c.mp === 'check' ? 'ozon' : c.mp, requestNumber: c.id, comment: f.comment, accounted: f.accounted });
            const t = now();
            await D.claimEvent(c, { responsibility: { kind: 'employee', employee_id: f.employeeId, deduction_id: ded.id, amount: ded.amountKopecks / 100, pvz_id: f.pvzId, shift_date: f.shiftDate, confirmed_by: 'Управляющий', confirmed_at: t },
              'processing/status': 'processed', 'processing/updated_at': t, 'processing/completed_at': t }, `Удержано ${rub(ded.amountKopecks / 100, true)} с сотрудника ${empName(empById[f.employeeId])}`);
            done('Удержание записано в табель');
          } catch (err) { toast(err.message, true); ev.currentTarget.disabled = false; }
        };
        d.foot.querySelector('#c-company').onclick = async () => {
          const t = now();
          await D.claimEvent(c, { responsibility: { kind: 'company', confirmed_by: 'Управляющий', confirmed_at: t }, 'processing/status': 'processed', 'processing/updated_at': t, 'processing/completed_at': t }, 'Решение: за счёт компании');
          done('Отмечено: за счёт компании');
        };
        d.foot.querySelector('#c-dispute').onclick = async () => {
          await D.claimEvent(c, { 'processing/status': 'disputed', 'processing/updated_at': now() }, 'Оспариваем претензию');
          done('Претензия в споре');
        };
        d.foot.querySelector('#c-close').onclick = async () => {
          if (!await confirmBox({ title: 'Закрыть без удержания?', text: 'Претензия уйдёт из очереди. Деньги ни с кого не удерживаются.', ok: 'Закрыть' })) return;
          await D.claimEvent(c, { 'processing/status': 'closed', 'processing/updated_at': now(), 'processing/completed_at': now() }, 'Закрыта без удержания');
          done('Претензия закрыта');
        };
      } else {
        d.foot.querySelector('#c-reopen').onclick = async () => {
          if (!await confirmBox({ title: 'Вернуть в работу?', text: 'Решение снимется. Если с сотрудника уже удержали деньги, удалите удержание в табеле графика.', ok: 'Вернуть' })) return;
          await D.claimEvent(c, { responsibility: null, 'processing/status': 'in_progress', 'processing/updated_at': now() }, 'Возвращена в работу');
          done('Претензия снова в очереди');
        };
      }
    }
    function decisionBox(c) {
      const r = c.resp, e = empById[r.employee_id];
      return `<div class="box" style="background:${r.kind === 'employee' ? 'var(--lav)' : 'var(--tile-2)'}"><b>Решение</b>
        ${r.kind === 'employee' ? `<div class="person">${avatar(e)}<span class="nm">${esc(empName(e) || r.employee_id)}</span><b class="num" style="margin-left:auto">−${rub(r.amount || c.sum, true)}</b></div>` : '<span>За счёт компании</span>'}
        <span class="small" style="opacity:.75">${esc(r.confirmed_by || '')} · ${ruDate(String(r.confirmed_at || '').slice(0, 10), true)}${r.shift_date ? ' · смена ' + ruDate(r.shift_date, true) : ''}</span></div>`;
    }

    // ── удержания ──
    function renderLedger() {
      let m = '', p = '', e = '', s = '', q = '';
      const months = [...new Set(rows.map(r => (r.status === 'written' ? r.account : r.shift).slice(0, 7)).filter(Boolean))].sort().reverse();
      pane.innerHTML = `
        <div class="tile"><div class="row">
          <select class="select" id="l-m" style="width:auto"><option value="">Всё время</option>${months.map(x => `<option value="${x}">${MONTHS[+x.slice(5) - 1]} ${x.slice(0, 4)}</option>`).join('')}</select>
          <select class="select" id="l-p" style="width:auto;max-width:260px"><option value="">Все пункты</option>${pvzs.filter(x => !x.test).map(x => `<option value="${esc(x.id)}">${esc(D.pvzTitle(x))}</option>`).join('')}</select>
          <select class="select" id="l-e" style="width:auto;max-width:240px"><option value="">Все сотрудники</option>${[...new Set(rows.map(r => r.empId))].map(id => empById[id]).filter(Boolean).sort((a, b) => empName(a).localeCompare(empName(b), 'ru')).map(x => `<option value="${esc(x.id)}">${esc(empName(x))}</option>`).join('')}</select>
          <select class="select" id="l-s" style="width:auto"><option value="">Любой статус</option><option value="due">К выплате</option><option value="pending">Не учтено</option><option value="written">Списано</option></select>
          <label class="search">${icon('search')}<input class="input" id="l-q" type="search" placeholder="Номер, причина"></label>
          <button class="btn sm" id="l-csv">${icon('download')}CSV</button></div></div>
        <section class="bento"><div class="tile s6"><b>По пунктам</b><div id="l-bp"></div></div><div class="tile s6"><b>По сотрудникам</b><div id="l-be"></div></div></section>
        <div class="tile table-tile"><div class="row" style="padding:14px 16px"><b class="grow">Записи</b><span class="muted small" id="l-n"></span></div>
          <div class="table-wrap"><table class="t"><thead><tr><th>Смена</th><th>Сотрудник</th><th>Пункт</th><th class="r">Сумма</th><th>№</th><th>Причина</th><th>Статус</th></tr></thead><tbody id="l-tb"></tbody></table></div></div>`;
      const filtered = () => rows.filter(r => (!m || (r.status === 'written' ? r.account : r.shift).startsWith(m)) && (!p || r.pvzId === p) && (!e || r.empId === e) && (!s || r.status === s)
        && (!q || `${r.req} ${r.reason} ${empName(r.emp)} ${r.pvz}`.toLowerCase().includes(q)));
      const draw = () => {
        const f = filtered(), bp = new Map(), be = new Map();
        for (const r of f) { const k = r.pvz || 'Пункт не указан'; bp.set(k, (bp.get(k) || 0) + r.amount); be.set(empName(r.emp), (be.get(empName(r.emp)) || 0) + r.amount); }
        pane.querySelector('#l-bp').innerHTML = bars(bp); pane.querySelector('#l-be').innerHTML = bars(be);
        pane.querySelector('#l-n').textContent = `${f.length} · ${rub(f.reduce((x, r) => x + r.amount, 0))}`;
        pane.querySelector('#l-tb').innerHTML = f.map(r => `<tr data-k="${esc(r.key)}"><td>${ruDate(r.shift, true)}</td><td>${esc(empName(r.emp))}</td><td class="clip">${esc(r.pvz || '—')}${r.pvzGuessed ? ' <span title="Определён по графику">· по графику</span>' : ''}</td>
          <td class="r"><b>−${rub(r.amount, true)}</b></td><td>${esc(r.req || '—')}</td><td class="clip">${esc(r.comment || r.reason)}</td><td><span class="chip ${ST[r.status][1]}">${ST[r.status][0]}${r.status === 'written' && r.account ? ' ' + ruDate(r.account) : ''}</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Нет записей</td></tr>';
      };
      for (const [id, fn] of [['l-m', v => m = v], ['l-p', v => p = v], ['l-e', v => e = v], ['l-s', v => s = v]]) pane.querySelector('#' + id).onchange = ev => { fn(ev.target.value); draw(); };
      pane.querySelector('#l-q').oninput = ev => { q = ev.target.value.trim().toLowerCase(); draw(); };
      pane.querySelector('#l-csv').onclick = () => downloadCsv(`udergania_${m || 'vse'}.csv`, ['Смена', 'Сотрудник', 'Пункт', 'Сумма', 'Номер', 'Причина', 'Статус', 'Списано'],
        filtered().map(r => [r.shift, empName(r.emp), r.pvz, String(r.amount).replace('.', ','), r.req, r.comment || r.reason, ST[r.status][0], r.account]));
      pane.querySelector('#l-tb').addEventListener('click', ev => { const tr = ev.target.closest('[data-k]'); if (tr) openDeduction(rows.find(r => r.key === tr.dataset.k)); });
      draw();
    }
    function openDeduction(r) {
      const d = drawer({
        title: `−${rub(r.amount, true)}`, sub: `${esc(empName(r.emp))} · смена ${ruDate(r.shift, true)}`,
        body: `<div class="box"><dl class="kv"><dt>Статус</dt><dd><span class="chip ${ST[r.status][1]}">${ST[r.status][0]}</span></dd><dt>Пункт</dt><dd>${esc(r.pvz || '—')}</dd>
          ${r.req ? `<dt>Обращение</dt><dd>${esc(r.req)}</dd>` : ''}<dt>Причина</dt><dd>${esc(r.reason)}</dd>${r.account ? `<dt>Списано</dt><dd>${ruDate(r.account, true)}</dd>` : ''}</dl></div>
          <p class="muted small" style="margin:0">Списание в выплату и удаление делаются в табеле: «График и зарплата» → «Вычеты и премии».</p>`,
        foot: r.status === 'written' ? '<a class="btn" href="#schedule">Открыть табель</a>' : `<button class="btn primary" id="d-acc">${r.status === 'due' ? 'Не учитывать в ближайшей выплате' : 'Учесть в ближайшую выплату'}</button><a class="btn" href="#schedule">Открыть табель</a>`
      });
      d.foot.querySelector('#d-acc')?.addEventListener('click', async () => {
        try {
          const want = r.status !== 'due';
          const fresh = (await D.employees({ fresh: true })).find(x => x.id === r.empId);
          const res = await D.ref(`/appData/employees/${fresh._idx}/deductions/${r.idx}`).transaction(v => (v && (v.id ? v.id === r.raw.id : v.reason === r.raw.reason)) ? { ...v, accounted: want } : undefined);
          if (!res.committed) throw new Error('Запись изменилась, обновите страницу');
          D.invalidate('/appData/employees'); toast(want ? 'Учтено в ближайшей выплате' : 'Убрано из ближайшей выплаты'); d.close(); rerender('#claims/ledger');
        } catch (err) { toast(err.message, true); }
      });
    }

    function manualDeduction() {
      const d = drawer({
        title: 'Удержание вручную', sub: 'Без претензии в базе: штраф, недостача, порча',
        body: `<form class="box" id="md" autocomplete="off"><div class="fields">
          <label class="field"><span>Пункт</span><select class="select" name="pvzId"><option value="">— выберите —</option>${pvzs.filter(p => !p.test).map(p => `<option value="${esc(p.id)}">${esc(D.pvzTitle(p))}</option>`).join('')}</select></label>
          <label class="field"><span>Дата смены</span><input class="input" type="date" name="shiftDate" value="${today}"></label>
          <div class="field wide"><span>Работали в эту смену</span><div class="row" id="md-c"><span class="muted small">Выберите пункт</span></div></div>
          <label class="field"><span>Сотрудник</span><select class="select" name="employeeId"><option value="">— выберите —</option>${emps.filter(e => !e.hidden).sort((a, b) => empName(a).localeCompare(empName(b), 'ru')).map(e => `<option value="${esc(e.id)}">${esc(empName(e))}</option>`).join('')}</select></label>
          <label class="field"><span>Сумма, ₽</span><input class="input" name="amount" inputmode="decimal" placeholder="456,71"></label>
          <label class="field"><span>Площадка</span><select class="select" name="marketplace"><option value="ozon">Ozon</option><option value="wb">WB</option><option value="yandex">Яндекс</option><option value="avito">Авито</option><option value="other">Другое</option></select></label>
          <label class="field"><span>Номер обращения</span><input class="input" name="requestNumber" placeholder="если есть"></label>
          <label class="field wide"><span>Причина</span><input class="input" name="comment" placeholder="Повреждение товара"></label>
          <label class="check wide"><input type="checkbox" name="accounted" checked>Учесть в ближайшую выплату</label></div></form>`,
        foot: '<button class="btn primary" id="md-save">Записать удержание</button>'
      });
      const form = d.el.querySelector('#md'), c = d.el.querySelector('#md-c');
      const upd = async () => {
        const f = formData(form); if (!f.pvzId) return;
        const ids = await D.whoWorked(f.pvzId, f.shiftDate);
        c.innerHTML = ids.map(id => empById[id]).filter(Boolean).map(e => `<button type="button" class="chip" data-emp="${esc(e.id)}" style="border:0;cursor:pointer;padding:6px 12px">${esc(empName(e))}</button>`).join('') || '<span class="muted small">По графику никого</span>';
        if (ids.length === 1) form.employeeId.value = ids[0];
      };
      form.pvzId.onchange = upd; form.shiftDate.onchange = upd;
      c.addEventListener('click', e => { const b = e.target.closest('[data-emp]'); if (b) { form.employeeId.value = b.dataset.emp; for (const x of c.children) x.className = 'chip' + (x === b ? ' dark' : ''); } });
      d.foot.querySelector('#md-save').onclick = async ev => {
        const f = formData(form);
        if (!f.employeeId || !f.pvzId || !f.amount) { toast('Заполните пункт, сотрудника и сумму', true); return; }
        ev.currentTarget.disabled = true;
        try { await D.addDeduction({ ...f, pvzName: pvzName[f.pvzId], decisionDate: today }); toast('Удержание записано в табель'); d.close(); rerender('#claims/ledger'); }
        catch (err) { toast(err.message, true); ev.currentTarget.disabled = false; }
      };
    }
  }
};
