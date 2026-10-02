import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { CORRELATION_TOPIC, TRANSFER_TOPIC, NETWORKS, parseSnapshot, paymentObservation, changedFork,
  fresh, indexedPaymentState, EXACT_SETTLEMENT_QUERY, requestJson, safeEndpoint } from "../apps/mobile/src/envio/live.ts";

const tx = "0x" + "a".repeat(64);
const block = "0x" + "b".repeat(64);
const parent = "0x" + "c".repeat(64);
const payer = "0x" + "1".repeat(40);
const recipient = "0x" + "2".repeat(40);
const reference = "0x" + "d".repeat(64);
const focus = { hash: tx, blockNumber: 100n, sender: payer, recipient, amount: 1000000n, reference };
const pad = (address: string) => "0x" + address.slice(2).padStart(64, "0");
function fixture() {
  return {
    source: "envio-hypersync", network: "monad-testnet", chainId: 10143,
    asset: NETWORKS["monad-testnet"].asset, registry: NETWORKS["monad-testnet"].registry, finality: "provisional",
    archiveHeight: 100, fromBlock: 100, nextBlock: 101, toBlock: 101, complete: true,
    observedAt: new Date().toISOString(), queryMs: 87,
    blocks: [{ number: 100, hash: block, parent_hash: parent, timestamp: 1790000000 }],
    transactions: [{ hash: tx, block_number: 100, block_hash: block, status: 1 }],
    logs: [{ address: NETWORKS["monad-testnet"].asset, block_number: 100, block_hash: block,
      transaction_hash: tx, log_index: 0, data: "0x" + focus.amount.toString(16).padStart(64, "0"),
      topic0: TRANSFER_TOPIC, topic1: pad(payer), topic2: pad(recipient), topic3: null as string | null, removed: false }],
  };
}
function indexedRow() { return { paymentTxHash: tx, paymentReference: reference, payer, recipient,
  asset: NETWORKS["monad-testnet"].asset, amount: focus.amount.toString(), registryAddress: NETWORKS["monad-testnet"].registry }; }

