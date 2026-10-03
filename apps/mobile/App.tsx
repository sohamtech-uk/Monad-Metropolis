import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { keccak256, toBytes } from "viem";
import type { CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import { createMonadRuntimeConfig, MonadReadClient, type MonadStatus } from "@cherry-metropolis/core";
import type { MeraAccountIdentity } from "./src/mera/account";
import type { AusdTransferResult } from "./src/mera/scopedSession";
import { progressForReference, subscribeTransferProgress } from "./src/mera/transferProgress";
import { CherryMoneyDraftCard } from "./src/CherryMoneyDraftCard";
import { MeraBusinessVaultCard } from "./src/MeraBusinessVaultCard";
import { SettlementAnalyticsCard } from "./src/SettlementAnalyticsCard";
import { JudgeReadinessCard } from "./src/JudgeReadinessCard";
import { TransactionLiveCard } from "./src/envio/TransactionLiveCard";
import { SupplierPaymentComposer } from "./src/experience/SupplierPaymentComposer";
import { draftKey, receiptFor, supportedDraft, type PaymentReceipt } from "./src/experience/model";
import { Action, Badge, Detail, Disclosure, Notice, ReceiptCard, palette, ui } from "./src/experience/ui";

type Step = 1 | 2 | 3;
const noop = () => undefined;
const STEPS = [{ step: 1, label: "Payment details" }, { step: 2, label: "Review & pay" }, { step: 3, label: "Business checks" }] as const;

export default function App({ active = true, onReceipt = noop, onBusyChange = noop }: {
  active?: boolean; onReceipt?: (receipt: PaymentReceipt) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<MonadStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [readEpoch, setReadEpoch] = useState(0);
  const [paymentDraft, setPaymentDraft] = useState<CherryMoneyPaymentDraft | null>(null);
  const [identity, setIdentity] = useState<MeraAccountIdentity | null>(null);
  const [transfer, setTransfer] = useState<AusdTransferResult | null>(null);
  const [indexed, setIndexed] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const paymentReference = paymentDraft ? keccak256(toBytes(draftKey(paymentDraft))) : null;
  const broadcast = useSyncExternalStore(subscribeTransferProgress,
    () => progressForReference(paymentReference), () => null);
  const progress = useMemo(() => broadcast && transfer?.hash === broadcast.hash ? { ...broadcast,
    correlation: { status: transfer.correlation.status, blockNumber: transfer.correlation.correlationBlockNumber,
      hash: transfer.correlation.correlationTxHash } } : broadcast, [broadcast, transfer]);
  useEffect(() => {
    if (progress?.hash) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [progress?.hash]);
  const client = useMemo(() => new MonadReadClient(createMonadRuntimeConfig({
    rpcUrl: process.env.EXPO_PUBLIC_MONAD_RPC_URL, chainId: process.env.EXPO_PUBLIC_MONAD_CHAIN_ID,
    explorerUrl: process.env.EXPO_PUBLIC_MONAD_EXPLORER_URL, ausdAddress: process.env.EXPO_PUBLIC_AUSD_ADDRESS,
    ausdDecimals: process.env.EXPO_PUBLIC_AUSD_DECIMALS, ausdFaucetAddress: process.env.EXPO_PUBLIC_AUSD_FAUCET_ADDRESS,
    settlementRegistryAddress: process.env.EXPO_PUBLIC_SETTLEMENT_REGISTRY_ADDRESS,
  })), []);
  const envioEndpoint = process.env.EXPO_PUBLIC_ENVIO_GRAPHQL_URL ?? "https://metropolis.cherrymoney.co.uk/graphql/";
  useEffect(() => {
    let cancelled = false;
    setStatus(null); setStatusError("");
    void client.status().then((next) => { if (!cancelled) setStatus(next); })
      .catch((cause: unknown) => { if (!cancelled) setStatusError(cause instanceof Error ? cause.message : "Connection unavailable."); });
    return () => { cancelled = true; };
  }, [client, readEpoch]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (transfer && paymentDraft) onReceipt(receiptFor(transfer, paymentDraft, client.config.ausdDecimals, indexed));
  }, [transfer, paymentDraft, indexed, client.config.ausdDecimals, onReceipt]);
  const onTransfer = useCallback((result: AusdTransferResult) => { setTransfer(result); setIndexed(false); }, []);
  const ready = status?.chainMatches === true && client.config.chainId === 10143;
  const canPay = ready && supportedDraft(paymentDraft);
  const canCheck = transfer !== null && transfer.correlation.status === "confirmed" && indexed;
  const receipt = transfer && paymentDraft ? receiptFor(transfer, paymentDraft, client.config.ausdDecimals, indexed) : null;
  function go(target: Step) {
    if (busy || (target === 2 && !canPay) || (target === 3 && !canCheck)) return;
    setStep(target);
  }
  return <ScrollView ref={scroll} contentContainerStyle={ui.page} keyboardShouldPersistTaps="handled">
    <View style={ui.row}><Badge tone="warning">Supplier preview · testnet</Badge><Badge>Cherry Money connected workflow</Badge></View>
    <Text accessibilityRole="header" style={ui.title}>Pay a supplier</Text>
    <Text style={ui.body}>Choose the business payment, approve its recipient and review before sending. Track confirmation without losing the reference.</Text>
    <View style={styles.steps}>
      {STEPS.map((item) => <Pressable key={item.step} accessibilityRole="button"
        accessibilityLabel={"Step " + item.step + ": " + item.label}
        accessibilityState={{ selected: step === item.step, disabled: busy || (item.step === 2 && !canPay) || (item.step === 3 && !canCheck) }}
        disabled={busy || (item.step === 2 && !canPay) || (item.step === 3 && !canCheck)} onPress={() => go(item.step)}
        style={[styles.step, step === item.step && styles.stepActive]}>
        <Text style={[styles.stepNumber, step === item.step && { color: "#FFFFFF" }]}>{item.step}</Text>
        <Text style={[styles.stepText, step === item.step && { color: "#FFFFFF" }]}>{item.label}</Text>
      </Pressable>)}
    </View>
    {progress ? <View style={step > 1 ? styles.stack : ui.hidden} accessibilityElementsHidden={step === 1} importantForAccessibility={step > 1 ? "auto" : "no-hide-descendants"}>
      <TransactionLiveCard key={progress.hash} progress={progress} active={active && step > 1}
        indexEndpoint={envioEndpoint} onIndexed={setIndexed} />
    </View> : null}
    <View style={step === 1 ? styles.stack : ui.hidden} accessibilityElementsHidden={step !== 1} importantForAccessibility={step === 1 ? "auto" : "no-hide-descendants"}>
      <View style={ui.card}>
        <View style={ui.row}>{!status && !statusError ? <ActivityIndicator color={palette.cherry} /> : null}
          <Text accessibilityLiveRegion="polite" style={ui.label}>{ready ? "Payment network checked" : statusError ? "Network check unavailable" : status ? "This build cannot use the supplier preview" : "Checking the payment network…"}</Text>
        </View>
        <Text style={ui.small}>Monad Testnet · test AUSD only. Connection checks run in the background; no payment is sent here.</Text>
        {!ready && (statusError || status) ? <Action secondary label="Retry network check" onPress={() => setReadEpoch((n) => n + 1)} /> : null}
        <Disclosure title="Network details">
          <Detail label="Configured network" value={"Chain " + client.config.chainId} />
          {status ? <Detail label="Last checked block" value={status.blockNumber.toString()} /> : null}
          <Detail label="Asset contract" value={client.config.ausdAddress} selectable />
          {statusError ? <Text selectable style={ui.small}>{statusError}</Text> : null}
        </Disclosure>
      </View>
      <CherryMoneyDraftCard defaultBaseUrl={process.env.EXPO_PUBLIC_CHERRY_MONEY_API_BASE_URL ?? "https://cherrymoney.co.uk"}
        selectedDraftId={paymentDraft?.id ?? null} onConnected={() => setStep(1)}
        onSelectDraft={(draft) => { setPaymentDraft(draft); setTransfer(null); setIndexed(false); }} />
      {paymentDraft && !supportedDraft(paymentDraft) ? <Notice warning>This preview supports USD and AUSD drafts only. We have not calculated an FX conversion for this {paymentDraft.currency} draft.</Notice> : null}
      {!paymentDraft ? <Text style={ui.small}>Connect Cherry Money and select a payment draft to continue.</Text> : null}
      <Action label="Continue to review & pay" disabled={!canPay} onPress={() => go(2)} />
    </View>
    <View style={step === 2 ? styles.stack : ui.hidden} accessibilityElementsHidden={step !== 2} importantForAccessibility={step === 2 ? "auto" : "no-hide-descendants"}>
      {paymentDraft ? <SupplierPaymentComposer runtimeConfig={client.config} paymentDraft={paymentDraft}
        onIdentity={setIdentity} onTransferSettled={onTransfer} onBusyChange={setBusy} /> : null}
      {receipt ? <ReceiptCard receipt={receipt} /> : null}
      <Action label="Open business verification" disabled={!canCheck || busy} onPress={() => go(3)} />
      {!canCheck && transfer ? <Notice>The transfer is confirmed. Its reference and exact indexed match must be established before business verification. Do not send the payment again.</Notice> : null}
      <Action secondary label="Back to payment details" disabled={busy} onPress={() => go(1)} />
    </View>
    <View style={step === 3 ? styles.stack : ui.hidden} accessibilityElementsHidden={step !== 3} importantForAccessibility={step === 3 ? "auto" : "no-hide-descendants"}>
      <Notice>These checks prepare reconciliation evidence. An imported simulation is not a signed production attestation, and this screen does not post to your accounts.</Notice>
      {step === 3 ? <JudgeReadinessCard networkConnected={ready} paymentDraftSelected={paymentDraft !== null}
        meraAccountReady={identity !== null} registryConfigured={client.config.settlementRegistryAddress !== null}
        lastPaymentTxHash={transfer?.hash ?? null} correlationConfirmed={transfer?.correlation.status === "confirmed"}
        envioConfigured={Boolean(envioEndpoint.trim())} envioIndexed={indexed} /> : null}
      <Action secondary label="Back to payment receipt" onPress={() => go(2)} />
    </View>
    <View style={transfer && step > 1 ? styles.stack : ui.hidden} accessibilityElementsHidden={!transfer || step === 1} importantForAccessibility={transfer && step > 1 ? "auto" : "no-hide-descendants"}>
      <Disclosure title="Settlement analytics & passkey evidence">
        <SettlementAnalyticsCard endpoint={envioEndpoint} explorerUrl={client.config.explorerUrl}
          assetDecimals={client.config.ausdDecimals} focusPaymentTxHash={transfer?.hash ?? null} />
        <MeraBusinessVaultCard accountCredentialId={identity?.credentialId ?? null} />
      </Disclosure>
    </View>
    <Text style={ui.small}>Preview build. Cherry Money remains the accounting system of record. No real-money supplier transfer or accounting posting is enabled by this flow.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  stack: { gap: 18 }, steps: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  step: { minHeight: 54, flexGrow: 1, flexBasis: 130, backgroundColor: "#EAF0E9", borderRadius: 12, flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  stepActive: { backgroundColor: palette.ink }, stepNumber: { fontSize: 13, fontWeight: "800", color: palette.muted },
  stepText: { fontSize: 12, color: palette.muted, fontWeight: "700", flexShrink: 1 },
});
