# Phase 6 — Settlement Event / Correlation Layer

**Target:** 4 October 2026

## Objective

Add a privacy-safe on-chain correlation layer that links:

- the opaque Cherry Money payment context;
- the confirmed AUSD transfer transaction;
- payer;
- recipient;
- asset;
- amount.

This creates the stable event surface that Envio and Chainlink CRE can consume in later
phases.

## Why this is a correlation layer, not an accounting settlement engine

The AUSD transfer and the correlation event are currently two separate Monad
transactions.

The registry therefore does **not** claim that a correlation event alone proves payment.
It records what the payer claims should be correlated, and later verification must check
the referenced AUSD transaction independently.

That separation is intentional:

- the registry stays tiny and non-custodial;
- it does not need token approvals or custody;
- Cherry Money accounting is not mutated from the mobile app;
- CRE can apply deterministic verification before reconciliation.

## Contract

`contracts/src/CherrySettlementRegistry.sol`

The contract has no owner, upgrade role, withdrawal function or token custody.

It emits:

```solidity
event BusinessPaymentCorrelated(
    bytes32 indexed paymentReference,
    bytes32 indexed paymentTxHash,
    address indexed payer,
    address recipient,
    address asset,
    uint256 amount,
    uint64 recordedAt
);
```

## Privacy

No supplier name, invoice description, email, bank details, Cherry Money company ID or
raw payment-draft ID is written to the chain.

For a Cherry Money payment draft, `paymentReference` is already a deterministic
`bytes32` hash of the business context.

## Replay protection

The registry accepts each `(payer, paymentReference)` pair once.

Before sending AUSD, when a registry is configured, Cherry Pay also checks whether the
reference has already been correlated. A prior correlation blocks another payment from
the standard mobile path.

The contract still enforces the payer-scoped one-reference rule independently.

## Mobile flow

```text
Cherry Money payment draft
        ↓
opaque bytes32 payment reference
        ↓
Mera passkey-approved payment session
        ↓
AUSD transfer simulated
        ↓
AUSD transfer signed and broadcast
        ↓
Monad payment receipt confirmed
        ↓
recipient AUSD balance re-read
        ↓
CherrySettlementRegistry.recordSettlement(...)
        ↓
BusinessPaymentCorrelated event
        ↓
Phase 7 Envio / Phase 8 CRE
```

## Correlation failure behaviour

A confirmed AUSD payment is never presented as failed merely because the second
correlation transaction fails.

The UI distinguishes:

- **AUSD settled + correlation confirmed**
- **AUSD settled + registry not configured**
- **AUSD settled + correlation needs attention**

If correlation needs attention, the UI explicitly warns:

> Do not resend the AUSD payment.

When the same correlation already exists with identical settlement data, retry is
idempotent and treated as confirmed.

A reference already linked to different settlement data fails closed.

## Session behaviour

The correlation transaction is signed using the same in-memory Mera session, before the
payment session usage counter is finalized.

If the session expires after the AUSD transfer confirms but before the correlation
transaction can be signed, the AUSD payment remains confirmed and the correlation is
reported as needing attention.

## Configuration

After deploying the registry to Monad testnet:

```dotenv
EXPO_PUBLIC_SETTLEMENT_REGISTRY_ADDRESS=0x...
```

Leaving this blank keeps Phase 4/5 AUSD payments functional but reports correlation as
not configured.

## Compile verification

CI now compiles the Solidity contract in addition to TypeScript:

```bash
npm run check
```

This runs:

- all workspace TypeScript checks;
- `solcjs` against `CherrySettlementRegistry.sol`.

## Exit criteria

- Solidity registry compiles in CI.
- Contract stores one immutable correlation per payer + payment reference.
- No raw Cherry Money business data is emitted on-chain.
- Mobile payment blocks a reference already correlated in the registry.
- Confirmed AUSD payment is correlated in a second transaction when registry is configured.
- Correlation retry is idempotent when the same data is already recorded.
- Different data for an existing reference fails closed.
- UI separately displays payment and correlation evidence.
- Cherry Money accounting remains unchanged.
- CI passes.

## Next phase

Phase 7 will use Envio HyperIndex to index:

- AUSD transfers;
- `BusinessPaymentCorrelated`;
- derived Settlement entities;
- counterparties and daily settlement metrics.

Phase 8 will use Chainlink CRE to verify the payment transaction and deliver a trusted
settlement callback to Cherry Money reconciliation.
