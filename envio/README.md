# Cherry Settlement Intelligence — Envio HyperIndex

This indexer is the Phase 7 on-chain read model for Cherry Money's Monad
Metropolis project.

It uses **Envio HyperIndex** on **Monad Testnet (chain ID 10143)**. Monad
Testnet is a first-class HyperSync chain in the current HyperIndex codebase.

## Indexed sources

### Agora AUSD

Fixed testnet contract:

`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`

Indexed event:

`Transfer(address indexed from, address indexed to, uint256 value)`

### CherrySettlementRegistry

Fixed Monad Testnet deployment:

`0xdcB418C6e719C40c8e1F9B446cD850330219EEFf`

Indexed event:

`BusinessPaymentCorrelated(...)`

The registry address is committed directly in `envio/config.yaml`. This is
public blockchain metadata, not a secret, and keeps the free Envio Development
deployment independent of paid custom environment variables.

## Derived entities

The indexer does more than copy ERC-20 events.

It derives:

- `AusdTransfer` — live AUSD transfers;
- `SettlementCorrelation` — every observed correlation plus verification outcome;
- `Settlement` — only independently matched AUSD settlements;
- `SettlementCounterparty` — sent/received counts and volume;
- `SettlementRoute` — payer→recipient aggregate volume;
- `DailySettlementMetric` — correlation health, verified count and volume.

## Verification logic

A registry correlation is only converted into a verified `Settlement` when:

1. the event comes from the committed CherrySettlementRegistry address;
2. the correlated asset equals Agora AUSD;
3. the referenced transaction has an indexed AUSD `Transfer`;
4. transfer payer matches registry payer;
5. transfer recipient matches registry recipient;
6. transfer amount matches registry amount.

Failures remain queryable with a diagnostic status instead of disappearing.

## Local validation

```bash
cp envio/.env.example envio/.env
# fill ENVIO_API_TOKEN only when your local HyperSync setup requires it

npm install
npm run typecheck -w @cherry-metropolis/envio-indexer
```

To run the local HyperIndex stack (Docker required):

```bash
npm run dev -w @cherry-metropolis/envio-indexer
```

GraphQL Playground is normally available from the local Envio stack after it
starts. Example queries are in `envio/queries.graphql`.

## Envio Cloud

For the bounty submission, deploy the `envio/` project to Envio Cloud from
the `main` branch. No custom environment variable is required for the registry
address on the free Development plan.

Capture the public GraphQL endpoint for the Phase 8 Cherry Analytics consumer.

## Bounty evidence

The public repository contains the required:

- `envio/config.yaml`
- `envio/schema.graphql`
- TypeScript event handlers
- non-trivial derived/aggregate entities
- GraphQL consumer queries

Phase 8 connects the generated GraphQL API to the visible Cherry Analytics
settlement dashboard.
