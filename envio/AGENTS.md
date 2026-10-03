# Envio implementation guidance

Read the current official docs before changing Envio-specific APIs or configuration:
https://docs.envio.dev/llms.txt

This repo pins Envio 3.12.1. Check that an example is compatible with the pinned version; do not upgrade dependencies or rebuild existing indexing infrastructure merely to follow a newer example.

Preserve the fixed AUSD/CherrySettlementRegistry trust anchors, deployment start block, existing derived entities and CRE boundary. HyperSync is the primary indexing data source; the configured RPC is a fallback. Run codegen and typecheck after config/schema changes.

Direct HyperSync UI observations live in `apps/mobile/src/envio/` and use a server-side Laravel adapter in Cherry Money (see `docs/ENVIO_LIVE.md`). Never expose ENVIO_API_TOKEN in Expo or GraphQL clients. Never describe raw event presence as finality or independent business verification. Respect next_block pagination, partial coverage, removed logs and rollback detection. Use viem's ABI decoder rather than inventing a codec.

Test stale data, wrong assets/references, missing receipts, duplicate logs and reorgs. Tests and mock fixtures are not live sponsor evidence.
