# Envio Live: observation → structured evidence → business verification

Built on top of `e85d405` without replacing the Mera/AUSD supplier flow or Aurora route.

## What changed

- **Envio Live tab**: start/pause raw HyperSync observations, select Monad Testnet AUSD, Monad mainnet USDC or Base USDC, filter by wallet, and replay a bounded block range.
- **Supplier payment panel**: observe the exact payment and correlation events with payer, recipient, trusted asset, amount, reference and successful-receipt checks. It uses the existing transfer result and never signs or sends money.
- **Exact HyperIndex matching**: look up `Settlement` by `paymentTxHash` instead of searching only the dashboard's ten latest rows. The result must match the payment reference, payer, recipient, asset, amount and fixed registry before the existing final-verification navigation can advance. The HyperSync token is not required for this GraphQL lookup.
- **HyperSync-first indexer**: preserves the existing start block and durable schema; explicitly marks Monad RPC as fallback rather than historical sync.
- **Evidence view**: source, chain, archive height, block-range coverage, acquisition timestamp, measured query round trip, log identities and exact-payment status. Amounts remain bigint/decimal strings throughout.

## Architecture

```
                        Monad payment
                         /           \
              HyperSync JSON API    HyperIndex (HyperSync primary)
                       |                  |
             Cherry Money proxy     durable entities / GraphQL
                       |                  |
               provisional live view     exact payment match
                         \               /
                   existing CRE business verification
```

Do not call HyperSync and HyperIndex two independent consensus checks: they share a data source. Do not turn a raw transfer or a registry event alone into `ready_for_reconciliation`.

## Secrets and deployment

Companion backend: `sohamtech-uk/cherrymoney` PR #384.

Configure the backend **runtime** with `ENVIO_API_TOKEN` (an Envio HyperSync token, not the Aurora key), `ENVIO_HYPERSYNC_ENABLED=true`, and approved origins. No key goes into this repo's public build variables. The backend uses Envio's documented JSON `/query` API directly from Laravel, so it does not add a new Node service to Hostinger or require a new database.

Optional public build setting (otherwise defaults to the production Cherry Money endpoint):

```env
EXPO_PUBLIC_ENVIO_HYPERSYNC_URL=https://cherrymoney.co.uk/api/envio/hypersync
```

For isolated testing, point that setting at the deployed testing backend instead. The existing GraphQL URL remains `EXPO_PUBLIC_ENVIO_GRAPHQL_URL`. Redeploy the backend and rebuild/publish the app/web artifact through the existing release process. This PR does **not** itself deploy either runtime, install a token, or submit a payment.

Deploy `envio/` to the existing Envio Cloud project to apply the explicit fallback setting. Local indexer runs require `ENVIO_API_TOKEN`; hosted Envio Cloud has managed access. No full-history reset is required.

## Live-data correctness

Polling is read-only, sequential and cancellable (six seconds between completed reads, increasing to thirty seconds on errors). It stops when the panel is inactive or the native app backgrounds. The server fixes a maximum 128-block window, three query pages, selected event fields and whitelisted chains/contracts. Mainnet observation requires a wallet filter. A partial response exposes `nextBlock` and remains visibly partial; replay from that cursor, never skip to the head. Stale/unavailable data is never labelled LIVE.

Each displayed snapshot replaces the previous one. Block hashes and parent links are checked, duplicates are removed by chain/block hash/transaction/log identity, removed logs are excluded, and changed overlapping block hashes produce a reorg warning. This is a provisional observation window, not a general persistent/finalised indexer. Deep reorg history, durable rollback and aggregate corrections remain HyperIndex's job.

The supplier panel only labels raw matches on complete, fresh snapshots. Exact HyperIndex matching is a separate effect, so missing HyperSync credentials cannot force users to pay again or bypass existing CRE checks. No accounting records, balances or reward claims are updated here.

## Tests

```sh
npx --no-install tsx --test tests/envio-live.test.ts
npm run check
npm run web:build
```

CI also exercises the Envio tab, pause/error states and a 390px viewport with all network access blocked. The browser must not fabricate a LIVE status when its provider is unavailable. Unit fixtures cover exact matching, mismatches, event decoding, duplicate/removed logs, failed receipts, stale/partial snapshots, big integers, changed block hashes and GraphQL errors. These are tests, not live payment evidence.

## Demo sequence

1. Open **Envio Live**, choose Monad Testnet, apply a public wallet filter and start HyperSync. Point out the actual archive height, scan window, timestamp and measured query duration. Do not claim a guaranteed latency or RPC speedup.
2. Perform the normal approved AUSD supplier payment in the existing payment flow. Its own panel watches the receipt block and compares the exact transfer and correlation reference.
3. Show the independent *stage* (not independent consensus source) in HyperIndex: the exact transaction and business fields match. Keep the daily metrics/mismatch analytics as the aggregate product view.
4. Continue to the unchanged final CRE business-verification step.
5. Open the evidence view or replay the known block for judges. For Aurora, Base and Monad USDC observations are separate chain legs; only an Aurora execution reference can link them. A coincidentally similar amount is not a cross-chain proof.

## Official references consulted

- https://docs.envio.dev/docs/HyperSync/hypersync-curl-examples
- https://docs.envio.dev/docs/HyperSync/hypersync-query
- https://docs.envio.dev/docs/HyperSync/api-tokens
- https://docs.envio.dev/docs/HyperIndex/hypersync
- https://docs.envio.dev/docs/HyperIndex/configuration-file
- https://envio.dev/chains/monad-testnet
