# Architecture

## Repository ownership

### `sohamtech-uk/cherrymoney`

Cherry Money remains the **foundation and business system of record**. It owns:

- companies and users
- suppliers and customers
- purchase and sales invoices
- payment drafts
- approvals and maker/checker controls
- accounting and ledger posting
- reconciliation evidence
- Open Banking / PISP integrations
- Ask Cherry business workflows

### `sohamtech-uk/Monad-Metropolis`

This repository owns the complete Metropolis hackathon implementation:

- React Native / Expo mobile experience
- Mera account and passkey layer
- Monad/AUSD settlement integration
- Metropolis-specific smart contracts
- Chainlink CRE workflows
- Envio indexers and settlement analytics
- hackathon demo and sponsor evidence

The project must **integrate with Cherry Money rather than fork its accounting domain**.

## Integration boundary

```text
Cherry Pay Global mobile app
        │
        ├── Mera account/session layer
        │
        ├── Monad / AUSD
        │
        ├── Envio read model
        │
        └── Cherry Money API adapter
                      │
                      ▼
              Cherry Money backend
              invoices / approvals
              payment drafts
              accounting
              reconciliation
```

The existing Cherry Money WebMCP bridge already provides bounded authenticated
endpoints including:

- `GET /api/webmcp/status`
- `GET /api/webmcp/bootstrap`
- `POST /api/webmcp/payment-drafts`

Those endpoints do **not** execute money movement. That safety boundary is retained.

## Phase 1

Phase 1 contains no private keys and no write transaction path.

It establishes:

1. an Expo/React Native mobile shell;
2. a read-only Monad client;
3. live chain verification;
4. live AUSD metadata and balance reads;
5. a typed Cherry Money API adapter;
6. environment and security boundaries for the later Mera phase.

## Hackathon end-to-end boundary

The current Metropolis implementation deliberately stops at independently verified
reconciliation evidence:

```text
Cherry Money payment draft
  │
  ▼
Mera passkey + scoped session
  │
  ▼
AUSD payment on Monad
  │
  ├──────────────► Envio HyperIndex ──► settlement analytics
  │
  ▼
CherrySettlementRegistry
  │
  ▼
Chainlink CRE
  │
  ▼
deterministic reconciliation evidence
  │
  ▼
Judge Mode proof
```

CRE cross-checks the on-chain registry, Envio's indexed settlement and the source Cherry
Money business draft. The hackathon client does **not** mark a production invoice paid or
post accounting entries. That is intentional: the current Cherry Money integration surface
does not expose a dedicated blockchain-settlement callback.

## Production follow-on

A production release can consume the verified evidence through a reviewed boundary:

```text
verified CRE reconciliation evidence
  │
  ▼
authenticated + idempotent settlement callback
  │
  ▼
Cherry Money invoice / ledger / reconciliation
```

That callback must be designed and reviewed as an accounting mutation surface rather than
reusing an unrelated bank-reconciliation endpoint.

Stellar remains a separate Cherry Pay rail in the production product architecture.
It is not replaced by Monad and is not inserted into the Agora qualifying transaction.
