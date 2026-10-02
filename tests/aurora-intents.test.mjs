import test from "node:test";
import assert from "node:assert/strict";

import {
  CHERRY_PAY_MONAD_USDC_RECIPE,
  buildBaseUsdcToMonadPaymentPlan,
  parseAuroraUsdcAmount,
} from "../apps/mobile/src/aurora/payment.ts";
import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  BASE_USDC_ASSET_ID,
  MONAD_USDC_ADDRESS,
  MONAD_USDC_ASSET_ID,
} from "../apps/mobile/src/aurora/config.ts";

const recipient = "0x1111111111111111111111111111111111111111";

test("Aurora route is pinned to Base USDC -> Monad USDC", () => {
  const plan = buildBaseUsdcToMonadPaymentPlan({
    recipient,
    amount: "1.25",
    depositViaWallet: false,
  });

  assert.equal(plan.originChain, "base");
  assert.equal(plan.originChainId, BASE_CHAIN_ID);
  assert.equal(plan.originToken.contractAddress, BASE_USDC_ADDRESS);
  assert.equal(plan.quote.originAsset, BASE_USDC_ASSET_ID);
  assert.equal(plan.quote.destinationAsset, MONAD_USDC_ASSET_ID);
  assert.equal(plan.quote.amount, "1250000");
  assert.equal(plan.quote.swapType, "EXACT_INPUT");
  assert.equal(plan.depositViaWallet, false);
  assert.equal(plan.recipe.destination.chain, "monad");
  assert.equal(plan.recipe.destination.tokenAddress, MONAD_USDC_ADDRESS);
});

test("destination recipe transfers Aurora's fee-adjusted amount to the merchant", () => {
  const [step] = CHERRY_PAY_MONAD_USDC_RECIPE.buildSteps(
    {
      intermediary: "0x2222222222222222222222222222222222222222",
      userAddress: "0x3333333333333333333333333333333333333333",
      amount: "{MIN_AMOUNT_OUT}",
    },
    { recipient },
  );

  assert.deepEqual(step, {
    to: MONAD_USDC_ADDRESS,
    functionSignature: "transfer(address,uint256)",
    parameters: [recipient, "{MIN_AMOUNT_OUT}"],
    value: "0",
    metadata: {
      product: "Cherry Pay Global",
      purpose: "cross_chain_payment",
    },
  });
});

test("amount parsing is exact and capped for the hackathon mainnet route", () => {
  assert.equal(parseAuroraUsdcAmount("1"), 1_000_000n);
  assert.equal(parseAuroraUsdcAmount("0.000001"), 1n);
  assert.equal(parseAuroraUsdcAmount("100.000000"), 100_000_000n);

  for (const invalid of [
    "0",
    "-1",
    "1e2",
    "1,000",
    "0.0000001",
    "100.000001",
    "101",
    "Infinity",
  ]) {
    assert.throws(() => parseAuroraUsdcAmount(invalid));
  }
});

test("invalid Monad recipient is rejected before Aurora execution creation", () => {
  assert.throws(() =>
    buildBaseUsdcToMonadPaymentPlan({
      recipient: "not-an-address",
      amount: "1",
      depositViaWallet: false,
    }),
  );
});
