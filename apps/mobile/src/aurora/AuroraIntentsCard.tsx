import { useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  Execution,
  ExecutionRunner,
  RunnerEvent,
} from "@aurora-is-near/intents-connect";
import { getAddress } from "viem";

import {
  createMeraLiveAccount,
  describeMeraError,
  recoverMeraLiveAccount,
  type MeraLiveAccount,
} from "../mera/account";
import { AURORA_INTENTS_ENABLED } from "./config";
import {
  createCherryAuroraRunner,
  monadMainnetTransactionUrl,
  previewAuroraPayment,
  type AuroraPaymentPreview,
} from "./payment";

type DepositMode = "external" | "passkey-base";

export function AuroraIntentsCard() {
  const liveRef = useRef<MeraLiveAccount | null>(null);
  const runnerRef = useRef<ExecutionRunner | null>(null);

  const [address, setAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1.00");
  const [depositMode, setDepositMode] = useState<DepositMode>("external");
  const [preview, setPreview] = useState<AuroraPaymentPreview | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [phase, setPhase] = useState("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [depositHash, setDepositHash] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      runnerRef.current?.dispose();
      runnerRef.current = null;
      liveRef.current?.end();
      liveRef.current = null;
    },
    [],
  );

  function resetRoute() {
    runnerRef.current?.dispose();
    runnerRef.current = null;
    setPreview(null);
    setExecution(null);
    setExecutionId(null);
    setPhase("idle");
    setStatus(null);
    setDepositAddress(null);
    setDepositHash(null);
    setDeadline(null);
    setError("");
  }

  async function connect(create: boolean) {
    if (!AURORA_INTENTS_ENABLED) {
      setError("Aurora Intents is disabled until the Cherry Money proxy and API key are configured.");
      return;
    }

    setBusy(true);
    setError("");
    resetRoute();

    try {
      liveRef.current?.end();
      const live = await (create
        ? createMeraLiveAccount()
        : recoverMeraLiveAccount());

      liveRef.current = live;
      setAddress(getAddress(live.identity.address));
    } catch (nextError) {
      setError(describeMeraError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function previewRoute() {
    const live = liveRef.current;

    if (!live) {
      setError("Use your Cherry Pay passkey before previewing the route.");
      return;
    }

    setBusy(true);
    setError("");
    setExecution(null);
    setExecutionId(null);
    setDepositAddress(null);
    setDepositHash(null);
    setDeadline(null);
    setPhase("planning");
    setStatus(null);

    try {
      const next = await previewAuroraPayment(live, {
        recipient,
        amount,
        depositViaWallet: depositMode === "passkey-base",
      });

      setPreview(next);
      setExecutionId(next.executionId);
      setPhase("preview-ready");
    } catch (nextError) {
      setPreview(null);
      setPhase("idle");
      setError(describeMeraError(nextError));
    } finally {
      setBusy(false);
    }
  }

  function handleRunnerEvent(event: RunnerEvent) {
    switch (event.type) {
      case "phase":
        setPhase(event.phase);
        break;
      case "status":
        setStatus(event.status);
        break;
      case "created":
        setExecutionId(event.executionId);
        break;
      case "deposit-address":
        setDepositAddress(event.address);
        setDeadline(event.deadline ?? null);
        break;
      case "deposit-sent":
        setDepositHash(event.txHash);
        break;
      case "error":
        setError(event.error.message);
        break;
      case "quoted":
        break;
    }
  }

  async function startPayment() {
    const live = liveRef.current;

    if (!live || !preview) {
      setError("Preview the Aurora route before starting the payment.");
      return;
    }

    setBusy(true);
    setError("");
    setExecution(null);

    const runner = createCherryAuroraRunner(live, handleRunnerEvent);
    runnerRef.current?.dispose();
    runnerRef.current = runner;

    try {
      const result = await runner.run(preview.plan);
      setExecution(result);
      setExecutionId(result.id);
      setStatus(result.status);
    } catch (nextError) {
      setError(
        describeMeraError(nextError) +
          " If funds were already sent, do not create another payment; resume or inspect this execution instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resumePayment() {
    const runner = runnerRef.current;

    if (!runner || !executionId) {
      setError(
        "Reconnect the same Cherry Pay passkey and restart from a fresh preview if this app session was closed.",
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await runner.resume(executionId, {
        depositViaWallet: false,
      });
      setExecution(result);
      setStatus(result.status);
    } catch (nextError) {
      setError(describeMeraError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function cancelPayment() {
    const runner = runnerRef.current;

    if (!runner || !executionId) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await runner.cancel(executionId);
      setPhase("idle");
      setStatus(null);
      setDepositAddress(null);
      setDeadline(null);
      setPreview(null);
      setExecutionId(null);
    } catch (nextError) {
      setError(describeMeraError(nextError));
    } finally {
      setBusy(false);
    }
  }

  const transactionUrl = execution
    ? monadMainnetTransactionUrl(execution)
    : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>AURORA INTENTS · MONAD</Text>
        <Text style={styles.title}>Pay with what you already have</Text>
        <Text style={styles.body}>
          One Cherry Pay intent routes Base USDC into USDC on Monad and executes
          the final merchant transfer. Aurora handles the bridge, routing and
          destination execution instead of making the payer operate a bridge.
        </Text>
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            {AURORA_INTENTS_ENABLED
              ? "Experimental hackathon route · real Base and Monad mainnet USDC. Maximum 100 USDC. The existing Agora AUSD testnet reconciliation demo remains separate."
              : "Aurora Intents is installed but disabled. Enable it only after the Cherry Money proxy has its deployment API key. No funds can move while disabled."}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>1. Cherry Pay passkey</Text>
        <Text style={styles.body}>
          Aurora's execution is signed by the existing Mera-derived EVM account.
          No seed phrase or browser wallet is required for the intent signature.
        </Text>
        <Text selectable style={styles.code}>
          {address || "No passkey account connected"}
        </Text>
        <View style={styles.actions}>
          <Button
            label="Use existing passkey"
            disabled={busy || !AURORA_INTENTS_ENABLED}
            onPress={() => void connect(false)}
          />
          <Button
            label="Create passkey"
            secondary
            disabled={busy || !AURORA_INTENTS_ENABLED}
            onPress={() => void connect(true)}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>2. Payment outcome</Text>
        <Field
          label="Recipient on Monad"
          value={recipient}
          setValue={(value) => {
            setRecipient(value);
            setPreview(null);
          }}
          disabled={busy}
          placeholder="0x…"
        />
        <Field
          label="Pay from Base USDC"
          value={amount}
          setValue={(value) => {
            setAmount(value);
            setPreview(null);
          }}
          disabled={busy}
          placeholder="1.00"
        />

        <Text style={styles.label}>Funding method</Text>
        <View style={styles.actions}>
          <Choice
            active={depositMode === "external"}
            label="Any wallet / exchange"
            disabled={busy}
            onPress={() => {
              setDepositMode("external");
              setPreview(null);
            }}
          />
          <Choice
            active={depositMode === "passkey-base"}
            label="This passkey on Base"
            disabled={busy}
            onPress={() => {
              setDepositMode("passkey-base");
              setPreview(null);
            }}
          />
        </View>
        <Text style={styles.body}>
          {depositMode === "external"
            ? "Recommended for the demo: Cherry shows the exact deposit address after signing. Fund it from any supported wallet or exchange; Cherry does not ask you to switch networks."
            : "Automatic Base deposit uses this same passkey account. It must already hold Base USDC and a small amount of ETH for the Base transfer gas."}
        </Text>

        <Button
          label={busy && phase === "planning" ? "Checking route…" : "Preview Aurora route"}
          disabled={busy || !address || !recipient.trim() || !amount.trim()}
          onPress={() => void previewRoute()}
        />
      </View>

      {preview ? (
        <View style={styles.card}>
          <Text style={styles.heading}>3. Review the route</Text>
          <Metric label="Aurora route" value="Live support confirmed" />
          <Metric label="You provide" value={preview.sourceAmountFormatted + " USDC on Base"} />
          <Metric
            label="Minimum destination"
            value={preview.minimumMonadUsdcFormatted + " USDC on Monad"}
          />
          <Metric
            label="Estimated execution"
            value={preview.estimatedTime ?? "Calculated by Aurora at execution"}
          />
          <Metric
            label="Destination network fee"
            value={
              preview.networkFeeAtomic
                ? preview.networkFeeAtomic + " atomic USDC"
                : "Included by Aurora in the destination quote"
            }
          />
          <Text style={styles.small}>
            The final Monad transfer is built with Aurora's fee-adjusted amount
            placeholder, so Cherry never guesses the post-fee value.
          </Text>
          <Button
            label={busy ? "Executing…" : "Sign intent & start payment"}
            disabled={busy}
            onPress={() => void startPayment()}
          />
        </View>
      ) : null}

      {executionId || depositAddress || status ? (
        <View style={styles.card}>
          <Text style={styles.heading}>Aurora execution</Text>
          <Metric label="Phase" value={phase} />
          <Metric label="Status" value={status ?? "Preparing"} />
          {executionId ? (
            <>
              <Text style={styles.label}>Execution ID</Text>
              <Text selectable style={styles.code}>{executionId}</Text>
            </>
          ) : null}

          {depositAddress ? (
            <View style={styles.deposit}>
              <Text style={styles.depositTitle}>Deposit ready</Text>
              <Text style={styles.body}>
                Send exactly {preview?.sourceAmountFormatted ?? amount} Base
                USDC to this address. The address is shown only after the Aurora
                execution signature has been submitted.
              </Text>
              <Text selectable style={styles.code}>{depositAddress}</Text>
              {deadline ? (
                <Text style={styles.small}>Deposit deadline: {deadline}</Text>
              ) : null}
            </View>
          ) : null}

          {depositHash ? (
            <>
              <Text style={styles.label}>Base deposit transaction</Text>
              <Text selectable style={styles.code}>{depositHash}</Text>
              <Button
                secondary
                label="Open Base transaction"
                onPress={() =>
                  void Linking.openURL("https://basescan.org/tx/" + depositHash)
                }
              />
            </>
          ) : null}

          {status !== "SUCCESS" && executionId ? (
            <View style={styles.actions}>
              <Button
                secondary
                label="Resume status"
                disabled={busy}
                onPress={() => void resumePayment()}
              />
              <Button
                secondary
                label="Cancel before funding"
                disabled={busy || Boolean(depositHash)}
                onPress={() => void cancelPayment()}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {execution?.status === "SUCCESS" ? (
        <View style={[styles.card, styles.success]}>
          <Text style={styles.heading}>✓ Settled on Monad</Text>
          <Text style={styles.body}>
            Aurora Intents completed the cross-chain payment and destination
            contract call.
          </Text>
          {execution.transaction?.evmTxHash ? (
            <Text selectable style={styles.code}>
              {execution.transaction.evmTxHash}
            </Text>
          ) : null}
          {transactionUrl ? (
            <Button
              secondary
              label="View Monad transaction"
              onPress={() => void Linking.openURL(transactionUrl)}
            />
          ) : null}
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Field({
  label,
  value,
  setValue,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onChangeText={setValue}
        placeholder={placeholder}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={secondary ? styles.buttonSecondaryText : styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );
}

function Choice({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, active && styles.choiceActive]}
    >
      <Text style={active ? styles.choiceActiveText : styles.choiceText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 18 },
  hero: { gap: 12 },
  eyebrow: {
    color: "#6b4e16",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  title: { color: "#142032", fontSize: 30, fontWeight: "800" },
  body: { color: "#475569", fontSize: 14, lineHeight: 22 },
  warning: {
    backgroundColor: "#fff7df",
    borderRadius: 14,
    padding: 14,
  },
  warningText: { color: "#6b4e16", fontSize: 13, lineHeight: 20, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderColor: "#e4e8ee",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 20,
  },
  success: { borderColor: "#b7d9c5", backgroundColor: "#f4fbf7" },
  heading: { color: "#152b27", fontSize: 20, fontWeight: "800" },
  field: { gap: 6 },
  label: { color: "#334155", fontSize: 13, fontWeight: "700" },
  input: {
    borderColor: "#c8d1dc",
    borderRadius: 10,
    borderWidth: 1,
    color: "#172b27",
    padding: 12,
  },
  code: {
    color: "#475569",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 20,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    alignItems: "center",
    backgroundColor: "#183127",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  buttonSecondary: { backgroundColor: "#edf4f0" },
  buttonText: { color: "#fff", fontWeight: "800" },
  buttonSecondaryText: { color: "#183127", fontWeight: "800" },
  disabled: { opacity: 0.4 },
  choice: {
    backgroundColor: "#eef1f5",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  choiceActive: { backgroundColor: "#6046a8" },
  choiceText: { color: "#334155", fontWeight: "700" },
  choiceActiveText: { color: "#fff", fontWeight: "800" },
  metric: {
    alignItems: "flex-start",
    borderBottomColor: "#eef1f5",
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 10,
  },
  metricLabel: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  metricValue: { color: "#172b27", fontSize: 15, fontWeight: "700" },
  small: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  deposit: {
    backgroundColor: "#f6f1ff",
    borderRadius: 14,
    gap: 8,
    padding: 14,
  },
  depositTitle: { color: "#51398f", fontSize: 16, fontWeight: "800" },
  errorBox: {
    backgroundColor: "#fff1f2",
    borderRadius: 14,
    padding: 14,
  },
  error: { color: "#b91c1c", lineHeight: 21 },
});
