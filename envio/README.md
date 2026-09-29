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

Indexed event:

`BusinessPaymentCorrelated(...)`

The registry is configured as a wildcard event source so the public indexer can
be generated before the final Phase 6 deployment address is fixed.

**Important:** wildcard discovery does not mean every matching event is trusted.
A correlation is marked `Verified` only when
`CHERRY_SETTLEMENT_REGISTRY_ADDRESS` is configured and equals the emitting
contract address.

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

1. the emitting registry equals the configured trusted registry;
2. the correlated asset equals Agora AUSD;
3. the referenced transaction has an indexed AUSD `Transfer`;
4. transfer payer matches registry payer;
5. transfer recipient matches registry recipient;
6. transfer amount matches registry amount.

Failures remain queryable with a diagnostic status instead of disappearing.

## Local validation

```bash
cp envio/.env.example envio/.env
# fill ENVIO_API_TOKEN and CHERRY_SETTLEMENT_REGISTRY_ADDRESS

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

For the bounty submission, deploy this indexer to Envio Cloud and configure:

- `ENVIO_API_TOKEN`
- `CHERRY_SETTLEMENT_REGISTRY_ADDRESS`

Capture the public GraphQL endpoint for the Phase 8 Cherry Analytics consumer.

## Bounty evidence

The public repository contains the required:

- `envio/config.yaml`
- `envio/schema.graphql`
- TypeScript event handlers
- non-trivial derived/aggregate entities
- GraphQL consumer queries

Phase 8 will connect the generated GraphQL API to the visible Cherry Analytics
settlement dashboard.
