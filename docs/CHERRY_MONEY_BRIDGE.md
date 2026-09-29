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

For development, provide a valid temporary bearer token in the in-app field. The token
exists in memory only.

The existing Cherry Money API login endpoint is:

`POST /api/login`

with the existing Cherry Money business credentials. Phase 5 deliberately does not add
a second password-login screen because Mera should remain the visible account experience
for the hackathon demo.

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
4. Obtain a temporary demo bearer token shortly before the demo.
5. Load/select the draft in the mobile app.
6. Disconnect/clear the token after the demo.

## Current AP limitation

The existing WebMCP bridge does not expose purchase-invoice/AP bill rows. Do not scrape
the Cherry Money HTML UI and do not bypass that boundary.

If direct supplier bill selection becomes necessary, add a reviewed, company-scoped,
read-only API to Cherry Money in a separate production change. Keep that work distinct
from the Metropolis hackathon repository.
