"""Offline UI acceptance. No external requests, authentication or payments.

Loads the actual compiled Expo bundle into a browser document. Deployment-host
routing, RPC availability and physical passkey-provider tests remain separate.
Requires playwright==1.57.0 and a system Chrome/Chromium executable.
"""
import json
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path('apps/mobile/dist').resolve()
out = Path('build/consumer-browser'); out.mkdir(parents=True, exist_ok=True)
html = (root / 'index.html').read_text()
match = re.search(r'<script\b[^>]*src="/([^"]+)"', html)
assert match, 'Compiled Expo script not found'
bundle = (root / match[1]).resolve()
assert root in bundle.parents, 'Invalid bundle path'
code = bundle.read_text()
html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
html = re.sub(r'<link\b[^>]*rel="icon"[^>]*>', '', html)
executable = shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium')
assert executable, 'A system Chrome/Chromium executable is required'
errors = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    page.route('**/*', lambda route: route.abort())
    page.on('pageerror', lambda error: errors.append(str(error)))
    button = lambda text: page.get_by_role('button', name=text, exact=True)
    try:
        page.set_content(html)
        page.add_script_tag(content=code)
        expect(page.get_by_text('Passkey-powered business payments', exact=True)).to_be_visible()
        button('Pay from any chain').click()
        expect(page.get_by_text('Pay with what you already have', exact=True)).to_be_visible()
        expect(page.get_by_text(re.compile('Experimental hackathon route'))).to_be_visible()
        expect(button('Use existing passkey')).to_be_enabled()
        expect(button('Create passkey')).to_be_enabled()
        page.screenshot(path=str(out / 'aurora-enabled-desktop.png'))
        button('Earnings · Rewards · Gifts').click()
        expect(page.get_by_text('Earn, give and get rewarded.', exact=True)).to_be_visible()
        expect(page.get_by_text(re.compile('On-chain actions are disabled'))).to_be_visible()
        expect(button('1. Approve exact test AUSD amount')).to_be_disabled()
        expect(button('2. Fund the locked plan')).to_be_disabled()
        button('Restart 60-second preview').click()
        page.wait_for_timeout(2100)
        expect(page.get_by_text(re.compile('This counter is a simulation'))).to_be_visible()
        page.screenshot(path=str(out / 'earnings-desktop.png'))
        button('Gifts').click()
        button('Set demo unlock in 2 minutes').click()
        expect(page.get_by_text(re.compile('Only the recipient can claim before expiry'))).to_be_visible()
        expect(button('2. Fund the locked plan')).to_be_disabled()
        page.screenshot(path=str(out / 'gifts-desktop.png'))
        button('Rewards').click()
        expect(page.get_by_text(re.compile('Raw CRE simulation JSON cannot authorise a reward'))).to_be_visible()
        expect(button('Claim test reward with passkey')).to_be_disabled()
        page.screenshot(path=str(out / 'rewards-desktop.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        button('Gifts').click()
        assert page.evaluate('document.documentElement.scrollWidth') <= 391, 'Horizontal mobile overflow'
        page.screenshot(path=str(out / 'gifts-mobile.png'))
        button('Supplier payments').click()
        expect(page.get_by_text('Passkey-powered business payments', exact=True)).to_be_visible()
        assert not errors, errors
        result = {'passed': True, 'mode': 'offline compiled-bundle UI check', 'paymentsExecuted': 0,
                  'checks': ['supplier flow retained', 'Aurora pay-from-any-chain surface', 'Aurora enabled build surface',
                             'earnings/rewards/gifts tabs', 'default-off write controls',
                             'explicit simulated earnings preview', 'gift UTC timing inputs',
                             'unsigned CRE evidence warning', '390px mobile viewport', 'no uncaught JavaScript exceptions']}
        (out / 'result.json').write_text(json.dumps(result, indent=2))
        print('CONSUMER_BROWSER_SMOKE: PASS — desktop and mobile UI, no payments')
    except Exception:
        (out / 'errors.json').write_text(json.dumps(errors, indent=2))
        (out / 'failure.html').write_text(page.content())
        page.screenshot(path=str(out / 'failure.png'))
        raise
    finally:
        browser.close()
