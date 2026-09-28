import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type EvmAddress,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { PasskeyError } from "react-native-passkey";

import { rpId } from "./config";

const RP_NAME = "Cherry Pay Global";
const USER_NAME = "cherry-pay-account";
const EVM_ACCOUNT_PATH = "m/44'/60'/0'/0/0";

type MeraAccountIdentity = Readonly<{
  address: EvmAddress;
  credentialId: string;
}>;

type PrfResult = Readonly<{
  credentialId: string;
  prfOutput: Uint8Array;
}>;

function displayName(): string {
  return `Cherry Pay account · ${new Date().toLocaleString()}`;
}

async function createMeraAccount(): Promise<MeraAccountIdentity> {
  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: {
      name: USER_NAME,
      displayName: displayName(),
    },
    webAuthnClient: reactNativeWebAuthnClient,
  });

  return deriveIdentity(result);
}

/**
 * Uses discoverable credentials intentionally: no credential ID is required
 * from local storage or from Cherry Money. The platform offers passkeys for
 * the configured relying party, allowing a fresh device/profile to reconstruct
 * the same account from the synced passkey alone.
 */
async function recoverMeraAccount(): Promise<MeraAccountIdentity> {
  const result = await getPasskeyPrfOutput({
    rpId,
    webAuthnClient: reactNativeWebAuthnClient,
  });

  return deriveIdentity(result);
}

/**
 * Follows Mera's documented EVM derivation pattern:
 * PRF output -> BIP-39 entropy -> BIP-39 seed -> BIP-32 Ethereum path.
 *
 * No derived secret, mnemonic, seed, or private key is persisted. The signing
 * session exists only long enough to calculate the public EVM address in this
 * phase, then it is ended immediately.
 */
function deriveIdentity(result: PrfResult): MeraAccountIdentity {
  if (result.prfOutput.length !== 32) {
    result.prfOutput.fill(0);
    throw new Error("Mera PRF output must be 32 bytes.");
  }

  let seed: Uint8Array | undefined;
  let privateKey: Uint8Array | undefined;
  let session: ReturnType<typeof createSecp256k1SigningSession> | undefined;

  try {
    const mnemonic = entropyToMnemonic(result.prfOutput, wordlist);
    seed = mnemonicToSeedSync(mnemonic);

    const node = HDKey.fromMasterSeed(seed).derive(EVM_ACCOUNT_PATH);
    if (node.privateKey === null) {
      throw new Error("Mera account derivation produced no private key.");
    }

    privateKey = Uint8Array.from(node.privateKey);
    session = createSecp256k1SigningSession({ privateKey });

    return Object.freeze({
      address: getEvmAddress(session.publicKey),
      credentialId: result.credentialId,
    });
  } finally {
    session?.end();
    result.prfOutput.fill(0);
    seed?.fill(0);
    privateKey?.fill(0);
  }
}

function describeMeraError(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey provider does not expose WebAuthn PRF. Use a supported iOS 18+ or Android passkey provider.";
      case "PASSKEY_OPERATION_FAILED":
        return describePasskeyError(error.cause);
      case "CRYPTO_UNAVAILABLE":
        return "Secure random-number generation is unavailable on this device.";
      case "SESSION_ENDED":
        return "The Mera signing session has ended.";
      default:
        return error.message;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function describePasskeyError(cause: unknown): string {
  const { error, message } = (cause ?? {}) as Partial<PasskeyError>;

  switch (error) {
    case "RequestFailed":
      return `The device refused the passkey request for ${rpId}. Verify the Apple/Android association files for this app and relying-party domain.`;
    case "NoCredentials":
      return `No synced passkey for ${rpId} is available on this device.`;
    default:
      return typeof message === "string" ? message : "The passkey request failed.";
  }
}

export type { MeraAccountIdentity };
export {
  createMeraAccount,
  describeMeraError,
  recoverMeraAccount,
};
