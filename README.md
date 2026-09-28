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

Current branch: **`feat/phase-1-foundation`**

Phase 1 is deliberately **read-only**: Monad connectivity, AUSD metadata/balance reads,
the Expo mobile shell, and the Cherry Money API boundary. Mera signing comes next.

See:

- `docs/ARCHITECTURE.md`
- `docs/PHASE_1.md`
- `docs/ROADMAP.md`
