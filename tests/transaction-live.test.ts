import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anchorBlock, appendSample, blockBars, indexedFocus, supportedProgress, transactionEvidence } from "../apps/mobile/src/envio/transactionLiveModel.ts";
import { progressForReference, publishTransferProgress, subscribeTransferProgress, type TransferProgress } from "../apps/mobile/src/mera/transferProgress.ts";
import { NETWORKS, type Snapshot, type Observation } from "../apps/mobile/src/envio/live.ts";

// Fixed synthetic unit fixtures ONLY. No node/provider request or payment occurs.
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const now = 1_800_000_000_000;
const payment: TransferProgress = {
  hash: hash(5), reference: hash(9), chainId: 10143, asset: NETWORKS["monad-testnet"].asset,
  sender: "0x" + "1".repeat(40), recipient: "0x" + "2".repeat(40), amount: 5_000_000n,
  submittedAtMs: now - 3000, receipt: null, correlation: null,
};
const transfer: Observation = { id: "transfer-fixture", kind: "transfer", txHash: payment.hash, paymentTxHash: payment.hash,
  blockNumber: 101, blockHash: hash(101), logIndex: 0, payer: payment.sender, recipient: payment.recipient,
  amount: payment.amount, asset: payment.asset, reference: null, successfulReceipt: true };
const reference: Observation = { ...transfer, id: "reference-fixture", kind: "correlation", txHash: hash(6), reference: payment.reference,
  blockNumber: 102, blockHash: hash(102) };
const snapshot: Snapshot = { network: "monad-testnet", chainId: 10143, archiveHeight: 108,
  fromBlock: 100, nextBlock: 108, toBlock: 108, complete: true, observedAt: now, queryMs: 84, removedCount: 0,
  blocks: Array.from({ length: 8 }, (_, n) => ({ number: 100 + n, hash: hash(100 + n), parentHash: hash(99 + n), timestamp: now / 1000 })),
  events: [transfer, reference] };
const confirmed: TransferProgress = { ...payment, receipt: { blockNumber: 101n, blockHash: hash(101), status: "success", receivedAtMs: now } };

