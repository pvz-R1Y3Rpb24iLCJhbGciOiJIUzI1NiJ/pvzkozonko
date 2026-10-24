// ==UserScript==
// @name         Kozonko · Сверка возвратов Ozon
// @namespace    kozonko
// @version      2.4
// @description  Турбо ПВЗ: сверка «Отправить на склад» по всем пунктам (дашборд возвратов) и контроль просрочки приёмки с тревогой в чат ПВЗ
// @match        https://turbo-pvz.ozon.ru/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/turbo_remains.user.js
// @downloadURL  https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/turbo_remains.user.js
// ==/UserScript==

/*
 Работает в обычной вкладке Турбо ПВЗ под вашим входом. Обходит пункты
 плиткой на «Пункты выдачи» и на каждом делает одно из двух:

 1) СВЕРКА ВОЗВРАТОВ — «Отчёты → Остатки на складе», статус «Отправить на
    склад», «Найти», забирает ответ страницы. Пишет в Firebase:
      /supplies/returns_remains/{pvz_id}/{дата МСК}, /supplies/returns_hanging/{pvz_id}
    Просрочено = флаг Ozon isExpired ИЛИ в статусе 24 ч…4 сут; дольше 4 сут —
    «утеряны» (не красят день). Тарные ящики не считаем.

 2) ПРИЁМКА — «Приёмка» (/receiving-v2/main): таймер «Время на приёмку» и
    карточки перевозок «Отправления X из Y». Если времени мало, а непринятого
    много — пишет тревогу в /supplies/acceptance_alerts/{pvz_id}, её отправляет
    в чат ПВЗ бот jobparc. Снимок всех пунктов — /supplies/acceptance_status.

 Автомонитор включается кнопкой в ОДНОЙ вкладке (её лучше держать открытой
 и не работать в ней): приёмка — в ACCEPT_TIMES по МСК (+ точечная перепроверка
 по таймеру), сверка возвратов — раз в день в RETURNS_AT по МСК; после неё в чаты
 ПВЗ с ненормативами уходит их список (через бота jobparc). Состояние обхода хранится
 в этой вкладке (sessionStorage), другие вкладки Турбо ПВЗ его не трогают.
*/
(function () {
  'use strict';
  const FB = 'https://kozonko-9bff6-default-rtdb.europe-west1.firebasedatabase.app';
  const REMAINS_URL = '/reports/remains?filter=' + encodeURIComponent('{"stateFilter":["GRPC_REMNANT_STATE_FILTER_RETURN"]}');
  const ACCEPT_URL = '/receiving-v2/main';

  const OVERDUE_HOURS = 24;
  const LOST_HOURS = 96;

  // Тревога по приёмке: осталось не больше ALERT_MINUTES минут и непринято не меньше ALERT_ITEMS
  const ALERT_MINUTES = 30;
  const ALERT_ITEMS = 50;
  const ALERT_REPEAT_MIN = 90;     // по одному пункту не чаще раза в полтора часа
  const ACCEPT_TIMES = ['15:00', '17:00', '19:00', '20:30'];   // автомонитор: проверки приёмки, МСК
  // Если проверка застала идущую приёмку (непринято ≥ ALERT_ITEMS, времени ещё
  // больше ALERT_MINUTES) — по таймеру ставим точечную перепроверку этого пункта
  // на момент «осталось ~30 мин». Перепроверка снова читает таймер и при
  // необходимости переносит себя (таймер Ozon идёт не вровень с часами).
  const FOLLOWUP_MARGIN_MIN = 2;   // приходим чуть раньше, чтобы застать ≤ 30 мин
  const RETURNS_AT = '13:00';      // автомонитор: сверка возвратов раз в день, МСК (сборка — до 13:00)
  // Список ненормативов в чат ПВЗ после автосверки (кнопка «Сверить все ПВЗ» вручную — не шлёт)
  const CLARIFY_MAX_H = 168;       // старше 7 дней не перечисляем
  const CLARIFY_TEXT = 'Обнаружены ненормативы возвратов. Нужны уточнения по данным товарам. Они будут отправлены сегодня?';
  const CLARIFY_MAX_LINES = 30;

  const RUN = 'kz_run';            // sessionStorage — обход в этой вкладке
  const AUTO = 'kz_auto';          // sessionStorage — автомонитор в этой вкладке
  const LAST = 'kz_last';          // localStorage — когда что делали (общая для вкладок)

  // Код пункта в Турбо ПВЗ → pvz_id в Firebase (сверено по адресам 21.10.2026).
  // Обходятся только те, что видны на «Пункты выдачи» под текущим входом;
  // незнакомые коды со страницы попадают в итог — их надо добавить сюда.
  const IGNORE = ['САРОВ_54', 'САРОВ_59'];
  const STORES = {
    'НАБЕРЕЖНЫЕ_ЧЕЛНЫ_507': 'q6go9yn', 'НИЖНИЙ_НОВГОРОД_793': 'xioddvw', 'БОГОЯВЛЕНИЕ_2': 'zrjs4fw',
    'КУДЬМА_2': '6y00aso', 'АЛЕКСИН_46': 'oflod70', 'НИЖНИЙ_НОВГОРОД_1176': '04rutq5',
    'НИЖНИЙ_НОВГОРОД_1295': 'ukslkup', 'НИЖНИЙ_НОВГОРОД_1553': 'anisrvz', 'НИЖНИЙ_НОВГОРОД_908': 'anisrvz',
    'АЛЕКСИН_65': '5wgbhty', 'АЛЕКСИН_47': '5wgbhty', 'НИЖНИЙ_НОВГОРОД_1548': 'g275poh',
    'НИЖНИЙ_НОВГОРОД_1054': 'g275poh', 'САРАНСК_338': 'y4rregi', 'НИЖНИЙ_НОВГОРОД_907': 'sq24dk9',
    'НИЖНИЙ_НОВГОРОД_1583': 'sq24dk9', 'НИЖНИЙ_НОВГОРОД_1338': '4q6k3iw',
  };
  const TAGS = { GRPC_REMAIN_TAG_WAIT_FOR_COURIER: 'ждёт курьера', GRPC_REMAIN_TAG_ADD_TO_TRIP: 'добавить в рейс' };
  const JOBS = { returns: 'Сверка возвратов', accept: 'Проверка приёмки' };

  const jget = (st, k) => { try { return JSON.parse(st.getItem(k) || 'null'); } catch (e) { return null; } };
  const load = () => jget(sessionStorage, RUN);
  const save = s => sessionStorage.setItem(RUN, JSON.stringify(s));
  const clear = () => sessionStorage.removeItem(RUN);
  const lastGet = () => jget(localStorage, LAST) || {};
  const lastSet = patch => localStorage.setItem(LAST, JSON.stringify({ ...lastGet(), ...patch }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  const msk = d => { const x = new Date(d.getTime() + 3 * 3600e3); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`; };

  // ── интерфейс ──────────────────────────────────────────────────────────────
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;font:13px/1.4 Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:8px';
  const panel = document.createElement('div');
  panel.style.cssText = 'display:none;max-width:360px;max-height:50vh;overflow:auto;background:#fff;color:#1C1917;border:1px solid #E7E5E4;border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.12);white-space:pre-wrap';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px';
  const mkBtn = (txt, dark) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.cssText = `background:${dark ? '#1C1917' : '#fff'};color:${dark ? '#fff' : '#1C1917'};border:1px solid ${dark ? '#1C1917' : '#E7E5E4'};border-radius:10px;padding:9px 13px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.12)`;
    return b;
  };
  const autoBtn = mkBtn('', false), accBtn = mkBtn('Проверить приёмку', false), retBtn = mkBtn('Сверить все ПВЗ', true);
  row.append(autoBtn, accBtn, retBtn);
  box.append(panel, row);
  document.body.appendChild(box);
  const say = t => { panel.style.display = 'block'; panel.textContent = t; };
  const paintAuto = () => { autoBtn.textContent = sessionStorage.getItem(AUTO) ? '● Автомонитор вкл' : 'Автомонитор выкл'; autoBtn.style.color = sessionStorage.getItem(AUTO) ? '#15803D' : '#1C1917'; };
  paintAuto();

  function start(job, only, auto) {
    const s = load();
    if (s && !s.done) {
      if (confirm(`Идёт «${JOBS[s.job]}». Остановить?`)) { clear(); say('Остановлено.'); setBusy(false); }
      return;
    }
    save({ job, only: only || null, auto: !!auto, queue: null, i: 0, phase: 'stores', results: {}, errors: {}, notes: [], tries: {}, started: Date.now() });
    location.href = '/stores';
  }
  retBtn.onclick = () => start('returns');
  accBtn.onclick = () => start('accept');
  autoBtn.onclick = () => {
    if (sessionStorage.getItem(AUTO)) sessionStorage.removeItem(AUTO);
    else {
      sessionStorage.setItem(AUTO, '1');
      say(`Автомонитор включён в этой вкладке.\nСверка возвратов — в ${RETURNS_AT} (список ненормативов уходит в чаты ПВЗ), приёмка — в ${ACCEPT_TIMES.join(', ')} МСК.\nНе работайте в этой вкладке — она сама ходит по страницам.`);
    }
    paintAuto();
  };
  function setBusy(on) {
    retBtn.textContent = on && load()?.job === 'returns' ? 'Остановить' : 'Сверить все ПВЗ';
    accBtn.textContent = on && load()?.job === 'accept' ? 'Остановить' : 'Проверить приёмку';
  }

  // ── обход пунктов ──────────────────────────────────────────────────────────
  async function waitFor(fn, ms = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(300); }
    return null;
  }
  const findExact = text => [...document.querySelectorAll('div,span,p,a')].find(e => e.childElementCount === 0 && e.textContent.trim() === text);

  async function step() {
    const s = load();
    if (!s || s.done) return;
    setBusy(true);
    if (!s.queue) {
      // план обхода — по плиткам текущего входа
      if (!location.pathname.startsWith('/stores')) { location.href = '/stores'; return; }
      await waitFor(() => Object.keys(STORES).some(c => findExact(c)), 20000);
      const onPage = [...new Set([...document.querySelectorAll('div,span,p,a')]
        .filter(e => e.childElementCount === 0 && /^[А-ЯЁ_]+_\d+$/.test(e.textContent.trim()))
        .map(e => e.textContent.trim()))];
      s.queue = onPage.filter(c => STORES[c] && (!s.only || s.only.includes(c)));
      const unknown = onPage.filter(c => !STORES[c] && !IGNORE.includes(c));
      const absent = Object.keys(STORES).filter(c => !onPage.includes(c) && (!s.only || s.only.includes(c)));
      if (unknown.length) s.notes.push('Новые коды, нет в списке скрипта: ' + unknown.join(', '));
      if (absent.length) s.notes.push('Нет под этим входом: ' + absent.join(', '));
      if (!s.queue.length) s.notes.push('На странице не найдено ни одного пункта из списка');
      save(s);
    }
    const code = s.queue[s.i];
    if (!code) return s.job === 'accept' ? finishAccept(s) : finishReturns(s);
    say(`${JOBS[s.job]}: ${s.i + 1} из ${s.queue.length}\n${code}${s.tries[code] ? ` — повтор ${s.tries[code]}` : ''}`);

    if (s.phase === 'stores') {
      if (!location.pathname.startsWith('/stores')) { location.href = '/stores'; return; }
      const tile = await waitFor(() => findExact(code));
      if (!tile) return fail(s, code, 'плитка пункта не найдена на /stores');
      s.phase = 'switched'; save(s);
      tile.click();
      // приложение перезагружает страницу; если нет — переходим сами
      await sleep(6000);
      if (load() && load().phase === 'switched') location.href = s.job === 'accept' ? ACCEPT_URL : REMAINS_URL;
      return;
    }

    if (s.phase === 'switched') {
      const url = s.job === 'accept' ? ACCEPT_URL : REMAINS_URL;
      if (!location.pathname.startsWith(url.split('?')[0])) { location.href = url; return; }
      // приложение дорисовывается после загрузки: ранний клик/чтение дают ошибки
      await sleep(4000);
      // код открытого пункта — в поле выбора ПВЗ в шапке (input), в тексте страницы его может не быть
      const ok = await waitFor(() => [...document.querySelectorAll('input')].some(i => i.value === code), 20000);
      if (!ok) return retry(s, code, 'не удалось переключиться на пункт');
      const res = s.job === 'accept' ? await readAccept() : await readRemains();
      if (res.__err) return retry(s, code, res.__err);
      s.results[code] = res;
      next(s);
    }
  }
  function next(s) { s.i++; s.phase = 'stores'; save(s); location.href = '/stores'; }
  function fail(s, code, why) { s.errors[code] = why; next(s); }
  async function retry(s, code, why) {
    s.tries[code] = (s.tries[code] || 0) + 1;
    if (s.tries[code] < 3) { save(s); await sleep(2000); location.reload(); return; }
    fail(s, code, why);
  }

  // ── сверка возвратов ───────────────────────────────────────────────────────
  async function readRemains() {
    const findBtn = await waitFor(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Найти'));
    if (!findBtn) return { __err: 'нет кнопки «Найти»' };
    const data = await new Promise(resolve => {
      const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
      const restore = () => { XMLHttpRequest.prototype.open = XO; XMLHttpRequest.prototype.send = XS; };
      XMLHttpRequest.prototype.open = function (m, u) { this.__kzu = String(u); return XO.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function (b) {
        if (this.__kzu.includes('GetWarehouseRemains')) {
          if (typeof b === 'string') b = b.replace('"take":50', '"take":1000');
          this.addEventListener('loadend', () => {
            restore();
            try { resolve(this.status === 200 ? JSON.parse(this.responseText) : { __err: 'HTTP ' + this.status }); }
            catch (e) { resolve({ __err: String(e) }); }
          });
        }
        return XS.call(this, b);
      };
      setTimeout(() => { restore(); resolve({ __err: 'нет ответа за 60 с' }); }, 60000);
      findBtn.click();
    });
    if (data.__err) return data;
    // храним только нужное — между перезагрузками всё лежит в sessionStorage
    return (data.remains || []).filter(r => r.articleType !== 'GRPC_ARTICLE_TYPE_BOX_TARE').map(r => ({
      b: (r.label && r.label[0]) || r.postingNumber || String(r.id),
      p: r.postingNumber || '', n: (r.itemName || r.typeDescription || '').slice(0, 120),
      t: r.shipmentCountdownMoment || '', x: !!r.isExpired, g: (r.tags || []).map(t => TAGS[t] || t.replace('GRPC_REMAIN_TAG_', '').toLowerCase()),
    }));
  }

  async function finishReturns(s) {
    s.done = true; save(s);
    const now = new Date();
    const date = msk(now).slice(0, 10);
    const byPvz = {};
    for (const [code, items] of Object.entries(s.results)) {
      const pvz = STORES[code];
      const slot = byPvz[pvz] || (byPvz[pvz] = { items: [], codes: [] });
      slot.codes.push(code);
      for (const it of items) {
        const since = it.t ? new Date(it.t) : null;
        slot.items.push({ ...it, code, since: since ? msk(since) : '', age: since ? Math.round((now - since) / 36e5 * 10) / 10 : null });
      }
    }
    const lines = [];
    let writeErr = 0;
    for (const [pvz, slot] of Object.entries(byPvz)) {
      // «ждёт курьера» — уже добавлен в перевозку, с товаром всё в порядке (Сергей, 24.10):
      // не просрочка и не утеря, даже с флагом Ozon isExpired
      const inTrip = it => it.g.includes(TAGS.GRPC_REMAIN_TAG_WAIT_FOR_COURIER);
      const isLost = it => !inTrip(it) && it.age != null && it.age > LOST_HOURS;
      const overdue = slot.items.filter(it => !inTrip(it) && !isLost(it) && (it.x || (it.age != null && it.age > OVERDUE_HOURS))).sort((a, b) => a.since.localeCompare(b.since));
      const lost = slot.items.filter(isLost);
      const waiting = slot.items.filter(inTrip).length;
      const remains = {
        checked_at: now.getTime(), checked: msk(now).slice(11), total: slot.items.length, codes: slot.codes,
        overdue: overdue.map(it => ({ barcode: it.b, name: it.n, since: it.since, age_h: it.age, expired: it.x, code: it.code })),
        lost: lost.length,
        in_trip: waiting,
      };
      const hanging = {};
      for (const it of overdue.concat(lost)) {
        hanging[it.b.replace(/[.#$%\[\]\/]/g, '_')] = {
          first_seen: it.since ? it.since.slice(0, 10) : date, since: it.since, age_h: it.age, posting: it.p,
          code: it.code, expired: it.x, lost: isLost(it), note: [it.n, it.x ? 'Ozon: нарушен срок' : '', ...it.g].filter(Boolean).join(', '),
        };
      }
      try {
        await put(`/supplies/returns_remains/${pvz}/${date}`, remains);
        await put(`/supplies/returns_hanging/${pvz}`, Object.keys(hanging).length ? hanging : null);
      } catch (e) { writeErr++; s.errors[pvz] = 'запись: ' + e; }
      lines.push(`${slot.codes.join(' + ')}: ${slot.items.length} к отправке, просрочено ${overdue.length}, утеряны (> 4 дн) ${lost.length}, ждут курьера ${waiting}`);
      // автосверка → список ненормативов (просрочка + утеряны не старше 7 дней) в чат ПВЗ
      const bad = overdue.concat(lost).filter(it => it.age == null || it.age <= CLARIFY_MAX_H).sort((a, b) => (b.age || 0) - (a.age || 0));
      if (s.auto && bad.length) {
        const ageTxt = h => h == null ? '' : h < 48 ? `${Math.round(h)} ч` : `${Math.floor(h / 24)} дн`;
        const rows = bad.slice(0, CLARIFY_MAX_LINES).map(it => `• ${it.b} — ${(it.n || '').slice(0, 60)}${it.age != null ? ` (висит ${ageTxt(it.age)})` : ''}`);
        if (bad.length > CLARIFY_MAX_LINES) rows.push(`… и ещё ${bad.length - CLARIFY_MAX_LINES} шт`);
        try {
          await put(`/supplies/returns_clarify/${pvz}/${now.getTime()}`, {
            created: now.getTime(), status: 'pending', auto: true, count: bad.length,
            text: `${CLARIFY_TEXT}\n\n${rows.join('\n')}`, barcodes: bad.map(it => it.b),
          });
          lines[lines.length - 1] += ' → список в чат';
        } catch (e) { s.errors[pvz] = 'список в чат: ' + e; }
      }
    }
    lastSet({ returns: date });
    report(s, `Сверка возвратов готова (${msk(now).slice(11)})${writeErr ? ' — ЕСТЬ ОШИБКИ ЗАПИСИ' : ', данные в дашборде'}`, lines);
  }

  // ── приёмка ────────────────────────────────────────────────────────────────
  // Таймер и перевозки читаем с экрана «Приёмка»: отдельного запроса у страницы нет.
  async function readAccept() {
    await waitFor(() => /Перевозки/.test(document.body.innerText), 15000);
    const lbl = [...document.querySelectorAll('div,span')].find(e => e.childElementCount === 0 && /Время на при[её]мку/.test(e.textContent));
    let minutes = null, timer = '';
    if (lbl && lbl.nextElementSibling) {
      timer = lbl.nextElementSibling.textContent.trim();
      const m = timer.match(/^(-)?\s*(\d+):(\d{2})(?::(\d{2}))?$/);
      if (m) minutes = (m[1] ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4]) / 60 : 0));
    }
    const text = document.body.innerText;
    const at = text.indexOf('Перевозки');
    const carriages = [];
    if (at >= 0) {
      // карточка: «№170411644 / НИЖНИЙ_НОВГОРОД_ХАБ… / Приёмка / … / Отправления / 371 из 460»
      const re = /№\s*(\d+)\n([^\n]*)\n([^\n]*)\n[\s\S]*?Отправления\n(\d+)\s*из\s*(\d+)/g;
      let m;
      const part = text.slice(at);
      while ((m = re.exec(part))) carriages.push({ no: m[1], from: m[2].trim(), status: m[3].trim(), done: +m[4], total: +m[5] });
    }
    const active = carriages.filter(c => /при[её]мк/i.test(c.status));
    const left = active.reduce((a, c) => a + Math.max(0, c.total - c.done), 0);
    return { timer, minutes: minutes == null ? null : Math.round(minutes), left, carriages: active };
  }

  async function finishAccept(s) {
    s.done = true; save(s);
    const now = new Date();
    const alerted = lastGet().alerts || {};
    const followups = lastGet().followups || {};
    const lines = [];
    let writeErr = 0;
    for (const [code, r] of Object.entries(s.results)) {
      const pvz = STORES[code];
      const risk = r.minutes != null && r.minutes <= ALERT_MINUTES && r.left >= ALERT_ITEMS;
      try {
        await put(`/supplies/acceptance_status/${pvz}/${code}`, {
          checked_at: now.getTime(), checked: msk(now).slice(11), timer: r.timer, minutes_left: r.minutes,
          left: r.left, carriages: r.carriages, risk,
        });
        if (risk && !(alerted[code] && now - alerted[code] < ALERT_REPEAT_MIN * 60e3)) {
          const mins = Math.max(0, r.minutes);
          const text = `Бот обнаружил риск просрочки приёмки - осталось ${mins} мин., непринято ${r.left} шт. ` +
            'Если вы не успеваете принять перевозку, нужно ускориться. Отложите раскладывание товаров, ' +
            'сначала примите и подпишите все, что осталось. Штраф за просрочку: 50 рублей с каждого товара';
          await put(`/supplies/acceptance_alerts/${pvz}/${now.getTime()}_${code}`, {
            code, created: now.getTime(), minutes_left: r.minutes, left: r.left, text,
          });
          alerted[code] = now.getTime();
        }
      } catch (e) { writeErr++; s.errors[code] = 'запись: ' + e; }
      if (r.minutes != null && r.minutes > ALERT_MINUTES && r.left >= ALERT_ITEMS) {
        // не раньше чем через 3 мин — иначе при таймере ~31 мин перепроверка зациклится
        followups[code] = now.getTime() + Math.max(3, r.minutes - ALERT_MINUTES - FOLLOWUP_MARGIN_MIN) * 60e3;
      } else delete followups[code];
      const tm = r.minutes == null ? 'нет приёмки' : `${r.timer}`;
      lines.push(`${risk ? '⚠ ' : ''}${code}: ${tm}${r.minutes != null ? `, непринято ${r.left}` : ''}${risk ? ' — ТРЕВОГА В ЧАТ' : ''}` +
        (followups[code] ? ` → перепроверка в ${msk(new Date(followups[code])).slice(11)}` : ''));
    }
    // перепроверка пункта, которого нет под этим входом, иначе висела бы вечно
    // при сбое — повтор через 5 мин
    for (const c of s.only || []) {
      if (c in s.results) continue;
      if (s.errors[c]) followups[c] = now.getTime() + 5 * 60e3; else delete followups[c];
    }
    // точечная перепроверка не сдвигает плановую раз-в-2-часа
    lastSet({ ...(s.only ? {} : { accept: now.getTime() }), alerts: alerted, followups });
    report(s, `${s.only ? 'Перепроверка' : 'Проверка'} приёмки готова (${msk(now).slice(11)})${writeErr ? ' — ЕСТЬ ОШИБКИ ЗАПИСИ' : ''}`, lines);
  }

  function report(s, head, lines) {
    const errs = Object.entries(s.errors).map(([k, v]) => `⚠ ${k}: ${v}`).concat((s.notes || []).map(n => 'ℹ ' + n));
    say(`${head}\n\n${lines.join('\n')}${errs.length ? '\n\n' + errs.join('\n') : ''}`);
    clear();
    setBusy(false);
  }

  function put(path, body) {
    return fetch(FB + path + '.json', { method: 'PUT', body: JSON.stringify(body) })
      .then(r => { if (!r.ok) throw 'HTTP ' + r.status; }, () => { throw 'сеть'; });
  }

  // ── автомонитор (только во вкладке, где он включён) ────────────────────────
  setInterval(() => {
    if (!sessionStorage.getItem(AUTO)) return;
    const s = load();
    if (s && !s.done) return;
    const now = new Date(), last = lastGet();
    const today = msk(now).slice(0, 10), hm = msk(now).slice(11);
    const due = Object.entries(last.followups || {}).filter(([, t]) => t <= now.getTime()).map(([c]) => c);
    if (due.length) return start('accept', due);
    if (hm >= RETURNS_AT && last.returns !== today) return start('returns', null, true);
    // приёмка: последний наступивший слот, если по нему сегодня ещё не проверяли
    // (вкладку открыли в 18:10 — проверит один раз за 17:00, пропущенный 15:00 не догоняет)
    const slot = ACCEPT_TIMES.filter(x => x <= hm).pop();
    if (slot && last.acceptSlot !== `${today} ${slot}`) { lastSet({ acceptSlot: `${today} ${slot}` }); return start('accept'); }
  }, 60e3);

  step().catch(e => { const s = load(); say('Ошибка: ' + e); if (s) { s.done = true; save(s); } setBusy(false); });
})();
