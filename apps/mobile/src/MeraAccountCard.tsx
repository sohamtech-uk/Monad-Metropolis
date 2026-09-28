import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createMeraAccount,
  describeMeraError,
  recoverMeraAccount,
  type MeraAccountIdentity,
} from "./mera/account";
import { rpId } from "./mera/config";

type PendingAction = "create" | "recover" | null;

type MeraAccountCardProps = {
  onIdentity: (identity: MeraAccountIdentity) => void;
};

export function MeraAccountCard({ onIdentity }: MeraAccountCardProps) {
  const [identity, setIdentity] = useState<MeraAccountIdentity | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Exclude<PendingAction, null>) {
    setPending(action);
    setError(null);

    try {
      const next =
        action === "create"
          ? await createMeraAccount()
          : await recoverMeraAccount();

      setIdentity(next);
      onIdentity(next);
    } catch (caught) {
      setError(describeMeraError(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>MERA ACCOUNT LAYER</Text>
      <Text style={styles.title}>One passkey. Same Monad account.</Text>
      <Text style={styles.body}>
        Cherry stores no seed phrase, wallet private key, or required account
        secret. The same synced passkey reconstructs the same EVM address.
      </Text>

      <Text style={styles.label}>Passkey domain</Text>
      <Text selectable style={styles.mono}>
        {rpId}
      </Text>

      {identity ? (
        <View style={styles.identity}>
          <Text style={styles.status}>Passkey account ready</Text>
          <Text selectable style={styles.address}>
            {identity.address}
          </Text>
          <Text style={styles.body}>
            Clear this local view, then use Recover with passkey. The address
            must reproduce without relying on local app state.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <ActionButton
          disabled={pending !== null}
          label={pending === "create" ? "Waiting for passkey…" : "Create with passkey"}
          onPress={() => void run("create")}
          primary
        />
        <ActionButton
          disabled={pending !== null}
          label={pending === "recover" ? "Waiting for passkey…" : "Recover with passkey"}
          onPress={() => void run("recover")}
        />
      </View>

      {pending ? <ActivityIndicator /> : null}

      {identity ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setIdentity(null);
            setError(null);
          }}
        >
          <Text style={styles.link}>Clear local view for stateless test</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.note}>
        Phase 2 derives identity only. Transaction signing remains disabled until
        the scoped-session phase.
      </Text>
    </View>
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
      <Text style={primary ? styles.buttonPrimaryText : styles.buttonSecondaryText}>
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
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
  },
  identity: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    gap: 8,
    paddingTop: 12,
  },
  status: {
    fontSize: 14,
    fontWeight: "700",
  },
  address: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    gap: 10,
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
    borderColor: "#111827",
    borderWidth: 1,
    backgroundColor: "#ffffff",
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
  link: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
  },
});
