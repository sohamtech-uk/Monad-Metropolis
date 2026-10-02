/** SERVER/CLI ONLY. Never call with a browser-supplied identity/campaign intent.
 * The existing Cherry Pay backend must supply an enrolled, authenticated merchant-
 * purchase intent and verified payer binding. This adapter does NOT mutate its
 * production GBP points ledger, award cash, or treat local CRE JSON as authority.
 */
import { decodeEventLog, decodeFunctionData, erc20Abi, getAddress, type Address, type Hex, type LocalAccount, type PublicClient } from 'viem';
import { COMMON_ABI, TEST_AUSD, REWARD_ABI, VOUCHER_TYPES, rewardDomain, type RewardVoucher } from './index.ts';
export type TrustedRewardIntent = Readonly<{
  id: string; mode: 'sandbox'; purpose: 'merchant_purchase'; payerAccountId: string;
  payerCompanyId: string | null; merchantCompanyId: string; payer: Address; merchant: Address;
  token: Address; amount: bigint; campaignId: Hex; campaignContract: Address;
}>;

export async function verifyRewardPurchase(client: PublicClient, intent: TrustedRewardIntent, paymentTxHash: Hex,
  logIndex: number, now: bigint, chainId = 10143): Promise<RewardVoucher> {
  if (chainId !== 10143 && chainId !== 31337) throw new Error('Testnet rewards only.');
  if (await client.getChainId() !== chainId) throw new Error('Chain mismatch.');
  if (!intent.id || intent.mode !== 'sandbox' || intent.purpose !== 'merchant_purchase' || !intent.payerAccountId
    || !intent.merchantCompanyId || intent.payerCompanyId === intent.merchantCompanyId || getAddress(intent.payer) === getAddress(intent.merchant))
    throw new Error('A trusted enrolled merchant purchase and non-self payer are required.');
  if (!Number.isSafeInteger(logIndex) || logIndex < 0 || logIndex >= 2 ** 32 || intent.amount <= 0n) throw new Error('Invalid payment intent.');
  const trustedAsset = await client.readContract({ address: intent.campaignContract, abi: COMMON_ABI, functionName: 'asset' });
  if (getAddress(intent.token) !== getAddress(trustedAsset) || (chainId === 10143 && getAddress(trustedAsset) !== TEST_AUSD)) throw new Error('Wrong trusted asset.');
  const [receipt, tx, head, campaign] = await Promise.all([
    client.getTransactionReceipt({ hash: paymentTxHash }), client.getTransaction({ hash: paymentTxHash }),
    client.getBlockNumber({ cacheTime: 0 }), client.readContract({ address: intent.campaignContract, abi: REWARD_ABI, functionName: 'campaigns', args: [intent.campaignId] }),
  ]);
  if (receipt.status !== 'success' || head < receipt.blockNumber + 1n) throw new Error('Payment not confirmed to the required depth.');
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash || block.timestamp > now) throw new Error('Noncanonical/future payment evidence.');
  const [merchant, , , minimum, , , , startsAt, endsAt, claimUntil] = campaign;
  if (getAddress(merchant) !== getAddress(intent.merchant) || block.timestamp < startsAt || block.timestamp >= endsAt
    || now >= claimUntil || intent.amount < minimum) throw new Error('Purchase is outside the campaign policy.');
  // Only a direct ERC20 purchase is supported in this first adapter. Escrow exits,
  // rewards, payroll and routed transfers cannot be relabelled as purchases.
  if (getAddress(tx.from) !== getAddress(intent.payer) || !tx.to || getAddress(tx.to) !== getAddress(intent.token)) throw new Error('Not a direct merchant purchase.');
  const call = decodeFunctionData({ abi: erc20Abi, data: tx.input });
  if (call.functionName !== 'transfer' || getAddress(call.args[0]) !== getAddress(intent.merchant) || call.args[1] !== intent.amount) throw new Error('Purchase calldata mismatch.');
  const log = receipt.logs.find(l => l.logIndex === logIndex);
  if (!log || log.removed || getAddress(log.address) !== getAddress(intent.token)) throw new Error('Trusted token event missing.');
  const event = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics });
  if (getAddress(event.args.from) !== getAddress(intent.payer) || getAddress(event.args.to) !== getAddress(intent.merchant) || event.args.value !== intent.amount) throw new Error('Purchase event mismatch.');
  const validUntil = now + 300n < claimUntil ? now + 300n : claimUntil;
  return { campaignId: intent.campaignId, paymentTxHash, logIndex, payer: intent.payer, purchaseAmount: intent.amount, paidAt: block.timestamp, validUntil };
}

export async function signRewardVoucher(client: PublicClient, signer: LocalAccount, contract: Address, voucher: RewardVoucher, chainId = 10143) {
  if (![10143, 31337].includes(chainId) || await client.getChainId() !== chainId) throw new Error('Testnet chain mismatch.');
  const campaign = await client.readContract({ address: contract, abi: REWARD_ABI, functionName: 'campaigns', args: [voucher.campaignId] });
  if (getAddress(campaign[1]) !== getAddress(signer.address)) throw new Error('Signer is not the designated campaign verifier.');
  const signature = await signer.signTypedData({ domain: rewardDomain(contract, chainId), types: VOUCHER_TYPES, primaryType: 'RewardVoucher', message: voucher });
  return JSON.stringify({ ...voucher, logIndex: String(voucher.logIndex), purchaseAmount: String(voucher.purchaseAmount), paidAt: String(voucher.paidAt), validUntil: String(voucher.validUntil), signature });
}
