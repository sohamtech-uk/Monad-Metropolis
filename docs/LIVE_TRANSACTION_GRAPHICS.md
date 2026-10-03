# Real-data transaction graphics

## Where it appears

In the redesigned supplier flow, the live transaction card appears automatically when Monad RPC returns the actual AUSD transfer hash. It no longer waits for both the payment receipt and the settlement-registry transaction to complete. The screen scrolls to the live card once for that hash, without a motion animation.

This automatic binding currently covers the Monad Testnet AUSD supplier flow. Aurora mainnet USDC remains its separate flow; the existing general Envio workspace still supports the configured Base and Monad mainnet wallet-filtered observations. Do not claim automatic Aurora cross-chain correlation from this change.

## Data and visual semantics

- Broadcast: actual transaction hash and approved payment scope from the existing Mera adapter.
- RPC receipt: actual block number/hash and success/revert state, published immediately when returned.
- HyperSync: validated snapshots from Cherry Money's existing server-side Envio endpoint.
- Transfer match: exact hash, trusted asset, payer, recipient, amount, successful receipt, and matching RPC block hash/number when known.
- Registry match: the same transaction hash and business reference, not a similar amount.
- HyperIndex: the existing exact settlement query; no assumption that the latest row is this payment.

The payer-to-recipient line reflects a binary matching-observation state, not an estimated percentage. The block chart uses returned block numbers and matching event counts, including genuine zero counts. Highlighting identifies this payment's events. It is NOT network TPS or whole-chain volume. The query chart uses server-reported milliseconds from each new snapshot, deduplicates repeated cached timestamps, and retains only the latest 16 samples. Query timing is not network finality or end-to-end payment speed.

No random values, generated transaction counts, smooth artificial balance increases, fake locations, hard-coded speed comparisons, completion percentages or timer-driven success states are used. The only one-second ticker updates the age label. Missing data stays missing.

## Observation lifecycle

Reads start immediately from the broadcast hash and sender filter. HyperSync contains mined blocks/logs, not pending mempool messages. The UI can legitimately show a submitted hash while waiting for HyperSync to observe its block.

Before the receipt is known, a wallet-filtered tip window is queried. Once the transfer is located or its RPC receipt arrives, the observer pins a bounded window around that block so a slow confirmation cannot make it disappear from a moving tip scan. A registry event whose known receipt lies outside that window gets a separate bounded read; the two scan windows are never presented as continuous coverage.

Polling is six seconds after a read completes, not a WebSocket or a sub-second promise. Errors back off up to thirty seconds. Browser-tab visibility and native foreground state pause reads. The existing server token, allowed networks/contracts, scan bounds, budgets and admin settings remain authoritative. No API token is sent to the app.

Stale, partial, unavailable and changed-fork states withhold positive observation badges. Old charts remain explicitly labelled as the last read. HyperIndex runs separately, and its result expires after twenty seconds without a successful recheck. Neither a green HyperSync observation nor an indexed match is a CRE attestation, a finality guarantee or an accounting posting.

Read observers cannot submit, retry or cancel a payment. Exceptions from progress subscribers are isolated from the existing broadcast/receipt path. Only public metadata is retained, with a bounded session-memory store. This is not durable restart-safe payment recovery.

## Deployment / real-data acceptance

This feature is in the customer-experience PR, not automatically deployed. Release the frontend plus the existing Cherry Money HyperSync backend/admin PR, apply its migration, save a valid Envio token in Admin while disabled, test the saved connection, and enable it with the intended origin. Use an isolated test backend URL in test builds when appropriate.

Then an authorised human should perform one small testnet supplier transaction. Verify: the displayed hash equals the actual submitted transaction; HyperSync matches that hash and fields; the highlighted block opens to the same block; block/query numbers come from the raw evidence; and disconnected/paused/provider-error states do not claim success. No real-money transaction is required for this acceptance test.

## Tests and screenshots

`tests/transaction-live.test.ts` tests field/hash/receipt binding, stale/future/partial rejection, reverted receipts, event deduplication, separate registry windows, real-zero graph values, cached sample handling, bounded progress state and subscriber isolation. A source-order regression check verifies publication occurs after broadcast and before the receipt wait; this is not a live signer test.

`tests/live-graphics.preview.tsx` and `scripts/live_graphics_browser.py` exercise the actual component with explicit offline provider fixtures. They validate auto-polling, a matched observation before an RPC receipt, block selection, pause/outage behaviour and 320px/390px layouts. The fixture entry is built under `build/live-graphics`, never the shipped Expo directory. Every fixture screenshot has a permanent banner saying it is NOT a live payment. Do not use those screenshots as live sponsor evidence.

Official query semantics: https://docs.envio.dev/docs/HyperSync/hypersync-query
