"""Actual component browser tests with explicit offline provider fixtures.
No live provider, wallet, signing or payment. Fixtures never ship in Expo output.
"""
import datetime
import json
import shutil
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect

root = Path('build/live-graphics').resolve()
out = Path('build/consumer-browser/live-graphics'); out.mkdir(parents=True, exist_ok=True)
assert (root / 'index.js').is_file()
mode = {'value': 'empty'}
requests, errors = [], []
hexhash = lambda n: '0x' + format(n, '064x')
asset = '0xa9012a055bd4e0edff8ce09f960291c09d5322dc'
registry = '0xdcb418c6e719c40c8e1f9b446cd850330219eeff'
payer, recipient = '0x' + '1' * 40, '0x' + '2' * 40
transfer_topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

def payload(start=100):
    end = start + 32
    # Archive height is a network property, not the end of this particular query.
    # Keep it stable when discovery pins a slightly earlier replay start, so the
    # healthy fixture does not accidentally simulate an archive rollback.
    data = {'source': 'envio-hypersync', 'network': 'monad-testnet', 'chainId': 10143,
        'asset': asset, 'registry': registry, 'finality': 'provisional', 'archiveHeight': 132,
        'fromBlock': start, 'nextBlock': end, 'toBlock': end, 'complete': True,
        'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'queryMs': 84,
        'blocks': [{'number': n, 'hash': hexhash(n), 'parent_hash': hexhash(n - 1), 'timestamp': 1800000000}
                   for n in range(start, end)], 'logs': [], 'transactions': []}
    if mode['value'] == 'observed' and start <= 101 < end:
        data['logs'] = [{'address': asset, 'topic0': transfer_topic,
            'topic1': '0x' + '0' * 24 + payer[2:], 'topic2': '0x' + '0' * 24 + recipient[2:],
            'data': hexhash(5000000), 'block_number': 101, 'block_hash': hexhash(101),
            'transaction_hash': hexhash(5), 'log_index': 0, 'removed': False}]
        data['transactions'] = [{'hash': hexhash(5), 'block_number': 101, 'block_hash': hexhash(101), 'status': 1}]
    return data

