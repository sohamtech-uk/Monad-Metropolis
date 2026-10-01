import test from 'node:test';
import assert from 'node:assert/strict';
import { CherryMoneyClient } from '../packages/cherry-money-client/src/index.ts';
import { EnvioSettlementClient } from '../packages/envio-client/src/index.ts';

test('shared service clients retain the browser fetch receiver', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async function browserFetch(input, init) {
      assert.equal(this, globalThis, 'fetch requires its Window/global receiver');
      requests.push({ url: String(input), method: init?.method ?? 'GET' });
      const payload = String(input).includes('/graphql')
        ? { data: { DailySettlementMetric: [], Settlement: [], SettlementCorrelation: [] } }
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
    const dashboard = await envio.dashboard();
    assert.deepEqual(dashboard.latestSettlements, []);
    assert.equal(dashboard.totals.verifiedVolume, 0n);
    assert.deepEqual(requests.map(request => request.method), ['GET', 'POST']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
