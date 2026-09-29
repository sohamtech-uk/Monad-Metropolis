# Phase 10 — End-to-End Integration

**Target:** 10 October 2026

## Objective

Connect the individually working sponsor integrations into one judge-ready
business-payment journey without hiding missing infrastructure behind mocks.

The Phase 10 qualifying path is:

```text
Cherry Money payment draft
        ↓
Mera passkey account + scoped session
        ↓
Agora AUSD payment on Monad
        ↓
CherrySettlementRegistry correlation
        ↓
Envio HyperIndex independently verifies transfer
        ↓
Chainlink CRE reads Monad + Envio + Cherry Money
        ↓
deterministic reconciliation evidence
        ↓
Judge Mode confirms every layer belongs to the same payment
```

## What Phase 10 adds

### 1. Chainlink CRE settlement verifier

New workflow:

`cre/settlement-verifier`

The workflow uses official CRE capabilities:

- `CronCapability`
- `EVMClient`
- `HTTPClient`
- `runtime.getSecret()`
- `consensusIdenticalAggregation()`

It connects three systems in one workflow:

1. **Monad blockchain**
   - direct read from `CherrySettlementRegistry` through CRE `EVMClient`;
2. **Envio**
   - latest verified settlement from the public HyperIndex GraphQL API;
3. **Cherry Money**
   - authenticated `/api/webmcp/bootstrap` business context.

The current CRE TypeScript SDK includes Monad Testnet:

- chain ID `10143`
- selector name `monad-testnet`
- selector `2183018362218727504`

The workflow resolves the network by name rather than hard-coding the numeric
selector.

### 2. Deterministic Cherry Money draft matching

CRE recomputes exactly the same payment-reference hash used by the mobile app:

```text
keccak256(
  "cherry-money-payment-draft"
  + ":" + draft ID
  + ":" + payee
  + ":" + currency
  + ":" + amount fixed to 2dp
  + ":" + reference
)
```

The Envio settlement's opaque reference must match one active Cherry Money
payment draft.

### 3. Direct registry cross-check

Envio already verifies the AUSD transfer.

CRE performs an additional direct Monad read of:

`settlementFor(payer, paymentReference)`

and checks:

- payment transaction hash;
- payer;
- recipient;
- asset;
- amount.

This prevents the end-to-end demo from trusting only the indexer or only the
mobile client.

### 4. Source amount rule

For the final deterministic judging path use a **USD/AUSD Cherry Money draft**.

For USD/AUSD:

```text
Cherry Money amount
    ↓ parse at 6 AUSD decimals
must equal
Envio verified settlement amount
```

For GBP/EUR/etc. the workflow returns `needs_attention` because Phase 5
correctly refused to invent an FX rate.

A future production design must persist an approved FX quote before automatic
multi-currency accounting reconciliation.

### 5. Judge Mode in the mobile app

The mobile app now tracks the same payment through the integration layers.

Judge Mode turns steps green only from real state:

1. Monad connected;
2. Cherry Money payment draft selected;
3. Mera account ready;
4. AUSD payment confirmed;
5. settlement correlation confirmed;
6. Envio indexes the same transaction hash;
7. pasted CRE simulation evidence matches the same transaction and all CRE
   checks are true.

This is intentionally strict. No mock completion state exists.

### 6. Envio focus tracking

After an AUSD transfer confirms, its transaction hash is passed directly to
the Envio analytics component.

The dashboard reports either:

- **This payment is indexed and verified ✓**
- **Waiting for Envio to index this payment**

This makes indexing latency visible during the demo.

## CRE reconciliation evidence

A successful CRE output looks like:

```json
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
```

Judge Mode accepts CRE evidence only when:

- status is `ready_for_reconciliation`;
- all five checks are true;
- the evidence payment transaction hash exactly equals the AUSD transaction
  generated in this mobile session.

## Accounting boundary

Phase 10 does **not** mutate Cherry Money accounting.

This is deliberate.

The existing public Cherry Money integration surface has no dedicated
blockchain settlement callback. Reusing an unrelated bank-reconciliation
endpoint would be technically and financially incorrect.

Phase 10 therefore ends at:

**independently verified reconciliation evidence**

rather than falsely claiming:

**invoice automatically posted to the ledger**

A production Cherry Money release can add a reviewed, authenticated,
idempotent settlement callback after the hackathon.

## End-to-end external prerequisites

The code is complete only when the following external setup is available for a
live run:

- valid `metropolis.cherrymoney.co.uk` passkey association;
- Monad testnet MON for sender gas;
- Agora testnet AUSD;
- deployed `CherrySettlementRegistry`;
- deployed Envio HyperIndex with public GraphQL URL;
- short-lived Cherry Money demo bearer token supplied to CRE;
- CRE CLI installed and simulation run.

## Definition of done

Code-level:

- CRE workflow typechecks in repository CI;
- direct Monad registry read is present;
- Envio and Cherry Money HTTP calls are CRE capabilities;
- Cherry Money token is a CRE secret, never committed;
- Judge Mode tracks live payment/correlation/indexing state;
- CRE evidence parser binds proof to the current payment transaction;
- one clean feature branch/PR passes CI.

Live-demo-level:

- one real USD Cherry Money draft is selected;
- Mera signs a real AUSD transfer;
- recipient receives AUSD;
- correlation confirms;
- Envio marks the same transaction verified;
- CRE simulation returns `ready_for_reconciliation`;
- Judge Mode reaches 7/7.

## What comes next

After this Phase 10 hackathon integration is stable, build the productized
**Cherry Pay Global** app.

That app should retain the same Cherry Money business layer but expose a
multi-rail payment router:

```text
Cherry Pay Global
   ├── Open Banking / PISP
   ├── Stellar
   └── Monad / AUSD
```

Stellar is added in the product app as a first-class rail; it is not inserted
into the Agora/Monad qualifying transaction.
