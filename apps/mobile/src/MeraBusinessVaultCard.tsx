import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { base64urlnopad } from "@scure/base";

import {
  VAULT_NAMESPACES,
  alternateNamespace,
  decryptBusinessVault,
  deriveNamespaceSalt,
  encryptBusinessVault,
  namespaceLabel,
  parseBusinessVaultEnvelope,
  proveNamespaceIsolation,
  serializeBusinessVaultEnvelope,
  type BusinessVaultNamespace,
} from "./mera/businessVault";

type PendingAction = "encrypt" | "decrypt" | "isolation" | null;

type MeraBusinessVaultCardProps = {
  accountCredentialId: string | null;
};

export function MeraBusinessVaultCard({
  accountCredentialId,
}: MeraBusinessVaultCardProps) {
  const [namespace, setNamespace] = useState<BusinessVaultNamespace>(
    VAULT_NAMESPACES.askCherryMemory,
  );
  const [plaintext, setPlaintext] = useState(
    "Prefer supplier payments over AUSD on Monad when the recipient supports it.",
  );
  const [envelopeJson, setEnvelopeJson] = useState("");
  const [decrypted, setDecrypted] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isolationVerified, setIsolationVerified] = useState(false);

  const namespaceSaltLabel = useMemo(() => {
    const salt = deriveNamespaceSalt(namespace);
    try {
      const encoded = base64urlnopad.encode(salt);
      return encoded.slice(0, 12) + "…";
    } finally {
      salt.fill(0);
    }
  }, [namespace]);

  async function encrypt() {
    if (!accountCredentialId) {
      setError(
        "Create or recover the Mera account first so this feature uses the same passkey.",
      );
      return;
    }

    setPending("encrypt");
    setNotice(null);
    setError(null);
    setDecrypted("");
    setIsolationVerified(false);

    try {
      const envelope = await encryptBusinessVault({
        namespace,
        plaintext,
        credentialId: accountCredentialId,
      });

      setEnvelopeJson(serializeBusinessVaultEnvelope(envelope));
      setNotice(
        "Encrypted with the same Mera passkey under the " +
          namespaceLabel(namespace) +
          " namespace. No PRF output or encryption key was stored.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to encrypt Cherry business state.",
      );
    } finally {
      setPending(null);
    }
  }

  async function decrypt() {
    setPending("decrypt");
    setNotice(null);
    setError(null);
    setDecrypted("");
    setIsolationVerified(false);

    try {
      const envelope = parseBusinessVaultEnvelope(envelopeJson);
      const value = await decryptBusinessVault(envelope);
      setNamespace(envelope.namespace);
      setDecrypted(value);
      setNotice(
        "Decrypted from ciphertext using the synced passkey and the envelope's namespaced PRF salt.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to decrypt Cherry business state.",
      );
    } finally {
      setPending(null);
    }
  }

  async function proveIsolation() {
    setPending("isolation");
    setNotice(null);
    setError(null);
    setIsolationVerified(false);

    try {
      const envelope = parseBusinessVaultEnvelope(envelopeJson);
      const other = alternateNamespace(envelope.namespace);
      const result = await proveNamespaceIsolation(envelope, other);

      if (!result.isolated) {
        throw new Error(
          "Unexpected result: the alternate namespace decrypted the vault.",
        );
      }

      setIsolationVerified(true);
      setNotice(
        namespaceLabel(result.testedNamespace) +
          " derived a different key and could not decrypt this envelope.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to verify namespace isolation.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>MERA · ONE PASSKEY, MANY KEYS</Text>
      <Text style={styles.title}>Passkey-protected Cherry Business Vault</Text>
      <Text style={styles.body}>
        This is deliberately non-wallet functionality. A custom 32-byte Mera
        PRF salt creates an isolated namespace for private Cherry application
        state. Only ciphertext and non-secret metadata need to travel between
        devices.
      </Text>

      <Text style={styles.label}>Namespace</Text>
      <View style={styles.namespaceRow}>
        <NamespaceButton
          active={namespace === VAULT_NAMESPACES.askCherryMemory}
          label="Ask Cherry memory"
          onPress={() => {
            setNamespace(VAULT_NAMESPACES.askCherryMemory);
            setIsolationVerified(false);
          }}
        />
        <NamespaceButton
          active={namespace === VAULT_NAMESPACES.supplierPrivateNote}
          label="Supplier note"
          onPress={() => {
            setNamespace(VAULT_NAMESPACES.supplierPrivateNote);
            setIsolationVerified(false);
          }}
        />
      </View>

      <View style={styles.namespaceInfo}>
        <Text style={styles.infoLabel}>Namespace ID</Text>
        <Text selectable style={styles.mono}>
          {namespace}
        </Text>
        <Text style={styles.infoLabel}>Public PRF salt fingerprint</Text>
        <Text selectable style={styles.mono}>
          {namespaceSaltLabel}
        </Text>
      </View>

      <Text style={styles.label}>Private application state</Text>
      <TextInput
        multiline
        onChangeText={setPlaintext}
        placeholder="Use fictional demo data here."
        style={[styles.input, styles.textArea]}
        textAlignVertical="top"
        value={plaintext}
      />

      <ActionButton
        disabled={pending !== null || !plaintext.trim() || !accountCredentialId}
        label={
          pending === "encrypt"
            ? "Waiting for passkey…"
            : "Encrypt with same Mera passkey"
        }
        onPress={() => void encrypt()}
        primary
      />

      {!accountCredentialId ? (
        <Text style={styles.warning}>
          Recover or create the Mera payment account above first. Encryption is
          then pinned to that exact passkey credential.
        </Text>
      ) : null}

      {pending === "encrypt" ? <ActivityIndicator /> : null}

      <Text style={styles.label}>Encrypted portable envelope</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        onChangeText={(value) => {
          setEnvelopeJson(value);
          setDecrypted("");
          setIsolationVerified(false);
        }}
        placeholder="Encrypted JSON appears here. Paste it on another device to recover."
        style={[styles.input, styles.envelopeArea]}
        textAlignVertical="top"
        value={envelopeJson}
      />

      <View style={styles.actions}>
        <ActionButton
          disabled={pending !== null || !envelopeJson.trim()}
          label={
            pending === "decrypt"
              ? "Waiting for passkey…"
              : "Decrypt imported envelope"
          }
          onPress={() => void decrypt()}
          primary
        />
        <ActionButton
          disabled={pending !== null || !envelopeJson.trim()}
          label={
            pending === "isolation"
              ? "Testing namespace…"
              : "Prove other namespace cannot decrypt"
          }
          onPress={() => void proveIsolation()}
        />
      </View>

      {pending === "decrypt" || pending === "isolation" ? (
        <ActivityIndicator />
      ) : null}

      {decrypted ? (
        <View style={styles.success}>
          <Text style={styles.successTitle}>Cross-device recovery ready ✓</Text>
          <Text style={styles.successText}>{decrypted}</Text>
        </View>
      ) : null}

      {isolationVerified ? (
        <View style={styles.isolation}>
          <Text style={styles.isolationTitle}>Namespace isolation proved ✓</Text>
          <Text style={styles.isolationText}>
            The alternate Mera PRF namespace produced unrelated key material,
            so authenticated decryption failed as expected.
          </Text>
        </View>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.note}>
        The envelope contains ciphertext, nonce, namespace salt and credential
        ID. It never contains the Mera PRF output or derived encryption key.
        Mutable key buffers are zeroed after use. JavaScript strings displayed
        in the UI cannot be reliably wiped from runtime memory, so demo content
        should remain non-sensitive.
      </Text>
    </View>
  );
}

function NamespaceButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.namespaceButton,
        active && styles.namespaceButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.namespaceButtonText,
          active && styles.namespaceButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
  primary = false,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={
          primary ? styles.buttonPrimaryText : styles.buttonSecondaryText
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    gap: 12,
    padding: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  namespaceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  namespaceButton: {
    borderColor: "#cbd5e1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  namespaceButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  namespaceButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  namespaceButtonTextActive: {
    color: "#ffffff",
  },
  namespaceInfo: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    gap: 5,
    padding: 12,
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 17,
  },
  input: {
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 88,
  },
  envelopeArea: {
    fontFamily: "monospace",
    fontSize: 10,
    minHeight: 130,
  },
  actions: {
    gap: 9,
  },
  button: {
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  buttonPrimary: {
    backgroundColor: "#111827",
  },
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderColor: "#111827",
    borderWidth: 1,
  },
  buttonPrimaryText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  buttonSecondaryText: {
    color: "#111827",
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  warning: {
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    color: "#9a3412",
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
  },
  success: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    gap: 6,
    padding: 12,
  },
  successTitle: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "700",
  },
  successText: {
    color: "#14532d",
    fontSize: 13,
    lineHeight: 19,
  },
  isolation: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    gap: 6,
    padding: 12,
  },
  isolationTitle: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
  },
  isolationText: {
    color: "#1e3a8a",
    fontSize: 12,
    lineHeight: 18,
  },
  notice: {
    color: "#166534",
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 18,
  },
  note: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
  },
});
