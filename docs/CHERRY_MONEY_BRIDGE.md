# Cherry Money Bridge Runbook

## Purpose

Connect Monad Metropolis to the existing Cherry Money business workspace without copying
or changing Cherry Money's accounting domain.

## Upstream system

Repository:

`sohamtech-uk/cherrymoney`

Cherry Money owns:

- companies and users;
- invoices and suppliers;
- payment drafts;
- approvals;
- accounting and ledger;
- reconciliation.

Monad Metropolis owns:

- Mera passkey account;
- Monad/AUSD settlement;
- hackathon mobile UX;
- later CRE and Envio integrations.

## API base URL

Default:

`https://cherrymoney.co.uk`

Override for a test environment with:

```dotenv
EXPO_PUBLIC_CHERRY_MONEY_API_BASE_URL=https://test.cherrymoney.co.uk
```

Do not put a bearer token in an `EXPO_PUBLIC_*` variable.

## Authentication

The bridge endpoints require Cherry Money Sanctum authentication.

### Browser / hosted demo

The web app uses Cherry Money's existing secure WebMCP Google OAuth bridge:

1. the user taps **Continue with Google**;
2. Cherry Money starts the server-side Google OAuth flow at
   `/webmcp/google/redirect` with the exact browser origin;
3. after Google returns to Cherry Money, the server creates a short-lived,
   single-use, origin-bound completion code;
4. Cherry redirects back to the Metropolis origin with that code in the URL
   fragment;
5. the app removes the fragment immediately and exchanges the code at
   `POST /api/webmcp/google/exchange`;
6. the returned Sanctum token remains only in React/page memory;
7. `GET /api/webmcp/bootstrap` loads the company-scoped workspace.

No Google client secret, Cherry Money password or Sanctum token is stored in
browser storage or an `EXPO_PUBLIC_*` variable. Disconnect makes a best-effort
call to Cherry Money logout and always clears the local in-memory token.

The Google account must already belong to an active Cherry Money business user.
The upstream WebMCP Google flow currently rejects users that require Cherry
Money two-factor authentication, so the public hackathon flow should use the
dedicated demo user intended for this integration.

### Native / development fallback

A fresh temporary Sanctum bearer token may still be pasted into the in-app
field. The token exists in memory only. An expired/invalid token returns 401;
the UI now tells the tester to sign in with Google or paste a new token rather
than treating that as an origin or Monad error.

The existing Cherry Money API password login endpoint remains:

`POST /api/login`

but the Metropolis app does not add a second Cherry Money password form. Mera
remains the visible account/signing experience for the payment itself.

## Load workspace

The app calls:

`GET /api/webmcp/bootstrap`

and validates:

- `connected === true`
- `source === "cherry-money-production"`
- company identity and currency
- each payment draft's safety contract:
  - `status === "draft_only"`
  - `moneyMoved === false`
  - `source === "cherry-money-production"`

Malformed or unexpected payloads are rejected.

## Create payment draft

The app calls:

`POST /api/webmcp/payment-drafts`

with:

```json
{
  "payee": "Atlas Design Studio",
  "amount": "850.00",
  "reference": "INV-1042",
  "purpose": "Supplier invoice"
}
```

Cherry Money determines the accounting currency from the authenticated company.

The response must remain draft-only. This endpoint does not execute payment.

## Demo setup

Before judging:

1. Use a dedicated Cherry Money demo company.
2. Create representative payment drafts with fictional/test supplier data.
3. Do not expose real bank/customer records in the public hackathon demo.
4. On web, sign in with the Google account linked to the dedicated demo company.
   On native/manual testing, obtain a fresh temporary bearer token shortly before the demo.
5. Load/select the draft.
6. Disconnect after the demo so the in-memory token is cleared.

## Current AP limitation

The existing WebMCP bridge does not expose purchase-invoice/AP bill rows. Do not scrape
the Cherry Money HTML UI and do not bypass that boundary.

If direct supplier bill selection becomes necessary, add a reviewed, company-scoped,
read-only API to Cherry Money in a separate production change. Keep that work distinct
from the Metropolis hackathon repository.
