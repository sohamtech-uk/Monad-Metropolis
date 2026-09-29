import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const privateKeyRaw = process.env.MONAD_DEPLOYER_PRIVATE_KEY?.trim();

if (!privateKeyRaw) {
  throw new Error("MONAD_DEPLOYER_PRIVATE_KEY is required.");
}

const privateKey = (
  privateKeyRaw.startsWith("0x") ? privateKeyRaw : `0x${privateKeyRaw}`
);

if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("MONAD_DEPLOYER_PRIVATE_KEY must be a 32-byte hex private key.");
}

const account = privateKeyToAccount(privateKey);
const chain = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [rpcUrl],
    },
  },
});

const transport = http(rpcUrl, {
  timeout: 20_000,
  retryCount: 2,
});

const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({
  account,
  chain,
  transport,
});

const liveChainId = await publicClient.getChainId();
if (liveChainId !== chain.id) {
  throw new Error(
    `Monad RPC returned chain ID ${liveChainId}; expected ${chain.id}.`,
  );
}

const balance = await publicClient.getBalance({
  address: account.address,
});

console.log("Deployer:", account.address);
console.log("MON balance:", formatEther(balance));

if (balance === 0n) {
  throw new Error(
    `Deployment wallet ${account.address} has zero MON. Fund this public address from the Monad testnet faucet and rerun the workflow.`,
  );
}

const sourcePath = path.resolve(
  "contracts/src/CherrySettlementRegistry.sol",
);
const source = fs.readFileSync(sourcePath, "utf8");

const compilerInput = {
  language: "Solidity",
  sources: {
    "CherrySettlementRegistry.sol": {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const compilerOutput = JSON.parse(
  solc.compile(JSON.stringify(compilerInput)),
);

const errors = (compilerOutput.errors ?? []).filter(
  (entry) => entry.severity === "error",
);

if (errors.length > 0) {
  throw new Error(
    "Solidity compilation failed:\n" +
      errors.map((entry) => entry.formattedMessage).join("\n"),
  );
}

const contract =
  compilerOutput.contracts?.["CherrySettlementRegistry.sol"]
    ?.CherrySettlementRegistry;

if (!contract?.abi || !contract?.evm?.bytecode?.object) {
  throw new Error("Compiled CherrySettlementRegistry artifact is missing.");
}

const bytecode = `0x${contract.evm.bytecode.object}`;

console.log("Broadcasting CherrySettlementRegistry deployment…");

const transactionHash = await walletClient.deployContract({
  abi: contract.abi,
  bytecode,
  account,
});

console.log("Deployment transaction:", transactionHash);

const receipt = await publicClient.waitForTransactionReceipt({
  hash: transactionHash,
  confirmations: 1,
  timeout: 120_000,
});

if (receipt.status !== "success" || !receipt.contractAddress) {
  throw new Error(
    "CherrySettlementRegistry deployment did not produce a successful contract receipt.",
  );
}

const code = await publicClient.getCode({
  address: receipt.contractAddress,
});

if (!code || code === "0x") {
  throw new Error(
    "Deployment receipt succeeded but no contract bytecode is present.",
  );
}

const metadata = {
  network: "monad-testnet",
  chainId: chain.id,
  rpcUrl,
  deployer: account.address,
  registryAddress: receipt.contractAddress,
  transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  sourceCommit: process.env.GITHUB_SHA ?? null,
  deployedAt: new Date().toISOString(),
};

const outputPath =
  process.env.DEPLOYMENT_OUTPUT_PATH ??
  "deployment/metropolis-testnet.json";

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify(metadata, null, 2) + "\n",
  "utf8",
);

console.log("Registry address:", receipt.contractAddress);
console.log("Deployment metadata:", outputPath);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `registry_address=${receipt.contractAddress}`,
      `transaction_hash=${transactionHash}`,
      `deployer_address=${account.address}`,
      `block_number=${receipt.blockNumber.toString()}`,
      "",
    ].join("\n"),
    "utf8",
  );
}
