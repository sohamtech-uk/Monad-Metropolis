import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  DEFAULT_MAX_AUTHORIZATIONS,
  DEFAULT_MAX_CUMULATIVE,
  DEFAULT_MAX_PER_PAYMENT,
  SessionPolicyViolation,
  createPaymentSessionScope,
} from "@cherry-metropolis/core";
import {
  formatUnits,
  getAddress,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
} from "viem";

import {
  createMeraLiveAccount,
  describeMeraError,
  recoverMeraLiveAccount,
  type MeraAccountIdentity,
} from "./mera/account";
import { rpId } from "./mera/config";
import { ScopedMeraPaymentSession } from "./mera/scopedSession";

type PendingAction = "create" | "recover" | "sign" | null;

type MeraSessionCardProps = {
  chainId: number;
  assetAddress: Address;
  assetDecimals: number;
  onIdentity: (identity: MeraAccountIdentity) => void;
};

export function MeraSessionCard({
  chainId,
  assetAddress,
  assetDecimals,
  onIdentity,
}: MeraSessionCardProps) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("25");
  const [identity, setIdentity] = useState<MeraAccountIdentity | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [authorizationCount, setAuthorizationCount] = useState(0);
  const [cumulativeAmount, setCumulativeAmount] = useState(0n);
  const [ceremonyMs, setCeremonyMs] = useState<number | null>(null);
  const [signatureMs, setSignatureMs] = useState<number | null>(null);
  const sessionRef = useRef<ScopedMeraPaymentSession | null>(null);

  function refreshSession() {
    const session = sessionRef.current;
    if (!session) {
      setRemainingMs(0);
      setAuthorizationCount(0);
      setCumulativeAmount(0n);
      return;
    }

    const status = session.status();
    setRemainingMs(status.remainingMs);
    setAuthorizationCount(status.authorizationCount);
    setCumulativeAmount(status.cumulativeAmount);

    if (!status.active && status.endReason) {
      setNotice(
        status.endReason === "expired"
          ? "Session expired. Use your passkey to open a new payment session."
          : "Session closed: " + status.endReason + ".",
      );
    }
  }

  useEffect(() => {
    const timer = setInterval(refreshSession, 1_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active" && sessionRef.current) {
        sessionRef.current.end("background");
        refreshSession();
        setNotice(
          "Session closed when the app left the foreground. Use your passkey to continue.",
        );
      }
    });

    return () => {
      clearInterval(timer);
      appState.remove();
      sessionRef.current?.end("replaced");
    };
  }, []);

  async function openSession(action: "create" | "recover") {
    setPending(action);
    setError(null);
    setNotice(null);
    setSignatureMs(null);

    try {
      const normalizedRecipient = getAddress(recipient);
      sessionRef.current?.end("replaced");

      const startedAt = Date.now();
      const live =
        action === "create"
          ? await createMeraLiveAccount()
          : await recoverMeraLiveAccount();

      try {
        const scope = createPaymentSessionScope({
          chainId,
          asset: assetAddress,
          recipient: normalizedRecipient,
          assetDecimals,
          nowMs: Date.now(),
        });

        const session = new ScopedMeraPaymentSession(live, scope);
        sessionRef.current = session;
        setIdentity(session.identity);
        onIdentity(session.identity);
        setCeremonyMs(Date.now() - startedAt);
        setNotice(
          "Payment session opened. In-scope authorizations now sign without another passkey prompt.",
        );
        refreshSession();
      } catch (caught) {
        live.end();
        throw caught;
      }
    } catch (caught) {
      setError(describeMeraError(caught));
    } finally {
      setPending(null);
    }
  }

  async function signAuthorization() {
    const session = sessionRef.current;
    if (!session) {
      setError("Open a passkey payment session first.");
      return;
    }

    setPending("sign");
    setError(null);
    setNotice(null);

    try {
      const startedAt = Date.now();
      const paymentAmount = parseUnits(amount, assetDecimals);
      const reference = keccak256(
        toBytes(
          "cherry-metropolis:" +
            session.identity.address +
            ":" +
            Date.now().toString(),
        ),
      );

      const signed = await session.authorizePayment({
        chainId,
        asset: assetAddress,
        recipient: getAddress(recipient),
        amount: paymentAmount,
        reference,
      });

      setSignatureMs(Date.now() - startedAt);
      setNotice(
        "Prompt-free authorization #" +
          signed.authorizationNumber.toString() +
          " signed and recovered to " +
          shortAddress(signed.recoveredAddress) +
          ".",
      );
      refreshSession();
    } catch (caught) {
      if (caught instanceof SessionPolicyViolation) {
        setError(
          caught.message +
            " A new passkey ceremony is required for the changed scope.",
        );
      } else {
        setError(describeMeraError(caught));
      }
      refreshSession();
    } finally {
      setPending(null);
    }
  }

  function endSession() {
    sessionRef.current?.end("manual");
    refreshSession();
    setNotice("Session ended. The in-memory Mera signing key has been zeroed.");
  }

  const active = Boolean(sessionRef.current?.status().active);
  const scope = sessionRef.current?.scope;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>MERA SCOPED SESSION</Text>
      <Text style={styles.title}>
        One prompt, then a tightly bounded payment burst.
      </Text>
      <Text style={styles.body}>
        The passkey opens a short in-memory Mera signing session. Prompt-free
        signing is limited to one network, AUSD, one recipient, capped amounts,
        three authorizations, and five minutes.
      </Text>

      <Text style={styles.label}>Passkey domain</Text>
      <Text selectable style={styles.mono}>
        {rpId}
      </Text>

      <Text style={styles.label}>Approved recipient</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        editable={pending === null}
        onChangeText={setRecipient}
        placeholder="0x recipient"
        style={styles.input}
        value={recipient}
      />

      <View style={styles.actions}>
        <ActionButton
          disabled={pending !== null || !recipient.trim()}
          label={
            pending === "create"
              ? "Waiting for passkey…"
              : "Create + open session"
          }
          onPress={() => void openSession("create")}
          primary
        />
        <ActionButton
          disabled={pending !== null || !recipient.trim()}
          label={
            pending === "recover"
              ? "Waiting for passkey…"
              : "Recover + open session"
          }
          onPress={() => void openSession("recover")}
        />
      </View>

      {pending === "create" || pending === "recover" ? (
        <ActivityIndicator />
      ) : null}

      {identity ? (
        <View style={styles.identity}>
          <Text style={styles.status}>
            {active ? "Session active" : "Account recovered"}
          </Text>
          <Text selectable style={styles.address}>
            {identity.address}
          </Text>
        </View>
      ) : null}

      {scope ? (
        <View style={styles.scope}>
          <Row label="Network" value={String(scope.chainId)} />
          <Row label="Asset" value="AUSD" />
          <Row
            label="Per payment"
            value={formatUnits(scope.maxPerPayment, assetDecimals) + " AUSD"}
          />
          <Row
            label="Session total"
            value={formatUnits(scope.maxCumulative, assetDecimals) + " AUSD"}
          />
          <Row
            label="Approvals"
            value={
              authorizationCount.toString() +
              "/" +
              scope.maxAuthorizations.toString()
            }
          />
          <Row
            label="Used"
            value={formatUnits(cumulativeAmount, assetDecimals) + " AUSD"}
          />
          <Row label="Expires in" value={formatRemaining(remainingMs)} />
        </View>
      ) : (
        <Text style={styles.scopeHint}>
          Default scope: max {DEFAULT_MAX_PER_PAYMENT} AUSD/payment,{" "}
          {DEFAULT_MAX_CUMULATIVE} AUSD total, {DEFAULT_MAX_AUTHORIZATIONS}{" "}
          prompt-free authorizations.
        </Text>
      )}

      {active ? (
        <>
          <Text style={styles.label}>Authorization amount</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            style={styles.input}
            value={amount}
          />
          <ActionButton
            disabled={pending !== null}
            label={
              pending === "sign"
                ? "Signing…"
                : "Sign payment authorization — no prompt"
            }
            onPress={() => void signAuthorization()}
            primary
          />
          <Pressable accessibilityRole="button" onPress={endSession}>
            <Text style={styles.link}>End session now</Text>
          </Pressable>
        </>
      ) : null}

      {ceremonyMs !== null ? (
        <Row label="Passkey ceremony" value={formatLatency(ceremonyMs)} />
      ) : null}
      {signatureMs !== null ? (
        <Row label="Prompt-free signature" value={formatLatency(signatureMs)} />
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.note}>
        Changing recipient, chain, asset, or exceeding the amount/session limits
        is rejected before signing and requires a new passkey-authorized scope.
        This phase signs EIP-712 payment authorizations only; it does not
        broadcast transactions.
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
      <Text
        style={primary ? styles.buttonPrimaryText : styles.buttonSecondaryText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return minutes.toString() + ":" + remainder;
}

function formatLatency(ms: number): string {
  return ms < 1_000
    ? ms.toString() + " ms"
    : (ms / 1_000).toFixed(2) + " s";
}

function shortAddress(address: string): string {
  return address.slice(0, 6) + "…" + address.slice(-4);
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
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
  },
  input: {
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    fontFamily: "monospace",
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  identity: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
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
  scope: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },
  scopeHint: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  value: {
    flexShrink: 1,
    fontSize: 13,
    textAlign: "right",
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  notice: {
    color: "#166534",
    fontSize: 13,
    lineHeight: 19,
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
