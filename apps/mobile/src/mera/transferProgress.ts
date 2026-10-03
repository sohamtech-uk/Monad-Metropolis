/** Public transaction metadata only. No signer, signed payload, bearer token or private key. */
export type TransferProgress = Readonly<{
  hash: string; chainId: number; asset: string; sender: string; recipient: string;
  amount: bigint; reference: string; submittedAtMs: number;
  receipt: Readonly<{ blockNumber: bigint; blockHash: string; status: "success" | "reverted"; receivedAtMs: number }> | null;
  correlation: Readonly<{ status: string; blockNumber: bigint | null; hash: string | null }> | null;
}>;
const listeners = new Set<() => void>();
const payments = new Map<string, TransferProgress>();

/** Observers cannot fail a submitted payment or cause a second broadcast. */
export function publishTransferProgress(progress: TransferProgress): void {
  const key = progress.hash.toLowerCase();
  payments.set(key, Object.freeze({ ...progress,
    receipt: progress.receipt ? Object.freeze({ ...progress.receipt }) : null,
    correlation: progress.correlation ? Object.freeze({ ...progress.correlation }) : null }));
  while (payments.size > 16) payments.delete(payments.keys().next().value!);
  for (const listener of listeners) {
    try { listener(); } catch { /* A view failure must not affect the payment path. */ }
  }
}
export function subscribeTransferProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function progressForReference(reference: string | null): TransferProgress | null {
  if (!reference) return null;
  const key = reference.toLowerCase();
  return [...payments.values()].reverse().find((payment) => payment.reference.toLowerCase() === key) ?? null;
}
// Intentionally session-only. This read model does not implement payment recovery,
// idempotency, finality, reconciliation, or an authenticated account history.
