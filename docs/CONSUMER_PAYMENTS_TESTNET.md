# Cherry Pay — Earnings, Rewards and Gifts (testnet implementation)

## Delivery boundary

This adds three experimental, non-upgradeable contracts, a shared web/native client,
a server-side reward receipt adapter and a consumer screen alongside the existing
supplier-payment journey. **Default off. Not audited. No production money, payroll,
points accrual, GBP cashback or automatic accounting activation.**

The existing CherrySettlementRegistry, Envio deployment, CRE supplier verifier,
WebMCP origin policy and Hostinger /graphql/ and passkey files are unchanged.
Contracts live outside `contracts/src` so the existing Foundry registry deployment
continues to compile only its original sources. No Vercel deployment or DNS move.

## What each feature actually does

### Gifts

The sender approves an exact test AUSD allowance, then separately funds a gift.
Recipient, amount, unlock and expiry are immutable. Only the recipient can claim
at `unlockAt <= block.timestamp < expiresAt`. Only the sender can reclaim an
unclaimed gift at/after expiry. There is no early revocation and no automatic
claim/refund. A link/record ID is not a bearer instrument. Names, messages and
contact details are not on-chain. This slice binds to a verified-by-the-user Mera
address; it does not implement a Contacts-directory lookup or anonymous claiming.

### Earnings streams

Fully prefunded, linear vesting using integer base units and chain timestamps.
One withdrawal transfers all currently vested/unwithdrawn funds to the immutable
recipient; it does not transact every second. A sender may cancel only streams
created as cancellable, and only before their end. Unvested funds return to the
sender; vested earnings stay claimable indefinitely. The final withdrawal includes
rounding remainder. The animated screen preview is explicitly simulated and does
not represent spendable earnings. This is not a payroll/tax implementation.

### Rewards

Merchant-funded campaigns lock test AUSD, specify an independent verifier address,
minimum purchase, basis-point rate, reward cap, per-payer claim count and windows.
Only the named payer can use a verifier-signed EIP-712 voucher. Signatures bind the
chain, contract, campaign, exact payment transaction AND log index, payer, amount,
paid time and expiry. One purchase event cannot claim twice across campaigns in
this contract. Campaign budgets cannot be overspent. Sender may recover unused
budget only after the claim window. A voucher is **not** a guaranteed reservation.

`verifyRewardPurchase` re-reads a successful, canonical transaction receipt and
requires two blocks of confirmation, a direct trusted-token `transfer` to the
merchant, exact payer/amount/log and an eligible campaign. The existing backend
must supply an authenticated, enrolled sandbox merchant-purchase intent and an
independently bound payer identity. Self-company payments and non-purchase
purposes are rejected. `signRewardVoucher` requires the campaign's verifier key.
That key remains server-side. Never expose the signer as a public endpoint that
accepts untrusted intent fields.

**Trust model:** the on-chain contract verifies the designated verifier signature,
not the historical receipt itself. Compromise of that verifier can distribute the
campaign's remaining test budget. This is not a Chainlink DON attestation. Raw
CRE simulation JSON never authorises claims. No random rewards, yield, new Cherry
token, rewards on gifts/salary/cashback, cash conversion of points or platform-funded
benefits are introduced. Refund/reversal handling for already-paid test rewards is
not automated; production activation remains blocked.

## What is not wired/enabled yet

- No contracts from this increment have been deployed merely by merging its code.
- No authenticated bridge into Cherry Money's existing PHP rewards ledger is enabled.
  Its GBP/company points and merchant cashback policies are unchanged.
- The existing Envio config indexes supplier payments only. New contract addresses
  and start blocks must be explicitly added before indexing consumer events.
- The existing CRE workflow still verifies supplier drafts. Consumer events require
  their own expected intent/state verifier and authenticated ingestion; never map a
  stream deposit or a gift deposit to a completed payment to the recipient.
- No gas sponsorship, contact discovery, bank cash-out, payroll posting or automated
  withdrawals are provided. MON is still needed for each on-chain transaction.

## Contracts and invariants

| Contract | Funding event | Recipient money-movement event |
| --- | --- | --- |
| CherryGiftEscrow | GiftFunded | GiftClaimed |
| CherryEarningsStream | StreamFunded | EarningsWithdrawn |
| CherryRewardCampaigns | CampaignFunded | RewardPaid |

