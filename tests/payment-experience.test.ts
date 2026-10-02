import test from "node:test";
import assert from "node:assert/strict";
import type { CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import { createPaymentReview, draftKey, parsePaymentAmount, receiptStage, sameReview, supportedDraft, type PaymentReceipt } from "../apps/mobile/src/experience/model.ts";

const draft: CherryMoneyPaymentDraft = {
  id: "ui-test-draft", payee: "Fixture Supplier", amount: 5, reference: "FIXTURE-ONLY",
  purpose: "Offline test fixture, not payment evidence", currency: "USD", status: "draft_only",
  createdAt: null, moneyMoved: false, source: "cherry-money-production",
};
const input = { draft, recipient: "0x1111111111111111111111111111111111111111", amount: "5.00", decimals: 6, chainId: 10143, maximum: 100_000_000n };

test("review captures exact recipient, amount, chain and immutable draft context", () => {
  const review = createPaymentReview(input);
  assert.equal(review.amount, 5_000_000n);
  assert.equal(review.formatted, "5");
  assert.equal(review.recipient, input.recipient);
  assert.equal(review.chainId, 10143);
  assert.equal(review.draftKey, draftKey(draft));
  assert.match(review.reference, /^0x[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(review), true);
});
test("no implicit FX conversion or unsupported supplier network", () => {
  assert.equal(supportedDraft(null), false);
  assert.equal(supportedDraft({ ...draft, currency: "GBP" }), false);
  assert.throws(() => createPaymentReview({ ...input, draft: { ...draft, currency: "GBP" } }));
  assert.throws(() => createPaymentReview({ ...input, chainId: 143 }));
});
test("invalid recipient, zero address, scope excess and changed draft amount are blocked", () => {
  for (const recipient of ["", "not-a-wallet", "0x0000000000000000000000000000000000000000"]) {
    assert.throws(() => createPaymentReview({ ...input, recipient }));
  }
  assert.throws(() => createPaymentReview({ ...input, maximum: 4_999_999n }));
  assert.throws(() => createPaymentReview({ ...input, amount: "6" }));
});
test("review is invalidated by another recipient or business reference", () => {
  const original = createPaymentReview(input);
  assert.equal(sameReview(original, createPaymentReview(input)), true);
  assert.equal(sameReview(original, createPaymentReview({ ...input, recipient: "0x2222222222222222222222222222222222222222" })), false);
  assert.equal(sameReview(original, createPaymentReview({ ...input, draft: { ...draft, reference: "CHANGED" } })), false);
});
test("decimal parsing never rounds an unauthorised payment", () => {
  assert.equal(parsePaymentAmount("0.000001", 6), 1n);
  assert.equal(parsePaymentAmount("9007199254740993.123456", 6), 9007199254740993123456n);
  for (const invalid of ["0", "-1", "1e3", "1,000", "Infinity", "NaN", "5.0000001", "01", "1."]) {
    assert.throws(() => parsePaymentAmount(invalid, 6));
  }
});
test("a receipt never promotes confirmation to an accounting posting", () => {
  const receipt: PaymentReceipt = { hash: "0x" + "1".repeat(64), recipient: input.recipient, amount: "5", payee: draft.payee,
    reference: draft.reference, confirmedAtMs: 1000, block: "123", network: "Monad Testnet", correlationConfirmed: false, indexed: false };
  assert.match(receiptStage(receipt), /reference needs attention/);
  assert.match(receiptStage({ ...receipt, correlationConfirmed: true }), /indexing pending/);
  assert.match(receiptStage({ ...receipt, correlationConfirmed: true, indexed: true }), /indexed match found/);
  for (const state of [receipt, { ...receipt, correlationConfirmed: true, indexed: true }]) {
    assert.doesNotMatch(receiptStage(state), /reconciled|accounting complete|ready_for_reconciliation|independently verified/i);
  }
});
