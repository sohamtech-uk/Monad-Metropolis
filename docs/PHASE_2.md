# Phase 2 — Mera Passkey Account Layer

**Target:** 30 September 2026

## Objective

Make Mera the complete Monad identity/account layer for the hackathon app without
introducing a seed phrase, browser wallet, wallet extension, email/OTP flow or Cherry
custody backend.

## Implementation

The mobile app now supports:

- **Create with passkey** using `createPasskeyWithPrfOutput`.
- **Recover with passkey** using discoverable credentials through
  `getPasskeyPrfOutput`.
- deterministic EVM account derivation from the Mera PRF output using the documented:
  - BIP-39 entropy mapping;
  - BIP-39 seed;
  - BIP-32 Ethereum path `m/44'/60'/0'/0/0`.
- immediate destruction/end of the temporary Mera signing session after deriving the
  public EVM address.
- zeroing mutable PRF, seed and copied private-key buffers where possible.
- **no persistence of PRF output, mnemonic, seed or private key**.

## Stateless test

The implementation intentionally does not require local identity storage.

Demo:

1. Create a passkey account.
2. Record the displayed EVM address.
3. Choose **Clear local view for stateless test**, or open the app from a fresh device
   / profile.
4. Choose **Recover with passkey**.
5. Select/use the same synced passkey.
6. Confirm the same EVM address is reproduced.

For the final bounty demo, step 3 should be performed by clearing local application
state or using a second device/fresh profile, not merely pressing the convenience
button.

## Native passkey association requirement

The relying-party domain defaults to:

`metropolis.cherrymoney.co.uk`

It can be overridden at native build time with:

```bash
MERA_RP_ID=another.example.com npm run prebuild -w @cherry-metropolis/mobile
```

Before real-device testing, the relying-party host must serve valid:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

for the actual Apple Team ID, iOS bundle ID, Android package and Android signing
certificate fingerprint.

See `docs/PASSKEY_DOMAIN.md`.

## Security boundary

Phase 2 still does **not** send transactions.

- no transaction signing UI;
- no transaction broadcast;
- no token approval;
- no AUSD transfer;
- no long-lived derived key;
- no custody server;
- no seed phrase export.

The account derivation creates a Mera signing session only briefly to obtain the public
address and ends it before returning identity metadata.

## Exit criteria

Code-level:

- TypeScript CI passes.
- Mera uses the official React Native WebAuthn adapter.
- the PRF output is never persisted.
- creation and recovery use the same deterministic derivation path.
- the mobile app exposes the stateless recovery flow.

Device-level (required before marking the phase fully verified):

- association files are live on the RP domain;
- account creation succeeds on supported hardware;
- recovery with the same passkey reproduces the same address on a fresh device/profile.
