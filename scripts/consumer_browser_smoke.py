"""Exercise the actual compiled Expo app, offline, on desktop and mobile.
Local build assets are served by Playwright; all external requests are blocked.
No provider authentication, passkey ceremony or payment is executed.
"""
import json
import mimetypes
import shutil
from pathlib import Path
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright, expect

root = Path('apps/mobile/dist').resolve()
out = Path('build/consumer-browser'); out.mkdir(parents=True, exist_ok=True)
assert (root / 'index.html').is_file(), 'Expo web export is required'
executable = shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium')
assert executable, 'A system Chrome/Chromium executable is required'
errors, blocked, submitted = [], [], []

def serve(route):
    request = route.request
    url = urlsplit(request.url)
    if url.hostname == 'cherry-ui.test':
        target = (root / unquote(url.path).lstrip('/')).resolve()
        if target == root:
            target = root / 'index.html'
        if root in target.parents and target.is_file():
            route.fulfill(status=200, body=target.read_bytes(), content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
        else:
            route.fulfill(status=404, body='Local asset not found')
        return
    blocked.append(request.url)
    body = request.post_data or ''
    if any(method in body for method in ['eth_sendRawTransaction', 'eth_sendTransaction', 'personal_sign']):
        submitted.append(body)
    route.abort()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, reduced_motion='reduce')
    page.route('**/*', serve)
    page.on('pageerror', lambda error: errors.append(str(error)))
    button = lambda text: page.get_by_role('button', name=text, exact=True)
    tab = lambda text: page.get_by_role('tab', name=text, exact=True)
    try:
        page.goto('https://cherry-ui.test/')
        expect(page.get_by_text('Pay with clarity.\nKeep the proof.', exact=True)).to_be_visible()
        expect(button('Pay a supplier')).to_be_visible()
        expect(page.get_by_text('No confirmed supplier payment in this session yet.', exact=True)).to_be_visible()
        page.screenshot(path=str(out / 'home-desktop.png'))
        tab('Activity').click()
        expect(page.get_by_text('No confirmed supplier payment in this session', exact=True)).to_be_visible()
        page.screenshot(path=str(out / 'activity-empty-desktop.png'))
        tab('Pay').click()
        button('Explore cross-chain payment').click()
        expect(page.get_by_text('Before you use mainnet', exact=True)).to_be_visible()
        expect(page.get_by_text('Pay with what you already have', exact=True)).to_have_count(0)
        page.screenshot(path=str(out / 'mainnet-consent-desktop.png'))
        button('Continue to mainnet preview').click()
        expect(page.get_by_text('Pay with what you already have', exact=True)).to_be_visible()
        expect(button('Use existing passkey')).to_be_enabled()
        expect(button('Preview Aurora route')).to_be_disabled()
        tab('Home').click()
        button('Pay a supplier').click()
        expect(page.get_by_text('Pay a supplier', exact=True)).to_be_visible()
        expect(page.get_by_text('Network check unavailable', exact=True)).to_be_visible()
        expect(button('Continue to review & pay')).to_be_disabled()
        expect(button('Retry network check')).to_be_enabled()
        page.screenshot(path=str(out / 'supplier-network-error-desktop.png'))
        # Offline conditions must not bypass network, draft or payment gates.
        expect(button('Step 2: Review & pay')).to_be_disabled()
        expect(button('Step 3: Business checks')).to_be_disabled()
        tab('More').click()
        button('Open Envio live evidence').click()
        expect(button('Start HyperSync')).to_be_enabled()
        button('Start HyperSync').click()
        expect(page.get_by_text('UNAVAILABLE', exact=True)).to_be_visible()
        expect(page.get_by_text('LIVE · PROVISIONAL', exact=True)).to_have_count(0)
        button('Pause HyperSync').click()
        button('Base Mainnet · USDC').click()
        button('Apply Envio filters').click()
        expect(page.get_by_text('Enter a valid wallet; mainnet reads require a wallet filter.', exact=True)).to_be_visible()
        page.screenshot(path=str(out / 'envio-unavailable-desktop.png'))
        tab('More').click()
        button('Experimental features · testnet only').click()
        button('Open experimental features').click()
        expect(page.get_by_text('Earn, give and get rewarded.', exact=True)).to_be_visible()
        expect(button('1. Approve exact test AUSD amount')).to_be_disabled()
        expect(button('2. Fund the locked plan')).to_be_disabled()
        button('Restart 60-second preview').click()
        expect(page.get_by_text('This counter is a simulation', exact=False)).to_be_visible()
        button('Gifts').click()
        button('Set demo unlock in 2 minutes').click()
        expect(page.get_by_text('Only the recipient can claim before expiry', exact=False)).to_be_visible()
        button('Rewards').click()
        expect(page.get_by_text('Raw CRE simulation JSON cannot authorise a reward', exact=False)).to_be_visible()
        expect(button('Claim test reward with passkey')).to_be_disabled()
        for width in [390, 320]:
            page.set_viewport_size({'width': width, 'height': 844})
            tab('Home').click()
            expect(button('Pay a supplier')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth') <= width + 1, 'Home overflows mobile viewport'
            for name in ['Home', 'Pay', 'Activity', 'More']:
                box = tab(name).bounding_box()
                assert box and box['height'] >= 44 and box['width'] >= 44, 'Navigation tap target too small'
            page.screenshot(path=str(out / ('home-mobile-' + str(width) + '.png')))
            tab('Pay').click()
            assert page.evaluate('document.documentElement.scrollWidth') <= width + 1, 'Pay screen horizontal overflow'
            page.screenshot(path=str(out / ('pay-mobile-' + str(width) + '.png')))
            button('Open supplier payment').click()
            expect(button('Continue to review & pay')).to_be_disabled()
            assert page.evaluate('document.documentElement.scrollWidth') <= width + 1, 'Supplier screen horizontal overflow'
        tab('More').click()
        button('How the payment is checked').click()
        expect(button('How the payment is checked')).to_have_attribute('aria-expanded', 'true')
        page.screenshot(path=str(out / 'help-mobile.png'))
        assert not submitted, 'The UI attempted a signing/submission request during offline tests'
        assert not errors, errors
        (out / 'result.json').write_text(json.dumps({'passed': True, 'paymentsExecuted': 0,
            'mode': 'actual compiled Expo app with local assets and external traffic blocked',
            'checks': ['customer home', 'truthful session-only activity', 'mainnet consent boundary',
                'network/draft/payment gates', 'HyperSync outage is not LIVE', 'mainnet wallet filter',
                'existing labs remain gated', '320/390px overflow', '44px navigation targets',
                'expanded accessibility state', 'no script exceptions', 'no transaction requests'],
            'externalRequestsBlocked': len(blocked)}, indent=2))
        print('CONSUMER_BROWSER_SMOKE: PASS — customer UI, no payments')
    except Exception:
        (out / 'errors.json').write_text(json.dumps(errors, indent=2))
        (out / 'failure.html').write_text(page.content())
        page.screenshot(path=str(out / 'failure.png'))
        raise
    finally:
        browser.close()
