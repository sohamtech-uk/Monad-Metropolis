import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatUnits } from "viem";
import type { TransferProgress } from "../mera/transferProgress";
import { Action, Badge, Detail, Disclosure, Notice, palette, ui } from "../experience/ui";
import { shortAddress } from "../experience/model";
import { changedFork, fresh, readSnapshot, readIndexedPayment, type IndexedState, type Snapshot } from "./live";
import { anchorBlock, appendSample, blockBars, indexedFocus, snapshotUsable, supportedProgress,
  transactionEvidence, type ReadSample } from "./transactionLiveModel";

const ENDPOINT = process.env.EXPO_PUBLIC_ENVIO_HYPERSYNC_URL ?? "https://cherrymoney.co.uk/api/envio/hypersync";
const POLL_MS = 6000;
type Props = { progress: TransferProgress; active: boolean; indexEndpoint: string; onIndexed: (matched: boolean) => void };

/** Read-only observers start from the real broadcast hash, not from a demo timer. */
export function TransactionLiveCard({ progress, active, indexEndpoint, onIndexed }: Props) {
  const [running, setRunning] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState !== "background");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [referenceSnapshot, setReferenceSnapshot] = useState<Snapshot | null>(null);
  const [samples, setSamples] = useState<readonly ReadSample[]>([]);
  const [locatedBlock, setLocatedBlock] = useState<bigint | null>(null);
  const [error, setError] = useState("");
  const [recheck, setRecheck] = useState(false);
  const [index, setIndex] = useState<{ state: IndexedState; at: number; error: string }>({ state: "waiting", at: 0, error: "" });
  const [now, setNow] = useState(Date.now());
  const latest = useRef(progress); latest.current = progress;
  const notify = useRef(onIndexed); notify.current = onIndexed;
  const prior = useRef<Snapshot | null>(null);
  const priorReference = useRef<Snapshot | null>(null);
  const watching = active && foreground && running;
  const anchor = anchorBlock(progress.receipt?.blockNumber ?? locatedBlock);
  const referenceAnchor = anchorBlock(progress.correlation?.blockNumber);
  const needsSeparateReference = anchor !== null && referenceAnchor !== null && referenceAnchor >= anchor + 126;

  useEffect(() => {
    const visible = () => setForeground(AppState.currentState !== "background"
      && (Platform.OS !== "web" || typeof document === "undefined" || document.visibilityState !== "hidden"));
    const app = AppState.addEventListener("change", visible);
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", visible);
    visible();
    return () => { app.remove(); if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", visible); };
  }, []);
  useEffect(() => {
    setSnapshot(null); setReferenceSnapshot(null); setSamples([]); setLocatedBlock(null);
    prior.current = null; priorReference.current = null; setError(""); setRecheck(false); setRunning(true);
    setIndex({ state: "waiting", at: 0, error: "" }); notify.current(false);
  }, [progress.hash]);
  useEffect(() => {
    if (!active || !foreground) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, foreground]);
  useEffect(() => {
    if (!watching || !supportedProgress(progress)) return;
    const controller = new AbortController(); let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined; let failures = 0;
    const poll = async () => {
      try {
        const primary = await readSnapshot(ENDPOINT, "monad-testnet", latest.current.sender, anchor, controller.signal);
        const secondary = needsSeparateReference ? await readSnapshot(ENDPOINT, "monad-testnet", latest.current.sender, referenceAnchor, controller.signal) : null;
        if (stopped) return;
        const changed = changedFork(prior.current, primary) || (secondary !== null && changedFork(priorReference.current, secondary));
        prior.current = primary; priorReference.current = secondary;
        setSnapshot(primary); setReferenceSnapshot(secondary); setRecheck(changed);
        setSamples((existing) => appendSample(changed ? [] : existing, primary));
        setError(""); setNow(Date.now()); failures = 0;
        if (anchor === null) {
          const evidence = transactionEvidence(latest.current, [primary], Date.now());
          if (evidence.transfer) setLocatedBlock(BigInt(evidence.transfer.blockNumber));
        }
      } catch (cause) {
        if (stopped) return;
        setError(cause instanceof Error ? cause.message : "Live observations are unavailable."); failures++;
      }
      if (!stopped) timer = setTimeout(() => void poll(), Math.min(30000, POLL_MS * 2 ** Math.min(failures, 3)));
    };
    void poll();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [watching, progress.hash, progress.chainId, progress.asset, anchor, referenceAnchor, needsSeparateReference]);
  useEffect(() => {
    const focus = indexedFocus(progress);
    if (!active || !foreground || !focus || !indexEndpoint) return;
    const controller = new AbortController(); let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const state = await readIndexedPayment(indexEndpoint, focus, controller.signal);
        if (!stopped) setIndex({ state, at: Date.now(), error: "" });
      } catch (cause) {
        if (!stopped) setIndex({ state: "waiting", at: 0, error: cause instanceof Error ? cause.message : "Indexed evidence is unavailable." });
      }
      if (!stopped) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [active, foreground, progress.hash, progress.receipt?.status, progress.receipt?.blockNumber, indexEndpoint]);

  const effectiveError = supportedProgress(progress) ? error : "This live payment view is restricted to the configured Monad Testnet AUSD route.";
  const usable = watching && !effectiveError && !recheck && snapshotUsable(snapshot, now)
    && (!needsSeparateReference || snapshotUsable(referenceSnapshot, now));
  const evidence = transactionEvidence(progress, usable ? [snapshot!, ...(referenceSnapshot ? [referenceSnapshot] : [])] : [], now);
  const indexed = active && foreground && now - index.at <= 20000 && index.state === "matched"
    && !recheck && !evidence.conflict && progress.receipt?.status === "success";
  // Receipt/correlation completion can reset the parent's derived state. Re-emit
  // the established indexed result when that public progress object changes too.
  useEffect(() => { notify.current(indexed); }, [indexed, progress]);
  const missing = !snapshot || (needsSeparateReference && !referenceSnapshot);
  const stale = (snapshot !== null && !fresh(snapshot, now))
    || (needsSeparateReference && referenceSnapshot !== null && !fresh(referenceSnapshot, now));
  const partial = (snapshot !== null && !snapshot.complete)
    || (needsSeparateReference && referenceSnapshot !== null && !referenceSnapshot.complete);
  const state = !watching ? "PAUSED" : effectiveError ? "UNAVAILABLE" : recheck || evidence.conflict ? "RECHECK REQUIRED"
    : missing ? "CONNECTING" : stale ? "STALE" : partial ? "PARTIAL SCAN" : "LIVE · PROVISIONAL";
  return <TransactionLiveVisual progress={progress} snapshot={snapshot} samples={samples} now={now}
    state={state} usable={usable} indexed={indexed} error={effectiveError} indexError={index.error}
    transferObserved={!!evidence.transfer} referenceObserved={!!evidence.correlation}
    onToggle={() => setRunning(!running)} running={running} recheck={recheck || evidence.conflict}
    referenceSnapshot={referenceSnapshot} />;
}

export type TransactionLiveVisualProps = {
  progress: TransferProgress; snapshot: Snapshot | null; referenceSnapshot: Snapshot | null;
  samples: readonly ReadSample[]; now: number; state: string; usable: boolean; indexed: boolean;
  error: string; indexError: string; transferObserved: boolean; referenceObserved: boolean;
  onToggle: () => void; running: boolean; recheck: boolean;
};
/** Presentational layer: every plotted value is supplied by the validated observer. */
export function TransactionLiveVisual(props: TransactionLiveVisualProps) {
  const { progress, snapshot, samples, now, usable, state, indexed, transferObserved, referenceObserved } = props;
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [linkError, setLinkError] = useState("");
  const bars = snapshot ? blockBars(snapshot, progress.hash) : [];
  const maximum = Math.max(1, ...bars.map((block) => block.events));
  const maxRead = Math.max(1, ...samples.map((sample) => sample.queryMs));
  const selected = snapshot?.blocks.find((block) => block.number === selectedBlock);
  const paymentBlock = progress.receipt?.blockNumber.toString() ?? "Awaiting receipt";
  const isReverted = progress.receipt?.status === "reverted";
  const raw = { source: "Envio HyperSync", chainId: progress.chainId, transactionHash: progress.hash,
    asset: progress.asset, payer: progress.sender, recipient: progress.recipient, requestedAmount: progress.amount.toString(),
    paymentReference: progress.reference, provisional: true, displayState: state, transferObserved, referenceObserved,
    indexedMatch: indexed, snapshot, referenceSnapshot: props.referenceSnapshot,
    note: "Source-labelled read observations only. No finality or accounting posting is established by this view." };
  return <View style={styles.outer} testID="transaction-live-card">
    <View style={styles.hero}>
      <View style={styles.headingRow}><Text style={styles.overline}>CHERRY PAY  /  LIVE TRANSACTION</Text>
        <View style={[styles.liveBadge, !usable && styles.notLive]}><Text accessibilityLiveRegion="polite" style={styles.liveText}>{state}</Text></View>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{isReverted ? "The transfer reverted." : transferObserved ? "Your transfer, observed." : "Follow your payment."}</Text>
      <Text style={styles.heroBody}>{isReverted ? "The RPC returned a reverted receipt. Do not treat this as a completed payment." : "Watching the actual transaction through Envio HyperSync. Each milestone changes only when its evidence arrives."}</Text>
      <View style={styles.route}>
        <View style={styles.endpoint}><Text style={styles.endpointIcon}>↗</Text><Text style={styles.endpointLabel}>Payer</Text><Text style={styles.address}>{shortAddress(progress.sender)}</Text></View>
        <View style={styles.routeMiddle}><Text style={styles.amount}>{formatUnits(progress.amount, 6)} AUSD</Text>
          <View style={styles.routeLine}><View style={[styles.routeFill, transferObserved && { width: "100%" }]} /></View>
          <Text style={styles.routeLabel}>Requested · Monad Testnet</Text></View>
        <View style={styles.endpoint}><Text style={[styles.endpointIcon, transferObserved && styles.observedIcon]}>{transferObserved ? "✓" : "↓"}</Text><Text style={styles.endpointLabel}>Recipient</Text><Text style={styles.address}>{shortAddress(progress.recipient)}</Text></View>
      </View>
      <Text selectable style={styles.hash}>{progress.hash}</Text>
      <Text style={styles.heroNote}>HyperSync contains mined block data, not a pending-transaction mempool. Broadcast comes from Monad RPC; observation comes from HyperSync.</Text>
    </View>
    <View style={styles.body}>
      <View style={styles.metrics}>
        <Metric title="Payment block · RPC" value={paymentBlock} />
        <Metric title="HyperSync archive height" value={snapshot ? snapshot.archiveHeight.toLocaleString() : "—"} />
        <Metric title="Provider query · server time" value={snapshot ? snapshot.queryMs + " ms" : "—"} />
        <Metric title="Last snapshot age" value={snapshot ? Math.max(0, Math.floor((now - snapshot.observedAt) / 1000)) + " s" : "—"} />
      </View>
      {!usable && snapshot ? <Notice>Charts below show the last received snapshot, not a currently healthy live observation.</Notice> : null}
      <View style={styles.journey}>
        <Stage number="1" title="Broadcast submitted" complete detail={new Date(progress.submittedAtMs).toLocaleTimeString() + " · actual transaction hash returned by RPC"} />
        <Stage number="2" title="Transfer observed" complete={transferObserved} detail={transferObserved ? "HyperSync matched the transaction, asset, payer, recipient, amount and successful receipt." : "Waiting for a fresh, complete and matching HyperSync result."} />
        <Stage number="3" title="Business reference observed" complete={referenceObserved} detail={referenceObserved ? "Registry event is linked to this transaction and payment reference." : "A transfer can confirm before its separate registry event is available."} />
        <Stage number="4" title="Indexed payment matched" complete={indexed} detail={indexed ? "HyperIndex matched this exact transaction and business reference." : "Waiting for the transaction-specific HyperIndex check."} last />
      </View>
      <View style={styles.plot}>
        <View style={ui.row}><Text accessibilityRole="header" style={[ui.heading, ui.grow]}>Inside the scanned blocks</Text><Badge>{snapshot ? snapshot.blocks.length + " blocks returned" : "Waiting for data"}</Badge></View>
        <Text style={ui.small}>Matching wallet-filtered events per block. Cherry-highlighted blocks contain this payment's events. This is not total network traffic or TPS.</Text>
        {bars.length ? <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barRow}>
            {bars.map((block) => <Pressable key={block.hash} accessibilityRole="button"
              accessibilityLabel={"Block " + block.number + ", " + block.events + " filtered events" + (block.payment ? ", payment event" : "")}
              accessibilityState={{ selected: selectedBlock === block.number }} onPress={() => setSelectedBlock(block.number)} style={styles.barSlot}>
              <Text style={styles.count}>{block.events}</Text>
              <View style={styles.barTrack}><View style={{ width: 17, height: block.events ? Math.max(3, block.events / maximum * 72) : 0,
                backgroundColor: !usable ? "#8B9893" : block.payment ? palette.cherry : "#49A17D", borderRadius: 5 }} />
                {block.events === 0 ? <View style={styles.zero} /> : null}</View>
              <Text style={styles.blockLabel}>{String(block.number).slice(-4)}</Text>
              {block.payment ? <View style={styles.paymentDot} /> : <View style={styles.noDot} />}
            </Pressable>)}
          </ScrollView>
          <Text style={ui.small}>Block {bars[0]?.number} → {bars.at(-1)?.number} · {usable ? "current read" : "last read"}. Tap a column for its full block reference.</Text>
        </> : <EmptyPlot text="The block chart will appear after the first HyperSync response. No sample bars are inserted." />}
        {selected ? <View style={styles.selected}><Text style={ui.label}>Block {selected.number}</Text><Text selectable style={ui.mono}>{selected.hash}</Text><Text style={ui.small}>{new Date(selected.timestamp * 1000).toISOString()} · block timestamp</Text></View> : null}
      </View>
      <View style={styles.plot}>
        <Text accessibilityRole="header" style={ui.heading}>Measured query times</Text>
        <Text style={ui.small}>Server-reported HyperSync query duration, in milliseconds. One column per new snapshot; cached repeats are not additional samples.</Text>
        {samples.length ? <View style={styles.readChart}>{samples.map((sample) => <View key={sample.observedAt} style={styles.readSlot}
          accessible accessibilityLabel={"Snapshot " + new Date(sample.observedAt).toISOString() + ", " + sample.queryMs + " milliseconds"}>
          <View style={styles.readTrack}><View style={{ height: sample.queryMs / maxRead * 46, minHeight: sample.queryMs ? 2 : 0,
            borderRadius: 4, backgroundColor: usable ? "#607CB0" : "#8B9893", width: "100%" }} /></View>
          <Text style={styles.readLabel}>{sample.queryMs}</Text></View>)}</View> : <EmptyPlot text="No measured query samples yet." />}
        <Text style={ui.small}>This is provider-query timing—not transaction finality or end-to-end payment speed.</Text>
      </View>
      {snapshot ? <Text style={ui.small}>Scanned [{snapshot.fromBlock}, {snapshot.nextBlock}) · target end {snapshot.toBlock} (exclusive).
        {snapshot.complete ? " Complete bounded scan." : " Partial scan; positive transfer evidence is withheld."}
        {snapshot.removedCount ? " Removed logs excluded: " + snapshot.removedCount + "." : ""}</Text> : null}
      {props.recheck ? <Notice warning>Conflicting data or a block-lineage change was detected. Positive observation badges are withheld while the payment is rechecked. Do not resend it.</Notice> : null}
      {props.error ? <Notice warning>{props.error} The live view has not changed the payment outcome.</Notice> : null}
      {props.indexError ? <Notice warning>{props.indexError}</Notice> : null}
      <Action secondary label={props.running ? "Pause live observations" : "Resume live observations"} onPress={props.onToggle} />
      <Disclosure title="Transaction, sources & raw evidence">
        <Detail label="Transaction hash" value={progress.hash} selectable />
        <Detail label="Payer" value={progress.sender} selectable /><Detail label="Recipient" value={progress.recipient} selectable />
        <Detail label="Business reference hash" value={progress.reference} selectable />
        <Detail label="RPC receipt" value={progress.receipt?.status ?? "Not returned yet"} />
        <Action secondary label="View actual transaction on explorer" onPress={() => {
          if (!/^0x[0-9a-f]{64}$/i.test(progress.hash)) return;
          void Linking.openURL("https://testnet.monadscan.com/tx/" + progress.hash).catch(() => setLinkError("The explorer could not be opened. Copy the transaction hash above."));
        }} />
        {linkError ? <Notice warning>{linkError}</Notice> : null}
        <Text selectable style={ui.mono}>{JSON.stringify(raw, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2)}</Text>
      </Disclosure>
      <Notice>Read-only evidence. HyperSync and HyperIndex share a data source; these are not independent consensus checks. CRE/business verification is separate. No accounting posting or finality guarantee is implied.</Notice>
      <Text style={ui.small}>Reads normally run every 6 seconds after the previous read finishes, with error backoff. Backgrounding pauses reads. Only the snapshot-age label advances on a timer; chart values and milestones come from returned data.</Text>
    </View>
  </View>;
}
function Metric({ title, value }: { title: string; value: string }) { return <View style={styles.metric}><Text style={ui.small}>{title}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function Stage({ title, detail, complete = false, number, last = false }: { title: string; detail: string; complete?: boolean; number: string; last?: boolean }) {
  return <View style={styles.stage}><View style={styles.stageRail}><Text accessible={false} aria-hidden style={[styles.stageIcon, complete && styles.stageComplete]}>{complete ? "✓" : number}</Text>{!last ? <View style={styles.stageLine} /> : null}</View><View style={styles.stageText}><Text style={ui.label}>{title} · {complete ? "recorded" : "waiting"}</Text><Text style={ui.small}>{detail}</Text></View></View>;
}
function EmptyPlot({ text }: { text: string }) { return <View style={styles.emptyPlot}><Text style={ui.small}>{text}</Text></View>; }
const styles = StyleSheet.create({
  outer: { borderRadius: 24, borderWidth: 1, borderColor: palette.line, overflow: "hidden", backgroundColor: "#FFFFFF" },
  hero: { backgroundColor: "#102F2B", padding: 22, gap: 15 }, headingRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" },
  overline: { color: "#B5D6C7", fontSize: 10, lineHeight: 17, fontWeight: "800", letterSpacing: 1.5 },
  liveBadge: { backgroundColor: "#245943", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }, notLive: { backgroundColor: "#3D4A45" },
  liveText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }, title: { color: "#FFFFFF", fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.7 },
  heroBody: { color: "#D6E7DE", fontSize: 14, lineHeight: 22 }, heroNote: { color: "#B5D6C7", fontSize: 11, lineHeight: 18 }, hash: { color: "#E0EDE6", fontSize: 11, lineHeight: 18, fontFamily: "monospace", flexShrink: 1 },
  route: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 }, endpoint: { alignItems: "center", width: 64, gap: 5 },
  endpointIcon: { width: 42, height: 42, lineHeight: 42, textAlign: "center", borderRadius: 21, backgroundColor: "#294B40", color: "#FFFFFF", fontSize: 24, overflow: "hidden" },
  observedIcon: { backgroundColor: "#3D8664" }, endpointLabel: { color: "#E4EDE7", fontSize: 11, fontWeight: "700" }, address: { color: "#B5D6C7", fontSize: 8 },
  routeMiddle: { flex: 1, gap: 9, alignItems: "center", minWidth: 0 }, amount: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", textAlign: "center", flexShrink: 1 }, routeLabel: { fontSize: 9, lineHeight: 14, color: "#B5D6C7", textAlign: "center" },
  routeLine: { height: 3, width: "100%", backgroundColor: "#38594B", borderRadius: 2 }, routeFill: { height: 3, width: "0%", backgroundColor: "#90D6B3" },
  body: { padding: 20, gap: 18 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 14 }, metric: { flexGrow: 1, flexBasis: 130, minWidth: 0, gap: 6, borderBottomWidth: 1, borderColor: palette.line, paddingBottom: 12 }, metricValue: { color: palette.ink, fontSize: 21, fontWeight: "800", lineHeight: 28 },
  journey: { gap: 0 }, stage: { flexDirection: "row", gap: 12 }, stageRail: { width: 30, alignItems: "center" }, stageIcon: { width: 30, height: 30, borderRadius: 15, lineHeight: 30, textAlign: "center", backgroundColor: "#EEF2ED", color: palette.muted, fontWeight: "700", overflow: "hidden" },
  stageComplete: { backgroundColor: "#DFF0E5", color: "#176442" }, stageLine: { flex: 1, width: 2, minHeight: 12, backgroundColor: "#E0E8E0", marginVertical: 4 }, stageText: { flex: 1, paddingBottom: 20, gap: 4 },
  plot: { borderWidth: 1, borderColor: palette.line, borderRadius: 16, padding: 14, gap: 12, minWidth: 0 }, barRow: { alignItems: "flex-end", gap: 4, paddingVertical: 4 },
  barSlot: { width: 27, alignItems: "center", gap: 4, minHeight: 130 }, barTrack: { height: 74, justifyContent: "flex-end", alignItems: "center", width: 22, borderBottomWidth: 1, borderColor: "#C6D3CB" }, zero: { height: 1, width: 17, backgroundColor: "#C6D3CB" },
  blockLabel: { fontSize: 8, color: palette.muted, fontFamily: "monospace" }, count: { fontSize: 10, color: palette.muted }, paymentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.cherry }, noDot: { height: 5 },
  selected: { gap: 6, padding: 12, borderRadius: 10, backgroundColor: "#F4F7F1" }, readChart: { flexDirection: "row", gap: 5, minHeight: 78, alignItems: "flex-end" }, readSlot: { flex: 1, maxWidth: 44, gap: 6, minWidth: 0 }, readTrack: { height: 48, justifyContent: "flex-end", borderBottomWidth: 1, borderColor: "#C6D3CB" }, readLabel: { fontSize: 8, color: palette.muted, textAlign: "center" },
  emptyPlot: { minHeight: 88, justifyContent: "center", padding: 12, borderRadius: 10, backgroundColor: "#F6F8F4", borderWidth: 1, borderStyle: "dashed", borderColor: "#D9E2D8" },
});
