# Agora / Monad Testnet Demo Runbook

## Purpose

Prepare two test accounts for the Agora cross-border payment demo.

- **Sender:** the Mera-derived Cherry Pay account.
- **Recipient:** a second Monad EVM address used to prove receipt.

## 1. Build the mobile app

The Mera native passkey association must already be configured. See:

- `docs/PASSKEY_DOMAIN.md`

## 2. Create or recover the Mera sender

In Cherry Pay Global:

1. Enter the recipient address.
2. Choose **Create + approve recipient** or **Recover + approve recipient**.
3. Record the Mera sender address displayed by the app.

## 3. Fund the sender with Monad testnet gas

The sender needs a small native **MON** balance before it can call the AUSD faucet or
send AUSD.

Use the official Monad testnet faucet and fund the exact Mera address shown by the app.

Then choose **Refresh balances**.

## 4. Request Agora test AUSD

With MON available, choose:

**Request Agora test AUSD**

The app calls the published Agora testnet faucet contract at:

`0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`

and requests funds for the Mera account itself.

Wait for the transaction confirmation. The AUSD balance should increase.

## 5. Send the payment

1. Enter an amount within the current session limit.
2. Choose **Send AUSD on Monad — no prompt**.
3. The app:
   - checks the scope;
   - checks sender balances;
   - simulates the transfer;
   - signs via the in-memory Mera session;
   - broadcasts to Monad;
   - waits for the confirmed receipt;
   - re-reads recipient balance.

## 6. Demo proof

Show all of the following live:

- Mera sender address;
- AUSD sender balance;
- MON gas balance;
- recipient address;
- amount;
- no second passkey prompt at send;
- **AUSD settled ✓**;
- recipient balance before/after;
- transaction hash;
- Monad explorer transaction;
- confirmation time;
- landing → confirmed metric.

## Troubleshooting

### No MON

The app blocks the faucet/transfer path.

Fund the Mera address from the Monad testnet faucet.

### No AUSD

Use **Request Agora test AUSD** after MON funding.

### Recipient changed

The active session intentionally rejects the change. End/reopen the session and approve
the new recipient with a passkey.

### Amount over limit

Open a new appropriately scoped session only if the demo/business policy is deliberately
changed. Do not silently weaken the existing limits.

### Transaction simulation fails

Do not broadcast. Check:

- live chain ID;
- AUSD contract address;
- sender AUSD balance;
- sender MON balance;
- recipient address;
- testnet availability.

## Environment

```dotenv
EXPO_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
EXPO_PUBLIC_MONAD_CHAIN_ID=10143
EXPO_PUBLIC_MONAD_EXPLORER_URL=https://testnet.monadscan.com
EXPO_PUBLIC_AUSD_ADDRESS=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC
EXPO_PUBLIC_AUSD_DECIMALS=6
EXPO_PUBLIC_AUSD_FAUCET_ADDRESS=0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C
```
