import { useEffect, useState, type ReactNode } from "react";
import { Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import SupplierApp from "./App";
import { AuroraIntentsCard } from "./src/aurora/AuroraIntentsCard";
import { ConsumerPayments } from "./src/consumer/ConsumerPayments";
import { EnvioLiveScreen } from "./src/envio/LiveHyperSyncCard";
import type { PaymentReceipt } from "./src/experience/model";
import { receiptStage } from "./src/experience/model";
import { Action, Badge, Disclosure, Notice, ReceiptCard, palette, ui } from "./src/experience/ui";

type Surface = "home" | "pay" | "supplier" | "aurora" | "activity" | "more" | "envio" | "labs";
const NAV = [{ key: "home", label: "Home", icon: "⌂" }, { key: "pay", label: "Pay", icon: "↗" },
  { key: "activity", label: "Activity", icon: "≋" }, { key: "more", label: "More", icon: "⋯" }] as const;
function navParent(surface: Surface) {
  return surface === "supplier" || surface === "aurora" ? "pay" : surface === "envio" || surface === "labs" ? "more" : surface;
}

export default function ConsumerApp() { return <SafeAreaProvider><ProductShell /></SafeAreaProvider>; }
function ProductShell() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const insets = useSafeAreaInsets();
  const [surface, setSurface] = useState<Surface>("home");
  const [visited, setVisited] = useState<Set<Surface>>(() => new Set(["home"]));
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [mainnetAccepted, setMainnetAccepted] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  function go(next: Surface) {
    if (busy) return;
    setVisited((current) => new Set([...current, next]));
    setSurface(next);
  }
  function nav(vertical: boolean) {
    return <View accessibilityRole="tablist" style={vertical ? styles.sideNav : styles.bottomNav}>
      {NAV.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label}
        accessibilityState={{ selected: navParent(surface) === item.key, disabled: busy }} disabled={busy}
        onPress={() => go(item.key)} style={[styles.navItem, vertical ? styles.navVertical : styles.navHorizontal,
          navParent(surface) === item.key && styles.navSelected]}>
        <Text accessible={false} style={[styles.navIcon, navParent(surface) === item.key && { color: palette.cherry }]}>{item.icon}</Text>
        <Text style={[styles.navLabel, navParent(surface) === item.key && { color: palette.cherry }]}>{item.label}</Text>
      </Pressable>)}
    </View>;
  }
  function panel(target: Surface, children: ReactNode) {
    return <View style={surface === target ? styles.pane : ui.hidden} accessibilityElementsHidden={surface !== target}
      importantForAccessibility={surface === target ? "auto" : "no-hide-descendants"}>{children}</View>;
  }
  return <View style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <View style={styles.topbar}>
      <View style={styles.brand}>
        <Image source={require("./assets/icon.png")} accessibilityLabel="Cherry Pay" style={styles.logo} resizeMode="contain" />
        <View><Text style={styles.brandName}>Cherry Pay</Text><Text style={styles.brandSub}>GLOBAL</Text></View>
      </View>
      <Badge tone="warning">Preview</Badge>
    </View>
    <View style={styles.layout}>
      {wide ? <View style={styles.sidebar}>{nav(true)}
        <View style={styles.sideNote}><Text style={ui.eyebrow}>BUILT FOR THE OUTCOME</Text><Text style={ui.small}>Approve a payment. Follow its progress. Keep its reference.</Text></View>
      </View> : null}
      <View style={styles.main}>
        {busy ? <View style={styles.busy}><Text accessibilityLiveRegion="polite" style={ui.small}>A secure operation is in progress. Stay on this screen; please do not submit again.</Text></View> : null}
        {panel("home", <ScrollView contentContainerStyle={ui.page}>
          <View style={[styles.hero, wide && styles.heroWide]}>
            <View style={styles.heroText}>
              <Text style={styles.heroEyebrow}>BUSINESS PAYMENTS, MADE CLEAR</Text>
              <Text accessibilityRole="header" style={[styles.heroTitle, width < 420 && { fontSize: 32, lineHeight: 38 }]}>Pay with clarity.{"\n"}Keep the proof.</Text>
              <Text style={styles.heroBody}>From the supplier's reference to a traceable receipt. One payment journey, with the details there when you need them.</Text>
              <Action label="Pay a supplier" disabled={busy} onPress={() => go("supplier")} />
              <Text style={styles.heroFootnote}>Guided testnet preview · no real supplier funds</Text>
            </View>
            {wide ? <View style={styles.heroSteps}>
              <Text style={styles.heroEyebrow}>YOUR NEXT PAYMENT</Text>
              {[['01', 'Choose the business payment'], ['02', 'Approve and review'], ['03', 'Track the confirmation']].map(([n, label]) =>
                <View key={n} style={styles.heroStep}><Text style={styles.heroStepNumber}>{n}</Text><Text style={styles.heroStepText}>{label}</Text></View>)}
              <Text style={styles.heroFootnote}>A clear next step, from payment to receipt.</Text>
            </View> : null}
          </View>
          <View style={styles.sectionHeading}><Text accessibilityRole="header" style={ui.heading}>What would you like to do?</Text></View>
          <View style={[styles.cards, wide && { flexDirection: "row" }]}>
            <RouteCard title="Pay a supplier" tag="TESTNET" description="Start with a Cherry Money draft. Authorise the recipient, review the amount and keep the payment reference."
              action="Open supplier payment" onPress={() => go("supplier")} />
            <RouteCard title="Pay from another chain" tag="MAINNET BETA" description="Preview Base USDC to Monad USDC. This route uses real funds and has a separate approval flow."
              action="Explore cross-chain payment" onPress={() => go("aurora")} warning />
          </View>
          <View style={ui.card}>
            <View style={styles.sectionHeading}><Text accessibilityRole="header" style={ui.heading}>Your payment activity</Text><Badge>This session</Badge></View>
            {receipt ? <>
              <Text style={ui.label}>{receipt.amount} AUSD → {receipt.payee}</Text><Text style={ui.body}>{receiptStage(receipt)}</Text>
              <Action secondary label="View payment receipt" onPress={() => go("activity")} />
            </> : <>
              <Text style={ui.body}>No confirmed supplier payment in this session yet.</Text>
              <Text style={ui.small}>Your receipt will appear here after confirmation. This is not a full wallet history or a balance statement.</Text>
            </>}
          </View>
          <Notice>Preview build. Supplier payments use test tokens. The separately labelled cross-chain beta uses real mainnet USDC and does not update your accounts.</Notice>
        </ScrollView>)}
        {panel("pay", <ScrollView contentContainerStyle={ui.page}>
          <Text style={ui.eyebrow}>CHOOSE YOUR PAYMENT</Text><Text accessibilityRole="header" style={ui.title}>Start with the outcome.</Text>
          <Text style={ui.body}>Pick the payment you need. Network and asset details are made explicit before approval.</Text>
          <RouteCard title="Pay a supplier" tag="TESTNET" description="A USD/AUSD draft from Cherry Money, a recipient-specific passkey approval and a traceable receipt."
            action="Open supplier payment" onPress={() => go("supplier")} />
          <RouteCard title="Pay from another chain" tag="MAINNET BETA" description="Currently Base USDC → Monad USDC only. Fees reduce the destination amount; review the quote before funding."
            action="Explore cross-chain payment" onPress={() => go("aurora")} warning />
        </ScrollView>)}
        {visited.has("supplier") ? panel("supplier", <SupplierApp active={surface === "supplier"} onReceipt={setReceipt} onBusyChange={setBusy} />) : null}
        {visited.has("aurora") ? panel("aurora", <ScrollView contentContainerStyle={ui.page} keyboardShouldPersistTaps="handled">
          {!mainnetAccepted ? <View style={ui.card}>
            <Badge tone="warning">Real funds · separate beta route</Badge><Text accessibilityRole="header" style={ui.title}>Before you use mainnet</Text>
            <Text style={ui.body}>This route moves USDC from Base to a recipient on Monad. It is not the supplier testnet flow and does not update Cherry Money accounting.</Text>
            <Notice warning>Transfers may be irreversible. Fees apply. This preview caps an input at 100 USDC. Check the recipient and quote before funding.</Notice>
            <Action label="Continue to mainnet preview" onPress={() => setMainnetAccepted(true)} />
            <Action secondary label="Use the testnet supplier flow instead" onPress={() => go("supplier")} />
            <Text style={ui.small}>Continuing only opens the interface. It does not sign or send a payment.</Text>
          </View> : <AuroraIntentsCard />}
        </ScrollView>) : null}
        {panel("activity", <ScrollView contentContainerStyle={ui.page}>
          <Text style={ui.eyebrow}>PAYMENT ACTIVITY</Text><Text accessibilityRole="header" style={ui.title}>Your payment receipt.</Text>
          <Text style={ui.body}>The latest confirmed supplier transfer from this session. Reloading clears this local view; it does not undo a payment.</Text>
          {receipt ? <ReceiptCard receipt={receipt} /> : <View style={ui.card}>
            <Text style={ui.heading}>No confirmed supplier payment in this session</Text>
            <Text style={ui.body}>Complete a supplier payment to see its reference, confirmation and receipt here.</Text>
            <Action label="Start a supplier payment" onPress={() => go("supplier")} />
          </View>}
          <Disclosure title="Need to inspect on-chain activity?">
            <Text style={ui.body}>Envio can show a filtered chain window or replay a known block. Those observations are provisional, not a complete wallet history or an accounting record.</Text>
            <Action secondary label="Open Envio live evidence" onPress={() => go("envio")} />
          </Disclosure>
        </ScrollView>)}
        {panel("more", <ScrollView contentContainerStyle={ui.page}>
          <Text style={ui.eyebrow}>HELP & DETAILS</Text><Text accessibilityRole="header" style={ui.title}>Clarity at every step.</Text>
          <View style={ui.card}><Text style={ui.heading}>Demo & evidence workspace</Text>
            <Text style={ui.body}>Inspect on-chain observations and follow the reference behind a payment.</Text>
            <Action secondary label="Open Envio live evidence" onPress={() => go("envio")} />
          </View>
          <Disclosure title="How the payment is checked">
            <Text style={ui.body}>Mera authorises the recipient and payment scope. Monad provides the on-chain receipt. Envio HyperSync observes raw events; HyperIndex checks the exact payment and business reference. CRE is a separate business-verification stage.</Text>
            <Text style={ui.small}>HyperSync and HyperIndex share a data source. An imported CRE simulation is not a signed production attestation. These screens do not post to the accounts.</Text>
          </Disclosure>
          <Disclosure title="Payment taking longer than expected?">
            <Text style={ui.body}>Do not send again simply because an indexer is slow. Check the transaction reference first. A confirmed transfer can still be awaiting its business reference or indexing.</Text>
            <Text style={ui.body}>For a cross-chain execution, keep its execution ID and source deposit transaction. Check or resume that execution instead of creating another funded payment.</Text>
          </Disclosure>
          <Disclosure title="Passkeys, fees and privacy">
            <Text style={ui.body}>Passkey authorisation is recipient-specific in the supplier preview. It expires and ends when the native app backgrounds. Test MON currently pays the network fees; gasless payments are not yet available.</Text>
            <Text style={ui.small}>Never share a seed phrase, private key, API token or sign-in code. Public blockchains expose transaction information; this preview does not provide private payments.</Text>
          </Disclosure>
          <Disclosure title="Experimental features · testnet only">
            <Text style={ui.body}>Explore testnet earnings, rewards and gifts in a separate workspace. On-chain actions remain subject to their feature controls.</Text>
            <Action secondary label="Open experimental features" onPress={() => go("labs")} />
          </Disclosure>
          <SupportCard />
        </ScrollView>)}
        {visited.has("envio") ? panel("envio", <EnvioLiveScreen active={surface === "envio"} />) : null}
        {visited.has("labs") ? panel("labs", <ScrollView contentContainerStyle={ui.page}>
          <Notice warning>Experimental workspace. Testnet contracts and simulated previews are not live earnings, balances or guaranteed returns.</Notice><ConsumerPayments />
        </ScrollView>) : null}
      </View>
    </View>
    {!wide && !keyboard ? <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 8) }]}>{nav(false)}</View> : null}
  </View>;
}
function RouteCard({ title, tag, description, action, onPress, warning = false }: {
  title: string; tag: string; description: string; action: string; onPress: () => void; warning?: boolean;
}) {
  return <View style={[ui.card, styles.routeCard]}>
    <Badge tone={warning ? "warning" : "neutral"}>{tag}</Badge><Text accessibilityRole="header" style={ui.heading}>{title}</Text>
    <Text style={[ui.body, { flexGrow: 1 }]}>{description}</Text><Action secondary label={action} onPress={onPress} />
  </View>;
}
function SupportCard() {
  const [error, setError] = useState("");
  return <View style={ui.card}><Text style={ui.heading}>Need a hand?</Text>
    <Text style={ui.body}>Contact Cherry Money with the public transaction or execution reference. Never include passwords, keys or tokens.</Text>
    <Action secondary label="Contact support" onPress={() => void Linking.openURL("mailto:info@cherrymoney.co.uk?subject=Cherry%20Pay%20preview%20support").catch(() => setError("Email info@cherrymoney.co.uk. An email app could not be opened."))} />
    {error ? <Text style={ui.small}>{error}</Text> : null}
    <Text style={ui.small}>Preview support · no response-time guarantee is implied.</Text>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background }, topbar: { minHeight: 78, paddingHorizontal: 22, paddingVertical: 12,
    backgroundColor: palette.surface, borderBottomWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 }, logo: { width: 38, height: 38, borderRadius: 10 },
  brandName: { color: palette.ink, fontSize: 20, fontWeight: "800", letterSpacing: -0.5 }, brandSub: { fontSize: 9, letterSpacing: 3.4, color: palette.muted, fontWeight: "700" },
  layout: { flex: 1, flexDirection: "row", minHeight: 0 }, sidebar: { width: 218, padding: 18, borderRightWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, justifyContent: "space-between" },
  sideNav: { gap: 8 }, sideNote: { padding: 10, gap: 10, marginBottom: 12 }, main: { flex: 1, minWidth: 0, minHeight: 0 }, pane: { flex: 1, minHeight: 0 },
  bottom: { borderTopWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, paddingTop: 6, paddingHorizontal: 8 },
  bottomNav: { width: "100%", maxWidth: 640, alignSelf: "center", flexDirection: "row", gap: 4 }, navItem: { borderRadius: 12, alignItems: "center", justifyContent: "center", minHeight: 54 },
  navVertical: { flexDirection: "row", padding: 12, justifyContent: "flex-start", gap: 12 }, navHorizontal: { flex: 1, gap: 2, paddingVertical: 6 },
  navSelected: { backgroundColor: palette.cherrySoft }, navIcon: { fontSize: 22, lineHeight: 26, color: palette.muted }, navLabel: { fontSize: 12, color: palette.muted, fontWeight: "700" },
  hero: { backgroundColor: palette.dark, borderRadius: 26, padding: 26, gap: 28 }, heroWide: { flexDirection: "row", padding: 34 }, heroText: { flexGrow: 1, flexShrink: 1, gap: 18, minWidth: 0 },
  heroTitle: { fontSize: 44, lineHeight: 49, fontWeight: "800", letterSpacing: -1.6, color: "#FFFFFF" }, heroEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.6, color: "#B8D4C5" },
  heroBody: { fontSize: 16, lineHeight: 24, color: "#D5E5DC" }, heroFootnote: { color: "#B8D4C5", fontSize: 12, lineHeight: 19 },
  heroSteps: { width: 260, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: "#36594B", paddingLeft: 25, justifyContent: "center", gap: 21 },
  heroStep: { flexDirection: "row", alignItems: "center", gap: 12 }, heroStepNumber: { fontSize: 13, color: "#B8D4C5", fontWeight: "800" }, heroStepText: { flex: 1, fontSize: 14, lineHeight: 21, color: "#FFFFFF", fontWeight: "600" },
  sectionHeading: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" },
  cards: { gap: 16 }, routeCard: { flexGrow: 1, flexShrink: 1, minWidth: 0 }, busy: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: palette.amberSoft },
});
