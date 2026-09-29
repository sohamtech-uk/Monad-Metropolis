# Phase 7 — Envio HyperIndex Settlement Intelligence

**Target:** 7 October 2026

## Objective

Turn the Phase 6 Monad settlement/correlation events into a live, queryable
business-payment read model using Envio HyperIndex and HyperSync.

This is intentionally more substantial than a single ERC-20 event indexer.

## Data flow

```text
Agora AUSD Transfer
        │
        ├─────────────┐
        │             │
        ▼             ▼
AusdTransfer     CherrySettlementRegistry
                      │
                      ▼
             BusinessPaymentCorrelated
                      │
                      ▼
                 Envio HyperIndex
                      │
          ┌───────────┼────────────┐
          ▼           ▼            ▼
  verification   counterparties  daily metrics
          │
          ▼
      Settlement
          │
          ▼
   GraphQL / Phase 8 UI
```

## Why Envio is core to the product

The application should not trust a mobile callback saying "payment succeeded."

Envio independently reconstructs the blockchain read model from Monad events.

A correlation is promoted to a verified settlement only when the indexed AUSD
transfer matches the correlation's:

- payer;
- recipient;
- asset;
- amount;
- transaction hash;

and the event was emitted by the configured trusted registry.

## HyperSync

Monad Testnet (`10143`) is present as a first-class `HypersyncChain` in
Envio HyperIndex.

The indexer therefore uses HyperSync by default for historical and live event
retrieval rather than manually polling block-by-block RPC endpoints.

## Schema depth

Phase 7 includes six entities:

1. `AusdTransfer`
2. `SettlementCorrelation`
3. `Settlement`
4. `SettlementCounterparty`
5. `SettlementRoute`
6. `DailySettlementMetric`

The latter three are derived aggregates, making Envio responsible for real
business analytics rather than merely mirroring logs.

## Verification statuses

Correlations remain observable even when they do not verify:

- `Verified`
- `RegistryUnconfigured`
- `RegistryMismatch`
- `AssetMismatch`
- `TransferMissing`
- `PayerMismatch`
- `RecipientMismatch`
- `AmountMismatch`

This gives the later dashboard and CRE workflow explicit exception data.

## Wildcard registry indexing

The Phase 6 registry address may change between local/test deployments.

Envio therefore wildcard-indexes the unique
`BusinessPaymentCorrelated` event signature. The handler does **not** trust
wildcard events automatically.

`CHERRY_SETTLEMENT_REGISTRY_ADDRESS` is the trust anchor. Only events from
that exact address become verified settlements.

## CI

The Envio workspace is included in the monorepo CI.

Its typecheck script runs:

```bash
envio codegen
tsc --noEmit
```

This catches invalid:

- `config.yaml`;
- `schema.graphql`;
- contract/event names;
- handler fields;
- entity writes;
- TypeScript logic.

## Deployment requirements

Before the Envio Cloud deployment:

1. Deploy `CherrySettlementRegistry` to Monad testnet.
2. Set `CHERRY_SETTLEMENT_REGISTRY_ADDRESS` to that address.
3. Create a free Envio API token.
4. Deploy the `envio/` project to Envio Cloud.
5. Capture its public GraphQL endpoint.
6. Run at least one real Phase 6 AUSD payment + correlation.
7. Verify the GraphQL API returns the settlement and derived metrics.

## Exit criteria

- Envio codegen and TypeScript compile in CI.
- AUSD transfers are indexed from the real Agora contract.
- Phase 6 correlations are indexed.
- Trusted-registry validation is enforced.
- AUSD payment transaction is independently matched.
- Mismatches are retained with explicit diagnostics.
- Verified settlements create counterparty, route and daily aggregates.
- GraphQL examples are provided.
- Envio Cloud deployment path is documented.

## Next phase

Phase 8 consumes the Envio GraphQL API inside Cherry Analytics and adds the
visible settlement dashboard required for the Envio bounty end-to-end demo.
