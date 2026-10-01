import {
  createPublicClient, createWalletClient, defineChain, encodeAbiParameters,
  encodeFunctionData, erc20Abi, getAddress, http, keccak256, parseAbi,
  parseAbiParameters, parseUnits, toBytes, type Address, type Hex, type LocalAccount,
} from 'viem';

export const TESTNET_CHAIN_ID = 10143;
export const TEST_AUSD = getAddress('0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC');
export const COMMON_ABI = parseAbi([
  'function asset() view returns (address)',
  'function CONTRACT_KIND() view returns (bytes32)',
  'function recordId(address sender, bytes32 reference) view returns (bytes32)',
]);
export const GIFT_ABI = parseAbi([
  'function createGift(address recipient,uint128 amount,uint64 unlockAt,uint64 expiresAt,bytes32 reference) returns (bytes32)',
  'function gifts(bytes32 id) view returns (address sender,address recipient,uint128 amount,uint64 unlockAt,uint64 expiresAt,uint8 state)',
  'function claim(bytes32 id)', 'function reclaim(bytes32 id)',
]);
export const STREAM_ABI = parseAbi([
  'function createStream(address recipient,uint128 total,uint64 startAt,uint64 duration,bool cancellable,bytes32 reference) returns (bytes32)',
  'function streams(bytes32 id) view returns (address sender,address recipient,uint128 total,uint128 withdrawn,uint64 startAt,uint64 endAt,bool cancellable,bool cancelled,uint128 vestedOnCancel)',
  'function withdrawable(bytes32 id) view returns (uint128)',
  'function withdraw(bytes32 id)', 'function cancel(bytes32 id)',
]);
export const REWARD_ABI = parseAbi([
  'function campaigns(bytes32 id) view returns (address merchant,address verifier,uint128 remaining,uint128 minimum,uint128 cap,uint16 bps,uint32 maxClaimsPerPayer,uint64 startsAt,uint64 endsAt,uint64 claimUntil)',
  'function createCampaign(address verifier,uint128 budget,uint128 minimum,uint128 cap,uint16 bps,uint32 maxClaimsPerPayer,uint64 startsAt,uint64 endsAt,uint64 claimUntil,bytes32 reference) returns (bytes32)',
  'function claim((bytes32 campaignId,bytes32 paymentTxHash,uint32 logIndex,address payer,uint128 purchaseAmount,uint64 paidAt,uint64 validUntil) v,bytes signature)',
  'function closeCampaign(bytes32 id)',
]);
export const VOUCHER_TYPES = {
  RewardVoucher: [
    { name: 'campaignId', type: 'bytes32' }, { name: 'paymentTxHash', type: 'bytes32' },
    { name: 'logIndex', type: 'uint32' }, { name: 'payer', type: 'address' },
    { name: 'purchaseAmount', type: 'uint128' }, { name: 'paidAt', type: 'uint64' },
    { name: 'validUntil', type: 'uint64' },
  ],
} as const;
export type Kind = 'gift' | 'stream' | 'rewards';
export type ConsumerConfig = Readonly<{
  enabled: boolean; rpcUrl: string; gifts: Address | null; streams: Address | null; rewards: Address | null;
}>;
export function consumerConfig(input: { enabled?: string | undefined; rpcUrl?: string | undefined; gifts?: string | undefined; streams?: string | undefined; rewards?: string | undefined }): ConsumerConfig {
  const parse = (s?: string) => s?.trim() ? getAddress(s.trim()) : null;
  const rpcUrl = input.rpcUrl ?? 'https://testnet-rpc.monad.xyz';
  if (new URL(rpcUrl).protocol !== 'https:') throw new Error('Consumer RPC must use HTTPS.');
  return Object.freeze({ enabled: input.enabled === 'true', rpcUrl, gifts: parse(input.gifts), streams: parse(input.streams), rewards: parse(input.rewards) });
}
export function consumerChain() {
  return defineChain({ id: TESTNET_CHAIN_ID, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } }, testnet: true });
}
export function publicConsumerClient(config: ConsumerConfig) {
  return createPublicClient({ chain: consumerChain(), transport: http(config.rpcUrl, { timeout: 15000, retryCount: 1 }) });
}
export function contractFor(config: ConsumerConfig, kind: Kind): Address {
  const address = kind === 'gift' ? config.gifts : kind === 'stream' ? config.streams : config.rewards;
  if (!address) throw new Error(`${kind} contract is not deployed/configured. No transaction was submitted.`);
  return address;
}
export async function verifyConsumerDeployment(config: ConsumerConfig, kind: Kind) {
  const client = publicConsumerClient(config);
  const address = contractFor(config, kind);
  if (await client.getChainId() !== TESTNET_CHAIN_ID) throw new Error('Wrong chain: consumer payments are Monad testnet only.');
  const [asset, tag] = await Promise.all([
    client.readContract({ address, abi: COMMON_ABI, functionName: 'asset' }),
    client.readContract({ address, abi: COMMON_ABI, functionName: 'CONTRACT_KIND' }),
  ]);
  const name = kind === 'gift' ? 'CherryGiftEscrow' : kind === 'stream' ? 'CherryEarningsStream' : 'CherryRewardCampaigns';
  if (getAddress(asset) !== TEST_AUSD || tag !== keccak256(toBytes(`${name}:v1:testnet`)))
    throw new Error('Consumer contract identity or trusted test AUSD asset does not match.');
  return { client, address };
}
export function amountUnits(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value.trim())) throw new Error('Enter a positive AUSD amount with at most 6 decimal places.');
  const amount = parseUnits(value.trim(), 6);
  if (amount <= 0n || amount > (1n << 128n) - 1n) throw new Error('AUSD amount is outside the supported range.');
  return amount;
}
export function bytes32(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0+$/.test(value)) throw new Error('A nonzero 32-byte record/reference is required.');
  return value as Hex;
}
export function newReference(): Hex {
  const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')) as Hex;
}
export function recordId(contract: Address, sender: Address, reference: Hex): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('uint256,address,address,bytes32'), [BigInt(TESTNET_CHAIN_ID), contract, sender, reference]));
}
export function vestedAmount(total: bigint, start: bigint, end: bigint, now: bigint): bigint {
  if (total < 0n || end <= start) throw new Error('Invalid stream schedule.');
  return now <= start ? 0n : now >= end ? total : total * (now - start) / (end - start);
}
export type RewardVoucher = {
  campaignId: Hex; paymentTxHash: Hex; logIndex: number; payer: Address;
  purchaseAmount: bigint; paidAt: bigint; validUntil: bigint;
};
export function rewardDomain(contract: Address, chainId = TESTNET_CHAIN_ID) {
  return { name: 'Cherry Pay Testnet Rewards', version: '1', chainId, verifyingContract: contract } as const;
}
export function parseSignedVoucher(text: string): { voucher: RewardVoucher; signature: Hex } {
  if (text.length > 4096) throw new Error('Voucher is too large.');
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid voucher.');
  const r = raw as Record<string, unknown>;
  const integer = (value: unknown, bits: number): bigint => {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Voucher integers must be decimal strings.');
    const n = BigInt(value); if (n >= 1n << BigInt(bits)) throw new Error('Voucher number out of range.'); return n;
  };
  if (typeof r.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(r.signature)) throw new Error('A verifier-signed EIP-712 voucher is required; CRE JSON is not a voucher.');
  const voucher: RewardVoucher = { campaignId: bytes32(String(r.campaignId)), paymentTxHash: bytes32(String(r.paymentTxHash)),
    logIndex: Number(integer(r.logIndex, 32)), payer: getAddress(String(r.payer)), purchaseAmount: integer(r.purchaseAmount, 128), paidAt: integer(r.paidAt, 64), validUntil: integer(r.validUntil, 64) };
  return { voucher, signature: r.signature as Hex };
}
export type ConsumerAction =
  | { type: 'approve'; kind: Kind; amount: bigint }
  | { type: 'revoke'; kind: Kind }
  | { type: 'gift'; recipient: Address; amount: bigint; unlockAt: bigint; expiresAt: bigint; reference: Hex }
  | { type: 'stream'; recipient: Address; amount: bigint; startAt: bigint; duration: bigint; cancellable: boolean; reference: Hex }
  | { type: 'claimGift' | 'reclaimGift' | 'withdraw' | 'cancel'; id: Hex }
  | { type: 'reward'; voucher: RewardVoucher; signature: Hex };
