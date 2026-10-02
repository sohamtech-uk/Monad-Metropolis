import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CherryMoneyClient,
  buildCherryMoneyGoogleLoginUrl,
  exchangeCherryMoneyGoogleCode,
} from '../packages/cherry-money-client/src/index.ts';
import { EnvioSettlementClient } from '../packages/envio-client/src/index.ts';

test('shared service clients retain the browser fetch receiver', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async function browserFetch(input, init) {
      assert.equal(this, globalThis, 'fetch requires its Window/global receiver');
      requests.push({ url: String(input), method: init?.method ?? 'GET' });
      const url = String(input);
      const payload = url.includes('/graphql')
        ? { data: { DailySettlementMetric: [], Settlement: [], SettlementCorrelation: [] } }
        : url.includes('/api/webmcp/google/exchange')
          ? {
              token: '1|browser-google-token',
              auth_method: 'google',
              user: {
                company: 'Cherry Demo Ltd',
                currency: 'USD',
                email: 'demo@example.com',
                name: 'Demo User',
                company_id: 42,
              },
            }
          : { connected: true };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    await import('../apps/mobile/src/mera/polyfills.web.ts');
    const cherry = new CherryMoneyClient({
      baseUrl: 'https://example.invalid', bearerToken: 'unit-test-only',
    });
    const envio = new EnvioSettlementClient({ endpoint: 'https://example.invalid/graphql/' });
    assert.deepEqual(await cherry.status(), { connected: true });

    const loginUrl = buildCherryMoneyGoogleLoginUrl(
      'https://example.invalid/',
      'https://metropolis.example.invalid/path?ignored=yes',
    );
    assert.equal(
      loginUrl,
      'https://example.invalid/webmcp/google/redirect?return_origin=https%3A%2F%2Fmetropolis.example.invalid',
    );

    const exchange = await exchangeCherryMoneyGoogleCode({
      baseUrl: 'https://example.invalid',
      code: 'A'.repeat(64),
    });
    assert.equal(exchange.token, '1|browser-google-token');
    assert.equal(exchange.authMethod, 'google');
    assert.equal(exchange.user.company, 'Cherry Demo Ltd');
    assert.equal(exchange.user.companyId, '42');

    const dashboard = await envio.dashboard();
    assert.deepEqual(dashboard.latestSettlements, []);
    assert.equal(dashboard.totals.verifiedVolume, 0n);
    assert.deepEqual(
      requests.map(request => request.method),
      ['GET', 'POST', 'POST'],
    );
    assert.match(requests[1].url, /\/api\/webmcp\/google\/exchange$/);
    await assert.rejects(
      exchangeCherryMoneyGoogleCode({
        baseUrl: 'https://example.invalid',
        code: 'not-a-valid-code',
      }),
      /sign-in code is invalid/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
