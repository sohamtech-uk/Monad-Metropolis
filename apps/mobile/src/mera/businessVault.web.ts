import { getPasskeyPrfOutput } from "@category-labs/mera";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { base64urlnopad } from "@scure/base";

import { rpId } from "./config";

const VAULT_VERSION = 1 as const;
const ALGORITHM = "XChaCha20-Poly1305" as const;
const NONCE_LENGTH = 24;
const PRF_SALT_LENGTH = 32;
const MIN_CIPHERTEXT_LENGTH = 16;

const VAULT_NAMESPACES = {
  askCherryMemory: "cherry:ai-memory:v1",
  supplierPrivateNote: "cherry:supplier-private-note:v1",
} as const;

type BusinessVaultNamespace =
  (typeof VAULT_NAMESPACES)[keyof typeof VAULT_NAMESPACES];

type BusinessVaultEnvelope = Readonly<{
  version: 1;
  namespace: BusinessVaultNamespace;
  credentialId: string;
  algorithm: typeof ALGORITHM;
  prfSalt: string;
  nonce: string;
  ciphertext: string;
  createdAt: string;
}>;

type EncryptBusinessVaultOptions = Readonly<{
  namespace: BusinessVaultNamespace;
  plaintext: string;
  credentialId: string;
}>;

type NamespaceIsolationResult = Readonly<{
  isolated: boolean;
  testedNamespace: BusinessVaultNamespace;
}>;

function deriveNamespaceSalt(namespace: BusinessVaultNamespace): Uint8Array {
  return sha256(
    utf8ToBytes("cherry.mera.namespace.v1:" + namespace),
  );
}

function deriveEncryptionKey(
  prfOutput: Uint8Array,
  namespace: BusinessVaultNamespace,
): Uint8Array {
  if (prfOutput.length !== 32) {
    throw new Error("Mera PRF output must be 32 bytes.");
  }

  return hkdf(
    sha256,
    prfOutput,
    new Uint8Array(32),
    utf8ToBytes("cherry.mera.encrypt.v1:" + namespace),
    32,
  );
}

async function encryptBusinessVault({
  namespace,
  plaintext,
  credentialId,
}: EncryptBusinessVaultOptions): Promise<BusinessVaultEnvelope> {
  const value = plaintext.trim();
  if (!value) {
    throw new Error("Private business state cannot be empty.");
  }
  if (!credentialId.trim()) {
    throw new Error(
      "Recover or create the Mera account first so Cherry can pin the vault to the same passkey.",
    );
  }

  const prfSalt = deriveNamespaceSalt(namespace);
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    credential: { credentialId },
    prfSalt,
  });

  let key: Uint8Array | undefined;
  const plaintextBytes = utf8ToBytes(value);

  try {
    key = deriveEncryptionKey(prfOutput, namespace);
    const nonce = randomBytes(NONCE_LENGTH);
    const createdAt = new Date().toISOString();
    const encodedSalt = base64urlnopad.encode(prfSalt);
    const aad = envelopeAad({
      version: VAULT_VERSION,
      namespace,
      credentialId,
      algorithm: ALGORITHM,
      prfSalt: encodedSalt,
      createdAt,
    });

    const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(
      plaintextBytes,
    );

    return Object.freeze({
      version: VAULT_VERSION,
      namespace,
      credentialId,
      algorithm: ALGORITHM,
      prfSalt: encodedSalt,
      nonce: base64urlnopad.encode(nonce),
      ciphertext: base64urlnopad.encode(ciphertext),
      createdAt,
    });
  } finally {
    prfOutput.fill(0);
    key?.fill(0);
    plaintextBytes.fill(0);
  }
}

async function decryptBusinessVault(
  envelopeInput: string | BusinessVaultEnvelope,
): Promise<string> {
  const envelope = parseBusinessVaultEnvelope(envelopeInput);
  const expectedSalt = deriveNamespaceSalt(envelope.namespace);
  const storedSalt = base64urlnopad.decode(envelope.prfSalt);

  try {
    if (!equalBytes(storedSalt, expectedSalt)) {
      throw new Error(
        "Vault namespace salt does not match its declared namespace.",
      );
    }

    const { prfOutput } = await getPasskeyPrfOutput({
      rpId,
      credential: { credentialId: envelope.credentialId },
      prfSalt: expectedSalt,
    });

    let key: Uint8Array | undefined;
    let plaintext: Uint8Array | undefined;

    try {
      key = deriveEncryptionKey(prfOutput, envelope.namespace);
      const nonce = base64urlnopad.decode(envelope.nonce);
      const ciphertext = base64urlnopad.decode(envelope.ciphertext);
      const aad = envelopeAad(envelope);

      plaintext = xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
      return new TextDecoder().decode(plaintext);
    } catch (error) {
      throw new Error(
        "Unable to decrypt this Cherry vault with the selected passkey and namespace.",
        { cause: error },
      );
    } finally {
      prfOutput.fill(0);
      key?.fill(0);
      plaintext?.fill(0);
    }
  } finally {
    expectedSalt.fill(0);
    storedSalt.fill(0);
  }
}