export type BroadcastEvidence = { txHash: Hex; recordId: Hex | null; action: ConsumerAction['type'] };

/** No arbitrary signing, native value transfer, unlimited approvals or auto-retry.
 * Caller must obtain a fresh Mera account after a human action and always end it.
 * Broadcast callback occurs BEFORE waiting; timeouts are uncertain, never failed-safe-to-resend.
 */
export async function executeConsumerAction(config: ConsumerConfig, account: LocalAccount, action: ConsumerAction,
  onBroadcast: (evidence: BroadcastEvidence) => void): Promise<BroadcastEvidence> {
  if (!config.enabled) throw new Error('Consumer testnet writes are disabled.');
  const kind: Kind = action.type === 'approve' || action.type === 'revoke' ? action.kind
    : action.type === 'gift' || action.type === 'claimGift' || action.type === 'reclaimGift' ? 'gift'
    : action.type === 'reward' ? 'rewards' : 'stream';
  const { client, address } = await verifyConsumerDeployment(config, kind);
  let target = address; let data: Hex; let id: Hex | null = null;
  switch (action.type) {
    case 'approve': {
      if (action.amount <= 0n || action.amount >= 1n << 128n) throw new Error('Invalid exact approval amount.');
      const allowance = await client.readContract({ address: TEST_AUSD, abi: erc20Abi, functionName: 'allowance', args: [account.address, address] });
      if (allowance !== 0n) throw new Error('Existing allowance found. Revoke it before approving a different funding request.');
      target = TEST_AUSD; data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [address, action.amount] }); break;
    }
    case 'revoke': target = TEST_AUSD; data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [address, 0n] }); break;
    case 'gift':
      id = recordId(address, account.address, action.reference);
      data = encodeFunctionData({ abi: GIFT_ABI, functionName: 'createGift', args: [action.recipient, action.amount, action.unlockAt, action.expiresAt, action.reference] }); break;
    case 'stream':
      id = recordId(address, account.address, action.reference);
      data = encodeFunctionData({ abi: STREAM_ABI, functionName: 'createStream', args: [action.recipient, action.amount, action.startAt, action.duration, action.cancellable, action.reference] }); break;
    case 'claimGift': case 'reclaimGift':
      id = action.id; data = encodeFunctionData({ abi: GIFT_ABI, functionName: action.type === 'claimGift' ? 'claim' : 'reclaim', args: [id] }); break;
    case 'withdraw': case 'cancel':
      id = action.id; data = encodeFunctionData({ abi: STREAM_ABI, functionName: action.type, args: [id] }); break;
    case 'reward':
      if (getAddress(account.address) !== getAddress(action.voucher.payer)) throw new Error('This reward belongs to a different payer.');
      data = encodeFunctionData({ abi: REWARD_ABI, functionName: 'claim', args: [action.voucher, action.signature] }); break;
  }
  // eth_call validates the exact sender, calldata and state before submission.
  await client.call({ account: account.address, to: target, data });
  const gas = await client.estimateGas({ account: account.address, to: target, data });
  const wallet = createWalletClient({ account, chain: consumerChain(), transport: http(config.rpcUrl, { retryCount: 0, timeout: 15000 }) });
  const txHash = await wallet.sendTransaction({ to: target, data, gas: gas * 120n / 100n });
  const evidence = { txHash, recordId: id, action: action.type };
  onBroadcast(evidence);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 2, timeout: 90000 });
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${txHash}. No automatic retry.`);
  return evidence;
}
