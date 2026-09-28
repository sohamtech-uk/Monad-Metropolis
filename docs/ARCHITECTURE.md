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

## Later components

```text
Mera
  │
  ▼
AUSD payment on Monad
  │
  ├──────────────► Envio HyperIndex ──► settlement analytics
  │
  ▼
Chainlink CRE
  │
  ▼
Cherry Money settlement endpoint
  │
  ▼
invoice + ledger + reconciliation
```

Stellar remains a separate Cherry Pay rail in the production product architecture.
It is not replaced by Monad and is not inserted into the Agora qualifying transaction.
