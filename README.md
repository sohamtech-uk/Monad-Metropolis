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
contracts/                      Monad settlement-correlation contract
cre/                            Chainlink CRE workflow (later phase)
envio/                          Envio HyperIndex settlement intelligence
docs/                           architecture, roadmap and bounty evidence
```

## Development

Feature work is developed on branches and merged into `main` through pull requests.

Current branch: **`feat/phase-7-envio-hyperindex`**

Phase 1 established the read-only Monad/AUSD foundation.

Phase 2 added **Mera passkey account creation and stateless recovery**.

Phase 3 added **short-lived, tightly scoped Mera signing sessions**.

Phase 4 added the **real Agora AUSD payment MVP**.

Phase 5 bound the settlement flow to a **real Cherry Money payment draft** through the
existing authenticated WebMCP bridge.

Phase 6 adds a **privacy-safe settlement correlation registry** on Monad. After an AUSD
payment confirms, Cherry Pay can record the opaque business reference, payment
transaction hash, payer, recipient, asset and amount in a second non-custodial
transaction. The registry does not mark Cherry Money paid; Envio/CRE will independently
verify the referenced transfer before later reconciliation.

Phase 7 adds **Envio HyperIndex settlement intelligence**. It indexes Agora AUSD
transfers and Phase 6 correlations on Monad Testnet, independently verifies the
referenced transfer, preserves mismatch diagnostics, and derives counterparty,
route and daily settlement analytics for the Phase 8 dashboard.

See:

- `docs/ARCHITECTURE.md`
- `docs/PHASE_1.md`
- `docs/PHASE_2.md`
- `docs/PHASE_3.md`
- `docs/PHASE_4.md`
- `docs/PHASE_5.md`
- `docs/PHASE_6.md`
- `docs/PHASE_7.md`
- `docs/SETTLEMENT_CORRELATION.md`
- `docs/CHERRY_MONEY_BRIDGE.md`
- `docs/AGORA_TESTNET.md`
- `docs/PASSKEY_DOMAIN.md`
- `docs/ROADMAP.md`
