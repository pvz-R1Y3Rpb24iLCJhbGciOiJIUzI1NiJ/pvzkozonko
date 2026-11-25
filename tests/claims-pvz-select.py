"""Browser regression: prefill the point on a claim, without Firebase writes."""
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = '''async () => {
  const data = {
    '/claims': {
      10001: { pvz_address: 'Родионова', pvz_code: 'НИЖНИЙ_НОВГОРОД_1553' },
      10002: { pvz_address: 'Родионова', pvz_code: 'KNOWN_2' },
      10003: { pvz_address: 'Ленина' },
      10004: { pvz_address: 'ул. Ленина, д. 45' },
      10005: { pvz_address: 'Ленина 47' },
      10006: { pvz_address: 'ПВЗ для теста', pvz_code: 'TEST_1' },
    },
    '/supplies/pvz_list': {
      rod: { public_name: 'Нижний Новгород, ул. Родионова д.43' },
      mixed: { public_name: 'Точка №2', ozon_codes: { KNOWN_2: true } },
      len43: { public_name: 'Алексин, ул. Ленина д.43' },
      len45: { public_name: 'Алексин, ул. Ленина д.45' },
      '88888888': { public_name: 'ПВЗ для теста', ozon_codes: { TEST_1: true } },
    },
    '/appData/employees': [{ id: 'worker', name: 'Сотрудник теста' }],
    '/appData/tabs/rod/monthData/2026-11/assignments/2026-11-25': {employeeId: 'worker'},
  };
  for (const c of Object.values(data['/claims'])) {
    Object.assign(c, { claim_date: '2026-11-25', marketplace_status: 'Ожидает ответа', amount: 200 });
  }
  window.claimReads = [];
  window.KZ = {ready: Promise.resolve(), db: () => ({ref: path => ({
    once: async () => { claimReads.push(path); return {val: () => data[path] ?? {}}; },
    update() { throw Error('Unexpected Firebase write'); },
    transaction() { throw Error('Unexpected Firebase write'); },
  })})};
  const {default: screen} = await import('/app/s-claims.js');
  await screen.render(document.querySelector('#app'), {params:['all'], setHeader({actions}) {
    if (actions) document.querySelector('header').innerHTML = actions;
  }});
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    for width in (1440, 390):
        page = browser.new_page(viewport={'width': width, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        def serve(route):
            url = urlsplit(route.request.url)
            if url.hostname != 'kozonko.test':
                return route.abort()
            if url.path == '/admin/':
                return route.fulfill(content_type='text/html', body='<html lang="ru"><link rel="stylesheet" href="/app/app.css"><body class="app"><header></header><main id="app"></main></body></html>')
            if url.path.startswith('/app/') and url.path.endswith(('.js', '.css')):
                return route.fulfill(path=ROOT / url.path.lstrip('/'))
            return route.abort()

        page.route('**/*', serve)
        page.goto('https://kozonko.test/admin/#claims/all')
        page.evaluate(FIXTURE)
        for claim, point in ((10001, 'rod'), (10002, 'mixed'), (10003, ''), (10004, 'len45'), (10005, ''), (10006, '')):
            page.get_by_role('button', name=f'№{claim}', exact=True).click()
            form = page.locator('#dec')
            expect(form.locator('[name=pvzId]')).to_have_value(point, timeout=1200)
            if claim == 10001:
                expect(form.locator('#cands [data-emp=worker]')).to_be_visible()
                form.locator('[name=pvzId]').select_option('mixed')
                expect(form.locator('[name=pvzId]')).to_have_value('mixed')
            page.get_by_role('button', name='Закрыть', exact=True).click()
            expect(form).to_have_count(0)
        assert not errors, errors
        page.close()
    browser.close()

print('PASS: visible drawer prefills unique address or mapped code, leaves ambiguous/unmatched/test points blank, and allows override')
