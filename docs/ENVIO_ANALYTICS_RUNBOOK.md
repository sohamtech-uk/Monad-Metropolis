# Envio Settlement Analytics Runbook

## 1. Deploy Phase 6 registry

Deploy `CherrySettlementRegistry` to Monad testnet and record the address.

The deployed registry is committed directly in `envio/config.yaml` as:

```text
0xdcB418C6e719C40c8e1F9B446cD850330219EEFf
```

No paid Envio custom environment variable is required for this public address.

## 2. Deploy the Phase 7 indexer

From `envio/`:

```bash
cp .env.example .env
# For local development only, fill ENVIO_API_TOKEN if your HyperSync setup requires it.

npm run codegen
npm run typecheck
```

Deploy the project to Envio Cloud.

## 3. Obtain the public GraphQL endpoint

The mobile app needs the **read-only public GraphQL endpoint**, not an Envio
management/API token.

Configure the mobile build:

```dotenv
EXPO_PUBLIC_ENVIO_GRAPHQL_URL=https://YOUR_PUBLIC_ENVIO_GRAPHQL_ENDPOINT
```

Never place `ENVIO_API_TOKEN`, database credentials or admin secrets in an
`EXPO_PUBLIC_*` value.

## 4. Produce real indexed data

Run at least one complete Phase 6 testnet payment:

1. select/create a Cherry Money payment draft;
2. recover/create the Mera account;
3. fund MON;
4. fund AUSD;
5. send AUSD;
6. confirm the AUSD transaction;
7. confirm the settlement-correlation transaction.

Wait for Envio to index both transactions.

## 5. Verify GraphQL directly

Use `envio/queries.graphql` and check:

- `Settlement` contains the verified payment;
- `DailySettlementMetric` increments verified volume/count;
- `SettlementCounterparty` contains sender/recipient activity;
- `SettlementRoute` contains the payer→recipient route.

## 6. Verify the mobile dashboard

Open Cherry Pay Global.

The **Cherry Settlement Analytics** card should show:

- verified volume;
- verified settlements;
- exceptions;
- verification rate;
- 7-day volume;
- latest settlement;
- payment and correlation explorer links.

The dashboard refreshes every 15 seconds and can be manually refreshed.

## 7. Exception demo

For Envio judging, it can be useful to show that invalid correlations do not
silently become settlements.

Use a controlled test-only scenario to generate a correlation that does not
match an AUSD transfer, then show it under **Verification exceptions**.

Do not create misleading production accounting entries for this demonstration.

## 8. Bounty evidence checklist

Capture:

- Envio Cloud deployment URL;
- public GraphQL endpoint;
- `config.yaml`;
- `schema.graphql`;
- handlers;
- GraphQL query output;
- dashboard showing live data;
- Monad payment explorer transaction;
- Monad correlation explorer transaction;
- short end-to-end video.

The strongest Envio demo sequence is:

```text
AUSD payment confirms
→ correlation confirms
→ Envio indexes both
→ Settlement becomes Verified
→ dashboard refreshes
→ volume/count/history visibly update
```
