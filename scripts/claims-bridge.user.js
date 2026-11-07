// ==UserScript==
// @name         ПВЗ — претензии и удержания
// @namespace    pvz-claims-bridge
// @version      1.0.1
// @description  Удержания по ПВЗ и смене, реквизиты претензий и единый реестр.
// @match        https://kozonko2.netlify.app/*
// @match        https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/admin/schedule.html*
// @updateURL    https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/scripts/claims-bridge.user.js
// @downloadURL  https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/scripts/claims-bridge.user.js
// @run-at       document-idle
// @grant        none
// @sandbox      raw
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const items = value => Object.values(value || {}).filter(Boolean);
  const normalizeNumber = value => String(value || '').trim().replace(/^№\s*/, '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();

  function parseAmount(value) {
    const text = String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Сумма: положительное число, максимум две цифры после запятой.');
    const [rubles, pennies = ''] = text.split('.');
    const result = Number(rubles) * 100 + Number(pennies.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result <= 0 || result > 100000000000) throw new Error('Сумма должна быть больше нуля и не больше 1 млрд ₽.');
    return result;
  }
  function validateDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Укажите дату в формате ГГГГ-ММ-ДД.');
    const date = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31') throw new Error('Укажите существующую дату от 2000 до 2100 года.');
    return value;
  }
  function shiftEmployees(tab, date) {
    validateDate(date);
    const assignments = tab?.monthData?.[date.slice(0, 7)]?.assignments || {};
    const legacy = date.split('-').map(Number).join('-');
    const ids = [];
    for (const key of new Set([date, legacy])) {
      const shift = assignments[key];
      if (typeof shift === 'string') ids.push(shift);
      else if (shift) ids.push(shift.employeeId, shift.second?.employeeId);
    }
    return [...new Set(ids.filter(Boolean))];
  }
  function buildDeduction(input, id, now) {
    for (const [key, label] of [['pvzId', 'ПВЗ'], ['employeeId', 'Сотрудник'], ['comment', 'Комментарий'], ['requestNumber', 'Номер обращения']]) {
      if (!String(input[key] || '').trim()) throw new Error('Заполните поле «' + label + '».');
    }
    if (!['ozon', 'wb', 'other'].includes(input.marketplace)) throw new Error('Выберите маркетплейс.');
    const shiftDate = validateDate(input.shiftDate);
    const decisionDate = validateDate(input.decisionDate);
    const requestNumber = normalizeNumber(input.requestNumber);
    if (!requestNumber || requestNumber.length > 120) throw new Error('Номер обращения должен содержать от 1 до 120 знаков.');
    const comment = input.comment.trim();
    if (comment.length > 2000) throw new Error('Комментарий не должен превышать 2000 знаков.');
    const amountKopecks = parseAmount(input.amount);
    const market = {ozon: 'Ozon', wb: 'WB', other: 'Другое'}[input.marketplace];
    // The host's payroll capture interpolates reason into innerHTML. Keep exact
    // source text in comment; use harmless visible angle glyphs in its legacy field.
    const reason = `${comment} · ${market} №${requestNumber} · вынесено ${decisionDate} · ${input.pvzName} · смена ${shiftDate}`.replace(/</g, '＜').replace(/>/g, '＞');
    return {
      id, bridgeVersion: 1, createdAt: now,
      amount: -amountKopecks / 100, amountKopecks,
      reason,
      date: shiftDate, accounted: input.accounted !== false,
      pvzId: input.pvzId, pvzName: input.pvzName || input.pvzId,
      employeeId: input.employeeId, shiftDate, decisionDate,
      marketplace: input.marketplace, requestNumber, comment
    };
  }
  function appendDeduction(employees, employeeId, deduction) {
    if (!employees) return null; // Firebase may initially call a transaction with an empty cache.
    const out = clone(employees);
    const all = items(out);
    const target = all.find(e => e.id === employeeId);
    if (!target) throw new Error('Сотрудник больше не найден в базе. Обновите страницу.');
    for (const employee of all) {
      for (const old of [...items(employee.deductions), ...items(employee.deductionHistory)]) {
        if (old.id === deduction.id) return out;
        if (old.requestNumber) {
          if (normalizeNumber(old.requestNumber) === deduction.requestNumber && old.marketplace === deduction.marketplace && old.pvzId === deduction.pvzId) {
            throw new Error(`Обращение №${deduction.requestNumber} уже записано у ${employee.name || employee.id}, включая историю.`);
          }
        } else {
          const escaped = deduction.requestNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp('(^|[^\\p{L}\\p{N}])' + escaped + '(?=$|[^\\p{L}\\p{N}])', 'iu').test(old.reason || '')) {
            throw new Error(`Номер №${deduction.requestNumber} найден в старой записи у ${employee.name || employee.id}. Проверьте её вручную.`);
          }
        }
      }
    }
    target.deductions = [...items(target.deductions), clone(deduction)];
    return out;
  }
  function records(employees) {
    return items(employees).flatMap(employee => ['deductions', 'deductionHistory'].flatMap(key => items(employee[key]).map(d => ({
      ...clone(d), employeeId: employee.id, employeeName: employee.name || employee.fullName || employee.id,
      status: key === 'deductionHistory' ? 'history' : d.accounted ? 'accounted' : 'pending'
    }))));
  }
  const core = {parseAmount, validateDate, shiftEmployees, buildDeduction, appendDeduction, records};
  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

  // @grant none / @sandbox raw is essential: app/dataRef/lastSynced are global lexical
  // bindings of the existing site, not window properties. Never create another Firebase app.
  const hostState = () => {
    if (typeof app === 'undefined' || !app || typeof dataRef === 'undefined' || typeof lastSynced === 'undefined' || !lastSynced) throw new Error('База сайта ещё не загружена. Обновите страницу и дождитесь табеля.');
    if (!Array.isArray(app.employees)) throw new Error('Формат сотрудников сайта изменился. Нужна проверка моста.');
    return app;
  };
  const dirty = () => (typeof hasUnsavedChanges !== 'undefined' && hasUnsavedChanges) || (typeof pendingRetry !== 'undefined' && Object.keys(pendingRetry).length > 0);
  const money = value => Number(value || 0).toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ₽';
  const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.split('-').reverse().join('.') : '—';
  const today = () => {const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const el = (tag, text, props = {}) => Object.assign(document.createElement(tag), props, text === undefined ? {} : {textContent: text});
  let saving = false;
  let ready = false;
  let currentState;
  const root = document.createElement('div');
  root.id = 'pvz-claims-bridge';
  const shadow = root.attachShadow({mode: 'open'});
  shadow.innerHTML = `
  <style>
    :host{font:14px Manrope,Arial,sans-serif;color:#172536;color-scheme:light}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer}
    button:disabled{cursor:wait;opacity:.55}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #92b7fb;outline-offset:2px}
    #launcher{position:fixed;right:22px;bottom:22px;z-index:100001;background:#1d4ed8;color:white;border:0;border-radius:8px;padding:13px 18px;font-weight:700;box-shadow:0 3px 12px #152d4b25}
    dialog{padding:0;width:min(1240px,calc(100vw - 40px));max-width:none;max-height:calc(100dvh - 40px);border:1px solid #cbd5e1;border-radius:12px;color:inherit;background:#fff;overflow:auto}
    dialog::backdrop{background:#14233866}header{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #e2e8f0}
    h1{font-size:21px;letter-spacing:-.5px;margin:0}h2{font-size:16px;margin:0}p{line-height:1.5;margin:5px 0;color:#526275}small{font-size:12px;color:#526275}
    .sub{font-size:12px;margin-top:4px}button{border:1px solid #cbd5e1;background:#fff;color:#243750;border-radius:6px;padding:9px 12px;font-weight:600;min-height:40px}
    .primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.layout{display:grid;grid-template-columns:370px minmax(0,1fr)}
    form{padding:22px 24px;background:#f8fafc;border-right:1px solid #e2e8f0}.fields{display:grid;gap:12px;margin-top:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    label{display:grid;gap:5px;font-size:12px;font-weight:700}input,select,textarea{width:100%;min-width:0;border:1px solid #bdc9d7;border-radius:6px;background:white;color:#172536;padding:9px 10px;min-height:40px}
    textarea{resize:vertical;min-height:76px}.check{display:flex;align-items:flex-start;gap:8px;font-weight:500;line-height:1.5}.check input{width:17px;height:17px;min-height:0;flex:none;margin:2px 0}
    #shiftHint{margin:0;font-size:12px}#preview{padding:12px 0;border-top:1px solid #d7e0eb;white-space:pre-line;font-size:12px;line-height:1.6;color:#334a65}
    #feedback{margin:12px 24px 0;padding:12px;border:1px solid #d5dfed;border-radius:6px;white-space:pre-line;line-height:1.5;overflow-wrap:anywhere}#feedback:empty{display:none}#feedback[data-error=true]{color:#991b1b;border-color:#fecaca;background:#fff7f7}
    .register{padding:22px 24px;min-width:0}.tools{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}.actions{display:flex;gap:8px;flex-wrap:wrap}.filters{display:grid;grid-template-columns:1fr 150px;gap:8px;margin:16px 0 10px}
    #totals{font-size:12px;margin:8px 0 14px}.table-wrap{overflow:auto;max-height:440px}table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}th{text-align:left;font-weight:600;color:#526275;position:sticky;top:0;background:white}td,th{padding:12px 6px;border-bottom:1px solid #e5eaf0;vertical-align:top;overflow-wrap:anywhere}th:first-child,td:first-child{padding-left:0}.amount{text-align:right;font-variant-numeric:tabular-nums;width:110px}td strong{display:block;color:#172536;font-size:13px}td small{display:block;margin-top:3px;font-size:11px}td.amount{color:#a52626;font-weight:700}th:nth-child(1){width:30%}th:nth-child(2){width:28%}
    #empty{padding:32px 0;color:#526275;line-height:1.6}footer{padding:12px 24px;border-top:1px solid #e2e8f0;font-size:11px;color:#526275}.muted{color:#526275}
    @media(max-width:900px){.layout{grid-template-columns:320px minmax(0,1fr)}form,.register{padding:18px 16px}.filters{grid-template-columns:1fr}header{padding:16px}.amount{width:90px}}
    @media(max-width:650px){dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px);border-radius:8px}.layout{display:block}form{border-right:0;border-bottom:1px solid #e2e8f0}.register{padding:20px 16px}h1{font-size:18px}.sub{max-width:230px}#launcher{right:12px;bottom:12px}header{gap:8px}.actions button{padding:8px}.table-wrap{max-height:400px}table{min-width:450px}.tools{align-items:flex-start}footer{padding:12px 16px}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  </style>
  <button id="launcher" type="button">Претензии и удержания</button>
  <dialog aria-labelledby="title">
    <header><div><h1 id="title">Претензии и удержания</h1><p class="sub">ПВЗ → смена → сотрудник → табель зарплат</p></div><button id="close" aria-label="Закрыть панель" type="button">Закрыть</button></header>
    <div id="feedback" role="status" aria-live="polite" tabindex="-1"></div>
    <div class="layout">
      <form id="entry"><h2>Новое удержание</h2><div class="fields">
        <label>ПВЗ<select id="pvzId" required></select></label>
        <div class="pair"><label>Дата смены<input id="shiftDate" type="date" min="2000-01-01" max="2100-12-31" required></label><label>Маркетплейс<select id="marketplace"><option value="ozon">Ozon</option><option value="wb">WB</option><option value="other">Другое</option></select></label></div>
        <label>Сотрудник<select id="employeeId" required></select></label><p id="shiftHint"></p>
        <div class="pair"><label>Сумма, ₽<input id="amount" type="text" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label><label>Дата вынесения<input id="decisionDate" type="date" min="2000-01-01" max="2100-12-31" required></label></div>
        <label>Номер обращения<input id="requestNumber" type="text" placeholder="Например, 30340172" maxlength="120" required autocomplete="off"></label>
        <label>Комментарий<textarea id="comment" placeholder="За что назначено удержание" maxlength="2000" required></textarea></label>
        <label class="check"><input id="accounted" type="checkbox" checked><span>Учесть в ближайшую выплату</span></label>
        <div id="preview">Выберите смену и заполните реквизиты.</div>
        <button class="primary" id="submit" type="submit">Записать удержание</button>
      </div></form>
      <section class="register" aria-labelledby="registryTitle"><div class="tools"><h2 id="registryTitle">Реестр удержаний</h2><div class="actions"><button id="refresh" type="button">Обновить</button><button id="export" type="button">Экспорт JSON</button></div></div>
        <div class="filters"><input id="search" aria-label="Поиск по реестру" type="search" placeholder="Обращение, сотрудник, ПВЗ…"><select id="status" aria-label="Статус удержания"><option value="all">Все статусы</option><option value="accounted">К выплате</option><option value="pending">Не учтены</option><option value="history">История</option></select></div>
        <p id="totals"></p><div class="table-wrap"><table><thead><tr><th>Обращение / смена</th><th>Сотрудник / ПВЗ</th><th>Комментарий / статус</th><th class="amount">Сумма</th></tr></thead><tbody id="rows"></tbody></table><div id="empty" hidden>Удержаний пока нет.<br>Первое можно внести в форме слева.</div></div>
        <p class="sub">Реестр общий для всех ПВЗ. Старые записи без реквизитов тоже видны. Списание и отмена учёта — в штатном табеле.</p>
      </section>
    </div><footer>Данные сохраняются в базе текущего сайта. Перед работой закройте другие вкладки табеля, чтобы старые копии не перезаписали изменения.</footer>
  </dialog>`;
  const $ = selector => shadow.querySelector(selector);
  const dialog = $('dialog');
  function feedback(text = '', error = false) { $('#feedback').textContent = text; $('#feedback').dataset.error = String(error); if (error) $('#feedback').focus(); }
  function options(select, values, placeholder) {
    select.replaceChildren();
    if (placeholder) select.append(el('option', placeholder, {value: ''}));
    for (const {value, label} of values) select.append(el('option', label, {value}));
  }
  function refreshEmployees() {
    const state = hostState();
    const tab = state.tabs[$('#pvzId').value];
    const ids = $('#shiftDate').value ? shiftEmployees(tab, $('#shiftDate').value) : [];
    const available = state.employees.filter(e => e && (!e.hidden || ids.includes(e.id)));
    options($('#employeeId'), available.map(e => ({value: e.id, label: `${e.name || e.fullName || e.id}${ids.includes(e.id) ? ' · в смене' : ''}`})), 'Выберите сотрудника');
    const known = ids.filter(id => available.some(e => e.id === id));
    if (ids.length === 1 && known.length === 1) $('#employeeId').value = known[0];
    $('#shiftHint').textContent = ids.length > 1 ? 'В смене несколько сотрудников или есть конфликт дат — выберите одного.' : known.length === 1 ? 'Сотрудник подставлен из графика. Его можно заменить.' : 'В графике нет сотрудника на эту дату. Выберите вручную.';
    preview();
  }
  function input() {
    const state = hostState();
    return Object.fromEntries(['pvzId','shiftDate','marketplace','employeeId','amount','decisionDate','requestNumber','comment'].map(key => [key, $('#' + key).value]).concat([['pvzName',state.tabs[$('#pvzId').value]?.name || ''],['accounted',$('#accounted').checked]]));
  }
  function preview() {
    try {
      const i = input();
      const employee = hostState().employees.find(e => e.id === i.employeeId);
      $('#preview').textContent = `${employee?.name || 'Сотрудник не выбран'} · ${i.pvzName || 'ПВЗ не выбран'}\nСмена ${dateLabel(i.shiftDate)} · вынесено ${dateLabel(i.decisionDate)}\n${i.amount ? 'Удержание: ' + money(-parseAmount(i.amount) / 100) : 'Введите положительную сумму'}${i.accounted ? ' · к ближайшей выплате' : ' · без учёта в выплате'}`;
    } catch (e) { $('#preview').textContent = e.message; }
  }
  function renderRecords() {
    const search = $('#search').value.trim().toLocaleLowerCase('ru');
    const status = $('#status').value;
    const filtered = records(hostState().employees).filter(d => (status === 'all' || d.status === status) && (!search || [d.requestNumber,d.employeeName,d.pvzName,d.reason,d.comment,d.shiftDate,d.decisionDate].join(' ').toLocaleLowerCase('ru').includes(search)));
    filtered.sort((a,b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
    $('#totals').textContent = `${filtered.length} записей · сумма ${money(filtered.reduce((sum,d) => sum + Number(d.amount || 0),0))}`;
    $('#rows').replaceChildren();
    for (const d of filtered) {
      const tr = el('tr');
      const details = el('td');
      details.append(el('strong', d.requestNumber ? '№' + d.requestNumber : 'Без номера'), el('small', `Смена ${dateLabel(d.shiftDate || d.date)}`), el('small', `Вынесено ${dateLabel(d.decisionDate)}`));
      const person = el('td'); person.append(el('strong', d.employeeName),el('small',d.pvzName || 'ПВЗ не указан'));
      const comment = el('td'); comment.append(el('span',d.comment || d.reason || 'Без комментария'),el('small',{history:'В истории',accounted:'К ближайшей выплате',pending:'Не учтено в выплате'}[d.status]));
      tr.append(details, person, comment, el('td',money(d.amount),{className:'amount'}));
      $('#rows').append(tr);
    }
    $('#empty').hidden = filtered.length > 0;
    $('#empty').textContent = search || status !== 'all' ? 'По этим условиям удержания не найдены.' : 'Удержаний пока нет. Первое можно внести в форме.';
  }
  function syncEmployees(value) {
    const employees = items(value);
    // Update both local copies so the site's next save does not replay a stale employees array.
    app.employees = clone(employees);
    lastSynced.employees = clone(employees);
    if (typeof renderPayrollList === 'function') renderPayrollList();
    if (typeof renderAllDeductionsList === 'function') renderAllDeductionsList();
    if (typeof renderDeductionsHistoryList === 'function') renderDeductionsHistoryList();
    if (typeof selectedEmployeeIdForViolations !== 'undefined' && typeof renderDeductionsList === 'function') {
      const selected = app.employees.find(e => e.id === selectedEmployeeIdForViolations);
      if (selected) renderDeductionsList(selected);
      else {
        document.getElementById('deductionsList')?.replaceChildren();
        const modal = document.getElementById('deductionsModal');
        if (modal) modal.style.display = 'none';
      }
    }
  }
  function busy(value) {
    saving = value;
    for (const control of shadow.querySelectorAll('button,input,select,textarea')) control.disabled = value || (!ready && control.id === 'submit');
    $('#submit').textContent = value ? 'Сохраняю… дождитесь ответа базы' : 'Записать удержание';
    $('#entry').setAttribute('aria-busy',String(value));
  }
  async function saveEntry(event) {
    event.preventDefault();
    if (saving) return;
    let record;
    try {
      hostState();
      if (dirty()) throw new Error('Сайт ещё сохраняет изменения или не смог их сохранить. Дождитесь сохранения; при ошибке сначала исправьте её в табеле.');
      record = buildDeduction(input(), crypto.randomUUID(), new Date().toISOString());
      // Fail duplicates before a network request as well as inside the server transaction.
      appendDeduction(app.employees, record.employeeId, record);
    } catch (e) { feedback(e.message,true); return; }
    busy(true);
    feedback('Сохраняю в базу. Не закрывайте вкладку до подтверждения.');
    let committed = false;
    try {
      const ref = dataRef.child('employees');
      await ref.get(); // Seed Firebase's local cache; the transaction still checks the latest server state.
      let abortError;
      const result = await ref.transaction(current => {
        abortError = undefined;
        try {return appendDeduction(current,record.employeeId,record);}
        catch (error) {abortError = error; return undefined;}
      }, undefined, false);
      if (abortError) throw abortError;
      const value = result.snapshot.val();
      if (!result.committed || !records(value).some(d => d.id === record.id)) throw new Error('База не подтвердила запись. Проверьте соединение и обновите реестр.');
      committed = true;
      syncEmployees(value);
      renderRecords();
      feedback(`Сохранено в базе: ${money(record.amount)} · №${record.requestNumber}.`);
      $('#amount').value = ''; $('#requestNumber').value = ''; $('#comment').value = '';
      preview();
    } catch (e) {
      feedback(committed ? 'Запись сохранена в базе, но табель не удалось обновить. Перезагрузите страницу перед следующим действием.' : `Удержание не подтверждено: ${e.message || e}. Проверьте реестр перед повтором.`,true);
    } finally { busy(false); if (committed) $('#amount').focus(); }
  }
  async function refresh() {
    if (saving) return;
    if (dirty()) {feedback('Дождитесь сохранения изменений сайта перед обновлением реестра.',true);return;}
    busy(true);
    try {
      const snapshot = await dataRef.child('employees').get();
      syncEmployees(snapshot.val()); renderRecords();
      feedback('Реестр обновлён из базы. Для обновления графика смен перезагрузите страницу.');
    } catch (e) {feedback('Не удалось обновить реестр: ' + e.message,true);}
    finally {busy(false);}
  }
  function download() {
    const payload = {schema:'pvz-claims-bridge/v1', exportedAt:new Date().toISOString(), records:records(hostState().employees)};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}));
    const a = el('a',undefined,{href:url,download:`pvz-deductions-${today()}.json`});
    shadow.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    feedback('Экспортированы все удержания и история, независимо от фильтров.');
  }
  function initialize() {
    currentState = hostState();
    const previous = $('#pvzId').value;
    const tabs = Object.entries(currentState.tabs || {}).map(([id,tab])=>({value:id,label:tab.name || id}));
    options($('#pvzId'),tabs,'Выберите ПВЗ');
    $('#pvzId').value = tabs.some(t=>t.value === previous) ? previous : (currentState.activeTabId || '');
    if (!$('#shiftDate').value) $('#shiftDate').value = today();
    if (!$('#decisionDate').value) $('#decisionDate').value = today();
    chooseMarket(); refreshEmployees(); renderRecords(); ready = true; $('#submit').disabled = false;
  }
  function chooseMarket() {
    const categories = hostState().tabs[$('#pvzId').value]?.categories || [];
    $('#marketplace').value = categories.length === 1 && ['ozon','wb'].includes(categories[0]) ? categories[0] : 'other';
  }
  function open() {
    if (!dialog.open) dialog.showModal();
    try {initialize();feedback();} catch(e) {feedback(e.message,true);$('#submit').disabled = true;}
  }
  function prefill(draft) {
    if (saving) throw new Error('Дождитесь окончания сохранения.');
    hostState(); open();
    if (draft.pvzId !== undefined) {
      if (!hostState().tabs[draft.pvzId]) throw new Error('ПВЗ не найден.');
      $('#pvzId').value = draft.pvzId; chooseMarket();
    }
    if (draft.shiftDate !== undefined) $('#shiftDate').value = validateDate(draft.shiftDate);
    refreshEmployees();
    for (const key of ['employeeId','marketplace','amount','decisionDate','requestNumber','comment']) if (draft[key] !== undefined) $('#' + key).value = String(draft[key]);
    if (draft.accounted !== undefined) $('#accounted').checked = !!draft.accounted;
    preview();
    feedback('Реквизиты подставлены. Проверьте их и нажмите «Записать удержание».');
  }
  $('#launcher').onclick = open;
  $('#close').onclick = () => {if (!saving) dialog.close();};
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  $('#entry').addEventListener('submit',saveEntry);
  $('#pvzId').onchange = () => {chooseMarket();refreshEmployees();};
  $('#shiftDate').onchange = refreshEmployees;
  $('#entry').addEventListener('input',preview);
  $('#search').oninput = renderRecords; $('#status').onchange = renderRecords;
  $('#refresh').onclick = refresh; $('#export').onclick = download;
  window.addEventListener('beforeunload',event=>{if(saving){event.preventDefault();event.returnValue='';}});
  document.body.append(root);
  window.PVZClaimsBridge = Object.freeze({version:'1.0.0',open,prefill,exportRecords:()=>({schema:'pvz-claims-bridge/v1',exportedAt:new Date().toISOString(),records:records(hostState().employees)})});
})();
