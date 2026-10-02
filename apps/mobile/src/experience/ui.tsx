import { useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { receiptStage, shortAddress, type PaymentReceipt } from "./model";

export const palette = {
  background: "#F6F7F4", surface: "#FFFFFF", ink: "#162E29", muted: "#536761",
  line: "#DFE6DF", cherry: "#AE2949", cherrySoft: "#FCEEF1", green: "#19613F",
  greenSoft: "#EBF5EE", amber: "#80521C", amberSoft: "#FFF4DB", dark: "#112D27",
};
export const ui = StyleSheet.create({
  page: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: 20, paddingBottom: 40, gap: 20 },
  card: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 22, padding: 22, gap: 14 },
  title: { color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.8 },
  heading: { color: palette.ink, fontSize: 20, lineHeight: 27, fontWeight: "700" },
  eyebrow: { color: palette.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  body: { color: palette.muted, fontSize: 15, lineHeight: 23 },
  small: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  label: { color: palette.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  input: { color: palette.ink, fontSize: 16, minHeight: 52, paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: "#FBFCFA", borderColor: "#A6B8AE", borderWidth: 1, borderRadius: 12 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  grow: { flex: 1, minWidth: 0 }, mono: { fontFamily: "monospace", color: palette.muted, fontSize: 12, lineHeight: 19, flexShrink: 1 },
  hidden: { display: "none" },
});
export function Action({ label, onPress, disabled = false, loading = false, secondary = false, testID }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean; testID?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || loading, busy: loading }} aria-busy={loading}
    disabled={disabled || loading} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.action, secondary && styles.secondary, (disabled || loading) && styles.disabled,
      pressed && { opacity: 0.82, transform: [{ scale: 0.99 }] }]}>
    {loading ? <ActivityIndicator color={secondary ? palette.ink : "#FFFFFF"} /> : null}
    <Text style={[styles.actionText, secondary && { color: palette.ink }]}>{label}</Text>
  </Pressable>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "success" }) {
  return <View style={[styles.badge, tone === "warning" && { backgroundColor: palette.amberSoft }, tone === "success" && { backgroundColor: palette.greenSoft }]}>
    <Text style={[styles.badgeText, tone === "warning" && { color: palette.amber }, tone === "success" && { color: palette.green }]}>{children}</Text>
  </View>;
}
export function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <View style={[styles.notice, warning && { backgroundColor: palette.amberSoft }]}>
    <Text accessibilityLiveRegion="polite" style={[ui.small, warning && { color: palette.amber }]}>{children}</Text>
  </View>;
}
export function Disclosure({ title, children, defaultOpen = false, keepMounted = false }: {
  title: string; children: ReactNode; defaultOpen?: boolean; keepMounted?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <View style={styles.disclosure}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }}
      aria-expanded={open} onPress={() => setOpen(!open)} style={styles.disclosureButton}>
      <Text style={[ui.label, ui.grow]}>{title}</Text>
      <Text style={styles.chevron} accessible={false} aria-hidden>{open ? "−" : "+"}</Text>
    </Pressable>
    {open || keepMounted ? <View style={open ? styles.disclosureContent : ui.hidden}
      accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"}>{children}</View> : null}
  </View>;
}
export function Detail({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <View style={styles.detail}><Text style={ui.small}>{label}</Text><Text selectable={selectable} style={styles.detailValue}>{value}</Text></View>;
}
export function Milestone({ title, detail, complete }: { title: string; detail: string; complete: boolean }) {
  return <View style={styles.milestone}>
    <Text accessible={false} aria-hidden style={[styles.marker, complete && styles.markerComplete]}>{complete ? "✓" : "○"}</Text>
    <View style={ui.grow}><Text style={ui.label}>{title} · {complete ? "complete" : "pending"}</Text><Text style={ui.small}>{detail}</Text></View>
  </View>;
}
export function ReceiptCard({ receipt }: { receipt: PaymentReceipt }) {
  const [linkError, setLinkError] = useState("");
  return <View style={ui.card} testID="payment-receipt">
    <View style={ui.row}><Badge tone="success">On-chain confirmation</Badge><Badge tone="warning">Testnet</Badge></View>
    <Text accessibilityRole="header" style={ui.heading}>Payment receipt</Text>
    <Text style={styles.receiptAmount}>{receipt.amount} <Text style={styles.asset}>AUSD</Text></Text>
    <Text style={ui.body}>To {receipt.payee}</Text>
    <Text accessibilityLiveRegion="polite" style={ui.label}>{receiptStage(receipt)}</Text>
    <Detail label="Recipient" value={receipt.recipient} selectable />
    <Detail label="Business reference" value={receipt.reference} selectable />
    <Detail label="Network" value={receipt.network + " · chain 10143"} />
    <Detail label="Confirmed" value={new Date(receipt.confirmedAtMs).toLocaleString()} />
    <Milestone complete title="Transfer confirmed" detail={"Recorded in block " + receipt.block + "."} />
    <Milestone complete={receipt.correlationConfirmed} title="Business reference" detail="The payment is linked to its approved draft reference." />
    <Milestone complete={receipt.indexed} title="Indexed match" detail="Envio checks this exact transaction, not an unrelated recent transfer." />
    <Notice>On-chain confirmation is not an accounting posting. Cherry Money's draft has not been marked paid by this screen.</Notice>
    <Disclosure title="Transaction details"><Text selectable style={ui.mono}>{receipt.hash}</Text>
      <Action secondary label={"View on explorer · " + shortAddress(receipt.hash)} onPress={() => {
        if (!/^0x[0-9a-fA-F]{64}$/.test(receipt.hash)) { setLinkError("The transaction reference is invalid."); return; }
        void Linking.openURL("https://testnet.monadscan.com/tx/" + receipt.hash).catch(() => setLinkError("The explorer could not be opened. The transaction reference is shown above."));
      }} />
      {linkError ? <Text style={ui.small}>{linkError}</Text> : null}
    </Disclosure>
  </View>;
}
const styles = StyleSheet.create({
  action: { minHeight: 50, borderRadius: 13, backgroundColor: palette.cherry, paddingHorizontal: 20, paddingVertical: 14,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  secondary: { backgroundColor: "#F0F4EF", borderColor: palette.line, borderWidth: 1 },
  actionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", textAlign: "center", flexShrink: 1 },
  disabled: { opacity: 0.5 }, badge: { backgroundColor: "#EDF2ED", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start" },
  badgeText: { color: palette.muted, fontSize: 11, fontWeight: "700", lineHeight: 16 },
  notice: { backgroundColor: "#EEF4EF", borderRadius: 12, padding: 14 },
  disclosure: { borderColor: palette.line, borderWidth: 1, borderRadius: 14, backgroundColor: palette.surface, overflow: "hidden" },
  disclosureButton: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  disclosureContent: { padding: 16, paddingTop: 4, gap: 14 }, chevron: { color: palette.muted, fontSize: 22 },
  detail: { gap: 4, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: palette.line },
  detailValue: { color: palette.ink, fontSize: 15, lineHeight: 23, fontWeight: "600", flexShrink: 1 },
  milestone: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, marker: { width: 28, height: 28, lineHeight: 28, textAlign: "center", borderRadius: 14, color: palette.muted, backgroundColor: "#EDF2ED", overflow: "hidden" },
  markerComplete: { color: palette.green, backgroundColor: palette.greenSoft },
  receiptAmount: { color: palette.ink, fontSize: 38, lineHeight: 46, fontWeight: "800", letterSpacing: -1 }, asset: { fontSize: 20, color: palette.muted },
});
