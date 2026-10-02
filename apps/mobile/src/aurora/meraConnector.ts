import type {
  Eip1193Provider,
  MakeTransferArgs,
  WalletConnector,
} from "@aurora-is-near/intents-connect";
import { resolveTransferAmount } from "@aurora-is-near/intents-connect";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { base } from "viem/chains";

import type { MeraLiveAccount } from "../mera/account";
import {
  AURORA_BASE_RPC_URL,
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
} from "./config";

const ERC20_TRANSFER_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

function createMeraEip1193Provider(
  live: MeraLiveAccount,
): Eip1193Provider {
  const address = getAddress(live.account.address);

  return Object.freeze({
    request: async ({ method, params }) => {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [address];

        case "eth_chainId":
          return "0x" + BASE_CHAIN_ID.toString(16);

        case "personal_sign": {
          if (!Array.isArray(params) || params.length < 2) {
            throw new Error("Aurora requested an invalid personal_sign payload.");
          }

          const [message, requestedAddress] = params as [unknown, unknown];

          if (
            typeof message !== "string" ||
            typeof requestedAddress !== "string" ||
            getAddress(requestedAddress) !== address
          ) {
            throw new Error(
              "Aurora signing request does not match the active Cherry Pay passkey account.",
            );
          }

          return live.account.signMessage({ message });
        }

        default:
          throw new Error(
            "Unsupported Aurora wallet request: " + String(method),
          );
      }
    },
  });
}

async function transferBaseUsdc(
  live: MeraLiveAccount,
  args: MakeTransferArgs,
): Promise<{ hash: string }> {
  if (args.chain !== "base" || args.evmChainId !== BASE_CHAIN_ID) {
    throw new Error(
      "Cherry Pay currently supports Aurora wallet deposits from Base only.",
    );
  }

  if (args.isNativeEvmTokenTransfer) {
    throw new Error(
      "Cherry Pay's initial Aurora route accepts Base USDC, not native ETH.",
    );
  }

  if (
    !args.tokenAddress ||
    getAddress(args.tokenAddress) !== getAddress(BASE_USDC_ADDRESS)
  ) {
    throw new Error(
      "Cherry Pay's initial Aurora route only accepts the verified Base USDC contract.",
    );
  }

  const amount = resolveTransferAmount(args);
  const recipient = getAddress(args.address);
  const account = live.account;
  const transport = http(AURORA_BASE_RPC_URL, {
    timeout: 15_000,
    retryCount: 1,
  });
  const publicClient = createPublicClient({ chain: base, transport });
  const walletClient = createWalletClient({ account, chain: base, transport });

  const [usdcBalance, ethBalance] = await Promise.all([
    publicClient.readContract({
      address: getAddress(BASE_USDC_ADDRESS),
      abi: ERC20_TRANSFER_ABI,
      functionName: "balanceOf",
      args: [getAddress(account.address)],
    }),
    publicClient.getBalance({ address: getAddress(account.address) }),
  ]);

  if (usdcBalance < amount) {
    throw new Error(
      "This Cherry Pay passkey account does not have enough Base USDC. Use the external wallet / exchange funding option or fund this address first.",
    );
  }

  if (ethBalance === 0n) {
    throw new Error(
      "This Cherry Pay passkey account has no Base ETH for the source transfer gas. Use external funding or add a small Base ETH balance.",
    );
  }

  const simulation = await publicClient.simulateContract({
    account,
    address: getAddress(BASE_USDC_ADDRESS),
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipient, amount],
  });

  const hash = await walletClient.writeContract(simulation.request);

  return { hash };
}

export function createMeraAuroraWalletConnector(
  live: MeraLiveAccount,
): WalletConnector {
  const provider = createMeraEip1193Provider(live);

  return {
    id: "cherry-mera-base",
    name: "Cherry Pay passkey",
    chains: ["base"],
    signingStandard: "erc191",
    connect: async () => undefined,
    disconnect: async () => undefined,
    getAddress: () => getAddress(live.account.address),
    getProviders: () => ({ evm: provider }),
    getChainId: async () => BASE_CHAIN_ID,
    makeTransfer: async (args) => transferBaseUsdc(live, args),
  };
}
