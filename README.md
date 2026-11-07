# Kozonko — единая панель ПВЗ

Сайт на GitHub Pages: `https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/`

| Адрес | Для кого | Вход |
| --- | --- | --- |
| `/` → `admin/index.html` | управляющие: **одно приложение со всеми разделами** | общий пароль |
| `supplies_staff_2col.html` | ПВЗ, ссылка прежняя | без пароля |
| `returns_dashboard.html`, `battleship.html`, `tests.html` | ПВЗ | без пароля |
| `turbo_remains.user.js` | Tampermonkey в ТурбоПВЗ, обновляется сам | без пароля |
| `scripts/claims-assistant.user.js` | Tampermonkey управляющих | пароль один раз |

## Приложение управляющих (`admin/index.html`)

Разделы переключаются без перезагрузки: `#today`, `#pvz/<id>`, `#people/<id>`, `#claims`, `#claims/all`,
`#claims/ledger`, `#supplies`, `#supplies/stock`, `#supplies/ai`, `#logs`, `#schedule`, `#returns`,
`#analytics`, `#settings`.

| Раздел | Файл | Заменил |
| --- | --- | --- |
| Сегодня | `app/s-today.js` | дашборд |
| Пункты | `app/s-pvz.js` | «Управление ПВЗ», «Список ПВЗ» в админке, создание вкладки графика |
| Сотрудники | `app/s-people.js` | «Реестр сотрудников», «Кто работал» |
| Претензии и удержания | `app/s-claims.js` | «Претензии», «Отчёты по удержаниям», «Удержания», мост удержаний |
| Расходники | `app/s-supplies.js` | «Обзор/Запросы» в админке, «Лог чатов снабжения» |
| Журнал | `app/s-logs.js` | две копии «Логов системы» |
| График и зарплата, Возвраты, Аналитика, Настройки | `app/s-embed.js` → старые модули во фрейме | — |

- `app/data.js` — все чтения и записи базы. Форматы те же, что у ботов и табеля.
- `app/ui.js` — шторка, тосты, диалог, иконки, кольца, «волны», стопки аватаров.
- `app/app.css` — дизайн-система: светлое бенто, фиолетовая тональная гамма.
- Старые адреса (`admin/employees.html`, `claims.html` и т. п.) — однострочные переадресации в раздел.
- `core/kz.js` — Firebase, вход, режим встраивания; старые модули, открытые напрямую, переадресуются в приложение.
- Перед коммитом: `py tools/stamp.py` (версии файлов, чтобы браузер не смешал старое и новое).

## Новый раздел

1. Файл `app/s-<имя>.js` с `export default { render(view, ctx) }`.
2. Строка в `SECTIONS` в `app/app.js`.
3. Если раздел для ПВЗ читает новый узел базы — добавить его в `firebase/database.rules.json`.
4. `py tools/stamp.py`.

## Локально

```
py -m http.server 8090
```
Открыть `http://localhost:8090/admin/index.html#today`.
