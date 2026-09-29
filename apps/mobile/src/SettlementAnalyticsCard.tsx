import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  EnvioSettlementClient,
  type EnvioDailySettlementMetric,
  type EnvioSettlementDashboard,
} from "@cherry-metropolis/envio-client";
import { formatUnits } from "viem";

type SettlementAnalyticsCardProps = {
  endpoint?: string;
  explorerUrl: string;
  assetDecimals: number;
  focusPaymentTxHash?: string | null;
  onFocusIndexed?: (indexed: boolean) => void;
};

export function SettlementAnalyticsCard({
  endpoint,
  explorerUrl,
  assetDecimals,
  focusPaymentTxHash,
  onFocusIndexed,
}: SettlementAnalyticsCardProps) {
  const client = useMemo(() => {
    if (!endpoint?.trim()) return null;

    try {
      return new EnvioSettlementClient({ endpoint });
    } catch {
      return null;
    }
  }, [endpoint]);

  const [dashboard, setDashboard] =
    useState<EnvioSettlementDashboard | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(mode: "initial" | "refresh" = "initial") {
    if (!client) return;

    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const nextDashboard = await client.dashboard();
      setDashboard(nextDashboard);

      if (focusPaymentTxHash) {
        const indexed = nextDashboard.latestSettlements.some(
          (settlement) =>
            settlement.paymentTxHash.toLowerCase() ===
            focusPaymentTxHash.toLowerCase(),
        );
        onFocusIndexed?.(indexed);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load Envio settlement analytics.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!client) {
      setDashboard(null);
      setLoading(false);
      return;
    }

    void load("initial");

    const timer = setInterval(() => {
      void load("refresh");
    }, 15_000);

    return () => {
      clearInterval(timer);
    };
  }, [client, focusPaymentTxHash]);

  if (!endpoint?.trim()) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CHERRY SETTLEMENT ANALYTICS</Text>
        <Text style={styles.title}>Envio dashboard awaiting deployment.</Text>
        <Text style={styles.body}>
          Configure the public Envio GraphQL endpoint after the Phase 7
          HyperIndex deployment. No mock settlement metrics are shown.
        </Text>
        <Text selectable style={styles.mono}>
          EXPO_PUBLIC_ENVIO_GRAPHQL_URL=
        </Text>
      </View>
    );
  }

  if (!client) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CHERRY SETTLEMENT ANALYTICS</Text>
        <Text style={styles.title}>Invalid Envio endpoint.</Text>
        <Text style={styles.error}>
          Use an HTTPS GraphQL endpoint, or localhost during development.
        </Text>
      </View>
    );
  }

  const totals = dashboard?.totals;
  const verificationRate =
    totals && totals.correlationCount > 0n
      ? Number((totals.verifiedCount * 10_000n) / totals.correlationCount) / 100
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>ENVIO · MONAD SETTLEMENT DATA</Text>
          <Text style={styles.title}>Cherry Settlement Analytics</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={loading || refreshing}
          onPress={() => void load("refresh")}
          style={({ pressed }) => [
            styles.refreshButton,
            (loading || refreshing) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.refreshText}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.body}>
        Live business settlement metrics come from Envio HyperIndex, not from
        the Cherry Money database or mobile payment state.
      </Text>

      {loading && !dashboard ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {dashboard ? (
        <>
          {focusPaymentTxHash ? (
            <View
              style={
                dashboard.latestSettlements.some(
                  (settlement) =>
                    settlement.paymentTxHash.toLowerCase() ===
                    focusPaymentTxHash.toLowerCase(),
                )
                  ? styles.focusVerified
                  : styles.focusPending
              }
            >
              <Text style={styles.focusTitle}>
                {dashboard.latestSettlements.some(
                  (settlement) =>
                    settlement.paymentTxHash.toLowerCase() ===
                    focusPaymentTxHash.toLowerCase(),
                )
                  ? "This payment is indexed and verified ✓"
                  : "Waiting for Envio to index this payment"}
              </Text>
              <Text selectable style={styles.mono}>
                {shortHex(focusPaymentTxHash)}
              </Text>
            </View>
          ) : null}
          <View style={styles.metricGrid}>
            <Metric
              label="Verified volume · 30d"
              value={
                formatUnits(
                  dashboard.totals.verifiedVolume,
                  assetDecimals,
                ) + " AUSD"
              }
            />
            <Metric
              label="Verified settlements"
              value={dashboard.totals.verifiedCount.toString()}
            />
            <Metric
              label="Exceptions"
              value={dashboard.totals.mismatchCount.toString()}
            />
            <Metric
              label="Verification rate"
              value={
                verificationRate === null
                  ? "—"
                  : verificationRate.toFixed(1) + "%"
              }
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent verified volume</Text>
            <SevenDayBars
              metrics={dashboard.daily.slice(0, 7).reverse()}
              assetDecimals={assetDecimals}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest verified settlements</Text>
            {dashboard.latestSettlements.length === 0 ? (
              <Text style={styles.muted}>
                Envio is connected; no verified settlements are indexed yet.
              </Text>
            ) : (
              dashboard.latestSettlements.slice(0, 5).map((settlement) => (
                <View key={settlement.id} style={styles.settlement}>
                  <View style={styles.settlementTop}>
                    <Text style={styles.settlementAmount}>
                      {formatUnits(settlement.amount, assetDecimals)} AUSD
                    </Text>
                    <Text style={styles.verified}>Verified ✓</Text>
                  </View>
                  <Row
                    label="From"
                    value={shortHex(settlement.payer)}
                  />
                  <Row
                    label="To"
                    value={shortHex(settlement.recipient)}
                  />
                  <Row
                    label="Settled"
                    value={formatTimestamp(settlement.settledAt)}
                  />
                  <Row
                    label="Reference"
                    value={shortHex(settlement.paymentReference)}
                  />
                  <View style={styles.linkRow}>
                    <ExplorerLink
                      label="Payment tx"
                      url={
                        trimSlash(explorerUrl) +
                        "/tx/" +
                        settlement.paymentTxHash
                      }
                    />
                    <ExplorerLink
                      label="Correlation tx"
                      url={
                        trimSlash(explorerUrl) +
                        "/tx/" +
                        settlement.correlationTxHash
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verification exceptions</Text>
            {dashboard.diagnostics.length === 0 ? (
              <Text style={styles.healthy}>
                No unresolved correlation mismatches in the latest indexed
                records.
              </Text>
            ) : (
              dashboard.diagnostics.slice(0, 3).map((diagnostic) => (
                <View key={diagnostic.id} style={styles.exception}>
                  <Text style={styles.exceptionTitle}>
                    {humaniseStatus(diagnostic.verificationStatus)}
                  </Text>
                  <Text style={styles.exceptionBody}>
                    {diagnostic.verificationReason}
                  </Text>
                  <Text selectable style={styles.mono}>
                    {shortHex(diagnostic.paymentTxHash)}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.sourceRow}>
            <Text style={styles.source}>
              Source · Envio HyperIndex · Monad Testnet
            </Text>
            <Text style={styles.source}>
              Updated · {formatFetchedAt(dashboard.fetchedAt)}
            </Text>
          </View>
        </>
      ) : null}
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

function SevenDayBars({
  metrics,
  assetDecimals,
}: {
  metrics: readonly EnvioDailySettlementMetric[];
  assetDecimals: number;
}) {
  if (metrics.length === 0) {
    return <Text style={styles.muted}>No indexed daily metrics yet.</Text>;
  }

  const max = metrics.reduce(
    (current, metric) =>
      metric.verifiedVolume > current ? metric.verifiedVolume : current,
    0n,
  );

  return (
    <View style={styles.bars}>
      {metrics.map((metric) => {
        const percentage =
          max === 0n ? 0 : Number((metric.verifiedVolume * 100n) / max);
        const width = (
          Math.max(
            percentage,
            metric.verifiedVolume > 0n ? 3 : 0,
          ).toString() + "%"
        ) as `${number}%`;

        return (
          <View key={metric.date} style={styles.barRow}>
            <Text style={styles.barDate}>{shortDate(metric.date)}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width },
                ]}
              />
            </View>
            <Text style={styles.barValue}>
              {formatCompactAmount(metric.verifiedVolume, assetDecimals)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ExplorerLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text selectable style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

function formatCompactAmount(value: bigint, decimals: number): string {
  const formatted = formatUnits(value, decimals);
  const numberValue = Number(formatted);

  if (!Number.isFinite(numberValue)) return formatted;
  if (numberValue >= 1_000_000) {
    return (numberValue / 1_000_000).toFixed(1) + "m";
  }
  if (numberValue >= 1_000) {
    return (numberValue / 1_000).toFixed(1) + "k";
  }
  return numberValue.toFixed(numberValue >= 100 ? 0 : 2);
}

function shortDate(date: string): string {
  const parts = date.split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] : date;
}

function formatTimestamp(value: bigint): string {
  const milliseconds = Number(value) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) return value.toString();

  return new Date(milliseconds).toLocaleString();
}

function formatFetchedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

function shortHex(value: string): string {
  return value.length > 16
    ? value.slice(0, 8) + "…" + value.slice(-6)
    : value;
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function humaniseStatus(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    gap: 14,
    padding: 18,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
    gap: 4,
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
  refreshButton: {
    borderColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    lineHeight: 19,
  },
  focusVerified: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    gap: 5,
    padding: 12,
  },
  focusPending: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    gap: 5,
    padding: 12,
  },
  focusTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metric: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    minWidth: "46%",
    padding: 12,
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
  section: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  muted: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
  healthy: {
    color: "#166534",
    fontSize: 13,
    lineHeight: 19,
  },
  bars: {
    gap: 8,
  },
  barRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  barDate: {
    fontSize: 11,
    width: 34,
  },
  barTrack: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    flex: 1,
    height: 9,
    overflow: "hidden",
  },
  barFill: {
    backgroundColor: "#111827",
    borderRadius: 999,
    height: 9,
  },
  barValue: {
    fontSize: 11,
    textAlign: "right",
    width: 48,
  },
  settlement: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    gap: 6,
    padding: 12,
  },
  settlementTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settlementAmount: {
    fontSize: 17,
    fontWeight: "700",
  },
  verified: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  rowLabel: {
    color: "#64748b",
    fontSize: 11,
  },
  rowValue: {
    flexShrink: 1,
    fontFamily: "monospace",
    fontSize: 11,
    textAlign: "right",
  },
  linkRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  link: {
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  exception: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    gap: 5,
    padding: 12,
  },
  exceptionTitle: {
    color: "#9a3412",
    fontSize: 13,
    fontWeight: "700",
  },
  exceptionBody: {
    color: "#7c2d12",
    fontSize: 12,
    lineHeight: 18,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 17,
  },
  sourceRow: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 3,
    paddingTop: 10,
  },
  source: {
    color: "#64748b",
    fontSize: 10,
  },
});