Use `(chainId, contractAddress, transactionHash, logIndex)` as immutable evidence
identity. Retain record ID/campaign ID separately. For multiple stream withdrawals,
use each event ID, not only the stream ID, as the idempotency key. Reclaimed and
cancelled unvested funds are refunds to sender, not recipient income. Mark a reward
paid only after its own RewardPaid event/receipt, never when issuing a voucher.

Every escrow uses SafeERC20 and ReentrancyGuard with checks/effects/interactions.
Deposits must increase the contract token balance by exactly the declared amount;
fee-on-transfer tokens are rejected. Token address is immutable; only canonical
non-rebasing test AUSD should be configured. There is no rescue/sweep/admin key,
so accidental unrelated tokens and direct native transfers are not recoverable.

The constructors permit chain 10143 (Monad testnet) or 31337 (local tests) only.
The browser client permits only 10143 and the canonical test AUSD address. It also
checks the deployed contract kind and asset before a write. These checks catch
wrong configuration but are not a substitute for bytecode/source review.

## Validation

```bash
npm install --workspaces --include-workspace-root
npm run consumer:test
npm run check
npm run web:build
```

Tests use an isolated Ganache chain and locally minted test fixtures only. They
cover authorization, exact timing/expiry boundaries, replay, insufficient funding,
fees/false returns, reentrant callbacks, stream conservation/rounding/cancellation,
reward budget/per-payer limits, EIP-712 domain/recipient tampering and real local
receipt-to-voucher-to-payout integration. They do not prove mainnet safety, live
passkey-provider interoperability or legal/payroll readiness.

## Reviewed deployment and Hostinger release

1. Review the new contracts and run CI. Keep UI writes off.
2. Compile with `npm run consumer:build`.
3. From a protected deployment environment only, set `MONAD_DEPLOYER_PRIVATE_KEY`.
4. Explicitly run `node scripts/deploy-consumer-testnet.mjs --confirm-testnet-deploy`.
5. Retain `build/consumer-deployment.json`; it journals each hash before confirmation.
   A timeout must be investigated, not blindly retried or the journal deleted.
6. Verify chain/token/runtime code and record each deployment block. No funds were
   deposited and no campaigns/streams/gifts were created by that deployment command.
7. Configure the public build variables with the verified addresses:

```dotenv
EXPO_PUBLIC_CONSUMER_PAYMENTS_ENABLED=false
EXPO_PUBLIC_CONSUMER_GIFT_ADDRESS=
EXPO_PUBLIC_CONSUMER_STREAM_ADDRESS=
EXPO_PUBLIC_CONSUMER_REWARDS_ADDRESS=
```

8. Set enabled to true only for the approved testnet demo build. An explicit .env
   value affects the compiled Expo bundle; changing a Hostinger variable alone does
   not rebuild the static site. Never put private keys/tokens in EXPO_PUBLIC values.
9. Build/upload frontend assets to the existing Hostinger document root. Preserve
   `.htaccess`, `/graphql/`, `.well-known/`; follow WEB_DEPLOYMENT.md and back up first.
10. Perform a fresh two-account passkey run: exact approval -> funded gift -> intended
    recipient claim; prefunded 60-second stream -> partial withdrawal -> cancellation
    preserves vested funds; verified merchant purchase -> signed test voucher -> one
    reward payout. Record transaction hashes and negative-test outcomes.

### Manual merchant campaign provisioning

Campaign creation is an operator/merchant action, not a browser auto-activation.
Use the compiled ABI and `createCampaign(verifier,budget,minimum,cap,bps,maxClaimsPerPayer,
startsAt,endsAt,claimUntil,referenceId)` from the merchant's test account after an
exact AUSD approval. Keep verifier distinct from merchant and never publish its
private key. A future authenticated backend integration must own this policy and
provide verified identities; this library is the integration point, not that service.

## Technical references

- OpenZeppelin SafeERC20 and Vesting utilities: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20
- Solidity security considerations: https://docs.soliditylang.org/en/latest/security-considerations.html
- Viem contract simulation: https://viem.sh/docs/contract/simulateContract
