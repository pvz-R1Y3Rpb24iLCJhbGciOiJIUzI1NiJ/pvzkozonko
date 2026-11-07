// Пункты: список и карточка пункта (все настройки в одном месте).
// Заменяет «Управление ПВЗ», «Список ПВЗ» в админке и ручное создание вкладки графика.
import { esc, icon, avatar, empName, drawer, toast, confirmBox, formData, todayMsk, plural, ring } from './ui.js';
import * as D from './data.js';

const TZ = ['МСК', 'МСК+1', 'МСК+2', 'МСК+3', 'МСК+4', 'МСК+5', 'МСК+6', 'МСК+7', 'МСК+8', 'МСК+9', 'МСК-1'];
const MKTS = [['ozon', 'Ozon'], ['wb', 'WB'], ['yandex', 'Яндекс'], ['avito', 'Авито']];

export default {
  async render(view, { params, setHeader, go }) {
    let q = '';
    setHeader({ title: 'Пункты', actions: `<button class="btn primary" id="pvz-add">${icon('plus')}Добавить пункт</button>` });
    document.getElementById('pvz-add').onclick = () => openCard(null);

    const [pvzs, inv] = await Promise.all([D.pvzList(), D.load('/supplies/inventory')]);
    const today = todayMsk();
    const days = Object.fromEntries(await Promise.all(pvzs.map(p => D.month(p.id, today.slice(0, 7)).then(m => [p.id, m.openCloseEvents?.[today] || {}]))));
    setHeader({ sub: `${pvzs.filter(p => !p.test).length} ${plural(pvzs.length, 'пункт', 'пункта', 'пунктов')} · настройки, часы работы, чаты VK` });

    const live = pvzs.filter(p => !p.test), openNow = live.filter(p => days[p.id]?.open && !days[p.id]?.close).length;
    const mcount = Object.fromEntries(MKTS.map(([k]) => [k, live.filter(p => (p.marketplaces || []).includes(k)).length]));
    const noChat = live.filter(p => !(p.jobparc_chat_id || p.chat_peer_id)).length, noTab = live.filter(p => !p.tabName).length;
    view.innerHTML = `
      <section class="bento">
        <div class="tile lime s4" style="flex-direction:row;flex-wrap:wrap;align-items:center;gap:18px">${ring(live.length ? openNow / live.length : 0, { size: 116, stroke: 12, color: 'var(--v1)', track: '#fff', center: `<div><b>${openNow}</b><small>из ${live.length}</small></div>` })}
          <div style="display:grid;gap:6px"><span class="label">Открыты сейчас</span><span class="note">${live.length - openNow ? `${live.length - openNow} закрыты или ещё не открылись` : 'все пункты работают'}</span></div></div>
        <div class="tile lav s5"><span class="label">Маркетплейсы</span>
          <div class="row" style="gap:22px;align-items:flex-end">${MKTS.map(([k, n]) => `<div style="display:grid"><span class="big" style="font-size:38px">${mcount[k]}</span><span class="note">${n}</span></div>`).join('')}</div></div>
        <div class="tile ${noChat || noTab ? 'coral' : ''} s3"><span class="label">Настроить</span><span class="big">${noChat + noTab}</span><span class="note">${noChat ? `без чата VK: ${noChat}` : ''}${noChat && noTab ? ' · ' : ''}${noTab ? `без вкладки графика: ${noTab}` : ''}${!noChat && !noTab ? 'всё заполнено' : ''}</span></div>
      </section>
      <div class="row"><label class="search">${icon('search')}<input class="input" id="pvz-q" type="search" placeholder="Адрес, город, название в графике" aria-label="Поиск пункта"></label></div><div class="cards" id="pvz-list"></div>`;
    const list = view.querySelector('#pvz-list');
    const draw = () => {
      const f = pvzs.filter(p => !q || `${p.public_name} ${p.pvz_name} ${p.tabName} ${p.city} ${p.id}`.toLowerCase().includes(q));
      list.innerHTML = f.map(p => {
        const ev = days[p.id] || {}, low = Object.values(inv?.[p.id] || {}).filter(x => x?.status === 'low').length;
        const st = ev.close ? '<span class="chip">Закрыт</span>' : ev.open ? '<span class="chip ok"><span class="dot"></span>Открыт</span>' : '<span class="chip">Не открыт</span>';
        const stc = ev.close ? 'closed' : ev.open ? 'open' : 'wait';
        return `<button class="card pvz-card st-${stc}" data-id="${esc(p.id)}"><span class="stripe"></span>
          <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="title grow">${esc(D.pvzTitle(p))}</span>${p.test ? '<span class="chip">тест</span>' : st}</div>
          <div class="row" style="gap:6px">${(p.marketplaces || []).map(m => `<span class="chip ${m === 'ozon' ? 'dark' : m === 'wb' ? 'lav' : m === 'yandex' ? 'lime' : ''}">${esc(D.MP[m] || m)}</span>`).join('')}</div>
          <div class="meta"><span>${esc(p.open_time || '?')}–${esc(p.close_time || '?')} ${esc(p.timezone || 'МСК')}</span>${p.tabName ? `<span>В графике: ${esc(p.tabName)}</span>` : '<span style="color:var(--warn)">Нет вкладки в графике</span>'}
          ${!(p.jobparc_chat_id || p.chat_peer_id) ? '<span style="color:var(--warn)">Чат VK не указан</span>' : ''}${low ? `<span style="color:var(--crit)">Мало расходников: ${low}</span>` : ''}</div>
        </button>`;
      }).join('') || '<div class="empty">Ничего не найдено</div>';
    };
    draw();
    view.querySelector('#pvz-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    list.addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) go('#pvz/' + c.dataset.id); });
    if (params[0]) openCard(pvzs.find(p => p.id === params[0]) || null, true);

    async function openCard(p, fromRoute) {
      const isNew = !p;
      p = p || { id: '', timezone: 'МСК', open_time: '09:00', close_time: '21:00', marketplaces: ['ozon'], weather_enabled: true, photo_reminder: true };
      const ev = days[p.id] || {};
      let who = [];
      if (!isNew) {
        const [ids, emps] = await Promise.all([D.whoWorked(p.id, today), D.employees()]);
        who = ids.map(id => emps.find(e => e.id === id)).filter(Boolean);
      }
      const stock = Object.entries(inv?.[p.id] || {}).filter(([, v]) => v && typeof v === 'object');
      const d = drawer({
        title: isNew ? 'Новый пункт' : esc(D.pvzTitle(p)),
        sub: isNew ? 'Создаётся и пункт, и вкладка в графике' : `Ключ ${esc(p.id)}`,
        body: `
          ${isNew ? '' : `<div class="bento">
            <div class="tile ${ev.open && !ev.close ? 'lime' : 'soft'} s6" style="padding:16px"><span class="label">Сегодня</span>
              <b>${ev.close ? 'Закрыт в ' + esc(String(ev.close.time).slice(0, 5)) : ev.open ? 'Открыт в ' + esc(String(ev.open.time).slice(0, 5)) : 'Ещё не открыт'}</b>
              ${who.map(e => `<div class="person">${avatar(e)}<span class="nm">${esc(empName(e))}</span></div>`).join('') || '<span class="small muted">В графике никого</span>'}</div>
            <div class="tile soft s6" style="padding:16px"><span class="label">Расходники</span>
              ${stock.length ? `<div class="row" style="gap:6px">${stock.map(([n, v]) => `<span class="chip ${v.status === 'low' ? 'crit' : v.status === 'warn' ? 'warn' : 'ok'}">${esc(n)}</span>`).join('')}</div>` : '<span class="small muted">Остатки ещё не отмечали</span>'}</div>
          </div>`}
          <form class="box" id="pvz-form" autocomplete="off">
            <div class="fields">
              <label class="field wide"><span>Адрес для сотрудников и клиентов</span><input class="input" name="public_name" value="${esc(p.public_name || '')}" required placeholder="Нижний Новгород, ул. Родионова д.43"></label>
              <label class="field"><span>Внутреннее название</span><input class="input" name="pvz_name" value="${esc(p.pvz_name || '')}" placeholder="как в отчётах бота"></label>
              <label class="field"><span>Короткое имя в графике</span><input class="input" name="tabName" value="${esc(p.tabName || '')}" placeholder="Родионова"></label>
              <label class="field"><span>Город</span><input class="input" name="city" value="${esc(p.city || '')}"></label>
              <label class="field"><span>Часовой пояс</span><select class="select" name="timezone">${TZ.map(t => `<option ${t === (p.timezone || 'МСК') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
              <label class="field"><span>Открытие (местное время)</span><input class="input" type="time" name="open_time" value="${esc(p.open_time || '09:00')}"></label>
              <label class="field"><span>Закрытие (местное время)</span><input class="input" type="time" name="close_time" value="${esc(p.close_time || '21:00')}"></label>
              <label class="field wide"><span>Коды пункта в ТурбоПВЗ</span><input class="input" name="ozon_codes" value="${esc(Object.keys(p.ozon_codes || {}).join(', '))}" placeholder="НИЖНИЙ_НОВГОРОД_1054"><span class="hint">По ним претензии сами находят пункт. Запоминаются и при разборе претензий</span></label>
              <div class="field wide"><span>Маркетплейсы</span><div class="row">${MKTS.map(([k, n]) => `<label class="check"><input type="checkbox" name="mkt_${k}" ${(p.marketplaces || []).includes(k) ? 'checked' : ''}>${n}</label>`).join('')}</div></div>
            </div>
          </form>
          <form class="box" id="pvz-form2" autocomplete="off">
            <b>Чаты VK и бот</b>
            <div class="fields">
              <label class="field"><span>Рабочий чат пункта</span><input class="input" name="jobparc_chat_id" inputmode="numeric" value="${esc(p.jobparc_chat_id || p.chat_peer_id || '')}" placeholder="2000000006"><span class="hint">Сюда бот шлёт напоминания и отчёты</span></label>
              <label class="field"><span>Чат видеобота</span><input class="input" name="video_chat_peer_id" inputmode="numeric" value="${esc(p.video_chat_peer_id || '')}"><span class="hint">Напишите в беседе /chatid_video</span></label>
              <label class="field wide"><span>Координаты для погоды</span><input class="input" name="coords" value="${p.lat != null ? esc(p.lat + ', ' + p.lon) : ''}" placeholder="56.3269, 44.0059"></label>
              <label class="check"><input type="checkbox" name="weather_enabled" ${p.weather_enabled !== false ? 'checked' : ''}>Погода в чате</label>
              <label class="check"><input type="checkbox" name="photo_reminder" ${p.photo_reminder !== false ? 'checked' : ''}>Напоминать про фото</label>
              <label class="check"><input type="checkbox" name="collect_antifreeze" ${p.collect_antifreeze ? 'checked' : ''}>Учёт незамерзайки</label>
            </div>
          </form>`,
        foot: `<button class="btn primary" id="pvz-save">${isNew ? 'Создать пункт' : 'Сохранить'}</button>${isNew || p.test ? '' : '<span class="grow"></span><button class="btn danger" id="pvz-del">Удалить пункт</button>'}`,
        onClose: () => { if (fromRoute || location.hash.startsWith('#pvz/')) history.replaceState(null, '', '#pvz'); }
      });

      d.foot.querySelector('#pvz-save').onclick = async e => {
        const btn = e.currentTarget, f = { ...formData(d.el.querySelector('#pvz-form')), ...formData(d.el.querySelector('#pvz-form2')) };
        if (!f.public_name.trim()) { toast('Укажите адрес пункта', true); return; }
        const mk = MKTS.map(([k]) => k).filter(k => f['mkt_' + k]);
        if (!mk.length) { toast('Отметьте хотя бы один маркетплейс', true); return; }
        const coord = f.coords.split(',').map(x => parseFloat(x));
        const chat = parseInt(f.jobparc_chat_id) || 0;
        const data = {
          public_name: f.public_name.trim(), pvz_name: (f.pvz_name || f.public_name).trim(), city: f.city.trim(), timezone: f.timezone,
          open_time: f.open_time || '09:00', close_time: f.close_time || '21:00', marketplaces: mk,
          jobparc_chat_id: chat, chat_peer_id: chat || parseInt(p.chat_peer_id) || 0, video_chat_peer_id: parseInt(f.video_chat_peer_id) || 0,
          ozon_codes: Object.fromEntries(f.ozon_codes.split(/[,;\s]+/).map(x => x.trim().toUpperCase().replace(/[.#$\[\]\/]/g, '_')).filter(Boolean).map(x => [x, true])),
          weather_enabled: f.weather_enabled, photo_reminder: f.photo_reminder, collect_antifreeze: f.collect_antifreeze,
          ...(coord.length === 2 && coord.every(Number.isFinite) ? { lat: coord[0], lon: coord[1] } : {})
        };
        btn.disabled = true;
        try {
          const tabName = (f.tabName || data.pvz_name).trim();
          if (isNew) {
            const id = D.uid();
            data.pvz_id = id;
            const now = new Date(), key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            await D.set(`/supplies/pvz_list/${id}`, data);
            await D.set(`/appData/tabs/${id}`, { name: tabName, month: now.getMonth() + 1, year: now.getFullYear(), categories: [mk[0]], category: mk[0], schedule: { start: data.open_time, end: data.close_time }, monthData: { [key]: { activeEmployeeId: '' } } });
            await D.ref('/appData/order').transaction(v => { const a = Array.isArray(v) ? v.slice() : Object.values(v || {}); if (!a.includes(id)) a.push(id); return a; });
            D.invalidate('/appData/tabs');
            toast('Пункт создан, вкладка в графике добавлена');
            d.close(); go('#pvz/' + id);
          } else {
            await D.update(`/supplies/pvz_list/${p.id}`, data);
            if (p.tabName !== tabName && f.tabName.trim()) { await D.set(`/appData/tabs/${p.id}/name`, tabName); D.invalidate('/appData/tabs'); }
            toast('Сохранено');
            d.close(); Object.assign(p, data, { tabName: f.tabName.trim() || p.tabName }); draw();
          }
        } catch (err) { toast('Не сохранилось: ' + err.message, true); btn.disabled = false; }
      };
      d.foot.querySelector('#pvz-del')?.addEventListener('click', async () => {
        const ok = await confirmBox({ title: 'Удалить пункт?', text: 'Бот перестанет присылать напоминания в его чат. История смен и зарплат в графике сохранится.', ok: 'Удалить', danger: true, typeToConfirm: D.pvzShort(p) });
        if (!ok) return;
        try { await D.remove(`/supplies/pvz_list/${p.id}`); toast('Пункт удалён'); d.close(); pvzs.splice(pvzs.indexOf(p), 1); draw(); }
        catch (err) { toast('Не удалилось: ' + err.message, true); }
      });
    }
  }
};
