import {
  createExecutionRunner,
  createIntentsConnectApi,
  type Execution,
  type ExecutionPlan,
  type Recipe,
  type RunnerEvent,
} from "@aurora-is-near/intents-connect";
import {
  formatUnits,
  getAddress,
  parseUnits,
  type Address,
} from "viem";

import type { MeraLiveAccount } from "../mera/account";
import {
  AURORA_DEMO_MAX_USDC,
  AURORA_INTENTS_API_BASE_URL,
  AURORA_INTENTS_PROXY_URL,
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  BASE_USDC_ASSET_ID,
  MONAD_MAINNET_EXPLORER_URL,
  MONAD_USDC_ADDRESS,
  MONAD_USDC_ASSET_ID,
  USDC_DECIMALS,
} from "./config";
import { createMeraAuroraWalletConnector } from "./meraConnector";

type CherryPayMonadParams = Readonly<{
  recipient: Address;
}>;

const CHERRY_PAY_MONAD_USDC_RECIPE: Recipe<CherryPayMonadParams> = {
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
      parameters: [recipient, amount],
      value: "0",
      metadata: {
        product: "Cherry Pay Global",
        purpose: "cross_chain_payment",
      },
    },
  ],
};

export type AuroraPaymentPlanInput = Readonly<{
  recipient: string;
  amount: string;
  depositViaWallet: boolean;
}>;

export type AuroraPaymentPreview = Readonly<{
  executionId: string;
  sourceAmountAtomic: string;
  sourceAmountFormatted: string;
  minimumMonadUsdcAtomic: string;
  minimumMonadUsdcFormatted: string;
  estimatedTime: string | null;
  networkFeeAtomic: string | null;
  plan: ExecutionPlan<CherryPayMonadParams>;
}>;

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
  const recipient = getAddress(input.recipient.trim());
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

export function createCherryAuroraApi() {
  const proxy = AURORA_INTENTS_PROXY_URL.trim();

  if (!/^https:\/\//i.test(proxy) && !/^http:\/\/localhost(?::\d+)?\//i.test(proxy)) {
    throw new Error(
      "Aurora Intents proxy URL must use HTTPS outside local development.",
    );
  }

  return createIntentsConnectApi({
    baseUrl: AURORA_INTENTS_API_BASE_URL,
    apiKeyProxyUrl: proxy,
  });
}

export function createCherryAuroraRunner(
  live: MeraLiveAccount,
  onEvent?: (event: RunnerEvent) => void,
) {
  return createExecutionRunner({
    api: createCherryAuroraApi(),
    wallet: createMeraAuroraWalletConnector(live),
    onEvent,
    pollIntervalMs: 3_000,
    maxPollAttempts: 240,
  });
}

export async function previewAuroraPayment(
  live: MeraLiveAccount,
  input: AuroraPaymentPlanInput,
): Promise<AuroraPaymentPreview> {
  const runner = createCherryAuroraRunner(live);

  try {
    const prepared = await runner.preview(
      buildBaseUsdcToMonadPaymentPlan(input),
    );
    const minimum = BigInt(prepared.execution.quote.minAmountOut);

    return Object.freeze({
      executionId: prepared.execution.id,
      sourceAmountAtomic: prepared.execution.quote.amountIn,
      sourceAmountFormatted: formatUnits(
        BigInt(prepared.execution.quote.amountIn),
        USDC_DECIMALS,
      ),
      minimumMonadUsdcAtomic: minimum.toString(),
      minimumMonadUsdcFormatted: formatUnits(minimum, USDC_DECIMALS),
      estimatedTime: prepared.execution.details.estimatedTime ?? null,
      networkFeeAtomic: prepared.execution.details.networkFee ?? null,
      plan: prepared.plan,
    });
  } finally {
    runner.dispose();
  }
}

export function monadMainnetTransactionUrl(execution: Execution): string | null {
  const hash = execution.transaction?.evmTxHash;

  return hash
    ? MONAD_MAINNET_EXPLORER_URL.replace(/\/$/, "") + "/tx/" + hash
    : null;
}

export { CHERRY_PAY_MONAD_USDC_RECIPE };
