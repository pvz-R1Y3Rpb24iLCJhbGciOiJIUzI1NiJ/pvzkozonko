/* Kozonko core — подключается на КАЖДОЙ странице ПОСЛЕ firebase-*-compat скриптов:
 *
 *   <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js"></script>
 *   <script src="../core/kz.js" data-role="admin" data-page="schedule"></script>
 *
 * data-role="admin" — страница управляющих: общий пароль, верхнее меню.
 * data-role="staff" — страница ПВЗ: вход незаметный (анонимный), меню нет.
 *
 * Что делает:
 *  - один раз инициализирует Firebase; повторные firebase.initializeApp(cfg)
 *    из старого кода страниц возвращают уже созданное приложение;
 *  - база ждёт восстановления входа сама (SDK), поэтому код страниц не меняется;
 *  - если входа ещё нет: staff — анонимный вход и одна перезагрузка,
 *    admin — экран пароля и перезагрузка после входа;
 *  - window.KZM — замена модульного API (ref/get/set/onValue…) для страниц,
 *    которые раньше импортировали firebase-database.js как ES-модуль.
 */
(function () {
  'use strict';
  var me = document.currentScript;
  var ROLE = (me && me.dataset.role) || 'staff';
  var PAGE = (me && me.dataset.page) || '';
  var BASE = (me && me.src) ? me.src.replace(/core\/kz\.js.*$/, '') : '/';

  var CFG = {
    apiKey: 'AIzaSyDgpd51erVNy_PwSbYTXPISALNMmYtgTN8',
    authDomain: 'kozonko-9bff6.firebaseapp.com',
    databaseURL: 'https://kozonko-9bff6-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'kozonko-9bff6',
    storageBucket: 'kozonko-9bff6.appspot.com',
    messagingSenderId: '128059740430',
    appId: '1:128059740430:web:5c923c4e9d912be196c75f'
  };
  var ADMIN_EMAIL = 'admin@kozonko.app';

  if (!window.firebase) { console.error('[KZ] firebase compat SDK не подключён до kz.js'); return; }

  // ── единая инициализация ───────────────────────────────────────────────
  var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG);
  var origInit = firebase.initializeApp.bind(firebase);
  firebase.initializeApp = function (cfg, name) {
    if (!name || name === '[DEFAULT]') return firebase.app();
    try { return firebase.app(name); } catch (e) { return origInit(cfg || CFG, name); }
  };
  var auth = firebase.auth();

  var isAdmin = function (u) { return !!(u && !u.isAnonymous && u.email === ADMIN_EMAIL); };

  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  var KZ = window.KZ = {
    role: ROLE, page: PAGE, base: BASE, config: CFG, app: app, auth: auth,
    db: function () { return firebase.database(); },
    ready: ready,                       // Promise<user> — вход выполнен
    isAdmin: function () { return isAdmin(auth.currentUser); },
    logout: function () { return auth.signOut().then(function () { location.reload(); }); },
    // ID-токен для REST-запросов: fetch(url + '?auth=' + await KZ.token())
    token: function () { return ready.then(function (u) { return u.getIdToken(); }); }
  };

  // ── REST-запросы к базе получают токен входа автоматически ────────────
  // Старые страницы делают fetch(FB + '/path.json'). Без токена после
  // закрытия базы они получат 401, поэтому дописываем ?auth=<idToken>.
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(CFG.databaseURL) !== 0 || /[?&]auth=/.test(url)) return nativeFetch(input, init);
    return ready.then(function (u) { return u.getIdToken(); }).then(function (t) {
      var withAuth = url + (url.indexOf('?') < 0 ? '?' : '&') + 'auth=' + encodeURIComponent(t);
      return nativeFetch(typeof input === 'string' ? withAuth : new Request(withAuth, input), init);
    });
  };

  // ── модульный API поверх compat (для бывших ES-module страниц) ──────────
  var snapOf = function (s) { return s; };
  window.KZM = {
    initializeApp: function () { return app; },
    getDatabase: function () { return firebase.database(); },
    ref: function (db, path) { return (db && db.ref) ? db.ref(path || '/') : firebase.database().ref(db || '/'); },
    child: function (r, p) { return r.child(p); },
    get: function (r) { return r.once('value').then(snapOf); },
    set: function (r, v) { return r.set(v); },
    update: function (r, v) { return r.update(v); },
    push: function (r, v) { return r.push(v); },
    remove: function (r) { return r.remove(); },
    runTransaction: function (r, fn) { return r.transaction(fn); },
    onValue: function (r, cb, err) { r.on('value', cb, err || null); return function () { r.off('value', cb); }; },
    off: function (r) { r.off(); },
    serverTimestamp: function () { return firebase.database.ServerValue.TIMESTAMP; }
  };

  // ── вход ────────────────────────────────────────────────────────────────
  var RELOAD_FLAG = 'kz_auth_reload';
  function reloadOnce() {
    try { if (sessionStorage.getItem(RELOAD_FLAG)) return; sessionStorage.setItem(RELOAD_FLAG, '1'); } catch (e) {}
    location.reload();
  }

  var first = true;
  auth.onAuthStateChanged(function (u) {
    var wasFirst = first; first = false;
    if (ROLE === 'staff') {
      if (u) { try { sessionStorage.removeItem(RELOAD_FLAG); } catch (e) {} readyResolve(u); return; }
      auth.signInAnonymously().then(function () { if (wasFirst) reloadOnce(); })
        .catch(function (e) { console.error('[KZ] анонимный вход', e); });
      return;
    }
    // admin
    if (isAdmin(u)) { readyResolve(u); onDom(function () { mountShell(u); }); return; }
    onDom(showLogin);
  });

  function onDom(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }

  // ── стили ядра ─────────────────────────────────────────────────────────
  var css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = BASE + 'core/kz.css';
  document.head.appendChild(css);
  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Onest"]')) {
    var f = document.createElement('link'); f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(f);
  }

  function showLogin() {
    if (document.getElementById('kz-login')) return;
    var ov = document.createElement('div');
    ov.id = 'kz-login';
    ov.innerHTML =
      '<form class="kz-login-card" autocomplete="on">' +
      '<div class="kz-logo"><span class="kz-dot"></span>Kozonko</div>' +
      '<h1>Вход для управляющих</h1>' +
      '<p>Пароль общий для всех управляющих. На этом устройстве вход сохранится.</p>' +
      '<input type="email" name="username" value="' + ADMIN_EMAIL + '" autocomplete="username" hidden>' +
      '<label for="kz-pass">Пароль</label>' +
      '<input id="kz-pass" type="password" autocomplete="current-password" required autofocus>' +
      '<button type="submit" class="kz-btn kz-btn-primary">Войти</button>' +
      '<div class="kz-login-err" role="alert"></div>' +
      '</form>';
    document.body.appendChild(ov);
    document.documentElement.classList.add('kz-locked');
    var form = ov.querySelector('form'), err = ov.querySelector('.kz-login-err'), btn = ov.querySelector('button');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      btn.disabled = true; err.textContent = '';
      auth.signInWithEmailAndPassword(ADMIN_EMAIL, ov.querySelector('#kz-pass').value)
        .then(function () { location.reload(); })
        .catch(function (e) {
          btn.disabled = false;
          err.textContent = /wrong-password|invalid-credential|invalid-login/.test(e.code || '') ? 'Неверный пароль' :
            /too-many-requests/.test(e.code || '') ? 'Слишком много попыток. Подождите минуту.' : 'Не удалось войти: ' + (e.message || e.code);
        });
    });
  }

  // ── верхнее меню (единое для всех админ-страниц) ───────────────────────
  var NAV = [
    ['home', 'Сегодня', 'admin/index.html'],
    ['schedule', 'График и табель', 'admin/schedule.html'],
    ['employees', 'Сотрудники', 'admin/employees.html'],
    ['pvz', 'Пункты', 'admin/pvz.html'],
    ['deductions', 'Удержания', 'admin/deductions.html'],
    ['claims', 'Претензии', 'admin/claims.html'],
    ['panel', 'Админка ПВЗ', 'admin/panel.html'],
    ['control', 'Контроль графиков', 'admin/control.html'],
    ['lookup', 'Кто работал', 'admin/lookup.html'],
    ['analytics', 'Аналитика', 'admin/analytics.html'],
    ['returns', 'Возвраты', 'returns_dashboard.html'],
    ['supplies-log', 'Чаты', 'admin/supplies-log.html'],
    ['logs', 'Логи', 'admin/logs.html'],
    ['staff', 'Панель ПВЗ ↗', 'supplies_staff_2col.html']
  ];
  function mountShell() {
    if (document.getElementById('kz-bar') || me.dataset.nav === 'off') return;
    var bar = document.createElement('nav');
    bar.id = 'kz-bar';
    bar.setAttribute('aria-label', 'Разделы');
    var links = NAV.map(function (n) {
      var cur = n[0] === PAGE ? ' aria-current="page"' : '';
      var ext = n[0] === 'staff' ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + BASE + n[2] + '"' + cur + ext + '>' + n[1] + '</a>';
    }).join('');
    bar.innerHTML = '<a class="kz-logo" href="' + BASE + 'admin/index.html"><span class="kz-dot"></span>Kozonko</a>' +
      '<div class="kz-links">' + links + '</div>' +
      '<button type="button" class="kz-out" title="Выйти на этом устройстве">Выйти</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    bar.querySelector('.kz-out').addEventListener('click', KZ.logout);
    var c = bar.querySelector('[aria-current]');
    if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
})();
