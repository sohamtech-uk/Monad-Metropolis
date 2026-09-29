import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type EvmAddress,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { PasskeyError } from "react-native-passkey";
import type { LocalAccount } from "viem";

import { rpId } from "./config";

const RP_NAME = "Cherry Pay Global";
const USER_NAME = "cherry-pay-account";
const EVM_ACCOUNT_PATH = "m/44'/60'/0'/0/0";

type MeraAccountIdentity = Readonly<{
  address: EvmAddress;
  credentialId: string;
}>;

type MeraLiveAccount = Readonly<{
  identity: MeraAccountIdentity;
  session: Secp256k1SigningSession;
  account: LocalAccount<"mera">;
  end: () => void;
}>;

type PrfResult = Readonly<{
  credentialId: string;
  prfOutput: Uint8Array;
}>;

function displayName(): string {
  return "Cherry Pay account · " + new Date().toLocaleString();
}

async function createMeraLiveAccount(): Promise<MeraLiveAccount> {
  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: {
      name: USER_NAME,
      displayName: displayName(),
    },
    webAuthnClient: reactNativeWebAuthnClient,
  });

  return deriveLiveAccount(result);
}

/**
 * Uses discoverable credentials intentionally: no credential ID is required
 * from local storage or from Cherry Money. The platform can offer every
 * passkey for this relying party on a fresh device/profile.
 */
async function recoverMeraLiveAccount(): Promise<MeraLiveAccount> {
  const result = await getPasskeyPrfOutput({
    rpId,
    webAuthnClient: reactNativeWebAuthnClient,
  });

  return deriveLiveAccount(result);
}

/**
 * Stateless identity helpers retained from Phase 2. They immediately end the
 * Mera session after deriving the public address.
 */
async function createMeraAccount(): Promise<MeraAccountIdentity> {
  const live = await createMeraLiveAccount();
  try {
    return live.identity;
  } finally {
    live.end();
  }
}

async function recoverMeraAccount(): Promise<MeraAccountIdentity> {
  const live = await recoverMeraLiveAccount();
  try {
    return live.identity;
  } finally {
    live.end();
  }
}

/**
 * PRF output -> BIP-39 entropy -> BIP-39 seed -> BIP-32 Ethereum path.
 *
 * PRF, seed, and the temporary private-key buffer are zeroed after the Mera
 * session takes its own in-memory copy. Nothing secret is persisted.
 */
function deriveLiveAccount(result: PrfResult): MeraLiveAccount {
  if (result.prfOutput.length !== 32) {
    result.prfOutput.fill(0);
    throw new Error("Mera PRF output must be 32 bytes.");
  }

  let seed: Uint8Array | undefined;
  let privateKey: Uint8Array | undefined;
  let session: Secp256k1SigningSession | undefined;

  try {
    const mnemonic = entropyToMnemonic(result.prfOutput, wordlist);
    seed = mnemonicToSeedSync(mnemonic);

    const node = HDKey.fromMasterSeed(seed).derive(EVM_ACCOUNT_PATH);
    if (node.privateKey === null) {
      throw new Error("Mera account derivation produced no private key.");
    }

    privateKey = Uint8Array.from(node.privateKey);
    session = createSecp256k1SigningSession({ privateKey });
    const account = toViemAccount(session);
    const identity = Object.freeze({
      address: getEvmAddress(session.publicKey),
      credentialId: result.credentialId,
    });

    return Object.freeze({
      identity,
      session,
      account,
      end: () => session?.end(),
    });
  } catch (error) {
    session?.end();
    throw error;
  } finally {
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
      return "The device refused the passkey request for " + rpId +
        ". Verify the Apple/Android association files for this app and relying-party domain.";
    case "NoCredentials":
      return "No synced passkey for " + rpId + " is available on this device.";
    default:
      return typeof message === "string"
        ? message
        : "The passkey request failed.";
  }
}

export type { MeraAccountIdentity, MeraLiveAccount };
export {
  createMeraAccount,
  createMeraLiveAccount,
  describeMeraError,
  recoverMeraAccount,
  recoverMeraLiveAccount,
};
