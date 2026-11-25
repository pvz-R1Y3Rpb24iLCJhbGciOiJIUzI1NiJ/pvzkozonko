"""Read-only browser regression for status partitions and response order."""
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = '''async () => {
  const row = (marketplace_status, deadline_at, extra={}) => ({marketplace_status, deadline_at, claim_date:'2026-11-20', amount:1, ...extra});
  const rows = {
    10001:row('GRPC_CLAIM_STATUS_RESPONSE_REQUIRED','2026-11-27'),
    10002:row('Ожидает ответа','2026-11-30'),
    10003:row('Ожидает ответа','2026-11-24'),
    10004:row('Ожидает ответа','2026-10-01'),
    10005:row('Ожидает ответа',null),
    10006:row('На рассмотрении','2026-11-26'),
    10007:row('','2026-11-26',{ozon_status:'GRPC_CLAIM_STATUS_PAYED'}),
    10008:row('GRPC_CLAIM_STATUS_CANCELLED','2026-11-25'),
    10009:row('Ожидает ответа','2026-11-26',{processing:{status:'closed'}}),
    10010:row('','2026-11-26'),
    10011:row('GRPC_CLAIM_STATUS_ON_REVIEW','2026-11-26',{ozon_status:'Ожидает ответа'}),
    wb:{active:{W1:row('withheld','2026-11-26'), W2:row('won','2026-11-26'), W3:row('in_ticket','2026-11-26')}},
    ozon:{10007:row('Ожидает ответа','2026-11-22')},
  };
  window.KZ = {ready: Promise.resolve(), db: () => ({ref: path => ({
    once: async () => ({val: () => path === '/claims' ? rows : {}}),
    update() { throw Error('Unexpected Firebase write'); },
  })})};
  const {default: screen} = await import('/app/s-claims.js');
  const render = () => screen.render(document.querySelector('#app'), {params:location.hash.split('/').slice(1),
    go(hash){location.hash=hash},setHeader({actions}) {if (actions) document.querySelector('header').innerHTML=actions;}});
  addEventListener('hashchange', render);
  await render();
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    for width in (1440, 390):
        page = browser.new_page(viewport={'width':width,'height':900}, timezone_id='America/New_York')
        page.clock.set_fixed_time('2026-11-25T16:00:00Z')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        def serve(route):
            url = urlsplit(route.request.url)
            if url.hostname != 'kozonko.test':
                return route.abort()
            if url.path == '/admin/':
                return route.fulfill(content_type='text/html', body='<html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/app.css"><body class="app"><header></header><main id="app"></main></body></html>')
            if url.path.startswith('/app/') and url.path.endswith(('.js','.css')):
                return route.fulfill(path=ROOT / url.path.lstrip('/'))
            return route.abort()
        page.route('**/*', serve)
        page.goto('https://kozonko.test/admin/#claims/all')
        page.evaluate(FIXTURE)
        rows = page.locator('#tb [data-key]')
        keys = lambda: rows.evaluate_all('(rows) => rows.map(r=>r.dataset.key)')
        expect(page.get_by_role('tab', name='Нужен ответ', exact=True)).to_be_visible(timeout=1100)
        expect(rows).to_have_count(5)
        expect(page.locator('#f-sort')).to_have_value('deadline')
        assert keys() == [f'ozon:{i}' for i in range(10001, 10006)]
        expect(rows.nth(2)).to_contain_text('Просрочен')
        page.get_by_role('tab', name='На рассмотрении', exact=True).click()
        expect(rows).to_have_count(4)
        assert set(keys()) == {'ozon:10006','ozon:10010','ozon:10011','wb:W3'}
        expect(page.locator('#f-sort')).to_have_count(0)
        expect(rows.filter(has_text='10010')).to_contain_text('Требует сверки')
        page.get_by_role('tab', name='Архив', exact=True).click()
        expect(rows).to_have_count(5)
        assert set(keys()) == {'ozon:10007','ozon:10008','ozon:10009','wb:W1','wb:W2'}
        assert not page.locator('.cr-urgent').count()
        expect(page.locator('#f-sort')).to_have_count(0)
        page.get_by_role('tab', name='Нужен ответ', exact=True).click()
        expect(rows).to_have_count(5)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        assert not errors, errors
        page.close()
    browser.close()
print('PASS: exclusive status partitions and response-only deadline sorting at desktop/mobile widths')
