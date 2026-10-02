export const AURORA_INTENTS_API_BASE_URL =
  process.env.EXPO_PUBLIC_AURORA_INTENTS_API_BASE_URL ??
  "https://intents-connect-alpha-api.aurora.dev";

export const AURORA_INTENTS_PROXY_URL =
  process.env.EXPO_PUBLIC_AURORA_INTENTS_PROXY_URL ??
  "https://cherrymoney.co.uk/api/aurora-intents/";

export const AURORA_BASE_RPC_URL =
  process.env.EXPO_PUBLIC_AURORA_BASE_RPC_URL ??
  "https://mainnet.base.org";

export const MONAD_MAINNET_EXPLORER_URL =
  process.env.EXPO_PUBLIC_MONAD_MAINNET_EXPLORER_URL ??
  "https://monadscan.com";

export const BASE_CHAIN_ID = 8453;
export const BASE_USDC_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BASE_USDC_ASSET_ID =
  "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_USDC_ADDRESS =
  "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
export const MONAD_USDC_ASSET_ID =
  "nep245:v2_1.omni.hot.tg:143_2dmLwYWkCQKyTjeUPAsGJuiVLbFx";

export const USDC_DECIMALS = 6;
export const AURORA_DEMO_MAX_USDC = 100n * 10n ** 6n;
