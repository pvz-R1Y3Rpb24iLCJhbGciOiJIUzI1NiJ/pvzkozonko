"""Browser regression for the production register, with only Firebase stubbed."""
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = '''async () => {
  const rows = Object.fromEntries(Array.from({length: 1210}, (_, i) => [90000 + i, {
    claim_date: '2026-10-01', amount: 100 + i, pvz: 'Тестовый пункт',
    reason_raw: 'Невозврат', item_name: 'Товар из претензии',
    marketplace_status: i % 3 === 0 ? 'Закрыта' : 'Ожидает ответа',
    ...(i === 2 ? {deadline_at: '2026-12-04T21:00:18.710Z'} : {}),
  }]));
  rows.ozon = {90002: {amount: 9999}, 80001: {claim_date:'2025-01-01', amount: 123, ozon_status:'Закрыта'}};
  rows.yandex = {active: {YM1: {claim_date:'2025-01-01', amount: 50}}};
  window.KZ = {ready: Promise.resolve(), db: () => ({ref: path => ({
    once: async () => {
      if (path === '/claims' && window.pauseClaims) {
        await new Promise(resolve => { window.finishRefresh = resolve; });
        rows[90002].amount = 200;
      }
      return {val: () => path === '/claims' ? rows : {}};
    },
  })})};
  const {default: screen} = await import('/app/s-claims.js');
  await screen.render(document.querySelector('#app'), {params:['all'], setHeader({actions}) {
    if (actions) document.querySelector('header').innerHTML = actions;
  }});
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    for width, height in ((1440, 900), (768, 820), (390, 844)):
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.clock.set_fixed_time('2026-12-04T21:00:10Z')
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
        expect(page.locator('#f-n')).to_contain_text('1\u202f212', timeout=1300)
        expect(page.locator('#tb [data-key]')).to_have_count(50)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        if width != 768:
            page.get_by_role('button', name='Последняя страница').click()
            expect(page.locator('#tb [data-key]')).to_have_count(12)
            expect(page.locator('#tb [data-key="ozon:80001"]')).to_have_count(1)
            page.locator('#f-q').fill('90002')
            expect(page.locator('#tb [data-key]')).to_have_count(1)
            row = page.locator('#tb [data-key="ozon:90002"]')
            expect(row).to_contain_text('Невозврат')
            expect(row).to_contain_text('05.12')
            expect(row).not_to_contain_text('9 999')
            expect(row).to_contain_text('Сегодня')
            page.clock.set_fixed_time('2026-12-04T21:00:20Z')
            page.evaluate('window.pauseClaims = true')
            page.get_by_role('button', name='Обновить реестр').click()
            page.wait_for_function('typeof window.finishRefresh === "function"')
            row.locator('.cr-amount').click()
            expect(page.locator('#dec')).to_have_count(0)
            page.evaluate('window.finishRefresh()')
            expect(row).to_contain_text('Просрочен')
            expect(row.locator('.cr-amount')).to_have_text('200 ₽')
            row.get_by_role('button', name='№90002').click()
            expect(page.locator('#dec [name="amount"]')).to_have_value('200')
            expect(page.get_by_text('Срок ответа', exact=True).last.locator('..')).to_contain_text('05.12')
        assert not errors, errors
        page.close()
    browser.close()

print('PASS: 1212 unique records, full pagination, global search, Moscow deadline, responsive 1440/768/390')
