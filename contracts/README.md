# Cherry Settlement Registry

`CherrySettlementRegistry.sol` is the Phase 6 correlation contract for the
Monad Metropolis hackathon.

It records an opaque Cherry Money payment reference against an already-confirmed
Monad payment transaction.

## What it does

The registry emits:

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

It also stores one immutable correlation per `paymentReference`.

## What it does NOT do

The registry:

- does not custody AUSD;
- does not execute the AUSD transfer;
- does not read Cherry Money data;
- does not contain supplier names, invoice descriptions, emails or bank details;
- does not prove by itself that `paymentTxHash` contains the expected AUSD transfer;
- does not mark a Cherry Money accounting record paid.

Envio and Chainlink CRE will independently verify the referenced payment
transaction before Cherry Money reconciliation.

## Privacy

The only business identifier sent on-chain is a `bytes32` opaque reference.
For a Cherry Money payment draft this is already a deterministic hash of the
draft context, not the raw draft ID or supplier details.

## Duplicate protection

Each `(payer, paymentReference)` pair can be recorded only once. This is an explicit
correlation-level replay guard and prevents another account from locking a payer's reference.

The AUSD payment and correlation event are currently separate transactions.
Therefore the registry is not an atomic payment router. Phase 6 documents this
limitation and does not treat the event alone as accounting proof.

## Compile

From the repository root:

```bash
npm install
npm run contracts:check
```

## Deployment

Deploy the contract to Monad testnet using a dedicated testnet deployer. Never
commit a deployer private key.

After deployment set:

```dotenv
EXPO_PUBLIC_SETTLEMENT_REGISTRY_ADDRESS=0x...
```

The mobile app treats an unset registry address as "correlation not configured"
and continues to show the underlying AUSD settlement separately.
