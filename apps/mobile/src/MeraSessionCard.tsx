import { useEffect, useMemo, useRef, useState } from "react";
import type { CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import {
  ActivityIndicator,
  AppState,
  Linking,
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
  MonadReadClient,
  SessionPolicyViolation,
  createPaymentSessionScope,
  type AusdBalance,
  type MonadRuntimeConfig,
  type NativeBalance,
  type SettlementCorrelationResult,
} from "@cherry-metropolis/core";
import {
  formatUnits,
  getAddress,
  keccak256,
  parseUnits,
  toBytes,
} from "viem";

import {
  createMeraLiveAccount,
  describeMeraError,
  recoverMeraLiveAccount,
  type MeraAccountIdentity,
} from "./mera/account";
import { rpId } from "./mera/config";
import {
  ScopedMeraPaymentSession,
  type AusdTransferResult,
  type FaucetResult,
} from "./mera/scopedSession";

type PendingAction =
  | "create"
  | "recover"
  | "send"
  | "faucet"
  | "refresh"
  | "correlate"
  | null;

type MeraSessionCardProps = {
  runtimeConfig: MonadRuntimeConfig;
  journeyStartedAtMs: number;
  paymentDraft: CherryMoneyPaymentDraft | null;
  onIdentity: (identity: MeraAccountIdentity) => void;
};

export function MeraSessionCard({
  runtimeConfig,
  journeyStartedAtMs,
  paymentDraft,
  onIdentity,
}: MeraSessionCardProps) {
  const readClient = useMemo(
    () => new MonadReadClient(runtimeConfig),
    [runtimeConfig],
  );

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
  const [senderAusd, setSenderAusd] = useState<AusdBalance | null>(null);
  const [senderMon, setSenderMon] = useState<NativeBalance | null>(null);
  const [transfer, setTransfer] = useState<AusdTransferResult | null>(null);
  const [faucet, setFaucet] = useState<FaucetResult | null>(null);
  const [timeToFirstConfirmedMs, setTimeToFirstConfirmedMs] =
    useState<number | null>(null);

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

  async function refreshBalances(account: string) {
    const [ausd, mon] = await Promise.all([
      readClient.ausdBalance(account),
      readClient.nativeBalance(account),
    ]);
    setSenderAusd(ausd);
    setSenderMon(mon);
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

  useEffect(() => {
    sessionRef.current?.end("replaced");
    refreshSession();
    setTransfer(null);
    setFaucet(null);
    setError(null);

    if (!paymentDraft) {
      return;
    }

    const currency = paymentDraft.currency.toUpperCase();
    if (currency === "USD" || currency === "AUSD") {
      setAmount(paymentDraft.amount.toFixed(2));
      setNotice(
        "Cherry Money payment draft selected. The AUSD amount matches the source amount because the draft is denominated in " +
          currency +
          ".",
      );
    } else {
      setAmount("");
      setNotice(
        "Cherry Money draft is denominated in " +
          currency +
          ". Enter the quoted AUSD settlement amount separately; no FX conversion is being assumed.",
      );
    }
  }, [paymentDraft?.id]);

  async function openSession(action: "create" | "recover") {
    setPending(action);
    setError(null);
    setNotice(null);
    setTransfer(null);
    setFaucet(null);

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
          chainId: runtimeConfig.chainId,
          asset: runtimeConfig.ausdAddress,
          recipient: normalizedRecipient,
          assetDecimals: runtimeConfig.ausdDecimals,
          nowMs: Date.now(),
          ...(paymentDraft
            ? { reference: cherryMoneyDraftReference(paymentDraft) }
            : {}),
        });

        const session = new ScopedMeraPaymentSession(live, scope);
        sessionRef.current = session;
        setIdentity(session.identity);
        onIdentity(session.identity);
        setCeremonyMs(Date.now() - startedAt);
        setNotice(
          "Payment session opened. The next in-scope AUSD transfer signs without another passkey prompt.",
        );
        refreshSession();
        await refreshBalances(session.identity.address);
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

  async function requestTestAusd() {
    const session = sessionRef.current;
    if (!session) {
      setError("Open a passkey payment session first.");
      return;
    }

    setPending("faucet");
    setError(null);
    setNotice(null);

    try {
      const result = await session.requestTestAusd(runtimeConfig);
      setFaucet(result);
      setNotice("Agora testnet AUSD faucet transaction confirmed.");
      await refreshBalances(result.account);
    } catch (caught) {
      setError(describeMeraError(caught));
    } finally {
      setPending(null);
      refreshSession();
    }
  }

  async function sendPayment() {
    const session = sessionRef.current;
    if (!session) {
      setError("Open a passkey payment session first.");
      return;
    }

    setPending("send");
    setError(null);
    setNotice(null);
    setTransfer(null);

    try {
      const paymentAmount = parseUnits(
        amount,
        runtimeConfig.ausdDecimals,
      );
      const reference = paymentDraft
        ? cherryMoneyDraftReference(paymentDraft)
        : keccak256(
            toBytes(
              "cherry-metropolis:" +
                session.identity.address +
                ":" +
                Date.now().toString(),
            ),
          );

      const result = await session.sendAusdTransfer(
        runtimeConfig,
        {
          chainId: runtimeConfig.chainId,
          asset: runtimeConfig.ausdAddress,
          recipient: getAddress(recipient),
          amount: paymentAmount,
          reference,
        },
      );

      setTransfer(result);
      setNotice(
        formatUnits(result.amount, runtimeConfig.ausdDecimals) +
          " AUSD settled on Monad.",
      );

      if (timeToFirstConfirmedMs === null) {
        setTimeToFirstConfirmedMs(result.confirmedAtMs - journeyStartedAtMs);
      }

      await refreshBalances(result.sender);
    } catch (caught) {
      if (caught instanceof SessionPolicyViolation) {
        setError(
          caught.message +
            " A new passkey ceremony is required for the changed scope.",
        );
      } else {
        setError(describeMeraError(caught));
      }
    } finally {
      setPending(null);
      refreshSession();
    }
  }

  async function retryCorrelation() {
    const session = sessionRef.current;
    if (!session || !transfer) {
      setError("A confirmed AUSD payment and active Mera session are required.");
      return;
    }

    setPending("correlate");
    setError(null);
    setNotice(null);

    try {
      const correlation = await session.retrySettlementCorrelation(
        runtimeConfig,
        transfer,
      );

      setTransfer(
        Object.freeze({
          ...transfer,
          correlation,
        }),
      );

      setNotice(
        correlation.status === "confirmed"
          ? "Settlement correlation confirmed on Monad."
          : correlation.status === "not_configured"
            ? "Settlement registry is not configured."
            : "AUSD is settled, but the correlation still needs attention.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to retry settlement correlation.",
      );
    } finally {
      setPending(null);
      refreshSession();
    }
  }

  async function refreshFunding() {
    if (!identity) return;
    setPending("refresh");
    setError(null);
    try {
      await refreshBalances(identity.address);
    } catch (caught) {
      setError(describeMeraError(caught));
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
  const hasGas = senderMon !== null && senderMon.raw > 0n;
  const hasAusd = senderAusd !== null && senderAusd.raw > 0n;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>AGORA AUSD · MERA · MONAD</Text>
      <Text style={styles.title}>
        Send AUSD cross-border with one passkey.
      </Text>
      <Text style={styles.body}>
        Approve the recipient once with your passkey, then send an in-scope
        AUSD payment on Monad without another wallet prompt.
      </Text>

      {paymentDraft ? (
        <View style={styles.businessContext}>
          <Text style={styles.businessEyebrow}>CHERRY MONEY PAYMENT DRAFT</Text>
          <Text style={styles.businessTitle}>{paymentDraft.payee}</Text>
          <Row
            label="Source amount"
            value={
              paymentDraft.currency + " " + paymentDraft.amount.toFixed(2)
            }
          />
          <Row
            label="Reference"
            value={paymentDraft.reference || "No reference"}
          />
          <Row label="Draft ID" value={paymentDraft.id} />
          {paymentDraft.purpose ? (
            <Text style={styles.businessPurpose}>{paymentDraft.purpose}</Text>
          ) : null}
          <Text style={styles.safe}>
            Draft only in Cherry Money · no payment executed there
          </Text>
        </View>
      ) : (
        <Text style={styles.warning}>
          No Cherry Money payment draft is selected. The standalone Agora testnet
          flow still works, but Phase 5 business-context evidence is not active.
        </Text>
      )}

      <Text style={styles.label}>Passkey domain</Text>
      <Text selectable style={styles.mono}>
        {rpId}
      </Text>

      <Text style={styles.label}>Recipient</Text>
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
              : "Create + approve recipient"
          }
          onPress={() => void openSession("create")}
          primary
        />
        <ActionButton
          disabled={pending !== null || !recipient.trim()}
          label={
            pending === "recover"
              ? "Waiting for passkey…"
              : "Recover + approve recipient"
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
            {active ? "Payment session active" : "Mera account recovered"}
          </Text>
          <Text selectable style={styles.address}>
            {identity.address}
          </Text>
        </View>
      ) : null}

      {identity ? (
        <View style={styles.scope}>
          <Row
            label="AUSD balance"
            value={senderAusd ? senderAusd.formatted + " AUSD" : "Loading…"}
          />
          <Row
            label="Gas balance"
            value={senderMon ? senderMon.formatted + " MON" : "Loading…"}
          />
          <Pressable
            accessibilityRole="button"
            disabled={pending !== null}
            onPress={() => void refreshFunding()}
          >
            <Text style={styles.link}>Refresh balances</Text>
          </Pressable>
        </View>
      ) : null}

      {scope ? (
        <View style={styles.scope}>
          <Row label="Network" value={String(scope.chainId)} />
          <Row label="Asset" value="AUSD" />
          <Row
            label="Per payment"
            value={
              formatUnits(
                scope.maxPerPayment,
                runtimeConfig.ausdDecimals,
              ) + " AUSD"
            }
          />
          <Row
            label="Session total"
            value={
              formatUnits(
                scope.maxCumulative,
                runtimeConfig.ausdDecimals,
              ) + " AUSD"
            }
          />
          <Row
            label="Payments"
            value={
              authorizationCount.toString() +
              "/" +
              scope.maxAuthorizations.toString()
            }
          />
          <Row
            label="Sent"
            value={
              formatUnits(
                cumulativeAmount,
                runtimeConfig.ausdDecimals,
              ) + " AUSD"
            }
          />
          <Row label="Expires in" value={formatRemaining(remainingMs)} />
        </View>
      ) : (
        <Text style={styles.scopeHint}>
          Default scope: max {DEFAULT_MAX_PER_PAYMENT} AUSD/payment,{" "}
          {DEFAULT_MAX_CUMULATIVE} AUSD total, {DEFAULT_MAX_AUTHORIZATIONS}{" "}
          prompt-free payments.
        </Text>
      )}

      {active ? (
        <>
          {!hasGas ? (
            <Text style={styles.warning}>
              This account needs MON for gas. Fund the Mera address from the
              Monad testnet faucet before requesting AUSD or sending.
            </Text>
          ) : null}

          <ActionButton
            disabled={pending !== null || !hasGas}
            label={
              pending === "faucet"
                ? "Requesting test AUSD…"
                : "Request Agora test AUSD"
            }
            onPress={() => void requestTestAusd()}
          />

          {faucet ? (
            <View style={styles.result}>
              <Text style={styles.status}>Test AUSD funded</Text>
              <Row
                label="Before"
                value={
                  formatUnits(
                    faucet.balanceBefore,
                    runtimeConfig.ausdDecimals,
                  ) + " AUSD"
                }
              />
              <Row
                label="After"
                value={
                  formatUnits(
                    faucet.balanceAfter,
                    runtimeConfig.ausdDecimals,
                  ) + " AUSD"
                }
              />
              <TransactionLink url={faucet.transactionUrl} hash={faucet.hash} />
            </View>
          ) : null}

          <Text style={styles.label}>
            {paymentDraft ? "AUSD settlement amount" : "Amount to send"}
          </Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            style={styles.input}
            value={amount}
          />

          <ActionButton
            disabled={pending !== null || !hasGas || !hasAusd}
            label={
              pending === "send"
                ? "Sending AUSD…"
                : paymentDraft
                  ? "Pay Cherry Money draft with AUSD — no prompt"
                  : "Send AUSD on Monad — no prompt"
            }
            onPress={() => void sendPayment()}
            primary
          />

          <Pressable accessibilityRole="button" onPress={endSession}>
            <Text style={styles.link}>End session now</Text>
          </Pressable>
        </>
      ) : null}

      {transfer ? (
        <View style={styles.success}>
          <Text style={styles.successTitle}>AUSD settled ✓</Text>
          <Row
            label="Amount"
            value={
              formatUnits(
                transfer.amount,
                runtimeConfig.ausdDecimals,
              ) + " AUSD"
            }
          />
          {paymentDraft ? (
            <>
              <Row label="Cherry Money draft" value={paymentDraft.id} />
              <Row label="Payee" value={paymentDraft.payee} />
              <Row
                label="Business reference"
                value={paymentDraft.reference || "No reference"}
              />
            </>
          ) : null}
          <Row
            label="Recipient before"
            value={
              formatUnits(
                transfer.recipientBalanceBefore,
                runtimeConfig.ausdDecimals,
              ) + " AUSD"
            }
          />
          <Row
            label="Recipient after"
            value={
              formatUnits(
                transfer.recipientBalanceAfter,
                runtimeConfig.ausdDecimals,
              ) + " AUSD"
            }
          />
          <Row
            label="Confirmation"
            value={formatLatency(transfer.confirmationMs)}
          />
          <Row
            label="Block"
            value={transfer.blockNumber.toString()}
          />
          <TransactionLink
            url={transfer.transactionUrl}
            hash={transfer.hash}
          />
          <CorrelationEvidence
            correlation={transfer.correlation}
            retryDisabled={!active || pending !== null}
            retryPending={pending === "correlate"}
            onRetry={() => void retryCorrelation()}
          />
        </View>
      ) : null}

      {ceremonyMs !== null ? (
        <Row label="Passkey ceremony" value={formatLatency(ceremonyMs)} />
      ) : null}
      {timeToFirstConfirmedMs !== null ? (
        <Row
          label="Landing → confirmed"
          value={formatLatency(timeToFirstConfirmedMs)}
        />
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.note}>
        Testnet only. AUSD is Agora's test token deployment on Monad testnet.
        When a Cherry Money payment draft is selected, its immutable draft ID
        and business reference are hashed into the passkey-approved payment
        context. Cherry Money remains draft-only in this phase; on-chain
        settlement does not yet mark the accounting record paid. When the
        Phase 6 registry is configured, a second non-custodial transaction
        records only the opaque reference, payment hash, payer, recipient,
        asset and amount for later independent verification.
      </Text>
    </View>
  );
}

function cherryMoneyDraftReference(
  draft: CherryMoneyPaymentDraft,
): `0x${string}` {
  return keccak256(
    toBytes(
      [
        "cherry-money-payment-draft",
        draft.id,
        draft.payee,
        draft.currency,
        draft.amount.toFixed(2),
        draft.reference,
      ].join(":"),
    ),
  );
}

function CorrelationEvidence({
  correlation,
  retryDisabled,
  retryPending,
  onRetry,
}: {
  correlation: SettlementCorrelationResult;
  retryDisabled: boolean;
  retryPending: boolean;
  onRetry: () => void;
}) {
  if (correlation.status === "confirmed") {
    return (
      <View style={styles.correlationConfirmed}>
        <Text style={styles.correlationTitle}>
          Business correlation confirmed ✓
        </Text>
        <Text selectable style={styles.mono}>
          Reference · {shortHash(correlation.paymentReference)}
        </Text>
        {correlation.registryAddress ? (
          <Text selectable style={styles.mono}>
            Registry · {correlation.registryAddress}
          </Text>
        ) : null}
        {correlation.correlationTxHash && correlation.correlationUrl ? (
          <TransactionLink
            url={correlation.correlationUrl}
            hash={correlation.correlationTxHash}
          />
        ) : (
          <Text style={styles.safe}>
            Existing matching correlation found on-chain.
          </Text>
        )}
      </View>
    );
  }

  if (correlation.status === "not_configured") {
    return (
      <View style={styles.correlationPending}>
        <Text style={styles.correlationTitle}>Correlation not configured</Text>
        <Text style={styles.businessPurpose}>
          The AUSD payment is confirmed, but no settlement registry address is
          configured for this build. Do not resend the payment.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.correlationFailed}>
      <Text style={styles.correlationTitle}>
        AUSD settled · correlation needs attention
      </Text>
      <Text style={styles.businessPurpose}>
        {correlation.error ??
          "The registry transaction did not confirm. Do not resend the AUSD payment."}
      </Text>
      <ActionButton
        disabled={retryDisabled}
        label={retryPending ? "Retrying correlation…" : "Retry correlation only"}
        onPress={onRetry}
      />
    </View>
  );
}

function TransactionLink({
  url,
  hash,
}: {
  url: string;
  hash: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
    >
      <Text selectable style={styles.link}>
        View transaction · {shortHash(hash)}
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

function shortHash(hash: string): string {
  return hash.slice(0, 10) + "…" + hash.slice(-8);
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
  businessContext: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },
  businessEyebrow: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  businessTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  businessPurpose: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
  },
  safe: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "600",
  },
  warning: {
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    color: "#9a3412",
    fontSize: 13,
    lineHeight: 19,
    padding: 10,
  },
  correlationConfirmed: {
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    gap: 6,
    marginTop: 6,
    padding: 10,
  },
  correlationPending: {
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    gap: 6,
    marginTop: 6,
    padding: 10,
  },
  correlationFailed: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
    padding: 10,
  },
  correlationTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  result: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },
  success: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },
  successTitle: {
    color: "#166534",
    fontSize: 17,
    fontWeight: "700",
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
