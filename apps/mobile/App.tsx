import { useEffect, useMemo, useRef, useState } from "react";
import type { CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import type { MeraAccountIdentity } from "./src/mera/account";
import type { AusdTransferResult } from "./src/mera/scopedSession";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createMonadRuntimeConfig,
  MonadReadClient,
  type AusdBalance,
  type MonadStatus,
} from "@cherry-metropolis/core";

import { CherryMoneyDraftCard } from "./src/CherryMoneyDraftCard";
import { MeraSessionCard } from "./src/MeraSessionCard";
import { MeraBusinessVaultCard } from "./src/MeraBusinessVaultCard";
import { SettlementAnalyticsCard } from "./src/SettlementAnalyticsCard";
import { JudgeReadinessCard } from "./src/JudgeReadinessCard";

type StepNumber = 1 | 2 | 3 | 4;

const STEPS: ReadonlyArray<{ step: StepNumber; label: string }> = [
  { step: 1, label: "Network" },
  { step: 2, label: "Cherry Money" },
  { step: 3, label: "Mera payment" },
  { step: 4, label: "Final verification" },
];

export default function App() {
  const journeyStartedAtMs = useRef(Date.now()).current;
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);

  const client = useMemo(() => {
    const config = createMonadRuntimeConfig({
      rpcUrl: process.env.EXPO_PUBLIC_MONAD_RPC_URL,
      chainId: process.env.EXPO_PUBLIC_MONAD_CHAIN_ID,
      explorerUrl: process.env.EXPO_PUBLIC_MONAD_EXPLORER_URL,
      ausdAddress: process.env.EXPO_PUBLIC_AUSD_ADDRESS,
      ausdDecimals: process.env.EXPO_PUBLIC_AUSD_DECIMALS,
      ausdFaucetAddress: process.env.EXPO_PUBLIC_AUSD_FAUCET_ADDRESS,
      settlementRegistryAddress:
        process.env.EXPO_PUBLIC_SETTLEMENT_REGISTRY_ADDRESS,
    });

    return new MonadReadClient(config);
  }, []);

  const [status, setStatus] = useState<MonadStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<AusdBalance | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [paymentDraft, setPaymentDraft] =
    useState<CherryMoneyPaymentDraft | null>(null);
  const [meraIdentity, setMeraIdentity] =
    useState<MeraAccountIdentity | null>(null);
  const [lastTransfer, setLastTransfer] =
    useState<AusdTransferResult | null>(null);
  const [envioIndexedCurrentPayment, setEnvioIndexedCurrentPayment] =
    useState(false);
  const envioEndpoint =
    process.env.EXPO_PUBLIC_ENVIO_GRAPHQL_URL ??
    "https://metropolis.cherrymoney.co.uk/graphql/";

  useEffect(() => {
    let mounted = true;

    client
      .status()
      .then((nextStatus) => {
        if (mounted) {
          setStatus(nextStatus);
          setStatusError(null);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setStatusError(
            error instanceof Error ? error.message : "Unable to reach Monad.",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [client]);

  async function readBalance() {
    setBalanceLoading(true);
    setBalance(null);
    setBalanceError(null);

    try {
      setBalance(await client.ausdBalance(address));
    } catch (error) {
      setBalanceError(
        error instanceof Error ? error.message : "Unable to read AUSD balance.",
      );
    } finally {
      setBalanceLoading(false);
    }
  }

  const networkConnected = status?.chainMatches === true;
  const canAdvanceFromStep1 = networkConnected;
  const canAdvanceFromStep2 = paymentDraft !== null;
  const canAdvanceFromStep3 =
    lastTransfer !== null &&
    lastTransfer.correlation.status === "confirmed" &&
    envioIndexedCurrentPayment;
  const currentStepLabel =
    STEPS.find(({ step }) => step === currentStep)?.label ?? "";

  function goToStep(step: StepNumber) {
    setCurrentStep(step);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          Platform.OS === "web" && styles.containerWeb,
        ]}
      >
        <Text style={styles.eyebrow}>CHERRY PAY GLOBAL · METROPOLIS</Text>
        <Text style={styles.title}>Passkey-powered business payments</Text>
        <Text style={styles.subtitle}>
          Phase 10 connects the full judging path: Cherry Money business
          context → Mera passkey → Agora AUSD on Monad → settlement
          correlation → Envio verification → Chainlink CRE evidence.
        </Text>
        <View style={styles.stepper}>
          {STEPS.map(({ step, label }, index) => (
            <View key={step} style={styles.stepperItem}>
              <Pressable
                accessibilityRole="button"
                disabled={step > currentStep}
                onPress={() => goToStep(step)}
                style={[
                  styles.stepperDot,
                  step === currentStep && styles.stepperDotActive,
                  step < currentStep && styles.stepperDotDone,
                ]}
              >
                <Text
                  style={
                    step <= currentStep
                      ? styles.stepperDotTextActive
                      : styles.stepperDotText
                  }
                >
                  {step < currentStep ? "✓" : step}
                </Text>
              </Pressable>
              <Text
                style={
                  step === currentStep
                    ? styles.stepperLabelActive
                    : styles.stepperLabel
                }
              >
                {label}
              </Text>
              {index < STEPS.length - 1 ? (
                <View style={styles.stepperConnector} />
              ) : null}
            </View>
          ))}
        </View>

        <Text style={styles.stepHeading}>
          Step {currentStep} of {STEPS.length} · {currentStepLabel}
        </Text>

        <View style={currentStep === 1 ? styles.stepShown : styles.stepHidden}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Network</Text>
            {!status && !statusError ? <ActivityIndicator /> : null}
            {statusError ? (
              <Text style={styles.error}>{statusError}</Text>
            ) : null}
            {status ? (
              <>
                <Row label="Configured chain" value={String(status.configuredChainId)} />
                <Row label="Live chain" value={String(status.liveChainId)} />
                <Row
                  label="Network check"
                  value={status.chainMatches ? "Connected" : "Chain mismatch"}
                />
                <Row label="Block" value={status.blockNumber.toString()} />
                <Row label="Asset" value={status.ausdSymbol} />
                <Row label="Decimals" value={String(status.ausdDecimals)} />
                <Text style={styles.label}>AUSD contract</Text>
                <Text selectable style={styles.mono}>
                  {status.ausdAddress}
                </Text>
              </>
            ) : null}
          </View>

          <StepNav
            onNext={() => goToStep(2)}
            nextDisabled={!canAdvanceFromStep1}
            nextLabel="Continue to Cherry Money"
          />
        </View>

        <View style={currentStep === 2 ? styles.stepShown : styles.stepHidden}>
          <CherryMoneyDraftCard
            defaultBaseUrl={
              process.env.EXPO_PUBLIC_CHERRY_MONEY_API_BASE_URL ??
              "https://cherrymoney.co.uk"
            }
            selectedDraftId={paymentDraft?.id ?? null}
            onSelectDraft={(draft) => {
              setPaymentDraft(draft);
              setLastTransfer(null);
              setEnvioIndexedCurrentPayment(false);
            }}
          />

          <StepNav
            onBack={() => goToStep(1)}
            onNext={() => goToStep(3)}
            nextDisabled={!canAdvanceFromStep2}
            nextLabel="Continue to Mera payment"
          />
        </View>

        <View style={currentStep === 3 ? styles.stepShown : styles.stepHidden}>
          <MeraSessionCard
            runtimeConfig={client.config}
            journeyStartedAtMs={journeyStartedAtMs}
            paymentDraft={paymentDraft}
            onIdentity={(identity) => {
              setMeraIdentity(identity);
              setAddress(identity.address);
              setBalance(null);
              setBalanceError(null);
            }}
            onTransferSettled={(result) => {
              setLastTransfer(result);
              setEnvioIndexedCurrentPayment(false);
            }}
          />

          <MeraBusinessVaultCard
            accountCredentialId={meraIdentity?.credentialId ?? null}
          />

          <SettlementAnalyticsCard
            endpoint={envioEndpoint}
            explorerUrl={client.config.explorerUrl}
            assetDecimals={client.config.ausdDecimals}
            focusPaymentTxHash={lastTransfer?.hash ?? null}
            onFocusIndexed={setEnvioIndexedCurrentPayment}
          />

          <View style={styles.card}>
          <Text style={styles.cardTitle}>Read an AUSD balance</Text>
          <Text style={styles.helper}>
            Create or recover a Mera account above to prefill its Monad
            address, or enter any EVM address. This only calls balanceOf.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAddress}
            placeholder="0x…"
            style={styles.input}
            value={address}
          />
          <Pressable
            accessibilityRole="button"
            disabled={balanceLoading || !address.trim()}
            onPress={readBalance}
            style={({ pressed }) => [
              styles.button,
              (balanceLoading || !address.trim()) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>
              {balanceLoading ? "Checking…" : "Check balance"}
            </Text>
          </Pressable>

          {balanceError ? (
            <Text style={styles.error}>{balanceError}</Text>
          ) : null}

          {balance ? (
            <View style={styles.result}>
              <Text style={styles.balance}>
                {balance.formatted} {balance.symbol}
              </Text>
              <Text selectable style={styles.mono}>
                {balance.account}
              </Text>
            </View>
          ) : null}
          </View>

          {!canAdvanceFromStep3 ? (
            <Text style={styles.helper}>
              Complete the AUSD payment, settlement correlation and Envio
              verification before continuing to the final Chainlink CRE step.
            </Text>
          ) : null}

          <StepNav
            onBack={() => goToStep(2)}
            onNext={() => goToStep(4)}
            nextDisabled={!canAdvanceFromStep3}
            nextLabel="Continue to final verification"
          />
        </View>

        <View style={currentStep === 4 ? styles.stepShown : styles.stepHidden}>
          <JudgeReadinessCard
            networkConnected={networkConnected}
            paymentDraftSelected={paymentDraft !== null}
            meraAccountReady={meraIdentity !== null}
            registryConfigured={
              client.config.settlementRegistryAddress !== null
            }
            lastPaymentTxHash={lastTransfer?.hash ?? null}
            correlationConfirmed={
              lastTransfer?.correlation.status === "confirmed"
            }
            envioConfigured={Boolean(envioEndpoint.trim())}
            envioIndexed={envioIndexedCurrentPayment}
          />

          <StepNav onBack={() => goToStep(3)} />
        </View>

        <Text style={styles.footer}>
          Cherry Money remains the accounting and invoice system of record.
          Monad Metropolis is the hackathon payment layer.
        </Text>
      </ScrollView>
    </SafeAreaView>
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

function StepNav({
  onBack,
  onNext,
  nextDisabled = false,
  nextLabel = "Continue",
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <View style={styles.navRow}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.navBack,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.navBackText}>Back</Text>
        </Pressable>
      ) : (
        <View style={styles.navSpacer} />
      )}
      {onNext ? (
        <Pressable
          accessibilityRole="button"
          disabled={nextDisabled}
          onPress={onNext}
          style={({ pressed }) => [
            styles.button,
            styles.navNext,
            nextDisabled && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>{nextLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f8fa",
  },
  container: {
    padding: 24,
    gap: 18,
  },
  containerWeb: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingVertical: 40,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  helper: {
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  value: {
    fontSize: 14,
    textAlign: "right",
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepperItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  stepperDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDotActive: {
    backgroundColor: "#111827",
  },
  stepperDotDone: {
    backgroundColor: "#166534",
  },
  stepperDotText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  stepperDotTextActive: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  stepperLabel: {
    marginLeft: 6,
    fontSize: 11,
    color: "#94a3b8",
  },
  stepperLabelActive: {
    marginLeft: 6,
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  stepperConnector: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 8,
  },
  stepHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  stepShown: {
    gap: 18,
  },
  stepHidden: {
    display: "none",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  navSpacer: {
    flex: 1,
  },
  navBack: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  navBackText: {
    color: "#475569",
    fontWeight: "700",
  },
  navNext: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "monospace",
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  error: {
    color: "#b91c1c",
    lineHeight: 20,
  },
  result: {
    gap: 8,
    paddingTop: 4,
  },
  balance: {
    fontSize: 26,
    fontWeight: "700",
  },
  footer: {
    fontSize: 13,
    lineHeight: 20,
  },
});
