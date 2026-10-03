import { decodeEventLog, parseAbiItem, toEventSelector, type Hex } from "viem";

export const NETWORKS = {
  "monad-testnet": { chainId: 10143, label: "Monad Testnet · AUSD", symbol: "AUSD", asset: "0xa9012a055bd4e0edff8ce09f960291c09d5322dc", registry: "0xdcb418c6e719c40c8e1f9b446cd850330219eeff", explorer: "https://testnet.monadscan.com" },
  monad: { chainId: 143, label: "Monad Mainnet · USDC", symbol: "USDC", asset: "0x754704bc059f8c67012fed69bc8a327a5aafb603", registry: null, explorer: "https://monadscan.com" },
  base: { chainId: 8453, label: "Base Mainnet · USDC", symbol: "USDC", asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", registry: null, explorer: "https://basescan.org" },
} as const;
export type Network = keyof typeof NETWORKS;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CORRELATION = parseAbiItem("event BusinessPaymentCorrelated(bytes32 indexed paymentReference, bytes32 indexed paymentTxHash, address indexed payer, address recipient, address asset, uint256 amount, uint64 recordedAt)");
export const TRANSFER_TOPIC = toEventSelector(TRANSFER);
export const CORRELATION_TOPIC = toEventSelector(CORRELATION);
export type PaymentFocus = Readonly<{ hash: string; blockNumber: bigint; sender: string; recipient: string; amount: bigint; reference: string }>;
export type Observation = Readonly<{
  id: string; kind: "transfer" | "correlation"; txHash: string; paymentTxHash: string;
  blockNumber: number; blockHash: string; logIndex: number; payer: string; recipient: string;
  asset: string; amount: bigint; reference: string | null; successfulReceipt: boolean;
}>;
export type Snapshot = Readonly<{
  network: Network; chainId: number; archiveHeight: number; fromBlock: number; nextBlock: number; toBlock: number;
  complete: boolean; observedAt: number; queryMs: number;
  blocks: readonly { number: number; hash: string; parentHash: string; timestamp: number }[];
  events: readonly Observation[]; removedCount: number;
}>;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Envio response object.");
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error("Invalid Envio response list.");
  return value;
}
function number(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^(?:[0-9]+|0x[0-9a-f]+)$/i.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid Envio integer.");
  return n;
}
function hex(value: unknown, bytes: number): Hex {
  if (typeof value !== "string" || !new RegExp("^0x[0-9a-fA-F]{" + bytes * 2 + "}$").test(value)) throw new Error("Invalid Envio hex value.");
  return value.toLowerCase() as Hex;
}
const address = (value: unknown) => hex(value, 20);
const hash = (value: unknown) => hex(value, 32);
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function parseSnapshot(value: unknown, expectedNetwork: Network): Snapshot {
  const root = record(value);
  const source = NETWORKS[expectedNetwork];
  if (root.source !== "envio-hypersync" || root.network !== expectedNetwork || root.chainId !== source.chainId
    || root.asset !== source.asset || root.registry !== source.registry || root.finality !== "provisional") {
    throw new Error("HyperSync source does not match the requested payment network.");
  }
  const fromBlock = number(root.fromBlock), nextBlock = number(root.nextBlock), toBlock = number(root.toBlock);
  if (nextBlock < fromBlock || toBlock < nextBlock || toBlock - fromBlock > 128 || typeof root.complete !== "boolean") throw new Error("Invalid HyperSync scan coverage.");
  const observedAt = typeof root.observedAt === "string" ? Date.parse(root.observedAt) : NaN;
  if (!Number.isFinite(observedAt)) throw new Error("Invalid observation timestamp.");
  const blocks = list(root.blocks).map((item) => {
    const row = record(item);
    return { number: number(row.number), hash: hash(row.hash), parentHash: hash(row.parent_hash), timestamp: number(row.timestamp) };
  }).sort((a, b) => a.number - b.number);
  const blockMap = new Map(blocks.map((block) => [block.number, block]));
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.number < fromBlock || block.number >= nextBlock || (i > 0 && (block.number !== blocks[i - 1]!.number + 1 || block.parentHash !== blocks[i - 1]!.hash))) throw new Error("Inconsistent HyperSync block lineage.");
  }
  if (root.complete && (blocks.length !== toBlock - fromBlock || nextBlock !== toBlock)) throw new Error("HyperSync marked an incomplete scan as complete.");
  const txs = new Map(list(root.transactions).map((item) => {
    const tx = record(item);
    return [hash(tx.hash), tx] as const;
  }));
  let removedCount = 0;
  const events = new Map<string, Observation>();
  for (const item of list(root.logs)) {
    const row = record(item);
    if (row.removed === true) { removedCount++; continue; }
    const contract = address(row.address), topic = hash(row.topic0);
    const blockNumber = number(row.block_number), blockHash = hash(row.block_hash);
    if (blockMap.get(blockNumber)?.hash !== blockHash) throw new Error("Event does not belong to the scanned canonical block.");
    const txHash = hash(row.transaction_hash), logIndex = number(row.log_index);
    const tx = txs.get(txHash);
    const successfulReceipt = tx !== undefined && number(tx.block_number) === blockNumber && hash(tx.block_hash) === blockHash && (tx.status === 1 || tx.status === "0x1" || tx.status === "1");
    const common = { id: source.chainId + ":" + blockHash + ":" + txHash + ":" + logIndex, txHash, blockNumber, blockHash, logIndex, successfulReceipt };
    let event: Observation;
    if (contract === source.asset && topic === TRANSFER_TOPIC) {
      const { args } = decodeEventLog({ abi: [TRANSFER], data: hex(row.data, 32), topics: [topic, hash(row.topic1), hash(row.topic2)], strict: true });
      event = { ...common, kind: "transfer", paymentTxHash: txHash, payer: args.from.toLowerCase(), recipient: args.to.toLowerCase(), asset: contract, amount: args.value, reference: null };
    } else if (contract === source.registry && topic === CORRELATION_TOPIC) {
      const { args } = decodeEventLog({ abi: [CORRELATION], data: hex(row.data, 128), topics: [topic, hash(row.topic1), hash(row.topic2), hash(row.topic3)], strict: true });
      event = { ...common, kind: "correlation", paymentTxHash: args.paymentTxHash.toLowerCase(), payer: args.payer.toLowerCase(), recipient: args.recipient.toLowerCase(), asset: args.asset.toLowerCase(), amount: args.amount, reference: args.paymentReference.toLowerCase() };
    } else {
      throw new Error("Unexpected event in the trusted HyperSync payment scope.");
    }
    events.set(event.id, event);
  }
  return { network: expectedNetwork, chainId: source.chainId, archiveHeight: number(root.archiveHeight), fromBlock, nextBlock, toBlock,
    complete: root.complete, observedAt, queryMs: number(root.queryMs), blocks,
    events: [...events.values()].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex), removedCount };
}
export function fresh(snapshot: Snapshot, now = Date.now()): boolean {
  return snapshot.observedAt <= now + 5000 && now - snapshot.observedAt <= 20000;
}
export function changedFork(previous: Snapshot | null, next: Snapshot): boolean {
  if (!previous || previous.network !== next.network) return false;
  const old = new Map(previous.blocks.map((block) => [block.number, block.hash]));
  if (next.archiveHeight < previous.archiveHeight || next.blocks.some((block) => old.has(block.number) && old.get(block.number) !== block.hash)) return true;
  const last = previous.blocks.at(-1), first = next.blocks[0];
  return !!(last && first && first.number === last.number + 1 && first.parentHash !== last.hash);
}
export function paymentObservation(snapshot: Snapshot, focus: PaymentFocus): { transfer: boolean; correlation: boolean } {
  const relevant = snapshot.network === "monad-testnet" && snapshot.complete && fresh(snapshot)
    ? snapshot.events.filter((event) => event.successfulReceipt && equal(event.paymentTxHash, focus.hash)
      && equal(event.payer, focus.sender) && equal(event.recipient, focus.recipient)
      && event.asset === NETWORKS["monad-testnet"].asset && event.amount === focus.amount)
    : [];
  return { transfer: relevant.some((event) => event.kind === "transfer" && BigInt(event.blockNumber) === focus.blockNumber),
    correlation: relevant.some((event) => event.kind === "correlation" && event.reference !== null && equal(event.reference, focus.reference)) };
}
export function safeEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Envio endpoint must use HTTPS outside local development.");
  return url;
}
export async function requestJson(endpoint: string, init: RequestInit, signal: AbortSignal, fetchImpl: typeof fetch = (input, options) => globalThis.fetch(input, options)): Promise<unknown> {
  safeEndpoint(endpoint);
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 30000);
  try {
    const response = await fetchImpl(endpoint, { ...init, signal: timeout.signal, headers: { Accept: "application/json", "Content-Type": "application/json" } });
    if (!response.ok) {
      if (response.status === 503) throw new Error("HyperSync is not configured: enable the backend and provide its server-side Envio token.");
      if (response.status === 429) throw new Error("Envio observation rate limit reached; polling will back off.");
      throw new Error("Envio data request failed (HTTP " + response.status + "). No payment state was changed.");
    }
    return await response.json();
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
export async function readSnapshot(endpoint: string, network: Network, wallet: string, fromBlock: number | null, signal: AbortSignal): Promise<Snapshot> {
  const url = safeEndpoint(endpoint);
  url.search = "";
  url.searchParams.set("network", network);
  if (wallet.trim()) url.searchParams.set("wallet", address(wallet.trim()));
  if (network !== "monad-testnet" && !wallet.trim()) throw new Error("Enter a wallet address to observe mainnet payments.");
  if (fromBlock !== null) url.searchParams.set("from_block", String(number(fromBlock)));
  return parseSnapshot(await requestJson(url.toString(), { method: "GET" }, signal), network);
}
export const EXACT_SETTLEMENT_QUERY = `query CherryExactPayment($hash: String!) {
  Settlement(where: {paymentTxHash: {_eq: $hash}, verified: {_eq: true}}, limit: 2) {
    paymentTxHash paymentReference payer recipient asset amount registryAddress
  }
}`;
export type IndexedState = "waiting" | "matched" | "mismatch";
export function indexedPaymentState(payload: unknown, focus: PaymentFocus): IndexedState {
  const root = record(payload);
  if (Array.isArray(root.errors) && root.errors.length) throw new Error("HyperIndex returned a GraphQL error.");
  const rows = list(record(root.data).Settlement);
  if (rows.length === 0) return "waiting";
  if (rows.length !== 1) return "mismatch";
  const row = record(rows[0]);
  return hash(row.paymentTxHash) === hash(focus.hash) && hash(row.paymentReference) === hash(focus.reference)
    && address(row.payer) === address(focus.sender) && address(row.recipient) === address(focus.recipient)
    && address(row.asset) === NETWORKS["monad-testnet"].asset && address(row.registryAddress) === NETWORKS["monad-testnet"].registry
    && typeof row.amount === "string" && /^[0-9]+$/.test(row.amount) && BigInt(row.amount) === focus.amount ? "matched" : "mismatch";
}
export async function readIndexedPayment(endpoint: string, focus: PaymentFocus, signal: AbortSignal): Promise<IndexedState> {
  return indexedPaymentState(await requestJson(endpoint, { method: "POST", body: JSON.stringify({ query: EXACT_SETTLEMENT_QUERY, variables: { hash: hash(focus.hash) } }) }, signal), focus);
}
