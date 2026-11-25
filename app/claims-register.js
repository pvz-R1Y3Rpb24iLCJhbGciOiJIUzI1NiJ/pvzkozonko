import { esc, icon, rub, ruDate, todayMsk } from './ui.js';
import { claims, MP, INTERNAL } from './data.js';

const SIZE = 50;
const OZON = 'https://turbo-pvz.ozon.ru/claims/claims/list/in-progress';
const num = new Intl.NumberFormat('ru-RU');
const stamp = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' });
const keys = new Intl.Collator('ru', { numeric: true });
const sortBy = {
  date: (a, b) => b.date.localeCompare(a.date),
  deadline: (a, b) => (a.deadline || '9').localeCompare(b.deadline || '9') || (a.deadlineMs ?? Infinity) - (b.deadlineMs ?? Infinity),
  amount: (a, b) => b.sum - a.sum,
  reason: (a, b) => (a.reason || '\uffff').localeCompare(b.reason || '\uffff', 'ru')
};

export function renderRegister(pane, initial, { openClaim, decisionChip }) {
  let registry = initial, page = 1, pending = false, visible = [];
  pane.innerHTML = `<section class="claim-reg" aria-labelledby="claim-reg-title">
    <div class="claim-reg-head"><div><h2 id="claim-reg-title">Реестр претензий</h2><p class="claim-reg-meta" id="f-source"></p></div>
      <div class="claim-reg-actions"><button class="btn" id="f-refresh">Обновить реестр</button><a class="btn claim-reg-primary" href="${OZON}" target="_blank" rel="noopener" aria-describedby="f-how">Открыть Турбо ПВЗ ↗</a></div></div>
    <p class="claim-reg-how" id="f-how">«Проверить сейчас» в Турбо ПВЗ добавляет новые открытые претензии. Затем обновите реестр. Статусы и сроки известных карточек эта проверка не обновляет.</p>
    <p class="claim-reg-how" id="f-msg" role="status" hidden></p>
    <div class="claim-reg-filters"><label class="search">${icon('search')}<input class="input" id="f-q" aria-label="Поиск по претензиям" type="search" placeholder="Номер, ПВЗ, причина, товар"></label>
      <select class="select" id="f-mp" aria-label="Площадка"><option value="">Все площадки</option>${Object.entries(MP).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      <select class="select" id="f-st" aria-label="Статус"><option value="">Все статусы</option><option value="open">Открытые</option><option value="done">Закрытые и решённые</option>${Object.entries(INTERNAL).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      <select class="select" id="f-sort" aria-label="Сортировка"><option value="date">Сначала новые</option><option value="deadline">По сроку ответа</option><option value="amount">По сумме ↓</option><option value="reason">По причине</option></select></div>
    <div class="claim-reg-summary"><span id="f-n" role="status"></span><span id="f-range"></span></div>
    <table class="claim-reg-table" role="table"><thead><tr><th scope="col">Претензия</th><th scope="col">ПВЗ</th><th scope="col">Причина / поток</th><th scope="col" class="claim-reg-money">Сумма</th><th scope="col">Срок ответа</th><th scope="col">Статус / решение</th></tr></thead><tbody id="tb" role="rowgroup"></tbody></table>
    <div id="f-empty" class="claim-reg-empty" hidden>По этим фильтрам ничего не найдено.</div>
    <nav class="claim-reg-pages" aria-label="Страницы реестра"><button class="btn" data-page="first" aria-label="Первая страница">«</button><button class="btn" data-page="prev" aria-label="Предыдущая страница">‹</button><label>Страница <input class="input" id="f-page" type="number" min="1" step="1" aria-label="Номер страницы"> <span id="f-page-max"></span></label><button class="btn" data-page="next" aria-label="Следующая страница">›</button><button class="btn" data-page="last" aria-label="Последняя страница">»</button></nav>
  </section>`;
  const el = s => pane.querySelector(s);
  const table = el('#tb'), nav = el('.claim-reg-pages');
  const row = c => `<tr data-key="${esc(c.key)}" role="row">
      <td class="cr-id" role="cell"><button type="button" class="cr-open" ${pending ? 'disabled' : ''}>№${esc(c.id)}</button><small>${esc(MP[c.mp])} · ${ruDate(c.date, true)}</small></td>
      <td class="cr-pvz" role="cell">${esc(c.pvzText || '—')}</td>
      <td class="cr-reason" role="cell"><strong>${esc(c.reason || '—')}</strong>${c.flow ? `<small>${esc(c.flow)}</small>` : ''}${c.product && c.product !== c.reason ? `<small class="cr-product" title="${esc(c.product)}">${esc(c.product)}</small>` : ''}</td>
      <td class="cr-amount claim-reg-money num" role="cell">${c.raw.amount == null && c.raw.sum == null ? '—' : rub(c.sum, true)}</td>
      <td class="cr-deadline" role="cell">${c.deadline ? `<time datetime="${c.deadlineMs === null ? esc(c.deadline) : new Date(c.deadlineMs).toISOString()}">${c.deadlineMs === null ? ruDate(c.deadline, true) : `${stamp.format(c.deadlineMs)} МСК`}</time><small hidden></small>` : '—'}</td>
      <td class="cr-status" role="cell"><span class="cr-ext">${esc(c.ext || INTERNAL[c.internal] || '—')}</span>${decisionChip(c)}</td>
    </tr>`;
  const updateUrgency = () => {
    const now = Date.now(), today = todayMsk();
    for (const [i, c] of visible.entries()) {
      const cell = table.rows[i].querySelector('.cr-deadline'), label = cell.querySelector('small');
      if (!label) continue;
      const urgent = c.closed ? '' : (c.deadlineMs === null ? c.deadline < today : c.deadlineMs <= now) ? 'Просрочен' : c.deadline === today ? 'Сегодня' : '';
      cell.classList.toggle('cr-urgent', Boolean(urgent));
      label.hidden = !urgent;
      if (label.textContent !== urgent) label.textContent = urgent;
    }
  };
  const draw = () => {
    const mp = el('#f-mp').value, st = el('#f-st').value;
    const q = el('#f-q').value.trim().replace(/^№\s*/, '').toLowerCase();
    const order = sortBy[el('#f-sort').value];
    const found = registry.filter(c => (!mp || c.mp === mp)
      && (!st || (st === 'open' ? !c.closed : st === 'done' ? c.closed : c.internal === st))
      && (!q || `${c.id} ${c.pvzText} ${c.pvzCode} ${c.product} ${c.reason} ${c.flow}`.toLowerCase().includes(q)));
    found.sort((a, b) => order(a, b) || sortBy.date(a, b) || keys.compare(b.key, a.key));
    const max = Math.max(1, Math.ceil(found.length / SIZE));
    page = Math.max(1, Math.min(page, max));
    const start = (page - 1) * SIZE;
    visible = found.slice(start, start + SIZE);
    el('#f-n').textContent = `${num.format(found.length)} найдено · ${rub(found.reduce((sum, c) => sum + c.sum, 0))}`;
    el('#f-range').textContent = found.length ? `${num.format(start + 1)}–${num.format(start + visible.length)} из ${num.format(found.length)}` : '';
    el('#f-empty').hidden = found.length !== 0;
    nav.hidden = max === 1;
    el('#f-page').value = page;
    el('#f-page').max = max;
    el('#f-page-max').textContent = `из ${max}`;
    for (const btn of nav.querySelectorAll('[data-page]')) btn.disabled = ['first', 'prev'].includes(btn.dataset.page) ? page === 1 : page === max;
    table.innerHTML = visible.map(row).join('');
    updateUrgency();
  };
  const meta = () => {
    const last = registry.reduce((max, c) => c.mp === 'ozon' ? Math.max(max, Date.parse(c.raw.collected_at) || 0) : max, 0);
    el('#f-source').textContent = `${num.format(registry.length)} в базе · ${last ? `Последняя запись из Ozon: ${stamp.format(last)} МСК` : 'Нет отметки о выгрузке Ozon'}`;
  };
  const filter = () => { page = 1; draw(); };
  for (const id of ['#f-mp', '#f-st', '#f-sort']) el(id).onchange = filter;
  el('#f-q').oninput = filter;
  el('#f-page').onchange = e => { page = Math.trunc(e.target.valueAsNumber) || 1; draw(); };
  nav.onclick = e => {
    const action = e.target.closest('[data-page]')?.dataset.page;
    if (!action) return;
    page = { first: 1, prev: page - 1, next: page + 1, last: +el('#f-page').max }[action];
    draw();
    el('.claim-reg-summary').scrollIntoView({ block: 'start' });
  };
  el('#f-refresh').onclick = async e => {
    const button = e.currentTarget, message = el('#f-msg');
    pending = button.disabled = true;
    for (const item of table.querySelectorAll('.cr-open')) item.disabled = true;
    message.hidden = false; message.textContent = 'Читаю свежие данные…';
    try { registry = await claims({ fresh: true }); meta(); message.textContent = 'Реестр обновлён из базы.'; }
    catch { message.textContent = 'Не удалось обновить реестр. Показаны предыдущие данные.'; }
    finally { pending = button.disabled = false; draw(); }
  };
  table.onclick = e => {
    const entry = e.target.closest('[data-key]');
    if (entry && !pending) openClaim(registry.find(c => c.key === entry.dataset.key));
  };
  meta();
  draw();
  const timer = setInterval(() => table.isConnected ? updateUrgency() : clearInterval(timer), 15_000);
}
