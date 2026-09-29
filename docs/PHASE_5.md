# Phase 5 — Cherry Money Payment Draft Integration

**Target:** 3 October 2026

## Objective

Bind the Phase 4 AUSD payment to a real Cherry Money business payment record while
keeping all Metropolis-specific development in this repository.

Cherry Money remains the upstream accounting/business system of record. Monad
Metropolis remains the passkey and settlement application.

## Repository boundary

All Phase 5 implementation code remains in `sohamtech-uk/Monad-Metropolis`. The Cherry Money repository is consumed only through its existing authenticated APIs; no hackathon-specific code is added there.

## Existing Cherry Money boundary

The production Cherry Money WebMCP bridge already exposes:

- `GET /api/webmcp/status`
- `GET /api/webmcp/bootstrap`
- `POST /api/webmcp/payment-drafts`

The payment-draft endpoint is intentionally safe:

- it creates a **draft-only** business instruction;
- it returns `moneyMoved: false`;
- it returns `paymentExecuted: false`;
- it requires human approval for any future execution;
- Cherry Money exposes no WebMCP payment-execution endpoint.

This phase consumes that existing boundary without modifying the Cherry Money repository.

## Important current limitation

The current WebMCP bootstrap exposes sales invoices and generic payment drafts. It does
**not** expose purchase-invoice / AP bill rows through the authenticated bridge.

Because Metropolis development is intentionally isolated in this repository, Phase 5
binds to a real Cherry Money **payment draft** rather than adding new AP APIs to the
production repository.

That still satisfies the Phase 5 integration goal:

> A real Cherry Money payment draft maps to the Monad/AUSD payment context.

A later reviewed Cherry Money API can expose approved purchase invoices if we decide the
final demo needs direct bill selection.

## Mobile flow

1. User opens the Cherry Money business-context card.
2. User provides a temporary Cherry Money Sanctum bearer token.
3. The app calls `/api/webmcp/bootstrap`.
4. Existing Cherry Money payment drafts are displayed.
5. User selects a draft, or creates one through the existing safe draft-only endpoint.
6. The selected draft becomes the business context for the Mera payment session.
7. The draft ID and business fields are hashed into a deterministic payment-context
   reference.
8. The passkey ceremony opens a Mera session bound to that reference.
9. The AUSD transfer must present the same reference or the session rejects it.
10. After a successful Monad testnet transfer, the UI shows both:
    - the Cherry Money draft identity; and
    - the Monad transaction evidence.

## Payment-context binding

The context hash is derived from:

```text
cherry-money-payment-draft
+ draft ID
+ payee
+ source currency
+ source amount
+ business reference
```

The resulting `bytes32` reference is included in the scoped-session policy.

Changing to another Cherry Money draft ends/replaces the active session and requires a
new passkey ceremony.

## Currency handling

Cherry Money payment drafts are denominated in the company's accounting currency.

The app **does not assume** that GBP/EUR/etc. equals AUSD.

Rules:

- If the Cherry Money draft is denominated in `USD` or `AUSD`, the numeric source
  amount may prefill the AUSD settlement amount.
- For any other source currency, the AUSD settlement amount is deliberately left blank.
- The user must enter a separately quoted AUSD amount.
- No FX rate is invented or silently applied.

A proper FX quote/routing layer is outside this phase.

## Authentication handling

The Cherry Money bearer token is:

- supplied at runtime;
- held only in React state / memory;
- not written to disk;
- not committed;
- not placed in `EXPO_PUBLIC_*` environment variables.

Disconnecting clears the token and business context from the app state.

## Security boundary

This phase does **not** tell Cherry Money that the invoice/draft is paid.

After Monad settlement:

- the Cherry Money draft remains `draft_only`;
- Cherry Money accounting is unchanged;
- no ledger entry is posted;
- no reconciliation is performed.

That is intentional.

The next settlement/reconciliation phases will add an authenticated, verified callback
workflow rather than falsely marking accounting records paid from the mobile app.

## Exit criteria

- Cherry Money workspace loads through the existing authenticated bridge.
- Existing real payment drafts can be selected.
- A draft can be created through the safe draft-only endpoint.
- The token is never persisted.
- Selected draft details appear in the payment UI.
- Draft identity is cryptographically bound to the Mera session reference.
- Changing the draft invalidates the previous session context.
- Non-USD drafts do not silently map 1:1 to AUSD.
- A successful AUSD transfer shows both Cherry Money draft evidence and Monad
  transaction evidence.
- TypeScript CI passes.

## Next phase

Phase 6 creates the privacy-safe settlement event / correlation layer so a confirmed
on-chain payment can be verified and later handed to Cherry Money reconciliation.