test("a broadcast can be found by HyperSync before the RPC receipt has returned", () => {
  const observed = transactionEvidence(payment, [snapshot], now);
  assert.equal(observed.transfer?.txHash, payment.hash);
  assert.equal(observed.correlation?.reference, payment.reference);
  assert.equal(indexedFocus(payment), null, "a pending RPC receipt must not fabricate an indexed focus");
  assert.equal(indexedFocus(confirmed)?.blockNumber, 101n);
});
test("match is bound to transaction, asset, addresses, amount, reference and receipt block", () => {
  for (const changed of [ { hash: hash(88) }, { amount: 6n }, { sender: payment.recipient },
    { recipient: payment.sender }, { asset: payment.recipient }, { chainId: 143 },
    { receipt: { ...confirmed.receipt!, blockHash: hash(99) } }, { receipt: { ...confirmed.receipt!, blockNumber: 102n } } ]) {
    assert.equal(transactionEvidence({ ...confirmed, ...changed }, [snapshot], now).transfer, null);
  }
  assert.equal(transactionEvidence({ ...payment, reference: hash(8) }, [snapshot], now).correlation, null);
});
test("stale, future, partial and wrong-network scans never turn the graphics green", () => {
  for (const changed of [{ observedAt: now - 21000 }, { observedAt: now + 6000 }, { complete: false }, { network: "base" as const }]) {
    const result = transactionEvidence(payment, [{ ...snapshot, ...changed }], now);
    assert.equal(result.transfer, null); assert.equal(result.correlation, null);
  }
});
test("an actual reverted RPC receipt overrides optimistic observations", () => {
  const reverted: TransferProgress = { ...confirmed, receipt: { ...confirmed.receipt!, status: "reverted" } };
  assert.equal(transactionEvidence(reverted, [snapshot], now).conflict, true);
  assert.equal(transactionEvidence(reverted, [snapshot], now).transfer, null);
  assert.equal(indexedFocus(reverted), null);
});
test("repeated windows deduplicate events, conflicting matches fail closed", () => {
  assert.equal(transactionEvidence(payment, [snapshot, snapshot], now).conflict, false);
  const duplicateLog = { ...transfer, id: "different-log", logIndex: 1 };
  assert.equal(transactionEvidence(payment, [{ ...snapshot, events: [transfer, duplicateLog] }], now).conflict, true);
  assert.equal(transactionEvidence(payment, [{ ...snapshot, events: [{ ...transfer, successfulReceipt: false }] }], now).transfer, null);
});
test("a later correlation can be checked in a separate bounded window", () => {
  const primary = { ...snapshot, events: [transfer] };
  const late = { ...reference, blockNumber: 501, blockHash: hash(501) };
  const secondary = { ...snapshot, fromBlock: 500, nextBlock: 502, toBlock: 502,
    blocks: [{ number: 500, hash: hash(500), parentHash: hash(499), timestamp: now / 1000 },
      { number: 501, hash: hash(501), parentHash: hash(500), timestamp: now / 1000 }], events: [late] };
  assert.equal(transactionEvidence(payment, [primary, secondary], now).correlation?.blockNumber, 501);
});
test("every block bar and zero is derived from returned data, not a random animation", () => {
  const bars = blockBars(snapshot, payment.hash);
  assert.equal(bars.length, 8);
  assert.deepEqual(bars.map((bar) => bar.events), [0, 1, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(bars.filter((bar) => bar.payment).map((bar) => bar.number), [101, 102]);
  assert.equal(blockBars({ ...snapshot, blocks: [], events: [] }, payment.hash).length, 0);
});
test("query charts keep measured values exact and don't count cached snapshots twice", () => {
  const samples = appendSample([], snapshot);
  assert.equal(samples[0]?.queryMs, 84);
  assert.equal(appendSample(samples, snapshot), samples);
  assert.equal(appendSample(samples, { ...snapshot, observedAt: now - 1 }), samples);
  assert.equal(appendSample(samples, { ...snapshot, observedAt: now + 1, queryMs: 0 }).at(-1)?.queryMs, 0);
  let history = samples;
  for (let n = 1; n < 100; n++) history = appendSample(history, { ...snapshot, observedAt: now + n });
  assert.equal(history.length, 16);
});
test("block anchors are bounded safe integers and pending data is not block zero", () => {
  assert.equal(anchorBlock(null), null); assert.equal(anchorBlock(101n), 99); assert.equal(anchorBlock(1n), 0);
  assert.throws(() => anchorBlock(-1n)); assert.throws(() => anchorBlock(BigInt(Number.MAX_SAFE_INTEGER) + 1n));
  assert.equal(supportedProgress({ ...payment, hash: "pending" }), false);
});
test("observer errors cannot propagate to a submitted payment and metadata is immutable", () => {
  let notifications = 0;
  const bad = subscribeTransferProgress(() => { throw new Error("Broken view"); });
  const good = subscribeTransferProgress(() => { notifications++; });
  assert.doesNotThrow(() => publishTransferProgress(payment));
  assert.equal(progressForReference(payment.reference)?.hash, payment.hash);
  assert.equal(Object.isFrozen(progressForReference(payment.reference)), true);
  publishTransferProgress(confirmed);
  assert.equal(notifications, 2);
  assert.equal(Object.isFrozen(progressForReference(payment.reference)?.receipt), true);
  bad(); good();
});
test("source regression: broadcast metadata is emitted before the receipt wait", () => {
  const source = readFileSync(new URL("../apps/mobile/src/mera/scopedSession.ts", import.meta.url), "utf8");
  const send = source.slice(source.indexOf("async sendAusdTransfer("), source.indexOf("async retrySettlementCorrelation("));
  assert.ok(send.indexOf("publishTransferProgress(progress)") > send.indexOf("walletClient.writeContract(simulation.request)"));
  assert.ok(send.indexOf("publishTransferProgress(progress)") < send.indexOf("waitForTransactionReceipt"));
  assert.equal((send.match(/walletClient\.writeContract/g) ?? []).length, 1);
});
