# Funding incident: faucet versus Aurora (3 October 2026)

## Reproduced from the report

The user reported `eth_sendRawTransaction` on Monad Testnet chain 10143 for `requestFunds(address recipient)`. The RPC detail was `Signer had insufficient balance`. This is a direct AUSD faucet transaction, not Aurora Intents and not evidence that passkey creation failed. A zero or insufficient native MON balance prevents the signed faucet transaction from being accepted. Receiving AUSD does not pay native gas.

The reported recipient `0xa9012a055bd4e0edff8ce09f960291c09d5322dc` is the configured testnet AUSD asset contract, not the intended supplier wallet. A transfer must not target the token itself. The screenshot and supplied error mention different sender addresses; that does not prove a derivation defect, but the same intended credential/address must be selected before funding. Do not create a new passkey to resolve an insufficient-gas error.

A read-only browser inspection of the public web deployment still showed the legacy three-tab interface, not the #50 redesign that has since merged. The Aurora tab was visible/enabled. No passkey, provider execution preview, balance funding, signing or transaction was performed by that inspection. A merge alone is not a hosted-app deployment; verify the released artifact before attributing the old UI to a browser cache.

## Correct current route

- Supplier payments: direct testnet AUSD + MON fees. This is not sponsored by the Aurora API key.
- Aurora, Any wallet / exchange: the Cherry passkey signs the intent; fund the quoted Base USDC deposit directly from the existing source wallet or exchange. No AUSD/MON/Base ETH top-up is required in the Cherry passkey wallet for this external-deposit mode. The source must have USDC and can incur its own network/withdrawal charges.
- Aurora, This passkey on Base: the app currently performs a direct ERC-20 source transfer and checks Base USDC and Base ETH. It is not source-gasless.
- Aurora handles destination-chain gas inside the quoted route. This is not a claim of zero fees, free payment principal, automatic funding of an empty wallet, or sponsored unrelated testnet writes.

Official reference: https://docs.intents.aurora.dev/intents-connect/deep-dive/how-it-works (Gas and fees; user signs and deposits).

## Changes in this fix

1. Shared supplier session policy rejects zero/token-as-recipient at scope creation and again at authorisation, including a manually constructed old scope. Normal limits and legitimate smart-wallet recipients remain supported.
2. Aurora plan and destination recipe reject the destination USDC token/zero as recipient.
3. Nested insufficient-native-funds errors become plain funding/route guidance without echoing a signed raw transaction. Other passkey and asset-balance errors retain their existing handling.
4. An Aurora funding explainer clarifies no destination MON top-up, source funding/fees, the nonsponsored Base direct option and reuse of an existing passkey. The original SDK form is moved unchanged to AuroraExecutionForm.tsx and rendered inside the wrapper.
5. Dedicated tests cover the reported errors, cause cycles, wrong recipients, unchanged policy limits and external-deposit flag.

## Not implemented by this fix

No source-chain paymaster/relayer, gas sponsorship policy, auto-funded treasury, principal credit, wallet migration or production deployment is created. No secret is read or changed. The proxy's separate production review and existing execution-recovery/quote/idempotency blockers still apply. Backend recipient validation should also be reviewed; client checks are not a substitute for an authenticated server policy.

To remove BOTH Base ETH and MON management end to end, add and test a compatible source-side sponsored transfer/authorisation route with a funded service budget and server-side allowlists, caps and replay/idempotency controls. Do not replace the stable Mera account or claim all-chain gaslessness just by changing labels.
