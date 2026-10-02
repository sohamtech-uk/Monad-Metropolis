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
packages/envio-client/          typed read-only Envio GraphQL client
contracts/                      Monad settlement-correlation contract
cre/                            Chainlink CRE settlement verifier
envio/                          Envio HyperIndex settlement intelligence
docs/                           architecture, roadmap and bounty evidence
```

## Development

Feature work is developed on branches and merged into `main` through pull requests.

Current branch: **`feat/phase-10-e2e-integration`**

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

Phase 7 added **Envio HyperIndex settlement intelligence**. It indexes Agora AUSD
transfers and Phase 6 correlations on Monad Testnet, independently verifies the
referenced transfer, preserves mismatch diagnostics, and derives counterparty,
route and daily settlement analytics.

Phase 8 added **Cherry Settlement Analytics** in the mobile app. It consumes the
public Envio GraphQL read model directly and shows verified AUSD volume,
settlement count, verification rate, exceptions, recent volume and transaction
evidence without falling back to mocked figures.

Phase 9 added **Mera One Passkey, Many Keys** as a genuinely non-wallet feature.
The same Mera passkey can evaluate isolated custom PRF namespaces for encrypted
Ask Cherry memory and supplier-private-note state.

Phase 10 adds the **end-to-end judging path**. Chainlink CRE now orchestrates
Envio, a direct Monad registry read, and authenticated Cherry Money business
context to produce deterministic reconciliation evidence. The mobile Judge Mode
tracks the same payment through draft selection, Mera, AUSD settlement,
correlation, Envio indexing and CRE verification.

See:

- `docs/ARCHITECTURE.md`
- `docs/PHASE_1.md`
- `docs/PHASE_2.md`
- `docs/PHASE_3.md`
- `docs/PHASE_4.md`
- `docs/PHASE_5.md`
- `docs/PHASE_6.md`
- `docs/PHASE_7.md`
- `docs/PHASE_8.md`
- `docs/PHASE_9.md`
- `docs/PHASE_10.md`
- `docs/JUDGE_DEMO_RUNBOOK.md`
- `docs/MERA_MANY_KEYS_RUNBOOK.md`
- `docs/ENVIO_ANALYTICS_RUNBOOK.md`
- `docs/SETTLEMENT_CORRELATION.md`
- `docs/CHERRY_MONEY_BRIDGE.md`
- `docs/AGORA_TESTNET.md`
- `docs/PASSKEY_DOMAIN.md`
- `docs/ROADMAP.md`
- `docs/AURORA_INTENTS.md`
- `docs/BOUNTY_TARGETS.md`