def serve(route):
    request = route.request
    parsed = urlsplit(request.url)
    if parsed.hostname == 'graphics-fixture.test':
        if parsed.path == '/':
            route.fulfill(status=200, content_type='text/html', body='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline studio fixture only</title><style>body{margin:0;background:#060a12}</style></head><body><div id="root"></div><script src="/index.js"></script></body></html>')
        elif parsed.path == '/index.js':
            route.fulfill(status=200, content_type='text/javascript', body=(root / 'index.js').read_bytes())
        else:
            route.fulfill(status=404, body='Not found')
        return
    requests.append({'url': request.url, 'method': request.method, 'body': request.post_data})
    if parsed.hostname == 'cherrymoney.co.uk' and parsed.path == '/api/envio/hypersync' and request.method == 'GET':
        if mode['value'] == 'unavailable':
            route.fulfill(status=503, content_type='application/json', body='{}')
        else:
            query = parse_qs(parsed.query)
            assert query.get('wallet') == [payer]
            assert query.get('network') == ['monad-testnet']
            start = int(query.get('from_block', ['100'])[0])
            route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(payload(start)))
        return
    route.abort()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, reduced_motion='reduce')
    page.route('**/*', serve)
    page.on('pageerror', lambda error: errors.append(str(error)))
    button = lambda name: page.get_by_role('button', name=name, exact=True)
    try:
        page.goto('https://graphics-fixture.test/')
        expect(page.get_by_text('LIVE · PROVISIONAL', exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_text('Transfer observed · waiting', exact=True)).to_be_visible()
        expect(page.get_by_text('Business reference observed · waiting', exact=True)).to_be_visible()
        expect(page.get_by_text('Indexed payment matched · waiting', exact=True)).to_be_visible()
        expect(button('Reduced motion active')).to_be_disabled()
        page.screenshot(path=str(out / 'waiting-desktop-fixture.png'), full_page=True)
        mode['value'] = 'observed'
        expect(page.get_by_text('Transfer observed · recorded', exact=True)).to_be_visible(timeout=20000)
        expect(page.get_by_text('Business reference observed · waiting', exact=True)).to_be_visible()
        expect(page.get_by_text('Indexed payment matched · waiting', exact=True)).to_be_visible()
        payment_block = button('Block 101, 1 filtered events, payment event')
        expect(payment_block).to_be_visible()
        payment_block.click()
        expect(page.get_by_text('Block 101', exact=True)).to_be_visible()
        expect(page.get_by_test_id('studio-block-inspector')).to_contain_text(hexhash(101))
        page.screenshot(path=str(out / 'observed-desktop-fixture.png'), full_page=True)
        for width in (390, 320):
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth') <= width + 1, 'Studio overflows viewport'
            payment_block.scroll_into_view_if_needed()
            box = payment_block.bounding_box()
            assert box and box['width'] >= 44 and box['height'] >= 44
            page.screenshot(path=str(out / ('observed-mobile-' + str(width) + '-fixture.png')), full_page=True)
        # Manual animation control changes presentation only, never payment state.
        page.emulate_media(reduced_motion='no-preference')
        button('Pause visual motion').click()
        expect(button('Enable visual motion')).to_be_enabled()
        expect(page.get_by_test_id('observation-sweep')).to_have_css('opacity', '0')
        expect(page.get_by_text('Transfer observed · recorded', exact=True)).to_be_visible()
        mode['value'] = 'unavailable'
        expect(page.get_by_text('UNAVAILABLE', exact=True)).to_be_visible(timeout=20000)
        expect(page.get_by_text('Transfer observed · waiting', exact=True)).to_be_visible()
        expect(page.get_by_text('Charts below show the last received snapshot, not a currently healthy live observation.', exact=True)).to_be_visible()
        page.screenshot(path=str(out / 'unavailable-mobile-fixture.png'), full_page=True)
        button('Pause live observations').click()
        expect(page.get_by_text('PAUSED', exact=True)).to_be_visible()
        count = len(requests)
        page.wait_for_timeout(700)
        assert len(requests) == count
        assert all(item['method'] == 'GET' for item in requests), 'Unexpected write request'
        assert not errors, errors
        # Short recording of the real component's data-triggered motion. Fixture banner stays visible.
        mode['value'] = 'observed'
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, reduced_motion='no-preference',
            record_video_dir=str(out / 'motion-fixture'), record_video_size={'width': 1440, 'height': 1100})
        moving = context.new_page()
        moving.route('**/*', serve)
        moving.on('pageerror', lambda error: errors.append(str(error)))
        moving.goto('https://graphics-fixture.test/')
        expect(moving.get_by_text('Transfer observed · recorded', exact=True)).to_be_visible(timeout=15000)
        moving.wait_for_timeout(7200)
        expect(moving.get_by_text('Transfer observed · recorded', exact=True)).to_be_visible()
        expect(moving.get_by_text('RECHECK REQUIRED', exact=True)).to_have_count(0)
        moving.get_by_role('button', name='Pause live observations', exact=True).click()
        expect(moving.get_by_text('PAUSED', exact=True)).to_be_visible()
        moving.wait_for_timeout(500)
        context.close()
        assert not errors, errors
        assert all(item['method'] == 'GET' for item in requests)
        (out / 'result.json').write_text(json.dumps({'passed': True, 'fixtureDataOnly': True,
            'livePayments': 0, 'checks': ['auto polling from actual-shaped submitted hash', 'match before RPC receipt',
            'pin discovered block with stable archive height', 'genuine zero-event block tiles', 'inspect full block hash',
            'no fabricated reference/index match', 'outage revokes highlights', 'pause stops reads',
            '320/390px no overflow', '44px block targets', 'OS reduced-motion respected',
            'manual motion pause', 'data-triggered motion recording with fixture banner'],
            'providerReadsMocked': len(requests)}, indent=2))
        print('LIVE_GRAPHICS_BROWSER: PASS — studio, explicit fixtures only, no payments')
    except Exception:
        (out / 'errors.json').write_text(json.dumps(errors, indent=2))
        (out / 'failure.html').write_text(page.content())
        page.screenshot(path=str(out / 'failure-fixture.png'), full_page=True)
        raise
    finally:
        browser.close()
