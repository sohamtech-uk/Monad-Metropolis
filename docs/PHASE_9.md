# Phase 9 — Mera “One Passkey, Many Keys”

**Target:** 9 October 2026

## Objective

Demonstrate a clearly **non-wallet** use of Mera's WebAuthn PRF:

> the same synced passkey deterministically reproduces unrelated encryption key
> material for multiple Cherry application namespaces, without storing those
> keys on disk or server.

The judged feature is the **Passkey-Protected Cherry Business Vault**.

## Why this qualifies as non-wallet use

The Phase 2–4 Mera flow uses Mera PRF output to reconstruct the Monad account.

Phase 9 uses **different explicit PRF salts** for application encryption:

```text
same passkey
    │
    ├── Mera default account salt
    │      └── Monad account
    │
    ├── sha256("cherry.mera.namespace.v1:cherry:ai-memory:v1")
    │      └── Ask Cherry private-memory encryption key
    │
    └── sha256("cherry.mera.namespace.v1:cherry:supplier-private-note:v1")
           └── supplier-private-note encryption key
```

Mera's PRF output is a deterministic function of:

- the credential;
- relying-party ID;
- PRF salt.

Mera explicitly supports a custom 32-byte `prfSalt`, and its documentation
describes salts as namespaces.

## Namespaces

Phase 9 ships two non-account namespaces:

```text
cherry:ai-memory:v1
cherry:supplier-private-note:v1
```

A namespace string is converted to an exact 32-byte WebAuthn PRF salt using
SHA-256.

The salt is public metadata. It is not a secret.

Each namespace therefore asks the same authenticator for an unrelated PRF
output.

## Encryption construction

The pipeline is:

```text
Mera passkey
   ↓
WebAuthn PRF(custom 32-byte namespace salt)
   ↓
32-byte PRF output
   ↓
HKDF-SHA-256
  info = "cherry.mera.encrypt.v1:<namespace>"
   ↓
32-byte encryption key
   ↓
XChaCha20-Poly1305
   ↓
portable encrypted envelope
```

XChaCha20-Poly1305 is authenticated encryption. A fresh 24-byte nonce is
generated for every encryption operation.

The namespace and envelope metadata are authenticated as associated data.

## Portable envelope

The exported JSON contains only:

- version;
- namespace;
- credential ID;
- encryption algorithm identifier;
- public PRF salt;
- nonce;
- ciphertext;
- creation timestamp.

It does **not** contain:

- PRF output;
- HKDF output;
- encryption key;
- account private key;
- seed phrase.

The credential ID is non-secret WebAuthn metadata and is used to pin recovery
to the same passkey rather than allowing the platform to silently choose
another discoverable credential.

## Cross-device demo

### Device A

1. Create/recover the normal Mera payment account.
2. Open **Passkey-Protected Cherry Business Vault**.
3. Choose **Ask Cherry memory**.
4. Enter fictional private application state.
5. Tap **Encrypt with same Mera passkey**.
6. Complete the WebAuthn prompt.
7. Copy the encrypted JSON envelope.

### Device B / fresh profile

1. Install/open the same Cherry Pay build under the same relying-party domain.
2. Paste the encrypted JSON envelope.
3. Tap **Decrypt imported envelope**.
4. Use the same synced passkey.
5. Confirm the plaintext is reconstructed.

No locally stored key from Device A is required.

## Namespace isolation proof

The UI also includes:

**Prove other namespace cannot decrypt**

For an `ai-memory` envelope it evaluates the same passkey with the
`supplier-private-note` PRF salt.

The resulting unrelated key is deliberately used against the original
ciphertext. XChaCha20-Poly1305 authentication must fail.

This provides a live demonstration that one passkey can mint multiple isolated
non-wallet keys.

## Security behaviour

Mutable secret-key buffers are zeroed after use:

- Mera PRF output;
- HKDF-derived encryption key;
- mutable plaintext/decrypted byte buffers;
- temporary salt copies.

The application does not persist the key material.

### JavaScript memory limitation

The plaintext shown in the React Native UI is a JavaScript string. JavaScript
strings are immutable and cannot be reliably overwritten in memory.

For that reason:

- the hackathon demo must use fictional/non-sensitive content;
- the implementation does not claim secure memory erasure for displayed text;
- the “zero secrets stored” claim applies to persisted key material, not every
  runtime copy produced by the JavaScript engine.

## Relying-party dependency

The encrypted state remains bound to the passkey and its RP ID:

`metropolis.cherrymoney.co.uk`

A future domain migration would require a planned export/migration path before
the old RP ID is lost.

## Definition of done

- explicit 32-byte custom PRF salts are used;
- at least one namespace performs live non-account work;
- two distinct namespaces are available;
- same passkey encrypts/decrypts portable application state;
- fresh-device/fresh-profile recovery requires no stored secret key;
- envelope pins the credential ID;
- alternate namespace fails authenticated decryption;
- no PRF output or encryption key is persisted;
- CI typechecks the implementation;
- real-device cross-device demonstration is documented.

## Next phase

Phase 10 combines the payment, correlation, Envio analytics and Mera vault
features into the complete end-to-end judging flow and removes any remaining
mock/demo-only gaps from the qualifying path.
