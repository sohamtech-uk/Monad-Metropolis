# Phase 8 — Cherry Settlement Analytics

**Target:** 8 October 2026

## Objective

Consume the Phase 7 Envio HyperIndex GraphQL API directly in Cherry Pay Global
and make live on-chain settlement intelligence visible to the user.

This phase completes the visible Envio bounty flow:

```text
Monad events
   ↓
Envio HyperIndex
   ↓
verified Settlement entities
   ↓
public GraphQL endpoint
   ↓
Cherry Settlement Analytics
```

## Product principle

Settlement analytics must come from **Envio**, not from:

- Cherry Money's accounting database;
- the mobile app's local payment state;
- hard-coded demo figures;
- a mocked analytics response.

If the Envio endpoint is not configured, the UI explicitly says the dashboard
is awaiting deployment. It does not invent data.

## Envio GraphQL client

Phase 8 adds:

`packages/envio-client`

The client is deliberately small and read-only.

It:

- accepts a public GraphQL endpoint;
- requires HTTPS outside localhost development;
- sends no Envio API token from the mobile app;
- parses BigInt values without floating-point loss;
- fails closed on malformed settlement/address/hash data;
- applies a 12-second request timeout;
- exposes one typed dashboard query.

## Dashboard query

The client requests:

- latest 30 `DailySettlementMetric` rows;
- latest 10 verified `Settlement` rows;
- latest 10 unverified `SettlementCorrelation` rows.

The mobile app derives the 30-day summary from those indexed entities.

## Visible metrics

The dashboard shows:

### Settlement health

- verified AUSD volume;
- verified settlement count;
- correlation exception count;
- verification rate.

### Recent volume

A seven-day compact volume chart based directly on
`DailySettlementMetric.verifiedVolume`.

### Latest verified settlements

Each settlement shows:

- amount;
- payer;
- recipient;
- opaque Cherry payment reference;
- settlement time;
- payment transaction explorer link;
- correlation transaction explorer link.

### Verification exceptions

The dashboard surfaces the latest Envio mismatch diagnostics, including:

- registry mismatch;
- asset mismatch;
- transfer missing;
- payer mismatch;
- recipient mismatch;
- amount mismatch.

This makes the Envio data useful operationally rather than simply decorative.

## Refresh behaviour

The dashboard:

- loads immediately when mounted;
- refreshes automatically every 15 seconds;
- supports manual refresh;
- shows the last successful fetch time.

The refresh uses the same public Envio read model and does not touch Cherry
Money accounting state.

## Mobile configuration

After the Phase 7 indexer is deployed to Envio Cloud, configure:

```dotenv
EXPO_PUBLIC_ENVIO_GRAPHQL_URL=https://...
```

This must be a **public read-only GraphQL endpoint**.

Do not expose:

```text
ENVIO_API_TOKEN
GitHub tokens
database credentials
admin GraphQL secrets
```

through Expo public configuration.

## Financial-data correctness

AUSD uses 6 decimals in this demo. The dashboard retains all amounts as
`bigint` until display formatting.

No settlement volume is calculated with JavaScript floating-point arithmetic.

The only conversion to `number` is for bounded visual percentages and small
display/chart calculations.

## Definition of done

- `packages/envio-client` typechecks in CI.
- GraphQL response parsing fails closed on malformed data.
- No private Envio credential is embedded in the mobile app.
- Dashboard visibly identifies Envio HyperIndex as its source.
- Latest verified settlements link to Monad explorer evidence.
- Daily settlement volume is displayed.
- Verification exceptions are displayed.
- Missing Envio endpoint produces a truthful setup state, not mock data.
- Automatic and manual refresh work.
- CI passes.

## Next phase

Phase 9 implements the Mera **One Passkey, Many Keys** non-wallet capability:
a passkey-derived, namespaced encryption key that can reconstruct and decrypt
private Cherry application state on a fresh device/profile without storing the
secret on disk or server.
