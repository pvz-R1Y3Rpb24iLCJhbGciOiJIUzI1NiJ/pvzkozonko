# Kozonko — единая панель ПВЗ

Сайт на GitHub Pages: `https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/`

| Адрес | Для кого | Вход |
| --- | --- | --- |
| `/` → `admin/index.html` | управляющие | общий пароль |
| `admin/*.html` | управляющие | общий пароль (сохраняется на устройстве) |
| `supplies_staff_2col.html` | ПВЗ, ссылка прежняя | без пароля |
| `returns_dashboard.html`, `battleship.html`, `tests.html` | ПВЗ | без пароля |
| `turbo_remains.user.js` | Tampermonkey в ТурбоПВЗ, обновляется сам | без пароля |
| `scripts/claims-assistant.user.js` | Tampermonkey управляющих | пароль один раз |
| `scripts/claims-bridge.user.js` | Tampermonkey управляющих, страница графика | вход сайта |

## Как устроено

- `core/kz.js` — одно подключение Firebase 10.14.1 (compat), вход, верхнее меню, токен
  для REST-запросов, совместимость со старыми модульными страницами (`window.KZM`).
- `core/kz.css` — дизайн-система (бенто): токены цветов для светлой и тёмной темы, карточки,
  кнопки, таблицы, меню, экран входа.
- `tools/wire_core.py` — подключает ядро ко всем страницам; запускать после добавления страницы.
- `firebase/database.rules.json` — правила доступа к базе.

Роли в базе:
- **управляющие** — Firebase Auth `admin@kozonko.app`, полный доступ;
- **ПВЗ** — анонимный вход, только рабочие узлы: график смен, расходники, ключи, возвраты,
  справочник сотрудников без реквизитов (`/staffDirectory`), личный кабинет по PIN (`/staffCabinet`).

Справочник и кабинеты собирает jobparc (`maintenance.py`) из `/appData/employees` раз в минуту.

## Новая страница

1. Положить в `admin/` (управляющие) или в корень (ПВЗ).
2. Добавить в `PAGES` в `tools/wire_core.py`, запустить `py tools/wire_core.py`.
3. Если страница ПВЗ читает новый узел базы — добавить его в `firebase/database.rules.json`.
4. Пункт меню — массив `NAV` в `core/kz.js`.

## Локально

```
py -m http.server 8090
```
Открыть `http://localhost:8090/admin/index.html`.
