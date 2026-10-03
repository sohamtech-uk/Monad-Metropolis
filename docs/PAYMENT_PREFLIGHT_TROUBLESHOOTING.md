# Payment preflight troubleshooting — Monad testnet only

## Three distinct issues in the 2 October screenshots

### 1. The failed request is a faucet call, not the supplier transfer

The detailed RPC error names `requestFunds(address)` at the configured Agora
faucet and says `Signer had insufficient balance`. A nonzero MON balance is
not enough: the sender needs to cover the transaction's gas budget in MON.
AUSD is a separate token and does not pay the native fee in this implementation.

Decoding the user-supplied type-2 request (offline, never rebroadcast):

- chain ID: 10143;
- gas limit: 113465;
- max fee per gas: 182400000000 wei;
- maximum native fee budget: 0.020696016 MON;
- screenshot balance: 0.002958314 MON;
- shortfall against that maximum: 0.017737702 MON.

These are parameters from that request, not a current network quote or a claim
about the fee finally charged. Monad charges the gas limit at the applicable
price per gas. Do not force a too-low gas limit merely to make it fit a balance.

The screenshot already shows 19,995 test AUSD. There is no need to request more
AUSD for a 5 AUSD demo. End the current session, fund the displayed *sender*
address with testnet MON through the official Monad faucet or an owned funded
test account, then refresh balances and approve a new session as needed.
The payment and its separate Registry correlation each need gas.

Official references:
- https://docs.monad.xyz/developer-essentials/gas-pricing
- https://docs.monad.xyz/developer-essentials/testnet
- https://faucet.monad.xyz/

### 2. The recipient field contains the AUSD contract

`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` is the configured token contract,
not a supplier receiving wallet. The faucet address and Registry address are
also not supplier wallets. Do not send tokens to these infrastructure addresses.

Use a separate recipient account you control for the demo, or the intended
recipient's independently verified Monad testnet account. Confirm control; do
not infer it from an address shown in old evidence. Reapprove the corrected
recipient with the existing Mera passkey, instead of creating another payer to
work around safeguards.

### 3. An existing draft reference is already correlated

The `hasSettlement(payer, reference)` preflight intentionally stops another
transfer for the same business instruction. Do not remove this check, clear
Registry state, or change wallets to pay the same instruction again.

For the original payment: verify the existing payment/correlation transaction.
For a genuinely separate test: create/select a new fictional USD payment draft
with a new ID/reference, then approve its new payment context. Do not change
an existing draft's amount/reference merely to evade its prior settlement.
If only correlation failed after the transfer confirmed, retry correlation
only, not the AUSD transfer.

## Patch behaviour

- Reject zero/token recipients when creating the scoped session; reject the
  configured token, faucet and Registry before supplier payment submission.
- Keep valid contract-wallet recipients possible; there is no blanket ban on
  contract addresses.
- After simulation, estimate gas and EIP-1559 fees, re-read the pending MON
  balance and require `gas * maxFeePerGas` for the zero-native-value call.
- Pass the exact checked gas/fee parameters into the write. Do not recalculate
  a different budget after passing the check.
- Apply this to AUSD transfers, faucet requests and Registry writes.
- Recheck session lifetime after async estimates; a gas check is not permission
  to use an expired passkey session.
- Preserve duplicate-reference blocking and partial-payment/correlation status.

An estimate is a preflight, not a transaction receipt or reservation of funds.
Other pending activity can still change balances before inclusion. Check chain
receipts before retrying an ambiguous broadcast.

Tests use injected estimates and no RPC, keys, credentials or money movement.
No contract, accounting, rewards, Hostinger or backend configuration is changed.
