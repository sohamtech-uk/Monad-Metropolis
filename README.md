# Cherry Money — Monad Metropolis

Hackathon development repository for **Cherry Pay Global** on Monad.

## Relationship to Cherry Money

The existing private `sohamtech-uk/cherrymoney` repository remains the **foundation
and business system of record** for Cherry Money. It continues to own invoices,
suppliers, approvals, payment drafts, accounting, ledger posting and reconciliation.

This repository owns all Metropolis-specific development and integrates back to Cherry
Money through explicit API boundaries. We do not fork or duplicate the full production
accounting codebase here.

## What lives here

- React Native / Expo mobile app
- Mera passkey account layer
- Agora AUSD payments on Monad
- Chainlink CRE workflow
- Envio indexing and settlement analytics
- Metropolis smart contracts
- Cherry Money integration adapter
- demo, security and bounty documentation

## Repository layout

```text
apps/mobile/                    Cherry Pay Global mobile app
packages/core/                  Monad/AUSD read and payment domain
packages/cherry-money-client/   typed Cherry Money API boundary
contracts/                      Monad contracts (later phase)
cre/                            Chainlink CRE workflow (later phase)
envio/                          Envio HyperIndex project (later phase)
docs/                           architecture, roadmap and bounty evidence
```

## Development

Feature work is developed on branches and merged into `main` through pull requests.

Current branch: **`feat/phase-4-agora-ausd-mvp`**

Phase 1 established the read-only Monad/AUSD foundation.

Phase 2 added **Mera passkey account creation and stateless recovery**.

Phase 3 added **short-lived, tightly scoped Mera signing sessions**.

Phase 4 adds the **real Agora AUSD payment MVP**: the Mera account can request test AUSD,
simulate an ERC-20 transfer, sign it from the scoped in-memory session, broadcast it to
Monad testnet, wait for a successful receipt, and prove receipt by re-reading the
recipient's AUSD balance.

See:

- `docs/ARCHITECTURE.md`
- `docs/PHASE_1.md`
- `docs/PHASE_2.md`
- `docs/PHASE_3.md`
- `docs/PHASE_4.md`
- `docs/AGORA_TESTNET.md`
- `docs/PASSKEY_DOMAIN.md`
- `docs/ROADMAP.md`
