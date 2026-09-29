# Chainlink CRE — Cherry Settlement Verifier

This workflow supplies the missing orchestration layer for the Metropolis
end-to-end demo.

It is based on the official Chainlink CRE TypeScript patterns for:

- CronCapability
- EVMClient
- HTTPClient
- runtime.getSecret()
- consensusIdenticalAggregation()

## What the workflow verifies

Every run:

1. queries the public Envio GraphQL API for the latest verified Monad settlement;
2. reads the Phase 6 CherrySettlementRegistry directly on Monad testnet using CRE EVMClient;
3. verifies that Envio and the on-chain registry agree on:
   - payment transaction hash;
   - payer;
   - recipient;
   - asset;
   - amount;
4. retrieves a short-lived Cherry Money API bearer token through CRE secrets;
5. loads Cherry Money's existing /api/webmcp/bootstrap endpoint;
6. recomputes the exact Cherry Money payment-draft hash used by the mobile app;
7. matches the settlement to the source business draft;
8. for USD/AUSD drafts, verifies source amount == settled AUSD amount;
9. returns deterministic reconciliation evidence.

## Why USD is used for the final judging path

For GBP/EUR/etc. Cherry Money drafts, Phase 5 deliberately does not invent an
FX rate.

The workflow therefore returns needs_attention until a future production design
persists an approved FX quote.

For a clean hackathon end-to-end demo, use a fictional/test Cherry Money company
or draft denominated in USD so the amount relationship is deterministic.

## Monad support

The current official Chainlink CRE TypeScript SDK includes Monad Testnet:

- chain ID: 10143
- chain selector name: monad-testnet
- CRE selector: 2183018362218727504

The workflow uses getNetwork() rather than hard-coding the numeric selector.

## Configure

Update config.staging.json:

- registryAddress: deployed CherrySettlementRegistry
- envioGraphqlEndpoint: public Envio Cloud GraphQL endpoint

Set the secret only in the environment / CRE secrets system:

~~~bash
export SECRET_CHERRY_MONEY_BEARER_TOKEN="..."
~~~

Do not commit the token.

## Typecheck

From repository root:

~~~bash
npm install
npm run typecheck -w @cherry-metropolis/cre-settlement-verifier
~~~

## Simulate

Once registry + Envio + Cherry Money demo token are configured:

~~~bash
cre workflow simulate cre/settlement-verifier \
  --target staging-settings \
  --non-interactive
~~~

A successful output for the final USD/AUSD demo should include:

~~~json
{
  "status": "ready_for_reconciliation",
  "checks": {
    "envioVerified": true,
    "registryStateMatches": true,
    "trustedAssetMatches": true,
    "cherryDraftMatched": true,
    "sourceAmountMatchesAusdWhenComparable": true
  }
}
~~~

## Accounting boundary

This workflow intentionally does not mark Cherry Money accounting records paid.

The existing Cherry Money public integration boundary has no dedicated
blockchain-settlement callback. Mutating accounting through an unrelated
bank-reconciliation endpoint would be incorrect.

For the hackathon, CRE produces independently verified reconciliation evidence.
A later production change can add a reviewed, idempotent Cherry Money settlement
callback that consumes this evidence.
