# Settlement Correlation Runbook

## Components

- AUSD transfer contract: Agora AUSD on Monad testnet
- Correlation contract: `CherrySettlementRegistry`
- Mobile signer: Mera
- Future verifier: Envio + Chainlink CRE
- Accounting system of record: Cherry Money

## 1. Compile

From the repository root:

```bash
npm install
npm run contracts:check
```

The contract must compile before deployment.

## 2. Deploy to Monad testnet

Deploy:

`contracts/src/CherrySettlementRegistry.sol`

using a dedicated Monad testnet deployer.

Do not:

- reuse a production private key;
- commit the deployer private key;
- give the contract custody of AUSD;
- add admin/upgrade behaviour just for the demo.

Record:

- deployed contract address;
- deployment transaction hash;
- deployment block.

## 3. Configure the mobile app

Set:

```dotenv
EXPO_PUBLIC_SETTLEMENT_REGISTRY_ADDRESS=0xDEPLOYED_ADDRESS
```

Rebuild/restart the Expo application so the public configuration is embedded.

## 4. Run the payment flow

1. Select a Cherry Money payment draft.
2. Enter/confirm the Monad recipient.
3. Open the Mera payment session with one passkey ceremony.
4. Confirm sender MON and AUSD funding.
5. Send the AUSD payment.
6. Wait for the AUSD transaction receipt.
7. Wait for the correlation transaction receipt.

## 5. Evidence to capture

For the AUSD payment:

- payment reference hash;
- AUSD transaction hash;
- block number;
- sender;
- recipient;
- asset;
- amount;
- recipient balance before/after.

For the registry correlation:

- registry address;
- correlation transaction hash;
- `BusinessPaymentCorrelated` event;
- correlation block number.

## 6. Failure rules

### Payment fails before confirmation

No correlation is attempted.

### Payment confirms but correlation fails

Do **not** send the AUSD payment again.

Use **Retry correlation only** while the Mera session remains active.

If the session has expired, preserve the AUSD transaction hash and payment reference for
later verification/recovery. A later workflow can correlate after a new explicitly
approved session or through the planned verifier workflow.

### Reference is already correlated for this payer

The standard mobile payment path blocks before a new AUSD transfer.

If retry discovers an existing correlation with exactly the same:

- payment transaction hash;
- payer;
- recipient;
- asset;
- amount;

it treats the operation as idempotently confirmed.

If any field differs, stop and investigate.

## 7. What later verifiers must check

The registry event is correlation evidence, not sufficient accounting proof.

Envio / CRE should verify:

1. `paymentTxHash` exists on Monad and succeeded.
2. The transaction emitted the expected AUSD `Transfer`.
3. AUSD contract address equals the configured asset.
4. Transfer sender equals the registry payer.
5. Transfer recipient equals the registry recipient.
6. Transfer amount equals the registry amount.
7. Payment reference maps to the intended Cherry Money draft.
8. The reference has not previously been reconciled.

Only after those checks should Cherry Money accounting be updated.
