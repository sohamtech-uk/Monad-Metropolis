# Aurora Intents — Pay with what you already have

Cherry Pay Global integrates the official
`@aurora-is-near/intents-connect` SDK as a focused Metropolis bounty flow.

## User outcome

The first supported route is intentionally narrow:

```text
Base USDC
   ↓
Aurora Intents Connect
   ↓
USDC on Monad
   ↓
USDC.transfer(merchant, fee-adjusted amount)
```

The customer chooses a payment outcome rather than operating a bridge, selecting
a destination network, or manually constructing the Monad contract call.

## Why this is separate from the qualifying AUSD path

The core Metropolis/Agora flow remains on Monad Testnet:

```text
Cherry Money draft → Mera → AUSD → Monad Testnet
→ CherrySettlementRegistry → Envio → CRE reconciliation evidence
```

Aurora Intents currently exposes a supported Monad **mainnet USDC** destination
route. The Aurora tab therefore does not pretend that a mainnet USDC execution
is the same transaction as the AUSD testnet reconciliation demo.

That separation is deliberate and visible in the UI.

## Official SDK

Mobile dependency:

```text
@aurora-is-near/intents-connect 7.24.2
```

Cherry uses the SDK's:

- `createIntentsConnectApi`;
- `createExecutionRunner`;
- bridge-in `Recipe`;
- preview/run/resume/cancel lifecycle;
- ERC-191 origin-wallet signing;
- exact-input quote;
- `{MIN_AMOUNT_OUT}` destination amount placeholder.

Cherry does not implement its own solver, bridge or execution state machine.

Before previewing a payment, the client asks Aurora for the live supported-token
catalogue and refuses to continue unless both Base USDC input and Monad USDC
output are currently advertised. This avoids presenting a stale hard-coded
route if solver/liquidity support changes.

## API-key proxy

Aurora execution-create requests use a priced API key. The key is never shipped
in Expo. The SDK is configured with a fail-closed feature gate:

```env
EXPO_PUBLIC_AURORA_INTENTS_ENABLED=true
EXPO_PUBLIC_AURORA_INTENTS_API_BASE_URL=https://intents-connect-alpha-api.aurora.dev
EXPO_PUBLIC_AURORA_INTENTS_PROXY_URL=https://cherrymoney.co.uk/api/aurora-intents/
```

The Cherry Money backend injects `x-api-key` only for the two create endpoints.
Every other SDK request goes directly to Aurora as intended.

Server deployment secret:

```text
AURORA_INTENTS_API_KEY
```

Never commit or paste that value into a client/public environment variable.

Keep `EXPO_PUBLIC_AURORA_INTENTS_ENABLED=false` until the server proxy is
deployed and the server-side key has been configured. The tab remains visible
but cannot open a Mera session or move funds while disabled.

## Wallet UX

The existing Mera passkey-derived EVM account is adapted to Aurora's
`WalletConnector` interface.

It supplies:

- the Mera EVM address;
- ERC-191 `personal_sign` through the in-memory Mera account;
- optional Base USDC deposit signing;
- no persisted private key;
- no seed phrase or browser wallet.

Two funding modes are offered:

### Any wallet / exchange

Default hackathon mode. The user signs the Aurora intent with Cherry Pay and
receives the exact Base USDC deposit address. They can fund that address from an
external wallet/exchange. Cherry never asks them to switch networks.

### This passkey on Base

The same Mera account submits the Base USDC deposit automatically. That account
must already have Base USDC plus enough ETH for Base gas.

## Mainnet safety

This route can move real mainnet USDC, so the hackathon implementation:

- caps a payment at 100 USDC;
- defaults to a 1 USDC input;
- validates the Base USDC contract;
- validates the Monad recipient;
- uses Aurora's exact quote and post-fee placeholder;
- warns against resubmitting an uncertain execution;
- supports resume;
- allows cancel before funding;
- does not update Cherry Money accounting;
- does not mix the result with AUSD testnet reconciliation evidence.

## Bounty evidence

Capture:

1. Cherry Pay mobile "Pay from any chain" tab;
2. Mera passkey account;
3. route preview showing Base input and minimum Monad output;
4. Aurora execution ID;
5. source deposit address / Base transaction;
6. final Monad transaction hash and explorer link;
7. a short architecture screenshot showing Aurora as the routing/execution
   layer rather than a generic swap screen.

The product line for the demo is:

> Pay with what you already have. Aurora routes it, Monad settles it, Cherry
> keeps the business context.
