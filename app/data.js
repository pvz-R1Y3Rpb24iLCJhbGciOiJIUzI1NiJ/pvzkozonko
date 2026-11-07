// Слой данных: одна точка доступа к Firebase для всех разделов.
// Пути и формат записей совпадают со старыми страницами и ботами — ничего не мигрируем.
const db = () => window.KZ.db();
const cache = new Map();   // path -> {t, v}
const TTL = 60_000;

export async function load(path, { fresh = false, ttl = TTL } = {}) {
  await window.KZ.ready;
  const c = cache.get(path);
  if (!fresh && c && Date.now() - c.t < ttl) return c.v;
  const v = (await db().ref(path).once('value')).val();
  cache.set(path, { t: Date.now(), v });
  return v;
}
export const invalidate = prefix => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); };
export const ref = path => db().ref(path);
export async function update(path, value) { await window.KZ.ready; await db().ref(path).update(value); invalidate(path.split('/').slice(0, 3).join('/')); }
export async function set(path, value) { await window.KZ.ready; await db().ref(path).set(value); invalidate(path.split('/').slice(0, 3).join('/')); }
export async function remove(path) { await window.KZ.ready; await db().ref(path).remove(); invalidate(path.split('/').slice(0, 3).join('/')); }
export function live(path, cb) { const r = db().ref(path); const h = s => cb(s.val()); r.on('value', h); return () => r.off('value', h); }

export const uid = () => Math.random().toString(36).slice(2, 9);   // как в графике
export const values = x => (Array.isArray(x) ? x : Object.values(x || {})).filter(v => v && typeof v === 'object');

// ── Пункты ──
export async function pvzList(opts) {
  const [list, tabs] = await Promise.all([load('/supplies/pvz_list', opts), load('/appData/tabs', { ...opts, ttl: 120_000 })]);
  return Object.entries(list || {}).filter(([, p]) => p && typeof p === 'object')
    .map(([id, p]) => ({ ...p, id, tabName: tabs?.[id]?.name || '', test: id === '88888888' }))
    .sort((a, b) => (a.public_name || a.pvz_name || '').localeCompare(b.public_name || b.pvz_name || '', 'ru'));
}
export const pvzTitle = p => p?.public_name || p?.pvz_name || p?.tabName || p?.id || '—';
export const pvzShort = p => p?.tabName || p?.pvz_name || p?.public_name || p?.id || '—';

// ── Сотрудники: массив /appData/employees, адресуем по id, индекс проверяем при записи ──
export async function employees(opts) {
  const raw = await load('/appData/employees', opts);
  const items = Array.isArray(raw) ? raw.map((e, i) => [String(i), e]) : Object.entries(raw || {});
  return items.filter(([, e]) => e && typeof e === 'object' && e.id).map(([idx, e]) => ({ ...e, _idx: idx }));
}
// Изменить поля одного сотрудника: транзакция по его узлу, с проверкой что под индексом тот же человек
export async function updateEmployee(emp, changes) {
  await window.KZ.ready;
  const fresh = await employees({ fresh: true });
  const cur = fresh.find(e => e.id === emp.id);
  if (!cur) throw new Error('Сотрудник не найден — обновите страницу');
  const res = await db().ref(`/appData/employees/${cur._idx}`).transaction(v => {
    if (!v) return v;
    if (v.id !== emp.id) return;            // индекс сдвинулся — отмена
    return { ...v, ...changes };
  });
  if (!res.committed) throw new Error('Список сотрудников изменился, повторите');
  invalidate('/appData/employees');
}
export async function addEmployee(data) {
  await window.KZ.ready;
  const id = uid() + Date.now().toString(36);
  const res = await db().ref('/appData/employees').transaction(v => {
    const arr = Array.isArray(v) ? v.slice() : Object.values(v || {});
    arr.push({ id, hidden: false, rate: 0, manualShiftAdjustment: 0, ...data });
    return arr;
  });
  if (!res.committed) throw new Error('Не удалось добавить');
  invalidate('/appData/employees');
  return id;
}

// ── Смены: назначения и открытия по пунктам за месяц ──
export async function month(pvzId, ym, opts) {
  return (await load(`/appData/tabs/${pvzId}/monthData/${ym}`, opts)) || {};
}
// Индекс "empId|дата" → pvzId по всему графику (для старых записей и подбора виновника)
export async function shiftIndex() {
  const tabs = await load('/appData/tabs', { ttl: 120_000 });
  const idx = {};
  for (const [pvzId, tab] of Object.entries(tabs || {}))
    for (const m of Object.values(tab?.monthData || {}))
      for (const [date, a] of Object.entries(m?.assignments || {}))
        for (const id of [a?.employeeId, a?.second?.employeeId]) if (id) idx[id + '|' + date] = pvzId;
  return idx;
}
export async function whoWorked(pvzId, date) {
  const a = (await load(`/appData/tabs/${pvzId}/monthData/${date.slice(0, 7)}/assignments/${date}`)) || {};
  return [a.employeeId, a.second?.employeeId].filter(Boolean);
}

