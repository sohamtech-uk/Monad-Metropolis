# Metropolis Judge Demo Runbook

## Goal

Demonstrate one coherent business payment rather than a collection of sponsor
integrations.

Target runtime: **3–5 minutes** unless the final hackathon rules specify
otherwise.

## Before the demo

### Native/passkey

- passkey association files are live for `metropolis.cherrymoney.co.uk`;
- app is installed on supported hardware;
- Mera account creation/recovery has been tested.

### Monad

- sender has MON for gas;
- sender has Agora testnet AUSD;
- recipient test address is ready;
- `CherrySettlementRegistry` is deployed;
- mobile build contains the registry address.

### Cherry Money

Use a fictional/test **USD-denominated** payment draft.

Example:

```text
Payee: Berlin Design Demo GmbH
Amount: USD 25.00
Reference: METROPOLIS-001
Purpose: Hackathon supplier payment
```

Use a short-lived demo Sanctum token.

### Envio

- Phase 7 indexer is deployed;
- trusted registry address is configured;
- public GraphQL endpoint is configured in the mobile build.

### CRE

Update:

`cre/settlement-verifier/config.staging.json`

with:

- deployed registry address;
- public Envio GraphQL endpoint.

Export only for the CRE process:

```bash
export SECRET_CHERRY_MONEY_BEARER_TOKEN="..."
```

## Demo sequence

### 1. Open Judge Mode

Show the incomplete checklist.

Explain that steps become complete only from live evidence.

### 2. Load Cherry Money business context

Load the workspace and select the USD payment draft.

Judge Mode:

`Cherry Money payment draft selected ✓`

### 3. Recover with one Mera passkey

Enter the recipient and choose:

**Recover + approve recipient**

Show:

- same account address;
- AUSD balance;
- MON balance;
- scoped payment limits.

Judge Mode:

`Mera passkey account ready ✓`

### 4. Send AUSD

Tap:

**Pay Cherry Money draft with AUSD — no prompt**

Show:

- no second passkey prompt;
- AUSD payment transaction hash;
- recipient balance before/after;
- confirmation time.

Judge Mode:

`AUSD payment confirmed ✓`

### 5. Show settlement correlation

Show:

**Business correlation confirmed ✓**

The event contains only the opaque Cherry reference and payment facts.

Judge Mode:

`Settlement correlation confirmed ✓`

### 6. Wait for Envio

Scroll to Cherry Settlement Analytics.

Use Refresh if needed.

Show:

**This payment is indexed and verified ✓**

Then show:

- verified volume;
- transaction history;
- payment explorer link;
- correlation explorer link.

Judge Mode:

`Envio indexed this payment ✓`

### 7. Run Chainlink CRE

From the repository:

```bash
cre workflow simulate cre/settlement-verifier \
  --target staging-settings \
  --non-interactive
```

Show CRE reading:

- latest verified Envio settlement;
- direct Monad registry state;
- Cherry Money payment drafts.

Expected result:

`ready_for_reconciliation`

with all deterministic checks true.

Copy the JSON result into Judge Mode and choose:

**Verify CRE evidence**

Judge Mode:

`Chainlink CRE evidence matches this payment ✓`

The checklist should now show:

**7/7 checks complete — Judge path complete ✓**

### 8. Optional Mera Many Keys bonus

If time remains, show the separate non-wallet bounty:

- encrypt Ask Cherry private memory;
- transfer ciphertext envelope to another device/profile;
- decrypt with same synced passkey;
- prove alternate namespace cannot decrypt.

## What to say about accounting

Use precise wording:

> “CRE has produced deterministic reconciliation evidence against the live
> Cherry Money draft. We deliberately do not mutate production accounting from
> this hackathon client because Cherry Money does not yet expose a dedicated
> blockchain-settlement callback.”

Do not say the production ledger was updated unless that feature has actually
been implemented and verified later.

## Failure recovery

### Envio has not indexed yet

Do not resend the AUSD payment.

Refresh the Envio dashboard.

### Correlation failed after payment

Do not resend AUSD.

Use **Retry correlation only** while the session is available.

### CRE returns no verified settlement

Confirm Envio has indexed the transaction first.

### CRE finds no Cherry draft

Confirm the same draft is still active and no business fields changed after the
passkey-approved reference was created.

### CRE reports amount mismatch

For the final demo use USD/AUSD source currency so the amount relation is
deterministic.

## Evidence to record

- Mera account recovery;
- AUSD balance;
- payment transaction hash;
- recipient balance increase;
- correlation transaction/event;
- Envio GraphQL settlement;
- Envio dashboard;
- CRE CLI output;
- Judge Mode 7/7;
- Mera namespace isolation if included.
