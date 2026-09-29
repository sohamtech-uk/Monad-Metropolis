# Phase 3 — Mera Scoped Signing Sessions

**Target:** 1 October 2026

## Objective

Use Mera signing sessions for prompt-free signing after a single passkey ceremony, while
adding an application-level payment policy that tightly bounds what may be signed
without another passkey prompt.

Mera owns the in-memory signing key and its end() lifecycle. Cherry Pay owns the
business/session policy.

## Session scope

| Rule | Scope |
|---|---|
| Network | Monad testnet, chain ID 10143 |
| Asset | configured AUSD contract only |
| Recipient | exact recipient approved before the passkey ceremony |
| Per-payment cap | 500 AUSD |
| Cumulative cap | 1,000 AUSD |
| Prompt-free authorizations | maximum 3 |
| Lifetime | 5 minutes |
| Background behaviour | session ends when the app leaves foreground |

A new passkey ceremony is required when the recipient, network, or asset changes; a
payment exceeds 500 AUSD; cumulative value would exceed 1,000 AUSD; three prompt-free
authorizations have been used; five minutes expire; the app backgrounds; or the user
manually ends the session.

## One-prompt design

**Create + open session** performs one passkey creation ceremony and immediately derives
the Mera signing session from that ceremony's PRF output.

**Recover + open session** performs one discoverable-passkey assertion and opens the
same scoped session.

There is no second prompt merely to establish a signing key.

## Prompt-free proof

Phase 3 does not move money yet. It signs an EIP-712 PaymentAuthorization through
Mera's official viem adapter.

The app verifies every signature by recovering the EVM address and checking that it
matches the Mera-derived account.

The typed message includes payer, recipient, asset, amount, payment reference, session
expiry, and authorization sequence number.

## Key lifecycle

~~~text
Passkey ceremony
      ↓
PRF output
      ↓
BIP-39 / BIP-32 derivation
      ↓
temporary private-key buffer
      ↓
Mera signing session
      │
      ├── prompt-free EIP-712 signatures
      │
      └── end()
             ↓
       session key zeroed
~~~

The PRF output, BIP-39 seed and temporary private-key buffer are zeroed after session
construction. Only Mera's session-owned key copy remains in memory until end().

## UX instrumentation

The demo displays passkey ceremony latency, prompt-free signing latency, remaining
session lifetime, authorization count, and cumulative approved AUSD.

This prepares the bounty's time-to-first-transaction measurement for the Agora phase.

## Security boundary

Phase 3 still does not broadcast a transaction:

- no AUSD transfer;
- no token approval;
- no network write;
- no server-side custody;
- no persistent signing key;
- no prompt-free signing outside the explicit scope.

## Exit criteria

- Phase 3 TypeScript CI passes.
- Account creation/recovery opens one live Mera signing session.
- An in-scope EIP-712 payment authorization signs with no second passkey prompt.
- The signature recovers to the expected account.
- Recipient/asset/network/amount violations are rejected before signing.
- Expiry and app-background transitions end the Mera session.
- A new scope requires a new passkey ceremony.

## Next phase

The Agora AUSD payment MVP replaces the EIP-712-only proof with a real AUSD transfer on
Monad while preserving the same scope checks before transaction signing.
