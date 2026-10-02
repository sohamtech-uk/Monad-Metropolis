import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatUnits } from "viem";
import { changedFork, fresh, NETWORKS, paymentObservation, readIndexedPayment, readSnapshot,
  type IndexedState, type Network, type PaymentFocus, type Snapshot } from "./live";

const DEFAULT_ENDPOINT = process.env.EXPO_PUBLIC_ENVIO_HYPERSYNC_URL ?? "https://cherrymoney.co.uk/api/envio/hypersync";

type Props = {
  active?: boolean; network?: Network; wallet?: string; fromBlock?: number | null;
  focus?: PaymentFocus | null; indexEndpoint?: string; onIndexed?: (matched: boolean) => void;
};

export function LiveHyperSyncCard({ active = true, network = "monad-testnet", wallet = "", fromBlock = null,
  focus = null, indexEndpoint, onIndexed }: Props) {
  const [running, setRunning] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== "background");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const previous = useRef<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [indexed, setIndexed] = useState<IndexedState>("waiting");
  const [indexError, setIndexError] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const indexedCallback = useRef(onIndexed);
  indexedCallback.current = onIndexed;
  const replayBlock = focus ? Number(focus.blockNumber > 2n ? focus.blockNumber - 2n : 0n) : fromBlock;
  const scopeWallet = focus?.sender ?? wallet;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !foreground) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, foreground]);
  useEffect(() => {
    setSnapshot(null); previous.current = null; setError(""); setNotice("");
    setIndexed("waiting"); indexedCallback.current?.(false);
    if (focus) setRunning(true);
  }, [focus, network, scopeWallet, replayBlock]);

  useEffect(() => {
    if (!active || !foreground || !running) return;
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const poll = async () => {
      try {
        const next = await readSnapshot(DEFAULT_ENDPOINT, network, scopeWallet, replayBlock, controller.signal);
        if (stopped) return;
        if (changedFork(previous.current, next)) setNotice("Block lineage changed. The previous snapshot was discarded; observations are being checked again.");
        previous.current = next; setSnapshot(next); setError(""); setNow(Date.now()); failures = 0;
      } catch (cause) {
        if (stopped) return;
        setError(cause instanceof Error ? cause.message : "HyperSync could not be reached.");
        failures++;
      }
      if (!stopped) timer = setTimeout(() => void poll(), Math.min(30000, 6000 * 2 ** Math.min(failures, 3)));
    };
    void poll();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [active, foreground, running, network, scopeWallet, replayBlock]);

  // This lookup is independent of the optional HyperSync panel/token. It replaces
  // inferring current-payment verification from a dashboard's ten newest rows.
  useEffect(() => {
    if (!active || !foreground || !focus || !indexEndpoint || network !== "monad-testnet") return;
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const state = await readIndexedPayment(indexEndpoint, focus, controller.signal);
        if (stopped) return;
        setIndexed(state); setIndexError(""); indexedCallback.current?.(state === "matched");
      } catch (cause) {
        if (stopped) return;
        setIndexError(cause instanceof Error ? cause.message : "HyperIndex could not be reached.");
        setIndexed("waiting"); indexedCallback.current?.(false);
      }
      if (!stopped) timer = setTimeout(() => void poll(), 6000);
    };
    void poll();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [active, foreground, focus, indexEndpoint, network]);

  const live = active && foreground && running && !error && snapshot !== null && fresh(snapshot, now);
  const observed = snapshot && live && focus ? paymentObservation(snapshot, focus) : { transfer: false, correlation: false };
  const status = !running || !active || !foreground ? "PAUSED" : error ? "UNAVAILABLE" : !snapshot ? "CONNECTING" : !fresh(snapshot, now) ? "STALE" : !snapshot.complete ? "PARTIAL SCAN" : replayBlock !== null ? "PAYMENT / BLOCK WATCH" : "LIVE · PROVISIONAL";
  const source = NETWORKS[network];
  const evidence = snapshot ? JSON.stringify({ source: "Envio HyperSync", network, chainId: snapshot.chainId,
    provisional: true, observedAt: new Date(snapshot.observedAt).toISOString(), archiveHeight: snapshot.archiveHeight,
    fromBlock: snapshot.fromBlock, nextBlock: snapshot.nextBlock, toBlock: snapshot.toBlock, complete: snapshot.complete,
    queryMs: snapshot.queryMs, focusHash: focus?.hash ?? null, indexedMatch: indexed,
    displayedEvents: snapshot.events.slice(0, 12), totalEventsInSnapshot: snapshot.events.length,
    note: "Observation evidence only. Not a CRE attestation, accounting write, or proof of finality." },
    (_key, value) => typeof value === "bigint" ? value.toString() : value, 2) : "";

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.grow}><Text style={styles.eyebrow}>ENVIO · RAW CHAIN DATA</Text><Text style={styles.title}>Live from HyperSync</Text></View>
      <Text accessibilityLiveRegion="polite" style={[styles.badge, live && snapshot?.complete ? styles.badgeLive : null]}>{status}</Text>
    </View>
    <Text style={styles.body}>{source.label} · Block/log data is read directly from HyperSync through Cherry's server. No API token is included in this app.</Text>
    <View style={styles.actions}>
      <Button label={running ? "Pause HyperSync" : "Start HyperSync"} onPress={() => setRunning(!running)} />
      {snapshot ? <Button label={showEvidence ? "Hide Envio evidence" : "Show Envio evidence"} onPress={() => setShowEvidence(!showEvidence)} /> : null}
    </View>
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    {notice ? <Text style={styles.warning}>{notice}</Text> : null}
    {snapshot ? <>
      <View style={styles.metrics}>
        <Metric label="HyperSync archive height" value={snapshot.archiveHeight.toLocaleString()} />
        <Metric label="Query round trip" value={snapshot.queryMs + " ms"} />
        <Metric label="Events in scanned window" value={String(snapshot.events.length)} />
        <Metric label="Snapshot age" value={Math.max(0, Math.floor((now - snapshot.observedAt) / 1000)) + " s"} />
      </View>
      <Text style={styles.small}>Coverage [{snapshot.fromBlock}, {snapshot.nextBlock}) · target end {snapshot.toBlock}. Query time is measured server-side, not a claimed network finality or speed advantage.</Text>
      {!snapshot.complete ? <Text style={styles.warning}>Partial or catching-up result. No complete-payment observation is claimed. Continue a replay from block {snapshot.nextBlock}; do not skip unscanned blocks.</Text> : null}
      {snapshot.removedCount > 0 ? <Text style={styles.warning}>{snapshot.removedCount} removed logs excluded.</Text> : null}
    </> : <Text style={styles.small}>Start a read-only stream to observe recent transfers, or inspect the exact block after making a payment. Nothing here submits a transaction.</Text>}
    {focus ? <View style={styles.proof}>
      <Text style={styles.heading}>This payment, not the latest unrelated transaction</Text>
      <Text selectable style={styles.mono}>{focus.hash}</Text>
      <Text style={styles.body}>HyperSync transfer: {observed.transfer ? "observed with matching asset, payer, recipient, amount and successful receipt" : "awaiting a fresh matching observation"}</Text>
      <Text style={styles.body}>HyperSync registry correlation: {observed.correlation ? "matching reference observed" : "not observed in this window"}</Text>
      <Text style={indexed === "matched" ? styles.match : indexed === "mismatch" ? styles.error : styles.body}>HyperIndex: {indexed === "matched" ? "exact transaction and business reference matched" : indexed === "mismatch" ? "indexed data does not match this payment" : "awaiting exact indexed match"}</Text>
      {indexError ? <Text style={styles.error}>{indexError}</Text> : null}
      <Text style={styles.small}>HyperIndex matching runs separately from the optional live feed. CRE still performs the final business-context checks; HyperSync observations do not unlock reconciliation.</Text>
    </View> : null}
    {snapshot?.events.slice(0, 8).map((event) => <View key={event.id} style={styles.event}>
      <Text style={styles.heading}>{event.kind === "transfer" ? source.symbol + " Transfer" : "BusinessPaymentCorrelated"} · {formatUnits(event.amount, 6)} {source.symbol}</Text>
      <Text style={styles.small}>Block {event.blockNumber} · log {event.logIndex} · {event.successfulReceipt ? "successful receipt observed" : "receipt status not established"}</Text>
      <Text selectable style={styles.mono}>{event.payer} → {event.recipient}</Text>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(source.explorer + "/tx/" + event.txHash).catch(() => setError("Unable to open the explorer."))}><Text style={styles.link}>{event.txHash}</Text></Pressable>
    </View>)}
    {snapshot && snapshot.events.length === 0 ? <Text style={styles.body}>No matching transfer or correlation logs in the scanned window. This does not prove that a payment never occurred.</Text> : null}
    {showEvidence ? <Text selectable style={styles.mono}>{evidence}</Text> : null}
    <Text style={styles.small}>HyperSync = provisional observations. HyperIndex = durable derived settlement data. CRE = separate verification workflow. HyperSync and HyperIndex share a data source; two green indicators are not independent consensus.</Text>
  </View>;
}

