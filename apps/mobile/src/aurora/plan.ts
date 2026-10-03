import type {
  ExecutionPlan,
  Recipe,
} from "@aurora-is-near/intents-connect";
import {
  getAddress,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";

import {
  AURORA_DEMO_MAX_USDC,
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  BASE_USDC_ASSET_ID,
  MONAD_USDC_ADDRESS,
  MONAD_USDC_ASSET_ID,
  USDC_DECIMALS,
} from "./config";

export type CherryPayMonadParams = Readonly<{
  recipient: Address;
}>;

export type AuroraPaymentPlanInput = Readonly<{
  recipient: string;
  amount: string;
  depositViaWallet: boolean;
}>;

export function auroraRecipient(value: string): Address {
  const recipient = getAddress(value.trim());
  if (recipient === zeroAddress || recipient === getAddress(MONAD_USDC_ADDRESS)) {
    throw new Error("Enter the recipient's Monad wallet address, not the USDC token contract or zero address.");
  }
  return recipient;
}

export const CHERRY_PAY_MONAD_USDC_RECIPE: Recipe<CherryPayMonadParams> = {
  id: "cherry-pay-monad-usdc",
  intent: "cherry_pay_cross_chain_payment",
  title: "Pay with USDC on Monad",
  flow: "bridge-in",
  type: "evm",
  destination: {
    chain: "monad",
    assetId: MONAD_USDC_ASSET_ID,
    tokenAddress: MONAD_USDC_ADDRESS,
  },
  buildSteps: ({ amount }, { recipient }) => [
    {
      to: MONAD_USDC_ADDRESS,
      functionSignature: "transfer(address,uint256)",
      parameters: [auroraRecipient(recipient), amount],
      value: "0",
      metadata: {
        product: "Cherry Pay Global",
        purpose: "cross_chain_payment",
      },
    },
  ],
};

export function parseAuroraUsdcAmount(value: string): bigint {
  const trimmed = value.trim();

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Enter a USDC amount with no more than 6 decimal places.");
  }

  const amount = parseUnits(trimmed, USDC_DECIMALS);

  if (amount <= 0n) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (amount > AURORA_DEMO_MAX_USDC) {
    throw new Error(
      "This hackathon route is capped at 100 USDC per payment.",
    );
  }

  return amount;
}

export function buildBaseUsdcToMonadPaymentPlan(
  input: AuroraPaymentPlanInput,
): ExecutionPlan<CherryPayMonadParams> {
  const recipient = auroraRecipient(input.recipient);
  const amount = parseAuroraUsdcAmount(input.amount);

  return {
    recipe: CHERRY_PAY_MONAD_USDC_RECIPE,
    params: { recipient },
    quote: {
      originAsset: BASE_USDC_ASSET_ID,
      destinationAsset: MONAD_USDC_ASSET_ID,
      amount: amount.toString(),
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      deadline: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    originChain: "base",
    originToken: {
      contractAddress: BASE_USDC_ADDRESS,
      decimals: USDC_DECIMALS,
    },
    originChainId: BASE_CHAIN_ID,
    depositViaWallet: input.depositViaWallet,
  };
}
