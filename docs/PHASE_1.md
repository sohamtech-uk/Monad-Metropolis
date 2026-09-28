# Phase 1 — Repository & Monad Foundation

**Target:** 29 September 2026

## Objective

Establish the new Metropolis repository, keep Cherry Money as the upstream accounting
foundation, and prove read-only Monad/AUSD connectivity before introducing Mera.

## Delivered in this branch

- npm monorepo workspace.
- Expo / React Native Cherry Pay Global app.
- shared `@cherry-metropolis/core` package.
- configurable Monad testnet read client.
- chain ID and block-height verification.
- AUSD `symbol`, `decimals` and `balanceOf` reads.
- mobile status and balance screen.
- typed `@cherry-metropolis/cherry-money-client` adapter for the existing Cherry Money
  WebMCP status, bootstrap and payment-draft boundaries.
- HTTPS-only configuration rules.
- no private-key, signing or transaction-broadcast capability.

## Security boundary

Phase 1 is read-only:

- no seed phrase;
- no private key;
- no Mera PRF material;
- no token approval;
- no transaction signing;
- no transaction broadcast;
- no Cherry Money payment execution;
- no custody backend.

## Exit criteria

- `npm install` succeeds on Node 24+.
- `npm run check` passes.
- mobile app reaches Monad testnet.
- configured and live chain IDs match.
- AUSD token metadata loads.
- a valid address returns a live AUSD balance.
- Cherry Money client remains a typed adapter only and stores no bearer token.

## Phase 2

Mera becomes the account layer:

1. passkey creation;
2. passkey sign-in/recovery;
3. same account reconstructed on a fresh device/profile;
4. signing-session model;
5. no wallet extension or Cherry custody backend.
