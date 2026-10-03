import test from "node:test";
import assert from "node:assert/strict";
import { getAddress, zeroAddress } from "viem";
import { createPaymentSessionScope, emptyPaymentSessionUsage, validatePaymentAuthorization,
  assertPaymentRecipient, SessionPolicyViolation } from "../packages/core/src/sessionPolicy.ts";
import { fundingErrorMessage } from "../apps/mobile/src/mera/fundingErrors.ts";
import { auroraRecipient, buildBaseUsdcToMonadPaymentPlan, CHERRY_PAY_MONAD_USDC_RECIPE } from "../apps/mobile/src/aurora/plan.ts";
import { MONAD_USDC_ADDRESS } from "../apps/mobile/src/aurora/config.ts";

const asset = getAddress("0xa9012a055bd4e0edff8ce09f960291c09d5322dc");
const recipient = getAddress("0x1111111111111111111111111111111111111111");
const ref = ("0x" + "9".repeat(64)) as `0x${string}`;
const options = { chainId: 10143, asset, recipient, assetDecimals: 6, nowMs: 1000, reference: ref };

test("reported AUSD-contract recipient is rejected at scope creation", () => {
  for (const value of [asset, asset.toLowerCase(), zeroAddress]) {
    assert.throws(() => createPaymentSessionScope({ ...options, recipient: value }), (e) => e instanceof SessionPolicyViolation && e.code === "RECIPIENT_INVALID");
  }
});
test("manually constructed legacy scope cannot authorise a transfer to its token", () => {
  const scope = { ...createPaymentSessionScope(options), recipient: asset };
  assert.throws(() => validatePaymentAuthorization(scope, emptyPaymentSessionUsage(), {
    chainId: 10143, asset, recipient: asset, amount: 5_000_000n, reference: ref,
  }, 1100), /recipient's wallet/);
});
test("valid recipients retain the original scope and payment limits", () => {
  const scope = createPaymentSessionScope(options);
  assert.equal(scope.maxPerPayment, 500_000_000n);
  assert.equal(scope.maxCumulative, 1_000_000_000n);
  assert.equal(scope.maxAuthorizations, 3);
  assert.equal(scope.expiresAtMs, 301000);
  assert.doesNotThrow(() => assertPaymentRecipient(asset, recipient));
  assert.doesNotThrow(() => validatePaymentAuthorization(scope, emptyPaymentSessionUsage(), {
    chainId: 10143, asset, recipient, amount: 5_000_000n, reference: ref,
  }, 1100));
});
test("Aurora rejects destination token or zero in both plan and recipe", () => {
  for (const value of [MONAD_USDC_ADDRESS, MONAD_USDC_ADDRESS.toLowerCase(), zeroAddress]) {
    assert.throws(() => auroraRecipient(value), /recipient's Monad wallet/);
    assert.throws(() => buildBaseUsdcToMonadPaymentPlan({ recipient: value, amount: "1", depositViaWallet: false }));
    assert.throws(() => CHERRY_PAY_MONAD_USDC_RECIPE.buildSteps({ amount: "{MIN_AMOUNT_OUT}", intermediary: recipient, userAddress: recipient }, { recipient: value as `0x${string}` }));
  }
});
test("external-wallet Aurora plan remains external, not a newly funded passkey transfer", () => {
  const plan = buildBaseUsdcToMonadPaymentPlan({ recipient, amount: "1", depositViaWallet: false });
  assert.equal(plan.depositViaWallet, false);
  assert.equal(plan.originChainId, 8453);
  assert.equal(plan.recipe.destination.chain, "monad");
});
test("reported faucet RPC error becomes a safe actionable gas message", () => {
  const err = { message: 'Missing or invalid parameters. requestFunds(address recipient). Request body: PRIVATE_SIGNED_PAYLOAD',
    cause: { details: 'Signer had insufficient balance' } };
  const message = fundingErrorMessage(err)!;
  assert.match(message, /AUSD faucet/);
  assert.match(message, /not a failed passkey or an Aurora payment/);
  assert.match(message, /MON/);
  assert.doesNotMatch(message, /PRIVATE_SIGNED_PAYLOAD|eth_sendRawTransaction/);
});
test("direct Base source gas is not described as sponsored", () => {
  const message = fundingErrorMessage(new Error('https://mainnet.base.org insufficient funds for gas * price + value'))!;
  assert.match(message, /Base ETH/);
  assert.match(message, /not sponsored/);
});
test("unknown-chain insufficient gas is not assigned to the wrong currency", () => {
  const message = fundingErrorMessage({ name: 'InsufficientFundsError', details: 'Signer had insufficient balance' })!;
  assert.match(message, /native network currency/);
  assert.doesNotMatch(message, /needs MON|needs Base ETH/);
});
test("token funding and cancelled passkeys are not converted into native gas failures", () => {
  assert.equal(fundingErrorMessage(new Error('Insufficient AUSD for this transfer.')), null);
  assert.equal(fundingErrorMessage({ code: 'PASSKEY_OPERATION_FAILED', cause: { error: 'UserCancelled' } }), null);
  assert.equal(fundingErrorMessage(null), null);
});
test("cyclic RPC cause chains cannot lock the error renderer", () => {
  const value: { cause?: unknown; message: string } = { message: 'Unrelated failure' };
  value.cause = value;
  assert.equal(fundingErrorMessage(value), null);
});
