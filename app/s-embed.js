// Большие модули, которые работают внутри приложения как есть (расчёт зарплат, настройки).
// Своё меню у них скрыто, вход общий.
import { esc } from './ui.js';

const EMBEDS = {
  schedule: { title: 'График и зарплата', sub: 'Смены по пунктам, табель, вычеты и премии, ведомость', tabs: [['', 'График и табель', 'schedule.html']] },
  returns: { title: 'Возвраты', sub: 'Сборка возвратов Ozon по пунктам', tabs: [['', 'Возвраты', '../returns_dashboard.html']] },
  analytics: { title: 'Аналитика', sub: 'Приёмка и дисциплина открытия смен', tabs: [['', 'Приёмка', 'analytics.html'], ['shifts', 'Открытия и закрытия', 'control.html']] },
  settings: { title: 'Настройки', sub: 'Расходники и пороги, премии, финансы, баннеры, уведомления, камеры', tabs: [['', 'Настройки системы', 'panel.html']] }
};

export default {
  render(view, { section, params, setHeader, go }) {
    const cfg = EMBEDS[section.embed];
    const tab = cfg.tabs.find(t => t[0] === (params[0] || '')) || cfg.tabs[0];
    setHeader({ title: cfg.title, sub: esc(cfg.sub), actions: `<a class="btn" href="${esc(tab[2])}?embed=1" target="_blank" rel="noopener">Открыть во весь экран</a>` });
    view.innerHTML = `${cfg.tabs.length > 1 ? `<div class="row"><div class="seg">${cfg.tabs.map(([k, n]) => `<button data-t="${k}" aria-pressed="${k === tab[0]}">${n}</button>`).join('')}</div></div>` : ''}
      <div class="embed"><iframe src="${esc(tab[2])}?embed=1" title="${esc(cfg.title)}"></iframe></div>`;
    view.querySelector('.seg')?.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) go(`#${section.id}${b.dataset.t ? '/' + b.dataset.t : ''}`); });
  }
};
