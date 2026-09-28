import { getAddress, type Address } from "viem";

export const DEFAULT_MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz";
export const DEFAULT_MONAD_TESTNET_CHAIN_ID = 10143;
export const DEFAULT_MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadscan.com";

export const DEFAULT_AUSD_ADDRESS = getAddress(
  "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
);
export const DEFAULT_AUSD_DECIMALS = 6;

export type MonadRuntimeConfig = Readonly<{
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
  ausdAddress: Address;
  ausdDecimals: number;
}>;

export function createMonadRuntimeConfig(
  overrides: Partial<{
    rpcUrl: string | undefined;
    chainId: number | string | undefined;
    explorerUrl: string | undefined;
    ausdAddress: string | undefined;
    ausdDecimals: number | string | undefined;
  }> = {},
): MonadRuntimeConfig {
  const rpcUrl = String(
    overrides.rpcUrl ?? DEFAULT_MONAD_TESTNET_RPC_URL,
  ).trim();

  if (!rpcUrl.startsWith("https://")) {
    throw new Error("Monad RPC URL must use HTTPS.");
  }

  const chainId = Number(
    overrides.chainId ?? DEFAULT_MONAD_TESTNET_CHAIN_ID,
  );
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("Monad chain ID must be a positive integer.");
  }

  const ausdDecimals = Number(
    overrides.ausdDecimals ?? DEFAULT_AUSD_DECIMALS,
  );
  if (!Number.isInteger(ausdDecimals) || ausdDecimals < 0 || ausdDecimals > 36) {
    throw new Error("AUSD decimals must be an integer between 0 and 36.");
  }

  return Object.freeze({
    rpcUrl,
    chainId,
    explorerUrl: String(
      overrides.explorerUrl ?? DEFAULT_MONAD_TESTNET_EXPLORER_URL,
    ).replace(/\/$/, ""),
    ausdAddress: getAddress(
      String(overrides.ausdAddress ?? DEFAULT_AUSD_ADDRESS),
    ),
    ausdDecimals,
  });
}
