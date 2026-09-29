import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type JudgeReadinessCardProps = {
  networkConnected: boolean;
  paymentDraftSelected: boolean;
  meraAccountReady: boolean;
  registryConfigured: boolean;
  lastPaymentTxHash: string | null;
  correlationConfirmed: boolean;
  envioConfigured: boolean;
  envioIndexed: boolean;
};

type CreEvidence = Readonly<{
  status: string;
  settlement?: {
    paymentTxHash?: string;
    paymentReference?: string;
  } | null;
  checks?: Record<string, unknown>;
}>;

export function JudgeReadinessCard({
  networkConnected,
  paymentDraftSelected,
  meraAccountReady,
  registryConfigured,
  lastPaymentTxHash,
  correlationConfirmed,
  envioConfigured,
  envioIndexed,
}: JudgeReadinessCardProps) {
  const [creJson, setCreJson] = useState("");
  const [creVerifiedHash, setCreVerifiedHash] = useState<string | null>(null);
  const [creError, setCreError] = useState<string | null>(null);

  const creVerified =
    lastPaymentTxHash !== null &&
    creVerifiedHash !== null &&
    creVerifiedHash.toLowerCase() === lastPaymentTxHash.toLowerCase();

  const steps = useMemo(
    () => [
      {
        label: "Monad testnet connected",
        complete: networkConnected,
      },
      {
        label: "Cherry Money payment draft selected",
        complete: paymentDraftSelected,
      },
      {
        label: "Mera passkey account ready",
        complete: meraAccountReady,
      },
      {
        label: "AUSD payment confirmed",
        complete: lastPaymentTxHash !== null,
      },
      {
        label: "Settlement correlation confirmed",
        complete: correlationConfirmed,
      },
      {
        label: "Envio indexed this payment",
        complete: envioConfigured && envioIndexed,
      },
      {
        label: "Chainlink CRE evidence matches this payment",
        complete: creVerified,
      },
    ],
    [
      networkConnected,
      paymentDraftSelected,
      meraAccountReady,
      lastPaymentTxHash,
      correlationConfirmed,
      envioConfigured,
      envioIndexed,
      creVerified,
    ],
  );

  const completed = steps.filter((step) => step.complete).length;
  const allComplete = completed === steps.length;

  function verifyCreEvidence() {
    setCreError(null);
    setCreVerifiedHash(null);

    try {
      const parsed = JSON.parse(creJson) as CreEvidence;
      const hash = parsed.settlement?.paymentTxHash;

      if (parsed.status !== "ready_for_reconciliation") {
        throw new Error(
          "CRE evidence is not ready_for_reconciliation.",
        );
      }

      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
        throw new Error("CRE evidence has no valid payment transaction hash.");
      }

      if (
        !lastPaymentTxHash ||
        hash.toLowerCase() !== lastPaymentTxHash.toLowerCase()
      ) {
        throw new Error(
          "CRE evidence belongs to a different payment transaction.",
        );
      }

      const checks = parsed.checks ?? {};
      const requiredChecks = [
        "envioVerified",
        "registryStateMatches",
        "trustedAssetMatches",
        "cherryDraftMatched",
        "sourceAmountMatchesAusdWhenComparable",
      ];

      const failed = requiredChecks.filter(
        (key) => checks[key] !== true,
      );

      if (failed.length > 0) {
        throw new Error(
          "CRE evidence has incomplete checks: " + failed.join(", "),
        );
      }

      setCreVerifiedHash(hash);
    } catch (error) {
      setCreError(
        error instanceof Error
          ? error.message
          : "CRE evidence JSON is invalid.",
      );
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>PHASE 10 · JUDGE MODE</Text>
      <Text style={styles.title}>End-to-end payment evidence</Text>
      <Text style={styles.body}>
        This checklist only turns green from live app state, configured
        services, Envio indexing and a matching Chainlink CRE simulation
        result. It does not manufacture completion.
      </Text>

      <View style={styles.progressRow}>
        <Text style={styles.progress}>
          {completed}/{steps.length} checks complete
        </Text>
        <Text style={allComplete ? styles.ready : styles.pending}>
          {allComplete ? "Judge path complete ✓" : "Integration in progress"}
        </Text>
      </View>

      <View style={styles.steps}>
        {steps.map((step, index) => (
          <View key={step.label} style={styles.step}>
            <Text style={step.complete ? styles.stepDone : styles.stepOpen}>
              {step.complete ? "✓" : (index + 1).toString()}
            </Text>
            <Text
              style={
                step.complete ? styles.stepLabelDone : styles.stepLabel
              }
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>

      {!registryConfigured ? (
        <Text style={styles.warning}>
          Deploy CherrySettlementRegistry and configure its address before the
          final end-to-end run.
        </Text>
      ) : null}

      {!envioConfigured ? (
        <Text style={styles.warning}>
          Deploy the Envio indexer and configure its public GraphQL endpoint.
        </Text>
      ) : null}

      <View style={styles.creSection}>
        <Text style={styles.sectionTitle}>Chainlink CRE proof</Text>
        <Text style={styles.helper}>
          Run the repository's CRE settlement-verifier workflow after Envio
          indexes the payment. Paste the JSON result here. The app accepts it
          only when all deterministic checks are true and the transaction hash
          matches this session's payment.
        </Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={(value) => {
            setCreJson(value);
            setCreVerifiedHash(null);
            setCreError(null);
          }}
          placeholder='{"status":"ready_for_reconciliation",...}'
          style={styles.input}
          textAlignVertical="top"
          value={creJson}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!creJson.trim() || !lastPaymentTxHash}
          onPress={verifyCreEvidence}
          style={({ pressed }) => [
            styles.button,
            (!creJson.trim() || !lastPaymentTxHash) &&
              styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Verify CRE evidence</Text>
        </Pressable>

        {creVerified ? (
          <Text style={styles.success}>
            CRE verification matches this payment ✓
          </Text>
        ) : null}
        {creError ? <Text style={styles.error}>{creError}</Text> : null}
      </View>

      <Text style={styles.note}>
        “Ready for reconciliation” is evidence, not an accounting mutation.
        Cherry Money remains unchanged until a dedicated production settlement
        callback is reviewed and implemented.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    gap: 13,
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
  progressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  progress: {
    fontSize: 13,
    fontWeight: "700",
  },
  ready: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "700",
  },
  pending: {
    color: "#9a3412",
    fontSize: 12,
    fontWeight: "700",
  },
  steps: {
    gap: 9,
  },
  step: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  stepDone: {
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    color: "#166534",
    fontSize: 12,
    fontWeight: "800",
    height: 24,
    lineHeight: 24,
    textAlign: "center",
    width: 24,
  },
  stepOpen: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    height: 24,
    lineHeight: 24,
    textAlign: "center",
    width: 24,
  },
  stepLabel: {
    color: "#475569",
    flex: 1,
    fontSize: 13,
  },
  stepLabelDone: {
    color: "#14532d",
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  warning: {
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    color: "#9a3412",
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
  },
  creSection: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 9,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  helper: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    fontFamily: "monospace",
    fontSize: 10,
    minHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
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
  success: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "700",
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
