# Metropolis bounty targets

Cherry Pay Global will enter **Consumer Products & Payments** as the primary Metropolis track and keep one coherent product story across sponsor bounties:

> Pay with minimal crypto friction, settle on Monad, verify the settlement independently, and turn it into Cherry Money reconciliation evidence.

Official Metropolis page: https://monad.xyz/developers/hackathons/metropolis

## Targeted prizes

| Target | Published prize | Cherry Pay evidence |
| --- | ---: | --- |
| Consumer Products & Payments | $30,000 split evenly between 3 teams | Native consumer payment UX on Monad; passkey-first flow; programmable payments without blockchain-first UX |
| Agora — Best Cross-Border Payments App on Monad | $10,000 | Real Agora AUSD transfer on Monad tied to a Cherry Money business payment draft |
| Aurora Intents — Bring Any-Chain Liquidity to Monad | $5,000 | One clean "pay with what you already have" flow into Monad; do not build a generic bridge/swap product |
| Chainlink — Best workflow with CRE | $3,000 | CRE combines Envio settlement evidence, direct Monad registry reads and Cherry Money business context |
| Envio — Best Use of Envio | $1,000 | HyperIndex-derived settlement verification/analytics plus a visible live HyperSync path where useful |
| Mera — Best Mera-Powered UX on Monad | $2,500 | Passkey-native account/recovery and payment signing with no browser extension or seed phrase |
| Mera — One Passkey, Many Keys | $2,500 | Separate PRF namespace used for non-wallet Cherry application state |

Published sponsor-bounty total targeted here: **$24,000**, in addition to the primary track. Award eligibility and stacking remain subject to the official submission-platform rules.

## Product rule

Do not add sponsor technology only to collect logos.

A sponsor integration is in scope only when it improves at least one of:

1. payment UX;
2. funding/onboarding UX;
3. settlement correctness;
4. reconciliation/auditability;
5. security or recoverability.

## Existing qualifying path

```text
Cherry Money payment draft
        ↓
Mera passkey account
        ↓
Agora AUSD transfer
        ↓
Monad confirmation
        ↓
CherrySettlementRegistry correlation
        ↓
Envio HyperIndex verification
        ↓
Chainlink CRE verification
        ↓
reconciliation evidence
```

This remains the stable baseline and must not be broken while adding bounty work.

## Remaining P0 work

### 1. Aurora Intents

Implement **one** demonstrable cross-chain funding/payment route.

Preferred demo:

```text
USDC on Base
    ↓
Aurora Intents
    ↓
USDC on Monad
    ↓
Cherry Pay destination/payment action
```

The user-facing language should be **Pay with what you already have**, not bridge/swap terminology.

Do not attempt broad multi-chain coverage for the submission. One reliable route with transaction evidence is stronger than several partially working routes.

### 2. Gas/sponsorship UX

Use the official Monad mobile/template documentation before building custom infrastructure.

Goal: remove the normal requirement for the user to understand or manually obtain MON for gas, if a supported sponsored-transaction pattern can be integrated without destabilising Mera.

Do not replace the existing Mera flow solely to satisfy this item.

### 3. Envio live evidence

Keep HyperIndex + Envio Cloud as the durable settlement read model.

Add a visible live-data moment around the qualifying payment when practical:

```text
Monad payment
   ↓
live HyperSync observation
   ↓
HyperIndex derived settlement
   ↓
CRE verification
```

Never ship an Envio API token in `EXPO_PUBLIC_*`. If direct HyperSync access requires a secret, proxy it through a server-side endpoint.

### 4. Contract verification

After Monad deployment, verify relevant submitted contracts using the current official Monad/Foundry verification instructions. Preserve explorer links and deployment transaction hashes as judge evidence.

## Bounty evidence checklist

### Agora

- transaction hash for real AUSD payment;
- sender/recipient balance delta;
- Monad explorer link;
- Cherry Money payment-draft reference;
- cross-border business-payment narrative.

### Aurora Intents

- source-chain transaction or deposit evidence;
- Intents execution/reference;
- final Monad transaction;
- destination asset and recipient;
- one-screen user journey showing no manual bridge/network choreography.

### Chainlink CRE

- workflow source;
- successful simulation/execution evidence;
- direct registry verification;
- deterministic result for the matching Cherry Money draft;
- clear failure/mismatch behavior.

### Envio

- `envio/config.yaml`;
- schema and handlers;
- public hosted GraphQL endpoint;
- derived settlement/diagnostic entities;
- visible dashboard;
- live HyperSync evidence if added.

### Mera UX

- passkey creation/recovery on native mobile;
- same account recovery;
- no persisted private key/seed phrase;
- payment signing evidence;
- clear expiry/re-prompt behavior.

### Mera One Passkey, Many Keys

- separate non-wallet PRF namespace;
- cross-device/profile reconstruction evidence;
- encrypted Cherry application data use;
- explanation showing separation from the wallet/account namespace.

## Submission discipline

- Keep the main demo under a few minutes.
- Demonstrate a real Monad transaction rather than mocked settlement.
- Show each sponsor only where it contributes to the same payment journey.
- Keep experimental consumer contracts explicitly testnet-only and default-off until deployed and validated.
- Do not expose API tokens, private keys or signing material in mobile/public configuration.
- Record screen/video evidence before code freeze so external-service issues do not block submission evidence.

## Deadline note

The public Metropolis page currently lists **13 October 2026** as the submission deadline. The existing repository roadmap contains an exact cutoff expressed on 14 October BST. Confirm the authoritative submission-platform time zone before changing the exact internal cutoff; plan to finish and record the demo before 13 October regardless.
