import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  loadNansenPaymentIntelligence,
  validEvmAddress,
  type NansenPaymentIntelligence,
} from "./client";
import { Badge, Notice, palette, ui } from "../experience/ui";
import { shortAddress } from "../experience/model";

export function NansenRecipientIntelligence({ address }: { address: string }) {
  const [profile, setProfile] = useState<NansenPaymentIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const valid = validEvmAddress(address);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    setProfile(null);
    setError("");

    if (!valid) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void loadNansenPaymentIntelligence(address, controller.signal)
        .then((next) => {
          setProfile(next);
          setError("");
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setError(
            cause instanceof Error
              ? cause.message
              : "Nansen recipient intelligence is unavailable.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
      setLoading(false);
    };
  }, [address, valid, nonce]);

  return (
    <View style={styles.card} testID="nansen-recipient-intelligence">
      <View style={ui.row}>
        <Badge tone={profile ? "success" : "neutral"}>Nansen AI track</Badge>
        <Text style={styles.powered}>Powered by Nansen API</Text>
      </View>
      <Text accessibilityRole="header" style={ui.heading}>
        Recipient intelligence
      </Text>
      <Text style={ui.body}>
        Before you create the payment intent, Cherry uses Nansen Profiler data
        to turn this Monad address into useful payment context.
      </Text>

      {!valid ? (
        <Text style={ui.small}>
          Enter a valid Monad recipient address to load its onchain context.
        </Text>
      ) : loading ? (
        <View style={styles.loading}>
          <View style={styles.pulse} />
          <Text accessibilityLiveRegion="polite" style={ui.small}>
            Reading current holdings, recent activity and related-wallet context…
          </Text>
        </View>
      ) : profile ? (
        <>
          <View style={styles.metrics}>
            <Metric
              label="Observed portfolio"
              value={usd(profile.portfolio.observed_value_usd)}
              detail={profile.portfolio.assets_returned + " assets returned"}
            />
            <Metric
              label="Recent activity"
              value={String(profile.activity.transactions_returned)}
              detail={
                profile.activity.last_activity_at
                  ? "Latest " + formatDate(profile.activity.last_activity_at)
                  : "No recent timestamp returned"
              }
            />
            <Metric
              label="Related wallets"
              value={String(profile.relationships.returned)}
              detail="Nansen first-degree relationships returned"
            />
          </View>

          {profile.portfolio.top_assets.length ? (
            <View style={styles.section}>
              <Text style={styles.label}>Largest returned holdings</Text>
              <View style={ui.row}>
                {profile.portfolio.top_assets.slice(0, 5).map((asset, index) => (
                  <View key={asset.symbol + index} style={styles.chip}>
                    <Text style={styles.chipText}>
                      {asset.symbol} · {usd(asset.value_usd)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {profile.relationships.items.length ? (
            <View style={styles.section}>
              <Text style={styles.label}>Relationship context</Text>
              {profile.relationships.items.slice(0, 3).map((item, index) => (
                <View key={item.address + index} style={styles.relationship}>
                  <Text style={styles.relationshipTitle}>
                    {item.relation || "Related wallet"}
                  </Text>
                  <Text style={ui.small}>
                    {item.label ? item.label + " · " : ""}
                    {shortAddress(item.address)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {profile.activity.labelled_counterparties.length ? (
            <Text style={ui.small}>
              Labelled counterparties in returned activity:{" "}
              {profile.activity.labelled_counterparties.join(", ")}
            </Text>
          ) : null}

          <Notice>
            {profile.notice} Nansen context is shown to help you understand the
            recipient before paying; it does not approve or block the payment.
          </Notice>
          <Text style={styles.freshness}>
            Nansen · Monad · refreshed {formatDate(profile.generated_at)}
          </Text>
        </>
      ) : error ? (
        <>
          <Notice warning>
            {error} You can still review the payment, but independently verify
            the recipient before sending real funds.
          </Notice>
          <Pressable
            accessibilityRole="button"
            onPress={refresh}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Retry Nansen check</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL("https://nansen.ai/")}
      >
        <Text style={styles.link}>Blockchain intelligence powered by Nansen ↗</Text>
      </Pressable>
    </View>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function usd(value: number): string {
  if (!Number.isFinite(value)) return "$—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F7F8FF",
    borderColor: "#D8DDF8",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  powered: {
    color: "#635B96",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  loading: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  pulse: {
    backgroundColor: "#7C6BEF",
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metric: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E3E6F7",
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 150,
    flexGrow: 1,
    gap: 4,
    minWidth: 0,
    padding: 14,
  },
  metricLabel: {
    color: "#666F85",
    fontSize: 11,
    fontWeight: "700",
  },
  metricValue: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  metricDetail: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 16,
  },
  section: { gap: 8 },
  label: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  chip: {
    backgroundColor: "#EAE7FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: "#4E438A", fontSize: 11, fontWeight: "700" },
  relationship: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E3E6F7",
    borderBottomWidth: 1,
    gap: 3,
    paddingVertical: 9,
  },
  relationshipTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  freshness: { color: "#7775A0", fontSize: 10, fontWeight: "600" },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: "#EAE7FF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  retryText: { color: "#4E438A", fontSize: 12, fontWeight: "800" },
  link: { color: "#5B4EC0", fontSize: 12, fontWeight: "700" },
});
