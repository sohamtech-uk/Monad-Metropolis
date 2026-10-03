import type { CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import { formatUnits, getAddress, keccak256, parseUnits, toBytes, zeroAddress, type Address, type Hex } from "viem";
import type { AusdTransferResult } from "../mera/scopedSession";

/** Presentation models only: no signing, provider credentials or durable financial storage. */
export type PaymentReceipt = Readonly<{
  hash: string; recipient: string; amount: string; payee: string; reference: string;
  confirmedAtMs: number; block: string; network: "Monad Testnet";
  correlationConfirmed: boolean; indexed: boolean;
}>;
export type PaymentReview = Readonly<{
  recipient: Address; amount: bigint; formatted: string; reference: Hex;
  draftKey: string; chainId: number;
}>;

export function draftKey(draft: CherryMoneyPaymentDraft): string {
  return ["cherry-money-payment-draft", draft.id, draft.payee, draft.currency,
    draft.amount.toFixed(2), draft.reference].join(":");
}
export function supportedDraft(draft: CherryMoneyPaymentDraft | null): boolean {
  return draft !== null && ["USD", "AUSD"].includes(draft.currency.toUpperCase());
}
export function parsePaymentAmount(value: string, decimals: number): bigint {
  const amount = value.trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) ||
      (amount.split(".")[1]?.length ?? 0) > decimals) {
    throw new Error("Enter a positive amount with no more than " + decimals + " decimal places.");
  }
  const atomic = parseUnits(amount, decimals);
  if (atomic <= 0n) throw new Error("The payment amount must be greater than zero.");
  return atomic;
}
export function createPaymentReview(input: {
  draft: CherryMoneyPaymentDraft; recipient: string; amount: string;
  decimals: number; chainId: number; maximum: bigint;
}): PaymentReview {
  if (input.chainId !== 10143) throw new Error("Supplier payments in this preview are restricted to Monad Testnet.");
  if (!supportedDraft(input.draft)) throw new Error("Choose a USD or AUSD draft. This preview does not provide an FX quote.");
  const recipient = getAddress(input.recipient.trim());
  if (recipient === zeroAddress) throw new Error("The zero address cannot receive this supplier payment.");
  const amount = parsePaymentAmount(input.amount, input.decimals);
  const sourceAmount = parsePaymentAmount(input.draft.amount.toFixed(2), input.decimals);
  if (amount !== sourceAmount) throw new Error("The amount must match the selected USD/AUSD payment draft.");
  if (amount > input.maximum) throw new Error("This amount exceeds the passkey session's per-payment limit.");
  const key = draftKey(input.draft);
  return Object.freeze({ recipient, amount, formatted: formatUnits(amount, input.decimals),
    reference: keccak256(toBytes(key)), draftKey: key, chainId: input.chainId });
}
export function sameReview(a: PaymentReview, b: PaymentReview): boolean {
  return a.recipient === b.recipient && a.amount === b.amount && a.reference === b.reference &&
    a.chainId === b.chainId && a.draftKey === b.draftKey;
}
export function receiptFor(transfer: AusdTransferResult, draft: CherryMoneyPaymentDraft,
  decimals: number, indexed: boolean): PaymentReceipt {
  return Object.freeze({ hash: transfer.hash, recipient: transfer.recipient,
    amount: formatUnits(transfer.amount, decimals), payee: draft.payee,
    reference: draft.reference || draft.id, confirmedAtMs: transfer.confirmedAtMs,
    block: transfer.blockNumber.toString(), network: "Monad Testnet",
    correlationConfirmed: transfer.correlation.status === "confirmed", indexed });
}
export function shortAddress(value: string): string {
  return value.length > 20 ? value.slice(0, 8) + "…" + value.slice(-6) : value;
}
export function receiptStage(receipt: PaymentReceipt): string {
  if (!receipt.correlationConfirmed) return "Payment confirmed · reference needs attention";
  return receipt.indexed ? "Payment confirmed · indexed match found" : "Payment confirmed · indexing pending";
}