// ── Удержания: в карточке сотрудника (deductions / deductionHistory), как в табеле ──
export function ledger(emps, pvzName = {}, shiftPvz = {}) {
  const out = [];
  for (const e of emps) {
    for (const [field, hist] of [['deductions', false], ['deductionHistory', true]]) {
      for (const [key, d] of Object.entries(e[field] || {})) {
        if (!d || typeof d !== 'object') continue;
        const signed = Number(d.amount);
        if (!Number.isFinite(signed) || signed >= 0) continue;
        const reason = String(d.comment || d.reason || '');
        const req = d.requestNumber || d.claim_id || (reason.match(/№\s*([A-ZА-Я0-9-]{5,})/i) || [])[1] || '';
        const shift = String(d.shiftDate || d.date || '').slice(0, 10);
        const pid = d.pvzId || d.pvz_id || shiftPvz[e.id + '|' + shift] || '';
        out.push({
          key: `${e.id}/${field}/${key}`, emp: e, empId: e.id, field, idx: key,
          amount: Math.abs(signed), shift, account: String(d.accountDate || '').slice(0, 10),
          status: hist ? 'written' : d.accounted ? 'due' : 'pending',
          pvzId: pid, pvz: d.pvzName || pvzName[pid] || '', pvzGuessed: !(d.pvzId || d.pvz_id) && !!pid,
          req: String(req), reason, comment: d.comment || '', marketplace: d.marketplace || '', raw: d
        });
      }
    }
  }
  return out.sort((a, b) => (b.shift || '').localeCompare(a.shift || ''));
}
export const normNum = s => String(s || '').replace(/^№/, '').replace(/\s+/g, '').toUpperCase();

// Добавить удержание (тот же формат, что у моста удержаний и табеля); защищает от дублей номера
export async function addDeduction({ employeeId, pvzId, pvzName, shiftDate, decisionDate, amount, marketplace, requestNumber, comment, accounted = true }) {
  await window.KZ.ready;
  const kop = Math.round(Number(String(amount).replace(/\s/g, '').replace(',', '.')) * 100);
  if (!Number.isFinite(kop) || kop <= 0) throw new Error('Введите сумму больше нуля');
  const num = normNum(requestNumber);
  const market = { ozon: 'Ozon', wb: 'WB', yandex: 'Яндекс', avito: 'Авито', other: 'Другое' }[marketplace] || 'Другое';
  const now = new Date().toISOString();
  const id = (crypto.randomUUID && crypto.randomUUID()) || uid() + uid();
  const reason = `${comment || 'Удержание'}${num ? ` · ${market} №${num}` : ''}${decisionDate ? ` · вынесено ${decisionDate}` : ''} · ${pvzName || pvzId || ''} · смена ${shiftDate}`.replace(/</g, '＜').replace(/>/g, '＞');
  const ded = { id, bridgeVersion: 1, createdAt: now, amount: -kop / 100, amountKopecks: kop, reason, date: shiftDate, accounted: !!accounted,
    pvzId: pvzId || '', pvzName: pvzName || '', employeeId, shiftDate, decisionDate: decisionDate || '', marketplace: marketplace || 'other', requestNumber: num, comment: comment || '' };
  let dupError = '';
  const res = await db().ref('/appData/employees').transaction(v => {
    if (!v) return v;
    const arr = Array.isArray(v) ? v.map(x => x && { ...x }) : Object.values(v).map(x => x && { ...x });
    const target = arr.find(e => e && e.id === employeeId);
    if (!target) { dupError = 'Сотрудник не найден'; return; }
    if (num) for (const e of arr) for (const old of [...Object.values(e?.deductions || {}), ...Object.values(e?.deductionHistory || {})])
      if (old && normNum(old.requestNumber) === num && (old.marketplace || 'other') === ded.marketplace) { dupError = `№${num} уже удержан у ${e.fullName || e.name}`; return; }
    target.deductions = [...Object.values(target.deductions || {}), ded];
    return arr;
  });
  if (dupError) throw new Error(dupError);
  if (!res.committed) throw new Error('Не удалось сохранить, повторите');
  invalidate('/appData/employees');
  return ded;
}

