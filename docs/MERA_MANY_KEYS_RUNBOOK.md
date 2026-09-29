# Mera “One Passkey, Many Keys” Demo Runbook

## Goal

Show three things clearly to a judge:

1. the **same Mera passkey** is used for the Monad account and non-wallet vault;
2. a custom PRF namespace recreates the encryption key on another synced device;
3. a different PRF namespace cannot decrypt the ciphertext.

## Prerequisites

- valid passkey association for `metropolis.cherrymoney.co.uk`;
- supported Mera/PRF authenticator;
- two synced devices or one device plus a genuinely fresh app/profile;
- fictional demo text only.

## Demo A — encrypt

1. Open Cherry Pay Global on Device A.
2. Create/recover the Mera account.
3. Confirm the account address is displayed.
4. Scroll to **Passkey-Protected Cherry Business Vault**.
5. Select **Ask Cherry memory**.
6. Enter:
   `Prefer AUSD on Monad for supported international suppliers.`
7. Tap **Encrypt with same Mera passkey**.
8. Complete the passkey prompt.
9. Show the encrypted portable envelope.
10. Copy the envelope to Device B by a neutral channel.

The exported JSON may be public for the demo because the plaintext is
fictional. In real use, storage location is a product decision.

## Demo B — fresh-device decrypt

On Device B:

1. Ensure no secret key from Device A exists locally.
2. Paste the envelope.
3. Tap **Decrypt imported envelope**.
4. Complete the passkey prompt using the same synced credential.
5. Show the recovered plaintext.

The important evidence is that the encrypted envelope plus the synced passkey
is sufficient.

## Demo C — namespace isolation

Using the same imported envelope:

1. Tap **Prove other namespace cannot decrypt**.
2. Complete the passkey prompt.
3. Cherry evaluates the passkey using the other custom PRF namespace.
4. Show:
   **Namespace isolation proved ✓**

Authenticated decryption fails because the alternative namespace returns
unrelated PRF output/key material.

## Demonstrating many keys

Repeat encryption with:

`cherry:supplier-private-note:v1`

The public namespace salt fingerprint changes.

The account address does not change because the wallet/account flow still uses
Mera's separate account PRF namespace.

## Evidence to capture

- account address;
- selected non-wallet namespace;
- public namespace salt fingerprint;
- encrypted JSON envelope;
- Device B/fresh profile;
- successful decrypt;
- namespace isolation proof;
- no key/PRF field in the JSON;
- relevant source files:
  - `apps/mobile/src/mera/businessVault.ts`
  - `apps/mobile/src/MeraBusinessVaultCard.tsx`

## What not to claim

Do not claim:

- that JavaScript UI strings can be securely erased;
- that the ciphertext can survive loss if every copy is deleted;
- that the passkey can survive an RP-domain migration automatically;
- that the vault replaces normal recovery/business continuity planning.

The specific bounty claim is narrower and stronger:

> Mera's custom PRF salts let Cherry use one synced passkey to reconstruct
> isolated non-wallet encryption keys, while persisted data contains only
> ciphertext and non-secret metadata.
