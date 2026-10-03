import test from "node:test";
import assert from "node:assert/strict";
import {
  loadNansenPaymentIntelligence,
  validEvmAddress,
} from "../apps/mobile/src/nansen/client.ts";

const address = "0x1111111111111111111111111111111111111111";

test("validates EVM recipients before spending Nansen credits", () => {
  assert.equal(validEvmAddress(address), true);
  assert.equal(validEvmAddress("0x1234"), false);
  assert.equal(validEvmAddress(""), false);
});

test("recipient intelligence calls only Cherry Money proxy and sends no API key", async () => {
  const original = globalThis.fetch;
  let seenUrl = "";
  let seenInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(input);
    seenInit = init;

    return new Response(JSON.stringify({
      source: "Nansen API",
      chain: "monad",
      address,
      generated_at: "2026-10-03T11:30:00Z",
      window_days: 30,
      portfolio: { assets_returned: 1, observed_value_usd: 12.5, top_assets: [] },
      activity: { transactions_returned: 1, last_activity_at: null, labelled_counterparties: [] },
      relationships: { returned: 0, items: [] },
      endpoints: [],
      notice: "informational",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await loadNansenPaymentIntelligence(address);
    assert.equal(result.source, "Nansen API");
    assert.match(seenUrl, /\/api\/nansen\/payment-intelligence\/0x1111/);
    assert.equal(seenInit?.method, "GET");
    assert.deepEqual(seenInit?.headers, { Accept: "application/json" });
    assert.equal(JSON.stringify(seenInit).includes("apikey"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("proxy errors stay explicit and do not become fake intelligence", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "Nansen payment intelligence is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => loadNansenPaymentIntelligence(address),
      /not configured/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
