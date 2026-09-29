import { useEffect, useMemo, useRef, useState } from "react";
import type { CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import {
  ActivityIndicator,
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

export default function App() {
  const journeyStartedAtMs = useRef(Date.now()).current;

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>CHERRY PAY GLOBAL · METROPOLIS</Text>
        <Text style={styles.title}>Passkey-powered business payments</Text>
        <Text style={styles.subtitle}>
          Phase 6 adds a privacy-safe on-chain correlation record after the
          AUSD payment confirms, linking the opaque Cherry Money payment
          reference to the Monad transaction for later Envio/CRE verification.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Network</Text>
          {!status && !statusError ? <ActivityIndicator /> : null}
          {statusError ? <Text style={styles.error}>{statusError}</Text> : null}
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

        <CherryMoneyDraftCard
          defaultBaseUrl={
            process.env.EXPO_PUBLIC_CHERRY_MONEY_API_BASE_URL ??
            "https://cherrymoney.co.uk"
          }
          selectedDraftId={paymentDraft?.id ?? null}
          onSelectDraft={setPaymentDraft}
        />

        <MeraSessionCard
          runtimeConfig={client.config}
          journeyStartedAtMs={journeyStartedAtMs}
          paymentDraft={paymentDraft}
          onIdentity={(identity) => {
            setAddress(identity.address);
            setBalance(null);
            setBalanceError(null);
          }}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f8fa",
  },
  container: {
    padding: 24,
    gap: 18,
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
