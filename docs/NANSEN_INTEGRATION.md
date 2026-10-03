# Nansen payment intelligence — Metropolis

## Product use

Nansen is part of the **payment decision surface**, not a separate data dashboard.
When a payer enters the Monad recipient for the Aurora Intents route, Cherry Pay
loads recipient context before the route is previewed:

1. current Monad holdings,
2. recent Monad transactions (30-day window),
3. first-degree related-wallet context.

Cherry Money's backend keeps the Nansen API key server-side and returns a compact
summary to the Expo app. The app visibly attributes the result to **Nansen API**.

The feature is informational. It does not claim to verify wallet ownership,
identity, sanctions status, fraud risk, payment finality, or accounting status.

## Nansen endpoints used

- `POST /api/v1/profiler/address/current-balance`
- `POST /api/v1/profiler/address/transactions`
- `POST /api/v1/profiler/address/related-wallets`

All three support `chain: "monad"`.

The backend caches each recipient profile for five minutes to avoid spending API
credits again when React rerenders or a user previews the same payment route.

## Why this is meaningful

Cherry Pay combines Nansen intelligence with a real payment action:

```text
Recipient entered
  ↓
Nansen recipient intelligence
  ↓
Aurora route quote
  ↓
Passkey intent signature
  ↓
Cross-chain USDC execution
  ↓
Monad settlement / Envio evidence
```

The user sees onchain context *before* a real-money intent is created. We do not
simply expose a Nansen table or token-price widget.

## Client configuration

Only this public proxy URL belongs in Expo:

```dotenv
EXPO_PUBLIC_NANSEN_PROXY_URL=https://cherrymoney.co.uk/api/nansen/payment-intelligence/
```

Never add `NANSEN_API_KEY` to Expo, EAS public variables, static Hostinger
files, browser storage, or screenshots.

## Backend runtime

The companion Cherry Money backend requires:

```dotenv
NANSEN_API_KEY=<secret>
NANSEN_ALLOWED_ORIGINS=https://metropolis.cherrymoney.co.uk
```

Its Azure deployment derives `NANSEN_ENABLED=true` only when the key exists.

## Hackathon submission answer

> Cherry Pay uses Nansen Profiler data as a pre-payment intelligence layer for
> its real-money Monad recipient. When a payer enters a recipient, our
> server-side Nansen integration queries current-balance, recent address
> transactions, and related-wallets on Monad. Cherry transforms those responses
> into a concise recipient context — observed portfolio value/top assets,
> recent activity, labelled counterparties and first-degree wallet
> relationships — directly inside the payment review journey. The Nansen key is
> never exposed to the browser, responses are cached to control credit usage,
> and the interface attributes Nansen beside the intelligence. This is a core
> product step before Aurora Intents creates the cross-chain USDC payment, not a
> raw-data page or price widget. After payment, Envio/Monad evidence tracks the
> settlement separately.