async function proveNamespaceIsolation(
  envelopeInput: string | BusinessVaultEnvelope,
  alternateNamespace: BusinessVaultNamespace,
): Promise<NamespaceIsolationResult> {
  const envelope = parseBusinessVaultEnvelope(envelopeInput);

  if (alternateNamespace === envelope.namespace) {
    throw new Error("Choose a different namespace for the isolation test.");
  }

  const alternateSalt = deriveNamespaceSalt(alternateNamespace);
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    credential: { credentialId: envelope.credentialId },
    prfSalt: alternateSalt,
  });

  let key: Uint8Array | undefined;
  try {
    key = deriveEncryptionKey(prfOutput, alternateNamespace);
    const nonce = base64urlnopad.decode(envelope.nonce);
    const ciphertext = base64urlnopad.decode(envelope.ciphertext);
    const aad = envelopeAad(envelope);

    try {
      xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);

      return Object.freeze({
        isolated: false,
        testedNamespace: alternateNamespace,
      });
    } catch {
      return Object.freeze({
        isolated: true,
        testedNamespace: alternateNamespace,
      });
    }
  } finally {
    prfOutput.fill(0);
    key?.fill(0);
    alternateSalt.fill(0);
  }
}

function parseBusinessVaultEnvelope(
  value: string | BusinessVaultEnvelope,
): BusinessVaultEnvelope {
  const parsed: unknown =
    typeof value === "string" ? parseEnvelopeJson(value) : value;

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Cherry vault must be a JSON object.");
  }

  const record = parsed as Record<string, unknown>;

  if (record.version !== VAULT_VERSION) {
    throw new Error("Cherry vault version must be 1.");
  }

  if (!isBusinessVaultNamespace(record.namespace)) {
    throw new Error("Cherry vault namespace is not supported.");
  }

  if (record.algorithm !== ALGORITHM) {
    throw new Error("Cherry vault encryption algorithm is not supported.");
  }

  const credentialId = requireString(record.credentialId, "credentialId");
  const prfSalt = requireBase64Url(record.prfSalt, "prfSalt", PRF_SALT_LENGTH);
  const nonce = requireBase64Url(record.nonce, "nonce", NONCE_LENGTH);
  const ciphertext = requireBase64Url(
    record.ciphertext,
    "ciphertext",
    undefined,
    MIN_CIPHERTEXT_LENGTH,
  );
  const createdAt = requireString(record.createdAt, "createdAt");

  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Cherry vault createdAt is invalid.");
  }

  return Object.freeze({
    version: VAULT_VERSION,
    namespace: record.namespace,
    credentialId,
    algorithm: ALGORITHM,
    prfSalt,
    nonce,
    ciphertext,
    createdAt,
  });
}

function serializeBusinessVaultEnvelope(
  envelope: BusinessVaultEnvelope,
): string {
  return JSON.stringify(envelope);
}

function namespaceLabel(namespace: BusinessVaultNamespace): string {
  switch (namespace) {
    case VAULT_NAMESPACES.askCherryMemory:
      return "Ask Cherry private memory";
    case VAULT_NAMESPACES.supplierPrivateNote:
      return "Supplier private note";
  }
}

function alternateNamespace(
  namespace: BusinessVaultNamespace,
): BusinessVaultNamespace {
  return namespace === VAULT_NAMESPACES.askCherryMemory
    ? VAULT_NAMESPACES.supplierPrivateNote
    : VAULT_NAMESPACES.askCherryMemory;
}

function envelopeAad(
  envelope: Pick<
    BusinessVaultEnvelope,
    | "version"
    | "namespace"
    | "credentialId"
    | "algorithm"
    | "prfSalt"
    | "createdAt"
  >,
): Uint8Array {
  return utf8ToBytes(
    [
      "cherry.mera.vault",
      envelope.version.toString(),
      envelope.namespace,
      envelope.credentialId,
      envelope.algorithm,
      envelope.prfSalt,
      envelope.createdAt,
    ].join("|"),
  );
}

function parseEnvelopeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Cherry vault JSON is invalid.");
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Cherry vault " + label + " is required.");
  }
  return value.trim();
}

function requireBase64Url(
  value: unknown,
  label: string,
  byteLength?: number,
  minByteLength?: number,
): string {
  const encoded = requireString(value, label);

  let decoded: Uint8Array;
  try {
    decoded = base64urlnopad.decode(encoded);
  } catch {
    throw new Error("Cherry vault " + label + " must be base64url.");
  }

  try {
    if (byteLength !== undefined && decoded.length !== byteLength) {
      throw new Error(
        "Cherry vault " +
          label +
          " must decode to " +
          byteLength.toString() +
          " bytes.",
      );
    }

    if (minByteLength !== undefined && decoded.length < minByteLength) {
      throw new Error(
        "Cherry vault " +
          label +
          " must decode to at least " +
          minByteLength.toString() +
          " bytes.",
      );
    }
  } finally {
    decoded.fill(0);
  }

  return encoded;
}

function isBusinessVaultNamespace(
  value: unknown,
): value is BusinessVaultNamespace {
  return (
    value === VAULT_NAMESPACES.askCherryMemory ||
    value === VAULT_NAMESPACES.supplierPrivateNote
  );
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a[index]! ^ b[index]!;
  }
  return difference === 0;
}

export {
  VAULT_NAMESPACES,
  alternateNamespace,
  decryptBusinessVault,
  deriveNamespaceSalt,
  encryptBusinessVault,
  namespaceLabel,
  parseBusinessVaultEnvelope,
  proveNamespaceIsolation,
  serializeBusinessVaultEnvelope,
};
export type {
  BusinessVaultEnvelope,
  BusinessVaultNamespace,
  NamespaceIsolationResult,
};
