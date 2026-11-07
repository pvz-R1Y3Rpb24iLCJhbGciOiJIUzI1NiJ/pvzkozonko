// Сотрудники: реестр, карточка, смены, удержания. Заменяет «Реестр сотрудников» и «Кто работал».
import { esc, icon, avatar, empName, rub, drawer, toast, formData, todayMsk, ruDate, plural, MONTHS, ring, stack } from './ui.js';
import * as D from './data.js';

const FIELDS = [
  ['name', 'Имя в графике', 'text', 'Коротко: «Аня К.»'],
  ['fullName', 'ФИО', 'text', 'Для документов'],
  ['rate', 'Ставка за смену, ₽', 'number', ''],
  ['birthday', 'День рождения', 'text', 'ДД.ММ'],
  ['tgChatId', 'VK ID', 'text', 'По нему бот узнаёт, кто открыл смену'],
  ['tgUsername', 'Ник в мессенджере', 'text', '@username'],
  ['paymentDetails', 'Реквизиты для выплат', 'text', 'Карта или счёт', 'wide'],
  ['staffPin', 'PIN личного кабинета', 'text', '4 цифры. Видит только управляющий'],
  ['color', 'Цвет в графике', 'color', '']
];

export default {
  async render(view, { params, setHeader, go }) {
    let q = '', mode = 'active';
    setHeader({ title: 'Сотрудники', actions: `<button class="btn" id="who-btn">Кто работал в день…</button><button class="btn primary" id="emp-add">${icon('plus')}Добавить</button>` });
    const [emps, pvzs, tabs] = await Promise.all([D.employees(), D.pvzList(), D.load('/appData/tabs', { ttl: 120_000 })]);
    const ym = todayMsk().slice(0, 7);
    const pvzName = Object.fromEntries(pvzs.map(p => [p.id, D.pvzShort(p)]));
    for (const [id, t] of Object.entries(tabs || {})) if (!pvzName[id] && t?.name) pvzName[id] = t.name;

    // смены сотрудника: empId -> [{date, pvzId}]
    const shifts = {};
    for (const [pvzId, tab] of Object.entries(tabs || {}))
      for (const [mKey, m] of Object.entries(tab?.monthData || {}))
        for (const [date, a] of Object.entries(m?.assignments || {}))
          for (const id of [a?.employeeId, a?.second?.employeeId]) if (id) (shifts[id] = shifts[id] || []).push({ date, pvzId, ym: mKey });
    const ledger = D.ledger(emps, pvzName);
    const dueBy = {};
    for (const r of ledger) if (r.status !== 'written') dueBy[r.empId] = (dueBy[r.empId] || 0) + r.amount;

    const active = emps.filter(e => !e.hidden), hidden = emps.filter(e => e.hidden);
    setHeader({ sub: `${active.length} работают · ${hidden.length} в архиве` });
    const withPin = active.filter(e => e.staffPin).length, noPay = active.filter(e => !e.paymentDetails), withDed = active.filter(e => dueBy[e.id]);
    const busy = active.filter(e => (shifts[e.id] || []).some(x => x.ym === ym)).sort((a, b) => (shifts[b.id] || []).filter(x => x.ym === ym).length - (shifts[a.id] || []).filter(x => x.ym === ym).length);
    view.innerHTML = `
      <section class="bento">
        <div class="tile lav s4"><span class="label">В графике в этом месяце</span><span class="huge">${busy.length}</span><div class="row">${stack(busy, 6)}<span class="note">из ${active.length} работающих</span></div></div>
        <div class="tile lime s4" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:18px">${ring(active.length ? withPin / active.length : 0, { size: 116, stroke: 12, color: 'var(--v1)', track: '#fff', center: `<div><b>${active.length ? Math.round(withPin / active.length * 100) : 0}%</b><small>с PIN</small></div>` })}
          <div style="display:grid;gap:6px;min-width:0"><span class="label">Личный кабинет</span><span class="note">${active.length - withPin} ${plural(active.length - withPin, 'человек', 'человека', 'человек')} без PIN — не смогут войти в кабинет в панели ПВЗ</span></div></div>
        <div class="tile ${noPay.length ? 'coral' : 's'} s2"><span class="label">Без реквизитов</span><span class="big">${noPay.length}</span></div>
        <div class="tile s2"><span class="label">С удержаниями</span><span class="big">${withDed.length}</span></div>
      </section>
      <div class="row">
        <div class="seg" role="group" aria-label="Кого показать"><button data-m="active" aria-pressed="true">Работают<span class="cnt">${active.length}</span></button><button data-m="hidden" aria-pressed="false">Архив<span class="cnt">${hidden.length}</span></button></div>
        <label class="search">${icon('search')}<input class="input" id="emp-q" type="search" placeholder="Имя, ФИО, VK ID" aria-label="Поиск сотрудника"></label>
      </div>
      <div class="cards" id="emp-list"></div>`;
    const list = view.querySelector('#emp-list');
    const draw = () => {
      const src = mode === 'active' ? active : hidden;
      const f = src.filter(e => !q || `${e.name} ${e.fullName} ${e.tgChatId} ${e.tgUsername}`.toLowerCase().includes(q))
        .sort((a, b) => empName(a).localeCompare(empName(b), 'ru'));
      list.innerHTML = f.map(e => {
        const n = (shifts[e.id] || []).filter(s => s.ym === ym).length;
        return `<button class="card" data-id="${esc(e.id)}">
          <div class="person">${avatar(e, 'md')}<div style="min-width:0;display:grid"><span class="nm">${esc(empName(e))}</span>${e.fullName && e.name ? `<span class="small muted">${esc(e.name)}</span>` : ''}</div></div>
          <div class="meta"><span>${n} ${plural(n, 'смена', 'смены', 'смен')} в графике на месяц</span>${e.rate ? `<span>${rub(e.rate)}/смена</span>` : ''}</div>
          <div class="row" style="gap:6px">${e.staffPin ? '<span class="chip ok">PIN есть</span>' : '<span class="chip">Нет PIN</span>'}${dueBy[e.id] ? `<span class="chip lav">Удержания ${rub(dueBy[e.id])}</span>` : ''}${!e.paymentDetails ? '<span class="chip warn">Нет реквизитов</span>' : ''}</div>
        </button>`;
      }).join('') || '<div class="empty">Никого не нашли</div>';
    };
    draw();
    view.querySelector('#emp-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    view.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; for (const x of view.querySelectorAll('.seg button')) x.setAttribute('aria-pressed', String(x === b)); draw(); });
    list.addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) go('#people/' + c.dataset.id); });
    document.getElementById('emp-add').onclick = () => openCard(null);
    document.getElementById('who-btn').onclick = whoWorked;
    if (params[0]) openCard(emps.find(e => e.id === params[0]) || null, true);

    function openCard(e, fromRoute) {
      const isNew = !e;
      e = e || { name: '', color: '#6c5ce7' };
      const my = (shifts[e.id] || []).filter(s => s.ym === ym).sort((a, b) => a.date.localeCompare(b.date));
      const mine = ledger.filter(r => r.empId === e.id);
      const due = mine.filter(r => r.status !== 'written').reduce((s, r) => s + r.amount, 0);
      const d = drawer({
        title: isNew ? 'Новый сотрудник' : esc(empName(e)),
        sub: isNew ? 'Появится в графике и в панели ПВЗ' : (e.hidden ? 'В архиве' : 'Работает'),
        body: `
          ${isNew ? '' : `<div class="row" style="flex-wrap:nowrap">${avatar(e, 'lg')}<div class="bento grow">
            <div class="tile lime s4" style="padding:14px"><span class="label">Смен на месяц</span><span class="big" style="font-size:30px">${my.length}</span></div>
            <div class="tile soft s4" style="padding:14px"><span class="label">Ставка</span><span class="big" style="font-size:30px">${e.rate ? rub(e.rate) : '—'}</span></div>
            <div class="tile ${due ? 'lav' : 'soft'} s4" style="padding:14px"><span class="label">Удержания</span><span class="big" style="font-size:30px">${rub(due)}</span></div></div></div>`}
          <form class="box" id="emp-form" autocomplete="off"><div class="fields">
            ${FIELDS.map(([k, label, type, hint, w]) => `<label class="field ${w || ''}"><span>${label}</span><input class="input" name="${k}" type="${type}" value="${esc(e[k] ?? '')}" ${type === 'text' && hint ? `placeholder="${esc(hint)}"` : ''}>${type !== 'text' || k === 'tgChatId' || k === 'staffPin' ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`).join('')}
            <label class="check"><input type="checkbox" name="bonuses_enabled" ${e.bonuses_enabled ? 'checked' : ''}>Участвует в премиях</label>
          </div></form>
          ${isNew ? '' : `<div class="box"><b>Смены в этом месяце по графику</b>${my.length ? `<div class="row" style="gap:6px">${my.map(s => `<span class="chip">${ruDate(s.date)} · ${esc(pvzName[s.pvzId] || s.pvzId)}</span>`).join('')}</div>` : '<span class="muted small">Смен нет</span>'}</div>
          <div class="box"><div class="row"><b class="grow">Удержания</b><a class="btn sm" href="#claims/ledger">Все удержания</a></div>
            ${mine.length ? mine.slice(0, 8).map(r => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="small muted" style="width:60px;flex:none">${ruDate(r.shift)}</span><span class="small grow" style="min-width:0;overflow-wrap:anywhere">${esc(r.comment || r.reason)}</span><b class="num small">−${rub(r.amount, true)}</b></div>`).join('') : '<span class="muted small">Удержаний не было</span>'}</div>`}`,
        foot: `<button class="btn primary" id="emp-save">${isNew ? 'Добавить сотрудника' : 'Сохранить'}</button>${isNew ? '' : `<span class="grow"></span><button class="btn" id="emp-hide">${e.hidden ? 'Вернуть из архива' : 'В архив'}</button>`}`,
        onClose: () => { if (fromRoute || location.hash.startsWith('#people/')) history.replaceState(null, '', '#people'); }
      });
      d.foot.querySelector('#emp-save').onclick = async ev => {
        const btn = ev.currentTarget, f = formData(d.el.querySelector('#emp-form'));
        if (!f.name.trim() && !f.fullName.trim()) { toast('Укажите имя', true); return; }
        if (f.staffPin && !/^\d{4}$/.test(f.staffPin.trim())) { toast('PIN — ровно 4 цифры', true); return; }
        const data = { ...f, name: f.name.trim(), fullName: f.fullName.trim(), rate: Number(f.rate) || 0, staffPin: f.staffPin.trim() };
        btn.disabled = true;
        try {
          if (isNew) { const id = await D.addEmployee(data); toast('Сотрудник добавлен'); d.close(); go('#people/' + id); }
          else {
            const changes = Object.fromEntries(Object.entries(data).filter(([k, v]) => String(e[k] ?? '') !== String(v ?? '') && !(k === 'bonuses_enabled' && !!e[k] === v)));
            if (Object.keys(changes).length) await D.updateEmployee(e, changes);
            Object.assign(e, changes); toast(Object.keys(changes).length ? 'Сохранено' : 'Изменений нет'); d.close(); draw();
          }
        } catch (err) { toast(err.message, true); btn.disabled = false; }
      };
      d.foot.querySelector('#emp-hide')?.addEventListener('click', async () => {
        try {
          await D.updateEmployee(e, { hidden: !e.hidden });
          e.hidden = !e.hidden;
          active.splice(0, active.length, ...emps.filter(x => !x.hidden)); hidden.splice(0, hidden.length, ...emps.filter(x => x.hidden));
          toast(e.hidden ? 'Сотрудник в архиве' : 'Сотрудник снова в графике'); d.close(); draw();
        } catch (err) { toast(err.message, true); }
      });
    }

    function whoWorked() {
      const d = drawer({
        title: 'Кто работал в день', sub: 'По графику смен',
        body: `<div class="box"><div class="fields"><label class="field"><span>Дата</span><input class="input" type="date" id="ww-date" value="${todayMsk()}"></label>
          <label class="field"><span>Пункт</span><select class="select" id="ww-pvz"><option value="">Все пункты</option>${pvzs.filter(p => !p.test).map(p => `<option value="${esc(p.id)}">${esc(D.pvzTitle(p))}</option>`).join('')}</select></label></div></div>
          <div id="ww-out" class="box"></div>`
      });
      const out = d.el.querySelector('#ww-out');
      const run = () => {
        const date = d.el.querySelector('#ww-date').value, pid = d.el.querySelector('#ww-pvz').value;
        if (!date) return;
        const rows = [];
        for (const p of pvzs.filter(x => !x.test && (!pid || x.id === pid))) {
          const a = tabs?.[p.id]?.monthData?.[date.slice(0, 7)]?.assignments?.[date] || {};
          const ids = [a.employeeId, a.second?.employeeId].filter(Boolean);
          rows.push(`<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="small" style="width:42%;flex:none">${esc(D.pvzTitle(p))}</span><div style="display:grid;gap:6px">${ids.map(id => emps.find(x => x.id === id)).filter(Boolean).map(x => `<a class="person" href="#people/${esc(x.id)}" style="text-decoration:none">${avatar(x)}<span class="nm">${esc(empName(x))}</span></a>`).join('') || '<span class="muted small">никого</span>'}</div></div>`);
        }
        out.innerHTML = rows.join('<hr style="border:0;border-top:1px solid var(--line);margin:4px 0">') || '<span class="muted">Нет данных</span>';
      };
      d.el.querySelector('#ww-date').addEventListener('change', run);
      d.el.querySelector('#ww-pvz').addEventListener('change', run);
      run();
    }
  }
};
