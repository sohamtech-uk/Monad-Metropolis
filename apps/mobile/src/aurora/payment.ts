import {
  createExecutionRunner,
  createIntentsConnectApi,
  type Execution,
  type ExecutionPlan,
  type RunnerEvent,
} from "@aurora-is-near/intents-connect";
import { formatUnits } from "viem";

import type { MeraLiveAccount } from "../mera/account";
import {
  AURORA_INTENTS_API_BASE_URL,
  AURORA_INTENTS_PROXY_URL,
  BASE_USDC_ASSET_ID,
  MONAD_MAINNET_EXPLORER_URL,
  MONAD_USDC_ASSET_ID,
  USDC_DECIMALS,
} from "./config";
import { createMeraAuroraWalletConnector } from "./meraConnector";
import {
  buildBaseUsdcToMonadPaymentPlan,
  type AuroraPaymentPlanInput,
  type CherryPayMonadParams,
} from "./plan";

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
    ...(onEvent ? { onEvent } : {}),
    pollIntervalMs: 3_000,
    maxPollAttempts: 240,
  });
}

export async function previewAuroraPayment(
  live: MeraLiveAccount,
  input: AuroraPaymentPlanInput,
): Promise<AuroraPaymentPreview> {
  const api = createCherryAuroraApi();
  const supported = await api.listSupportedTokens();

  const baseUsdcSupported =
    supported.in?.some((token) => token.assetId === BASE_USDC_ASSET_ID) === true;
  const monadUsdcSupported =
    supported.out?.some((token) => token.assetId === MONAD_USDC_ASSET_ID) === true;

  if (!baseUsdcSupported || !monadUsdcSupported) {
    throw new Error(
      "Aurora does not currently advertise the Base USDC → Monad USDC route. Try again later rather than sending funds to a stale route.",
    );
  }

  const runner = createExecutionRunner({
    api,
    wallet: createMeraAuroraWalletConnector(live),
    pollIntervalMs: 3_000,
    maxPollAttempts: 240,
  });

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
