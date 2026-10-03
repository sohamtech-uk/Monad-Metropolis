import { fresh, NETWORKS, type Snapshot, type Observation, type PaymentFocus } from "./live";
import type { TransferProgress } from "../mera/transferProgress";

export type ReadSample = Readonly<{ observedAt: number; archiveHeight: number; queryMs: number }>;
export type PaymentEvidence = Readonly<{ transfer: Observation | null; correlation: Observation | null; conflict: boolean }>;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function supportedProgress(payment: TransferProgress): boolean {
  const scope = NETWORKS["monad-testnet"];
  return payment.chainId === scope.chainId && same(payment.asset, scope.asset)
    && /^0x[0-9a-f]{64}$/i.test(payment.hash) && /^0x[0-9a-f]{64}$/i.test(payment.reference)
    && /^0x[0-9a-f]{40}$/i.test(payment.sender) && /^0x[0-9a-f]{40}$/i.test(payment.recipient)
    && payment.amount > 0n;
}
export function snapshotUsable(snapshot: Snapshot | null, now: number): snapshot is Snapshot {
  return snapshot !== null && snapshot.network === "monad-testnet" && snapshot.complete && fresh(snapshot, now);
}
/** No amount-only correlation: bind the actual transaction, receipt and business reference. */
export function transactionEvidence(payment: TransferProgress, snapshots: readonly Snapshot[], now: number): PaymentEvidence {
  if (!supportedProgress(payment) || payment.receipt?.status === "reverted") {
    return { transfer: null, correlation: null, conflict: payment.receipt?.status === "reverted" };
  }
  const unique = new Map<string, Observation>();
  for (const snapshot of snapshots) {
    if (!snapshotUsable(snapshot, now)) continue;
    for (const event of snapshot.events) {
      if (same(event.paymentTxHash, payment.hash)) unique.set(event.id, event);
    }
  }
  const events = [...unique.values()];
  const scoped = (event: Observation) => event.successfulReceipt
    && same(event.asset, payment.asset) && same(event.payer, payment.sender)
    && same(event.recipient, payment.recipient) && event.amount === payment.amount;
  const matches = events.filter((event) => event.kind === "transfer" && scoped(event)
    && same(event.txHash, payment.hash)
    && (!payment.receipt || (BigInt(event.blockNumber) === payment.receipt.blockNumber && same(event.blockHash, payment.receipt.blockHash))));
  const references = events.filter((event) => event.kind === "correlation" && scoped(event)
    && event.reference !== null && same(event.reference, payment.reference));
  const conflict = matches.length > 1 || references.length > 1
    || (events.some((event) => event.kind === "transfer") && matches.length !== 1)
    || events.some((event) => event.kind === "correlation" && !references.includes(event));
  return { transfer: !conflict && matches.length === 1 ? matches[0]! : null,
    correlation: !conflict && references.length === 1 ? references[0]! : null, conflict };
}
export function indexedFocus(payment: TransferProgress): PaymentFocus | null {
  return supportedProgress(payment) && payment.receipt?.status === "success" ? {
    hash: payment.hash, blockNumber: payment.receipt.blockNumber, sender: payment.sender,
    recipient: payment.recipient, amount: payment.amount, reference: payment.reference,
  } : null;
}
/** Only append newly observed server snapshots. A cached response isn't another measurement. */
export function appendSample(previous: readonly ReadSample[], snapshot: Snapshot): readonly ReadSample[] {
  const last = previous.at(-1);
  if (last && snapshot.observedAt <= last.observedAt) return previous;
  return [...previous, { observedAt: snapshot.observedAt, archiveHeight: snapshot.archiveHeight, queryMs: snapshot.queryMs }].slice(-16);
}
/** Every bar represents one returned block, including true zero-event blocks. */
export function blockBars(snapshot: Snapshot, paymentHash: string, limit = 24) {
  const counts = new Map<number, number>();
  const mine = new Set<number>();
  for (const event of snapshot.events) {
    counts.set(event.blockNumber, (counts.get(event.blockNumber) ?? 0) + 1);
    if (same(event.paymentTxHash, paymentHash)) mine.add(event.blockNumber);
  }
  const focal = snapshot.blocks.findIndex((block) => mine.has(block.number));
  const start = focal >= 0 ? Math.max(0, Math.min(focal - 4, snapshot.blocks.length - limit)) : Math.max(0, snapshot.blocks.length - limit);
  return snapshot.blocks.slice(start, start + limit).map((block) => ({ ...block,
    events: counts.get(block.number) ?? 0, payment: mine.has(block.number) }));
}
export function anchorBlock(block: bigint | null | undefined): number | null {
  if (block == null) return null;
  if (block < 0n || block > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsupported block height.");
  return Number(block > 2n ? block - 2n : 0n);
}