test("exact raw transfer matching includes successful receipt and all payment fields", () => {
  const snapshot = parseSnapshot(fixture(), "monad-testnet");
  assert.deepEqual(paymentObservation(snapshot, focus), { transfer: true, correlation: false });
  for (const wrong of [{ ...focus, hash: reference }, { ...focus, recipient: payer }, { ...focus, amount: 999999n }, { ...focus, blockNumber: 99n }]) {
    assert.equal(paymentObservation(snapshot, wrong).transfer, false);
  }
});
test("correlation is decoded using ABI and matched to the original payment hash/reference", () => {
  const raw = fixture();
  const correlationTx = "0x" + "e".repeat(64);
  raw.logs.push({ ...raw.logs[0]!, address: NETWORKS["monad-testnet"].registry,
    transaction_hash: correlationTx, log_index: 1, topic0: CORRELATION_TOPIC,
    topic1: reference, topic2: tx, topic3: pad(payer),
    data: encodeAbiParameters(parseAbiParameters("address,address,uint256,uint64"), [recipient as `0x${string}`, NETWORKS["monad-testnet"].asset, focus.amount, 1790000000n]) });
  raw.transactions.push({ hash: correlationTx, block_number: 100, block_hash: block, status: 1 });
  const snapshot = parseSnapshot(raw, "monad-testnet");
  assert.deepEqual(paymentObservation(snapshot, focus), { transfer: true, correlation: true });
  assert.equal(paymentObservation(snapshot, { ...focus, reference: tx }).correlation, false);
});
test("untrusted source, wrong asset, orphaned log and false scan coverage fail closed", () => {
  const wrongChain = fixture(); wrongChain.chainId = 143;
  const wrongAsset = fixture(); wrongAsset.logs[0]!.address = payer;
  const orphan = fixture(); orphan.logs[0]!.block_hash = parent;
  const badRange = fixture(); badRange.nextBlock = 100;
  for (const raw of [wrongChain, wrongAsset, orphan, badRange]) assert.throws(() => parseSnapshot(raw, "monad-testnet"));
});
test("duplicates are removed without doubling evidence or token amounts", () => {
  const raw = fixture(); raw.logs.push({ ...raw.logs[0]! });
  const snapshot = parseSnapshot(raw, "monad-testnet");
  assert.equal(snapshot.events.length, 1); assert.equal(snapshot.events[0]!.amount, 1000000n);
});
test("removed logs, failed transactions, partial and stale observations never pass", () => {
  const removed = fixture(); removed.logs[0]!.removed = true;
  const failed = fixture(); failed.transactions[0]!.status = 0;
  const partial = fixture(); partial.complete = false;
  const stale = fixture(); stale.observedAt = new Date(Date.now() - 60000).toISOString();
  for (const raw of [removed, failed, partial, stale]) assert.equal(paymentObservation(parseSnapshot(raw, "monad-testnet"), focus).transfer, false);
  assert.equal(parseSnapshot(removed, "monad-testnet").removedCount, 1);
});
test("uint256 amounts stay exact beyond JavaScript safe integers", () => {
  const raw = fixture(); const amount = 2n ** 200n + 123n;
  raw.logs[0]!.data = "0x" + amount.toString(16).padStart(64, "0");
  assert.equal(parseSnapshot(raw, "monad-testnet").events[0]!.amount, amount);
});
test("overlapping block hash change and head rollback invalidate previous lineage", () => {
  const before = parseSnapshot(fixture(), "monad-testnet");
  const raw = fixture(); raw.blocks[0]!.hash = reference; raw.logs[0]!.block_hash = reference; raw.transactions[0]!.block_hash = reference;
  const after = parseSnapshot(raw, "monad-testnet");
  assert.equal(changedFork(before, after), true);
  assert.equal(changedFork(before, before), false);
  assert.equal(changedFork(before, { ...before, archiveHeight: 99 }), true);
  assert.equal(fresh({ ...before, observedAt: Date.now() + 60000 }), false);
});
test("HyperIndex verifies the exact row, not its newest ten settlements", () => {
  assert.match(EXACT_SETTLEMENT_QUERY, /paymentTxHash: \{_eq: \$hash\}/);
  assert.equal(indexedPaymentState({ data: { Settlement: [indexedRow()] } }, focus), "matched");
  assert.equal(indexedPaymentState({ data: { Settlement: [] } }, focus), "waiting");
  assert.equal(indexedPaymentState({ data: { Settlement: [indexedRow(), indexedRow()] } }, focus), "mismatch");
  for (const patch of [{ paymentTxHash: reference }, { paymentReference: tx }, { amount: "7" }, { recipient: payer }, { asset: payer }, { registryAddress: payer }]) {
    assert.equal(indexedPaymentState({ data: { Settlement: [{ ...indexedRow(), ...patch }] } }, focus), "mismatch");
  }
  assert.throws(() => indexedPaymentState({ errors: [{ message: "failed" }] }, focus));
});
test("credentials and insecure endpoints are rejected", () => {
  assert.throws(() => safeEndpoint("http://example.com/query"));
  assert.throws(() => safeEndpoint("https://token:secret@example.com/query"));
  assert.equal(safeEndpoint("http://localhost:8080/query").hostname, "localhost");
});
test("HTTP errors never print upstream body; cancellation propagates", async () => {
  const fake: typeof fetch = async (_input, init) => {
    assert.equal(init?.headers && JSON.stringify(init.headers).includes("Authorization"), false);
    return new Response('server-secret-must-not-be-exposed', { status: 503 });
  };
  await assert.rejects(requestJson("https://cherrymoney.co.uk/api/envio/hypersync", { method: "GET" }, new AbortController().signal, fake),
    (error: Error) => /not configured/.test(error.message) && !/server-secret/.test(error.message));
  const aborted = new AbortController(); aborted.abort();
  const cancelFake: typeof fetch = async (_input, init) => { assert.equal(init?.signal?.aborted, true); throw new Error("aborted"); };
  await assert.rejects(requestJson("https://example.com/query", {}, aborted.signal, cancelFake), /aborted/);
});