// ── Претензии: все источники в одном списке ──
const CLOSED = /cancel|отмен|аннулир|paid|оплач|закрыт|resolved|решен|отклон|возмещ/i;
export const INTERNAL = { new: 'Новая', in_progress: 'В работе', processed: 'Решена', disputed: 'Оспаривается', closed: 'Закрыта' };
export async function claims(opts) {
  const raw = (await load('/claims', opts)) || {};
  const map = new Map();
  const put = (mp, id, v, path) => {
    if (!v || typeof v !== 'object') return;
    const key = mp + ':' + id;
    const prev = map.get(key);
    if (prev) { prev.paths.push(path); prev.data = { ...v, ...prev.data }; return; }   // первая запись главная
    map.set(key, { mp, id, path, paths: [path], data: v });
  };
  for (const [id, v] of Object.entries(raw)) if (/^\d+$/.test(id)) put('ozon', id, v, `/claims/${id}`);
  for (const [id, v] of Object.entries(raw.ozon || {})) put('ozon', id, v, `/claims/ozon/${id}`);
  for (const [id, v] of Object.entries(raw.wb?.active || {})) put('wb', id, v, `/claims/wb/active/${id}`);
  for (const [id, v] of Object.entries(raw.yandex?.active || {})) put('yandex', id, v, `/claims/yandex/active/${id}`);
  for (const [id, v] of Object.entries(raw.ozon_checks?.active || {})) put('check', id, v, `/claims/ozon_checks/active/${id}`);
  return [...map.values()].map(({ mp, id, path, paths, data: c }) => {
    const ext = String(c.ozon_status || c.marketplace_status || c.status || '').trim();
    const internal = c.processing?.status || (c.responsibility?.kind ? 'processed' : 'new');
    const closed = internal === 'closed' || internal === 'processed' || CLOSED.test(ext);
    return {
      key: mp + ':' + id, mp, id, path, paths, raw: c,
      date: normDate(c.claim_date || c.created_date || c.created_at || c.checked_at || c.collected_at),
      eventDate: normDate(c.cancel_or_loss_date || c.event_date),
      deadline: normDate(c.deadline_at || c.deadline_date),
      pvzCode: String(c.pvz_code || (/^[A-ZА-ЯЁ_0-9]+$/.test(String(c.pvz || '')) ? c.pvz : '') || '').trim(),
      sum: Number(c.amount ?? c.sum) || 0,
      pvzText: c.pvz_address || c.pvz || c.pvz_code || c.address || '',
      ext, internal, closed,
      product: c.product_name || c.item_name || c.title || '',
      reason: c.reason || c.reason_raw || c.claim_type || c.type || '',
      url: c.claim_url || c.source_url || c.url || '',
      resp: c.responsibility || null,
      guessName: c.employee_name || ''
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
// Даты в базе бывают ISO, «ДД.ММ.ГГГГ», «ДД.ММ.ГГГГ, чч:мм» и миллисекунды → всегда YYYY-MM-DD
export function normDate(x) {
  if (x == null || x === '') return '';
  if (typeof x === 'number' || /^\d{12,}$/.test(String(x))) { const d = new Date(+x); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
  const s = String(x).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
export const MP = { ozon: 'Ozon', wb: 'WB', yandex: 'Яндекс', check: 'Проверка Ozon', avito: 'Авито' };

// Подобрать пункт: сначала по запомненным кодам ТурбоПВЗ (pvz_list/{id}/ozon_codes), затем по словам адреса
const tokens = s => String(s || '').toLowerCase().split(/[^a-zа-яё0-9_]+/i).filter(w => w.length > 2 && !/^(ул|улица|нижний|новгород|нижний_новгород|пос|город|ozon|wildberries|пр|д)$/.test(w));
export function matchPvz(text, pvzs, code) {
  const c = String(code || '').trim().toUpperCase();
  if (c) { const hit = pvzs.find(p => p.ozon_codes && p.ozon_codes[c]); if (hit) return { pvz: hit, how: 'code' }; }
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  let best = null, score = 0;
  for (const p of pvzs) {
    const s = tokens(`${p.public_name} ${p.pvz_name} ${p.tabName}`).filter(w => t.includes(w)).length;
    if (s > score) { score = s; best = p; }
  }
  return score ? { pvz: best, how: 'address' } : null;
}
// Запомнить, что код ТурбоПВЗ относится к пункту (ключи Firebase не допускают . # $ [ ] /)
export async function rememberCode(pvzId, code) {
  const c = String(code || '').trim().toUpperCase().replace(/[.#$\[\]\/]/g, '_');
  if (!pvzId || !c) return;
  await set(`/supplies/pvz_list/${pvzId}/ozon_codes/${c}`, true);
}

export async function claimEvent(c, patch, text) {
  const now = new Date().toISOString();
  const evId = 'ui_' + Date.now().toString(36);
  const updates = {};
  for (const [k, v] of Object.entries(patch)) updates[k] = v;
  updates[`history/${evId}`] = { ts: now, type: 'processing', operator: 'Управляющий', text };
  await window.KZ.ready;
  await db().ref(c.path).update(updates);
  invalidate('/claims');
}

// Заявки на расходники: время создания и «свежие» (старше 30 дней без отметки — архив)
export const reqTs = r => { const m = String(r?.id || '').match(/_(\d{12,})/); return m ? +m[1] : 0; };
export const freshPending = r => (r.status || 'pending') === 'pending' && Date.now() - reqTs(r) < 30 * 86400000;
