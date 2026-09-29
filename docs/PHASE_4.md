# Phase 4 — Agora AUSD Payment MVP

**Target:** 2 October 2026

## Objective

Turn the Phase 3 prompt-free signing proof into the first real qualifying payment flow:

**Mera passkey → AUSD balance → AUSD transfer on Monad → recipient receives → confirmed receipt**

This remains a testnet-only hackathon implementation.

## Qualifying flow

1. User enters an overseas supplier/recipient Monad address.
2. User creates or recovers the Mera account with one passkey ceremony.
3. Cherry Pay opens the existing scoped session:
   - Monad testnet only
   - AUSD only
   - exact recipient
   - max 500 AUSD/payment
   - max 1,000 AUSD/session
   - max 3 payments
   - 5-minute lifetime
4. App shows sender AUSD and MON balances.
5. If needed, the user can request test AUSD from Agora's published testnet faucet.
6. User enters the AUSD amount.
7. Cherry Pay validates the session policy before signing.
8. The ERC-20 `transfer` is simulated first.
9. Mera's in-memory account signs the real transaction without another passkey prompt.
10. The transaction is broadcast to Monad.
11. Cherry Pay waits for one confirmed receipt.
12. The app re-reads sender and recipient AUSD balances.
13. Success is shown only after the receipt status is `success`.

## Agora contracts

Monad testnet:

- AUSD: `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`
- AUSD faucet: `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`
- AUSD decimals: 6

These remain environment-overridable.

## Gas

The Mera-derived account must hold a small amount of **MON** for Monad testnet gas.

The app checks the native MON balance before:

- requesting test AUSD;
- sending AUSD.

A zero MON balance blocks the write path and tells the tester to fund the displayed Mera address from the Monad testnet faucet.

## Test AUSD

The mobile app can call Agora's published testnet faucet:

`requestFunds(address recipient)`

The faucet call is a test utility. It does not consume the Cherry Pay payment-value/session counters because it sends no value out of the account and can only request test AUSD to the Mera account itself.

It still requires MON for gas.

## Transaction safety

Before transaction signing:

- session must be active;
- live RPC chain must match the approved chain ID;
- configured AUSD contract must match the session asset;
- recipient must match the passkey-approved recipient;
- amount must fit the per-payment and cumulative limits;
- authorization count must remain in scope;
- sender must have enough AUSD;
- sender must have MON for gas;
- `eth_call` simulation of the AUSD transfer must succeed.

Session usage is only counted after a confirmed successful transaction.

A failed simulation, failed submission, timeout, or reverted receipt does not count as a successful Cherry Pay payment.

## Demo evidence

The payment result displays:

- amount;
- transaction hash;
- Monad explorer link;
- block number;
- confirmation time;
- recipient AUSD balance before;
- recipient AUSD balance after;
- landing-to-first-confirmed-transaction time.

The recipient balance delta is direct proof of send/receive behaviour.

## Security boundary

Phase 4 introduces real **testnet** money movement, but still:

- no production/mainnet payment path;
- no server-side custody;
- no stored private key;
- no stored Mera PRF output;
- no arbitrary contract calls from the payment UI;
- no scope bypass for a changed recipient/asset/network;
- no automatic Cherry Money invoice reconciliation yet.

## Exit criteria

Code-level:

- TypeScript CI passes.
- real ERC-20 transfer path uses the Mera viem local account;
- transfer is simulated before signing;
- receipt must confirm successfully before UI success;
- recipient balance after payment is re-read on-chain;
- session policy is enforced before each transfer;
- successful transfers consume the scoped-session counters.

Device/network-level:

- Mera passkey association works on real hardware;
- Mera account has MON for gas;
- Agora testnet AUSD can be funded;
- one real AUSD send/receive completes on Monad testnet;
- transaction opens in the Monad explorer.

## Next phase

Phase 5 connects this payment to an actual Cherry Money supplier invoice/payment draft so
the transfer becomes a business-payment workflow rather than a standalone token send.