export function EnvioLiveScreen({ active }: { active: boolean }) {
  const [network, setNetwork] = useState<Network>("monad-testnet");
  const [walletInput, setWalletInput] = useState("");
  const [blockInput, setBlockInput] = useState("");
  const [scope, setScope] = useState({ wallet: "", fromBlock: null as number | null, revision: 0 });
  const [error, setError] = useState("");
  function apply() {
    const wallet = walletInput.trim();
    if ((wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) || (network !== "monad-testnet" && !wallet)) { setError("Enter a valid wallet; mainnet reads require a wallet filter."); return; }
    const block = blockInput.trim() ? Number(blockInput.trim()) : null;
    if (block !== null && (!/^(0|[1-9][0-9]*)$/.test(blockInput.trim()) || !Number.isSafeInteger(block) || block < 0)) { setError("Enter a non-negative block number or leave blank for the live tip."); return; }
    setError(""); setScope({ wallet, fromBlock: block, revision: scope.revision + 1 });
  }
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.eyebrow}>CHERRY PAY · ENVIO OBSERVABILITY</Text>
    <Text style={styles.title}>Watch the payment, not just a spinner.</Text>
    <Text style={styles.body}>Observe a filtered live window, replay a known transaction block, and inspect source-labelled evidence. Mainnet USDC observations are separate from the AUSD testnet reconciliation flow.</Text>
    <View style={styles.actions}>{(Object.keys(NETWORKS) as Network[]).map((key) => <Button key={key} label={NETWORKS[key].label} onPress={() => { setNetwork(key); setScope({ wallet: "", fromBlock: null, revision: scope.revision + 1 }); }} />)}</View>
    <TextInput accessibilityLabel="Envio wallet filter" placeholder="Wallet address (required on mainnet)" value={walletInput} onChangeText={setWalletInput} autoCapitalize="none" autoCorrect={false} style={styles.input} />
    <TextInput accessibilityLabel="Envio replay start block" placeholder="Replay start block — blank means live tip" value={blockInput} onChangeText={setBlockInput} keyboardType="number-pad" style={styles.input} />
    <Button label="Apply Envio filters" onPress={apply} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <LiveHyperSyncCard key={network + ":" + scope.revision} active={active} network={network} wallet={scope.wallet} fromBlock={scope.fromBlock} />
  </ScrollView>;
}
function Button({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.small}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
const styles = StyleSheet.create({
  screen: { padding: 20, paddingBottom: 60, gap: 16, maxWidth: 1100, width: "100%", alignSelf: "center" },
  card: { backgroundColor: "#fff", borderColor: "#d8e4e0", borderWidth: 1, borderRadius: 18, padding: 18, gap: 14 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }, grow: { flexGrow: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, color: "#466453" },
  title: { fontSize: 24, fontWeight: "800", color: "#172e26" }, heading: { fontWeight: "700", color: "#183127", fontSize: 14 },
  body: { color: "#475569", lineHeight: 22, fontSize: 14 }, small: { fontSize: 12, lineHeight: 18, color: "#64748b" },
  badge: { backgroundColor: "#eef1f4", borderRadius: 8, padding: 8, fontSize: 11, fontWeight: "800", color: "#475569" }, badgeLive: { color: "#166534", backgroundColor: "#ecf8ef" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { borderRadius: 10, padding: 12, backgroundColor: "#183127" }, buttonText: { color: "#fff", fontWeight: "700" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 14 }, metric: { minWidth: 125, flexGrow: 1 }, metricValue: { fontSize: 22, fontWeight: "700", color: "#183127" },
  mono: { fontFamily: "monospace", fontSize: 11, lineHeight: 17, color: "#475569", flexShrink: 1 },
  link: { fontSize: 11, color: "#26604c", textDecorationLine: "underline", flexShrink: 1 },
  event: { borderTopWidth: 1, borderColor: "#e8eeea", paddingTop: 12, gap: 5 }, proof: { backgroundColor: "#f5f8f6", padding: 14, borderRadius: 12, gap: 8 },
  input: { backgroundColor: "#fff", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#d8e4e0", color: "#183127" },
  match: { color: "#166534", lineHeight: 22 }, error: { color: "#b91c1c", lineHeight: 21 }, warning: { color: "#854d0e", lineHeight: 21 },
});
