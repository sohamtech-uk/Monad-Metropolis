import {
  createPublicClient,
  defineChain,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";

import {
  createMonadRuntimeConfig,
  type MonadRuntimeConfig,
} from "./config";

const AUSD_READ_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export type MonadStatus = Readonly<{
  configuredChainId: number;
  liveChainId: number;
  chainMatches: boolean;
  blockNumber: bigint;
  ausdAddress: Address;
  ausdSymbol: string;
  ausdDecimals: number;
  explorerUrl: string;
}>;

export type AusdBalance = Readonly<{
  account: Address;
  contract: Address;
  raw: bigint;
  formatted: string;
  decimals: number;
  symbol: string;
}>;

export class MonadReadClient {
  readonly config: MonadRuntimeConfig;
  readonly publicClient: PublicClient;

  constructor(config: MonadRuntimeConfig = createMonadRuntimeConfig()) {
    this.config = config;

    const chain = defineChain({
      id: config.chainId,
      name: "Monad Testnet",
      nativeCurrency: {
        name: "MON",
        symbol: "MON",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [config.rpcUrl],
        },
      },
      blockExplorers: {
        default: {
          name: "Monad Explorer",
          url: config.explorerUrl,
        },
      },
      testnet: true,
    });

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl, {
        timeout: 10_000,
        retryCount: 1,
      }),
    });
  }

  async status(): Promise<MonadStatus> {
    const [liveChainId, blockNumber, symbol, decimals] = await Promise.all([
      this.publicClient.getChainId(),
      this.publicClient.getBlockNumber(),
      this.publicClient.readContract({
        address: this.config.ausdAddress,
        abi: AUSD_READ_ABI,
        functionName: "symbol",
      }),
      this.publicClient.readContract({
        address: this.config.ausdAddress,
        abi: AUSD_READ_ABI,
        functionName: "decimals",
      }),
    ]);

    return Object.freeze({
      configuredChainId: this.config.chainId,
      liveChainId,
      chainMatches: liveChainId === this.config.chainId,
      blockNumber,
      ausdAddress: this.config.ausdAddress,
      ausdSymbol: symbol,
      ausdDecimals: decimals,
      explorerUrl: this.config.explorerUrl,
    });
  }

  async ausdBalance(account: string): Promise<AusdBalance> {
    const address = getAddress(account);

    const raw = await this.publicClient.readContract({
      address: this.config.ausdAddress,
      abi: AUSD_READ_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    return Object.freeze({
      account: address,
      contract: this.config.ausdAddress,
      raw,
      formatted: formatUnits(raw, this.config.ausdDecimals),
      decimals: this.config.ausdDecimals,
      symbol: "AUSD",
    });
  }

  transactionUrl(hash: `0x${string}`): string {
    return `${this.config.explorerUrl}/tx/${hash}`;
  }
}
