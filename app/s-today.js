import { esc, rub, plural, icon, avatar, empName, msk, todayMsk, tzOffset, toMin, MONTHS_GEN, MONTHS, ymd, ring, waves, miniBars, stack, delta, deco } from './ui.js';
import * as D from './data.js';

const MK = [['ozon', 'Ozon', '#9278ff'], ['wb', 'WB', '#c2b3fe'], ['yandex', 'Яндекс', '#ffc9d3']];
// Ошибочные вводы («89057145110») не должны ломать график: больше 3000 за день на пункт не бывает
const cnt = v => { const n = Number(v) || 0; return n > 0 && n <= 3000 ? n : 0; };

export default {
  async render(view, { setHeader }) {
    const now = msk(), today = todayMsk(), ym = today.slice(0, 7), nowMin = now.getHours() * 60 + now.getMinutes();
    const prevYm = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 15)).slice(0, 7);
    const wd = now.toLocaleDateString('ru-RU', { weekday: 'long' });
    setHeader({ title: 'Сегодня', sub: `${wd[0].toUpperCase() + wd.slice(1)}, ${now.getDate()} ${MONTHS_GEN[now.getMonth()]} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} МСК <span id="bot-state"></span>` });

    const [pvzs, emps, inv, req, health, claims] = await Promise.all([
      D.pvzList(), D.employees(), D.load('/supplies/inventory'), D.load('/supplies/requests'), D.load('/system/health', { ttl: 20_000 }), D.claims()
    ]);
    const live = pvzs.filter(p => !p.test);
    const byId = Object.fromEntries(emps.map(e => [e.id, e]));
    const months = await Promise.all(live.map(p => Promise.all([D.month(p.id, ym), D.month(p.id, prevYm)])));

    // ── смены сегодня ──
    let started = 0, opened = 0; const late = [], onShift = [];
    const cards = live.map((p, i) => {
      const m = months[i][0], ev = m.openCloseEvents?.[today] || {}, as = m.assignments?.[today] || {};
      const off = tzOffset(p.timezone), o = (toMin(p.open_time) ?? 540) - off, c = (toMin(p.close_time) ?? 1260) - off;
      const isStarted = nowMin >= o, isLate = isStarted && nowMin < c && !ev.open && nowMin - o > 15;
      if (isStarted) started++; if (ev.open) opened++; if (isLate) late.push(p);
      const who = [as.employeeId, as.second?.employeeId].filter(Boolean).map(id => byId[id]).filter(Boolean);
      if (ev.open && !ev.close) onShift.push(...who);
      const st = ev.close ? 'closed' : ev.open ? 'open' : isLate ? 'late' : 'wait';
      const chip = st === 'closed' ? `<span class="chip">Закрыт ${esc(ev.close.time === 'auto' ? 'авто' : String(ev.close.time).slice(0, 5))}</span>`
        : st === 'open' ? `<span class="chip ok"><span class="dot"></span>Открыт ${esc(String(ev.open.time).slice(0, 5))}</span>`
        : st === 'late' ? `<span class="chip crit"><span class="dot"></span>Не открыт</span>` : `<span class="chip">${isStarted ? 'Не открыт' : 'с ' + esc(p.open_time || '')}</span>`;
      const total = MK.reduce((s, [k]) => s + cnt(ev[k + '_received_count']), 0);
      return { w: st === 'late' ? 0 : st === 'open' ? 1 : 2, html: `
        <a class="card pvz-card st-${st}" href="#pvz/${esc(p.id)}" style="text-decoration:none"><span class="stripe"></span>
          <div class="row" style="align-items:flex-start;flex-wrap:nowrap"><span class="title grow">${esc(D.pvzTitle(p))}</span>${chip}</div>
          <div class="row" style="flex-wrap:nowrap">${who.length ? stack(who, 3) + `<span class="small" style="font-weight:650;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(who.map(e => e.name || empName(e)).join(', '))}</span>` : '<span class="muted small">В графике никого</span>'}</div>
          <div class="nums"><span><b>${total || '—'}</b>принято</span><span><b>${esc(p.open_time || '?')}</b>открытие</span><span><b>${esc(p.close_time || '?')}</b>закрытие</span></div>
        </a>` };
    }).sort((a, b) => a.w - b.w);

    // ── приёмка за 14 дней по маркетплейсам ──
    const days = Array.from({ length: 14 }, (_, i) => ymd(new Date(now.getTime() - (13 - i) * 86400000)));
    const series = MK.map(([k]) => days.map(d => months.reduce((s, [cur, prev]) => s + cnt(((d.slice(0, 7) === ym ? cur : prev).openCloseEvents?.[d] || {})[k + '_received_count']), 0)));
    const totals = days.map((_, i) => series.reduce((s, sr) => s + sr[i], 0));
    const todayTotal = totals[13];
    const last7 = totals.slice(7).reduce((a, b) => a + b, 0), prev7 = totals.slice(0, 7).reduce((a, b) => a + b, 0);

    // ── удержания по месяцам ──
    const rows = D.ledger(emps);
    const due = rows.filter(r => r.status === 'due');
    const mKeys = Array.from({ length: 6 }, (_, i) => ymd(new Date(now.getFullYear(), now.getMonth() - 5 + i, 15)).slice(0, 7));
    const byMonth = mKeys.map(k => rows.filter(r => (r.shift || '').startsWith(k)).reduce((s, r) => s + r.amount, 0));

    // ── внимание ──
    const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const queue = claims.filter(c => !c.closed && !c.resp?.kind && c.date >= since);
    const urgent = queue.filter(c => c.deadline && (new Date(c.deadline) - new Date(today)) / 86400000 <= 3);
    const pending = D.values(req).filter(D.freshPending);
    const lowPvz = live.filter(p => Object.values(inv?.[p.id] || {}).some(x => x && x.status === 'low'));
    const bdays = upcomingBirthdays(emps.filter(e => !e.hidden), 7);
    const pct = started ? opened / started : 0;

    view.innerHTML = `
      <section class="bento rows">
        <a class="tile lime s4 r2" href="#pvz" style="align-items:center;justify-content:space-between;text-align:center">
          <span class="label" style="align-self:flex-start">Смены сегодня</span><span class="corner">${icon('arrow')}</span>
          ${ring(pct, { size: 168, stroke: 16, color: 'var(--v1)', track: '#fff', center: `<div><b style="font-size:40px">${opened}<span style="opacity:.35">/${started}</span></b><small>${late.length ? 'есть опоздания' : started ? 'все вовремя' : 'ещё рано'}</small></div>` })}
          <div style="display:grid;gap:8px;justify-items:center">${onShift.length ? stack(onShift, 5) : ''}<span class="note">${onShift.length} ${plural(onShift.length, 'человек', 'человека', 'человек')} на смене${late.length ? ` · <b style="color:var(--crit)">не открыты: ${late.map(p => esc(D.pvzShort(p))).join(', ')}</b>` : ''}</span></div>
        </a>

        <div class="tile lav s8 r2">
          <div class="row" style="align-items:flex-start"><div style="display:grid;gap:6px"><span class="label">Приёмка сегодня, отправлений</span>
            <div class="row" style="align-items:flex-end;gap:14px"><span class="huge">${todayTotal.toLocaleString('ru-RU')}</span>${delta(last7, prev7, { suffix: ' за неделю' })}</div></div>
            <span class="grow"></span><div class="legend">${MK.map(([, n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div></div>
          <span class="note">${last7.toLocaleString('ru-RU')} за последние 7 дней · ${prev7.toLocaleString('ru-RU')} за предыдущие</span>
          <div class="chart-wrap">${waves(series, { colors: MK.map(m => m[2]), labels: days.map((d, i) => i % 3 === 1 || i === 13 ? (i === 13 ? 'сегодня' : `${+d.slice(8)}.${d.slice(5, 7)}`) : '') })}</div>
        </div>

        <a class="tile violet s4 r2" href="#claims/ledger">
          <div class="tile-head"><span class="icon-circle">${icon('claims')}</span><span class="label">Удержания к ближайшей выплате</span></div>
          <span class="big">${rub(due.reduce((s, r) => s + r.amount, 0))}</span>
          <div class="row">${delta(byMonth[5], byMonth[4], { invert: true, suffix: ' к прошлому месяцу' })}</div>
          <div class="grow"></div>
          ${miniBars(byMonth, mKeys.map(k => MONTHS[+k.slice(5) - 1].slice(0, 3)))}
        </a>

        <a class="tile coral s4" href="#claims">
          <div class="tile-head"><span class="icon-circle">${icon('claims')}</span><span class="label">Претензии ждут решения</span></div>
          <div class="row" style="align-items:flex-end"><span class="big">${queue.length}</span><span class="note" style="padding-bottom:6px">${rub(queue.reduce((s, c) => s + c.sum, 0))}</span></div>
          ${urgent.length ? `<span class="float-pill" style="right:18px;bottom:18px">🔥 ${urgent.length} ${plural(urgent.length, 'срочная', 'срочные', 'срочных')}</span>` : ''}
        </a>
        <a class="tile s4" href="#supplies">
          <div class="tile-head"><span class="icon-circle">${icon('supplies')}</span><span class="label">Заявки на расходники</span></div>
          <div class="row" style="align-items:flex-end"><span class="big">${pending.length}</span><span class="note muted" style="padding-bottom:6px">${pending.length ? 'ждут заказа' : 'всё заказано'}</span></div>
          <span class="corner">${icon('arrow')}</span>
        </a>
        <a class="tile s4" href="#supplies/stock">
          <div class="tile-head"><span class="icon-circle" style="background:var(--crit-soft);color:var(--crit)">${icon('pvz')}</span><span class="label">Пункты с нехваткой</span></div>
          <div class="row" style="align-items:flex-end"><span class="big">${lowPvz.length}</span></div>
          <div class="row" style="gap:6px">${lowPvz.slice(0, 4).map(p => `<span class="chip crit">${esc(D.pvzShort(p))}</span>`).join('')}</div>
        </a>
        <div class="tile s4" style="overflow:hidden">
          <span class="label">Дни рождения на неделе</span>
          ${bdays.length ? `${stack(bdays.map(b => b.e), 4)}<div style="display:grid;gap:4px">${bdays.slice(0, 2).map(b => `<span class="small"><b>${esc(empName(b.e))}</b> · ${b.label}</span>`).join('')}</div>` : '<span class="note muted">На этой неделе нет</span>'}
          ${deco('coil', { size: 120, color: 'var(--v4)', style: 'right:-14px;bottom:-30px' })}
        </div>
      </section>
      <section style="display:grid;gap:12px">
        <div class="row"><h2 class="h2">Пункты сейчас</h2><span class="muted small">${live.length} ${plural(live.length, 'пункт', 'пункта', 'пунктов')} · ${emps.filter(e => !e.hidden).length} сотрудников</span></div>
        <div class="cards">${cards.map(c => c.html).join('') || '<div class="empty">Пунктов нет</div>'}</div>
      </section>`;

    const ts = health?.jobparc?.ts, el = document.getElementById('bot-state');
    if (el && ts) { const ago = Math.round((Date.now() - ts) / 60000); el.innerHTML = ago <= 3 ? ' · <span class="chip ok"><span class="dot"></span>бот работает</span>' : ` · <span class="chip crit"><span class="dot"></span>бот молчит ${ago} мин</span>`; }
  }
};

function upcomingBirthdays(emps, days) {
  const now = msk(), out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86400000), key = ymd(d).slice(5);
    for (const e of emps) {
      const m = String(e.birthday || '').match(/^(\d{1,2})\.(\d{1,2})/);
      if (m && `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` === key) out.push({ e, label: i === 0 ? 'сегодня' : i === 1 ? 'завтра' : `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}` });
    }
  }
  return out;
}
