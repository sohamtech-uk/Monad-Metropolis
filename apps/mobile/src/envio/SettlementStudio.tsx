import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatUnits } from "viem";
import type { TransactionLiveVisualProps } from "./TransactionLiveCard";
import { blockBars } from "./transactionLiveModel";
import { displayTokenAmount, segment, tracePoints } from "./studioGeometry";
import { shortAddress } from "../experience/model";

const C = { bg: "#090F1D", panel: "#111A2B", inset: "#0D1625", border: "#273247", text: "#EFF5FF",
  muted: "#A7B5CB", dim: "#778AA6", mint: "#A5F3CD", lilac: "#C4B1FF", rose: "#FF8EAA", amber: "#FFD48D" };

function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    if (Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia) {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setReduced(media.matches);
      update(); media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
/** Motion responds once to a new server observation. It cannot create data or advance a payment. */
function useObservationSweep(revision: number | null, enabled: boolean) {
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    value.stopAnimation();
    if (!enabled || revision === null) { value.setValue(1); return; }
    value.setValue(0);
    const animation = Animated.timing(value, { toValue: 1, duration: 1150, easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web", isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [value, revision, enabled]);
  return value;
}

/** Presentation only. Reads/signing/validation remain in the existing observer. */
export function SettlementStudio(props: TransactionLiveVisualProps) {
  const { progress, snapshot, samples, state, usable, indexed, transferObserved, referenceObserved, now } = props;
  const [width, setWidth] = useState(900);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [motionPaused, setMotionPaused] = useState(false);
  const [details, setDetails] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [linkError, setLinkError] = useState("");
  const reduced = useReducedMotion();
  const motion = !reduced && !motionPaused && usable && state === "LIVE · PROVISIONAL";
  const sweep = useObservationSweep(snapshot?.observedAt ?? null, motion);
  const wide = width >= 800;
  const mobile = width < 450;
  const bars = snapshot ? blockBars(snapshot, progress.hash, 11) : [];
  const selected = bars.find((block) => block.number === selectedNumber) ?? bars.find((block) => block.payment) ?? bars.at(-1);
  const observedEvent = snapshot?.events.find((event) => event.kind === "transfer" && event.txHash.toLowerCase() === progress.hash.toLowerCase());
  const paymentBlock = progress.receipt?.blockNumber.toString() ?? (transferObserved && observedEvent ? String(observedEvent.blockNumber) : "Awaiting block");
  const isReverted = progress.receipt?.status === "reverted";
  const signal = usable && transferObserved && !props.recheck && !isReverted;
  const raw = { source: "Envio HyperSync", chainId: progress.chainId, transactionHash: progress.hash,
    requestedAmount: progress.amount.toString(), payer: progress.sender, recipient: progress.recipient,
    asset: progress.asset, paymentReference: progress.reference, provisional: true, displayState: state,
    transferObserved, referenceObserved, indexedMatch: indexed, snapshot, referenceSnapshot: props.referenceSnapshot,
    note: "Read observations, not transaction finality or an accounting posting." };
  const amount = displayTokenAmount(formatUnits(progress.amount, 6));
  const currentState = isReverted ? "TRANSFER REVERTED" : state;
  return <View testID="transaction-live-card" style={s.outer} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    <View style={[s.header, mobile && { padding: 20 }]}>
      <View style={s.headerRow}>
        <View style={s.wordmark}><View style={s.brandMark}><Text style={s.brandLetter}>C</Text></View>
          <Text style={s.overline}>CHERRY PAY <Text style={{ color: C.dim }}> / </Text> ENVIO</Text></View>
        <View style={[s.pill, usable && !isReverted ? s.livePill : s.mutedPill]}>
          <View style={[s.statusDot, { backgroundColor: usable && !isReverted ? C.mint : C.amber }]} />
          <Text accessibilityLiveRegion="polite" style={[s.pillText, { color: usable && !isReverted ? C.mint : C.amber }]}>{currentState}</Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={[s.title, mobile && { fontSize: 29, lineHeight: 36 }]}>Your payment. In motion.</Text>
      <Text style={s.subtitle}>A live view of the evidence behind your transfer.</Text>
    </View>

    <View style={[s.workspace, wide && { flexDirection: "row" }]}>
      <View style={[s.stage, wide && { flex: 1 }]}>
        <View style={s.stageTop}><Text style={s.overline}>MONAD <Text style={{ color: C.dim }}> / </Text> TESTNET</Text>
          <Text style={s.micro}>{usable ? "CURRENT OBSERVATION" : "AWAITING / LAST READ"}</Text></View>
        <View style={s.orbitStage}>
          <Backdrop />
          <View style={s.routePath} pointerEvents="none"><View style={[s.routeTrack, signal && { backgroundColor: "#3C675D" }]} /></View>
          <View style={s.routeEndpoints}>
            <Endpoint icon="↗" title="PAYER" address={progress.sender} />
            <View style={[s.medallion, mobile && { width: 138, height: 138 }]}>
              <View pointerEvents="none" style={[s.ringOuter, signal && { borderColor: "#2C514D" }]} />
              <View pointerEvents="none" style={[s.ringInner, signal && { borderColor: "#739B8E" }]} />
              <View pointerEvents="none" style={s.orbitDiamond} />
              <Text style={s.amountLabel}>TRANSFER AMOUNT</Text>
              <Text style={[s.amount, { fontSize: mobile ? 34 : 46 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}>{amount}</Text>
              <Text style={s.asset}>AUSD</Text>
              <Text style={[s.signal, { color: signal ? C.mint : C.muted }]}>{isReverted ? "REVERTED" : signal ? "TRANSFER OBSERVED" : "WATCHING THE CHAIN"}</Text>
            </View>
            <Endpoint icon={signal ? "✓" : "↓"} title="RECIPIENT" address={progress.recipient} accent={signal} />
          </View>
          <View style={s.traceTag}><View style={[s.statusDot, { backgroundColor: signal ? C.lilac : C.dim }]} />
            <Text style={s.traceTagText}>{signal ? "Exact transaction detected" : "Waiting for matching transfer"}</Text>
          </View>
        </View>
        <View style={s.blockSection}>
          <View style={s.sectionHead}><Text accessibilityRole="header" style={s.sectionTitle}>Inside the chain</Text>
            <Text style={s.micro}>{snapshot ? bars.length + " / " + snapshot.blocks.length + " RETURNED BLOCKS" : "NO DATA YET"}</Text></View>
          {bars.length ? <View style={s.ledger}>
            <BlockRibbon blocks={bars} selected={selected?.number ?? null} onSelect={setSelectedNumber} current={usable}
              revision={snapshot!.observedAt} animate={motion} />
            <Animated.View pointerEvents="none" accessible={false} aria-hidden style={[s.sweep,
              { opacity: sweep.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 0.55, 0.22, 0] }),
                transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-50, width] }) }] }]} />
          </View> : <View style={s.emptyLedger}><Text style={s.emptyGlyph}>◇</Text><Text style={s.body}>Blocks appear when HyperSync returns them.</Text><Text style={s.small}>No artificial blocks or sample traffic.</Text></View>}
          <View style={s.legend}><Legend color={usable ? C.lilac : C.dim} label="This payment's block" /><Legend color="#526987" label="Other scanned blocks" /></View>
          {selected ? <View style={s.inspector} testID="studio-block-inspector">
            <View style={s.sectionHead}><Text style={s.inspectorTitle}>Block {selected.number}</Text>
              <Text style={[s.micro, { color: selected.payment && usable ? C.lilac : C.muted }]}>{selected.events} FILTERED {selected.events === 1 ? "EVENT" : "EVENTS"}</Text></View>
            <Text selectable style={s.hash}>{selected.hash}</Text>
            <Text style={s.small}>{new Date(selected.timestamp * 1000).toISOString()} · block time</Text>
          </View> : null}
          <Text style={s.footnote}>One tile per returned block. Tile height is decorative; event counts are wallet-filtered, not network traffic.</Text>
        </View>
      </View>

      <View style={[s.evidence, wide && { width: 272, borderLeftWidth: 1, borderTopWidth: 0 }]}>
        <Text style={s.overline}>THE EVIDENCE TRAIL</Text><Text accessibilityRole="header" style={s.evidenceTitle}>Every step. Accounted for.</Text>
        <ProofStep order="01" title="Broadcast submitted" complete source="MONAD RPC" detail="Transaction hash returned" />
        <ProofStep order="02" title="Transfer observed" complete={signal} source="ENVIO HYPERSYNC" detail="Exact asset, amount & recipient" />
        <ProofStep order="03" title="Business reference observed" complete={usable && referenceObserved && !props.recheck && !isReverted} source="ENVIO HYPERSYNC" detail="Linked registry event" />
        <ProofStep order="04" title="Indexed payment matched" complete={indexed && !props.recheck && !isReverted} source="ENVIO HYPERINDEX" detail="Transaction-specific match" last />
        <View style={s.referenceCard}><Text style={s.micro}>PAYMENT REFERENCE</Text><Text selectable style={s.hash}>{shortAddress(progress.reference)}</Text></View>
        <Text style={s.footnote}>Separate sources are labelled. An observed transfer is not an accounting posting or proof of finality.</Text>
      </View>
    </View>

    <View style={[s.stats, mobile && { paddingHorizontal: 18 }]}>
      <Stat label="PAYMENT BLOCK" value={paymentBlock} note={progress.receipt ? "RPC receipt" : "HyperSync observation"} />
      <Stat label="ARCHIVE HEIGHT" value={snapshot ? snapshot.archiveHeight.toLocaleString() : "—"} note="Returned by HyperSync" />
      <Stat label="QUERY TIME" value={snapshot ? snapshot.queryMs + " ms" : "—"} note="Measured server-side" />
      <Stat label="SNAPSHOT AGE" value={snapshot ? Math.max(0, Math.floor((now - snapshot.observedAt) / 1000)) + " s" : "—"} note={usable ? "Current observation" : "Not a live confirmation"} />
    </View>
    <View style={[s.bottomGrid, wide && { flexDirection: "row" }]}>
      <View style={[s.telemetry, wide && { flex: 1.4 }]}>
        <View style={s.sectionHead}><Text accessibilityRole="header" style={s.sectionTitle}>Read telemetry</Text><Text style={s.micro}>{samples.length} REAL {samples.length === 1 ? "SAMPLE" : "SAMPLES"}</Text></View>
        <QueryTrace samples={samples} current={usable} />
        <Text style={s.footnote}>Measured query durations. The line connects returned samples; it is not payment speed.</Text>
      </View>
      <View style={[s.transactionCard, wide && { flex: 1 }]}>
        <Text style={s.overline}>YOUR TRANSACTION</Text><Text selectable style={s.hash}>{progress.hash}</Text>
        <View style={s.txMeta}><Text style={s.small}>Broadcast</Text><Text style={s.small}>{new Date(progress.submittedAtMs).toLocaleTimeString()}</Text></View>
        <Pressable accessibilityRole="link" accessibilityLabel="Open transaction on Monad explorer" style={s.explorer}
          onPress={() => {
            if (!/^0x[0-9a-fA-F]{64}$/.test(progress.hash)) { setLinkError("Invalid transaction reference."); return; }
            void Linking.openURL("https://testnet.monadscan.com/tx/" + progress.hash).catch(() => setLinkError("The explorer could not be opened. Copy the transaction reference above."));
          }}><Text style={s.explorerText}>Inspect on Monad explorer ↗</Text></Pressable>
      </View>
    </View>

    {!usable && snapshot ? <Banner>Charts below show the last received snapshot, not a currently healthy live observation.</Banner> : null}
    {props.error ? <Banner warning>{props.error}</Banner> : null}
    {props.indexError ? <Banner warning>{props.indexError}</Banner> : null}
    {props.recheck ? <Banner warning>Block evidence changed or conflicted. Positive observations are withheld while it is checked again.</Banner> : null}
    {linkError ? <Banner warning>{linkError}</Banner> : null}
    <View style={s.controls}>
      <StudioButton label={props.running ? "Pause live observations" : "Resume live observations"} onPress={props.onToggle} />
      <StudioButton label={reduced ? "Reduced motion active" : motionPaused ? "Enable visual motion" : "Pause visual motion"}
        disabled={reduced} onPress={() => setMotionPaused(!motionPaused)} />
      <StudioButton label={details ? "Hide observation details" : "Observation details"} onPress={() => setDetails(!details)} expanded={details} />
    </View>
    {details ? <View style={s.details}>
      <Text style={s.body}>This is a bounded view of mined block data, not the mempool. Broadcast metadata comes from RPC.</Text>
      {snapshot ? <Text style={s.small}>Scanned [{snapshot.fromBlock}, {snapshot.nextBlock}) · target {snapshot.toBlock}, exclusive. {snapshot.complete ? "Complete bounded scan." : "Partial scan; no complete observation claimed."}</Text> : null}
      <Text style={s.small}>The payment block is pinned for reliable inspection; it is not an endless chain-tip animation. The archive-height number updates with each provider read.</Text>
      <Text style={s.small}>Reads normally repeat six seconds after a read finishes. Decorative sweeps run once per new received snapshot, respect reduced-motion preferences and stop when stale, paused or backgrounded.</Text>
      <Text style={s.small}>HyperSync and HyperIndex share a data source; they are not independent consensus. CRE/business checks remain separate. No finality, reconciliation posting or speed guarantee is implied.</Text>
      <StudioButton label="Transaction, sources & raw evidence" expanded={sourceOpen} onPress={() => setSourceOpen(!sourceOpen)} />
      {sourceOpen ? <Text selectable style={s.hash}>{JSON.stringify(raw, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2)}</Text> : null}
    </View> : null}
    <View style={s.footer}><Text style={s.footerBrand}>POWERED BY <Text style={{ color: C.text }}>ENVIO HYPERSYNC</Text></Text><Text style={s.footnote}>Real observations. No invented progress.</Text></View>
  </View>;
}

function Backdrop() {
  return <View pointerEvents="none" accessible={false} aria-hidden style={StyleSheet.absoluteFill}>
    {[0, 1, 2, 3].map((ring) => <View key={ring} style={[s.backgroundOrbit, { width: 230 + ring * 95, height: 230 + ring * 95,
      marginLeft: -(230 + ring * 95) / 2, marginTop: -(230 + ring * 95) / 2, opacity: 0.65 - ring * 0.12 }]} />)}
    {[0, 1, 2, 3, 4, 5, 6, 7].map((line) => <View key={line} style={[s.gridLine, { left: line * 14 + "%" }]} />)}
  </View>;
}
function Endpoint({ icon, title, address, accent = false }: { icon: string; title: string; address: string; accent?: boolean }) {
  return <View style={s.endpoint}><View style={[s.endpointIcon, accent && { borderColor: "#719D89", backgroundColor: "#18332F" }]}>
    <Text accessible={false} aria-hidden style={[s.endpointGlyph, accent && { color: C.mint }]}>{icon}</Text></View>
    <Text style={s.endpointLabel}>{title}</Text><Text selectable style={s.endpointAddress}>{shortAddress(address)}</Text></View>;
}
function BlockRibbon({ blocks, selected, onSelect, current, revision, animate }: {
  blocks: ReturnType<typeof blockBars>; selected: number | null; onSelect: (n: number) => void;
  current: boolean; revision: number; animate: boolean;
}) {
  const list = useRef<ScrollView>(null);
  const [visibleWidth, setVisibleWidth] = useState(600);
  const appearance = useObservationSweep(revision, animate);
  const paymentIndex = blocks.findIndex((block) => block.payment);
  useEffect(() => {
    const timer = setTimeout(() => list.current?.scrollTo({ x: Math.max(0, paymentIndex * 70 - visibleWidth / 2 + 35), animated: false }), 0);
    return () => clearTimeout(timer);
  }, [paymentIndex, visibleWidth]);
  return <ScrollView horizontal ref={list} showsHorizontalScrollIndicator={false} onLayout={(event) => setVisibleWidth(event.nativeEvent.layout.width)}
    contentContainerStyle={s.ribbon}>
    {blocks.map((block) => <Pressable key={block.hash} accessibilityRole="button"
      accessibilityLabel={"Block " + block.number + ", " + block.events + " filtered events" + (block.payment ? ", payment event" : "")}
      accessibilityState={{ selected: selected === block.number }} aria-pressed={selected === block.number}
      onPress={() => onSelect(block.number)} style={s.blockSlot}>
      <Text style={[s.blockCount, block.payment && current && { color: C.lilac }]}>{block.events}</Text>
      <Animated.View pointerEvents="none" style={[s.cube, { opacity: appearance.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
        transform: [{ translateY: appearance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        <View style={[s.cubeShadow, block.payment && current && { backgroundColor: "#50447B" }]} />
        {[12, 8, 4, 0].map((offset) => <View key={offset} style={[s.cubeFace, { top: 28 + offset,
          backgroundColor: offset ? (block.payment && current ? "#58477E" : "#203249") : block.payment && current ? "#BBA5F4" : "#344C69",
          borderColor: block.payment && current ? "#D1C0FF" : "#68809B", opacity: current ? 1 : 0.48 }]} />)}
        <View style={[s.cubeCenter, { backgroundColor: block.payment && current ? "#EDE3FF" : "#9DAEC7" }]} />
      </Animated.View>
      <Text style={[s.blockNumber, selected === block.number && { color: C.text }]}>{String(block.number).slice(-6)}</Text>
      <View style={[s.blockIndicator, selected === block.number && { backgroundColor: current && block.payment ? C.lilac : C.muted }]} />
    </Pressable>)}
  </ScrollView>;
}
function ProofStep({ order, title, complete, source, detail, last = false }: {
  order: string; title: string; complete: boolean; source: string; detail: string; last?: boolean;
}) {
  return <View style={s.step}><View style={s.stepTrack}><View style={[s.stepDot, complete && s.stepDotDone]}>
    <Text accessible={false} aria-hidden style={[s.stepNumber, complete && { color: C.mint }]}>{complete ? "✓" : order}</Text></View>
    {!last ? <View style={[s.stepLine, complete && { backgroundColor: "#33584D" }]} /> : null}</View>
    <View style={s.stepContent}><Text style={[s.stepSource, complete && { color: C.mint }]}>{source}</Text>
      <Text style={s.stepTitle}>{title} · {complete ? "recorded" : "waiting"}</Text><Text style={s.stepDetail}>{detail}</Text></View></View>;
}
function QueryTrace({ samples, current }: { samples: TransactionLiveVisualProps["samples"]; current: boolean }) {
  const [width, setWidth] = useState(280);
  const points = tracePoints(samples, Math.max(1, width - 24), 62);
  const maximum = Math.max(0, ...points.map((point) => point.queryMs));
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    <View style={s.traceAxis}><Text style={s.small}>{maximum} ms</Text><Text style={s.small}>{current ? "Current reads" : "Last received"}</Text></View>
    <View style={s.tracePlot} accessibilityRole="image" accessibilityLabel={points.length ? points.map((point) => point.queryMs + " milliseconds at " + new Date(point.observedAt).toISOString()).join("; ") : "No query measurements yet"}>
      {[0, 31, 62].map((y) => <View key={y} style={[s.traceGrid, { top: y + 8 }]} />)}
      {points.slice(1).map((point, i) => {
        const line = segment(points[i]!, point);
        return <View key={point.observedAt} pointerEvents="none" style={{ position: "absolute", left: line.left + 12, top: line.top + 8,
          width: line.length, height: 2, backgroundColor: current ? C.mint : C.dim, transform: [{ rotate: line.angle as `${number}rad` }] }} />;
      })}
      {points.map((point, i) => <View key={point.observedAt} style={{ position: "absolute", left: point.x + 8, top: point.y + 4,
        width: 8, height: 8, borderRadius: 4, backgroundColor: current ? C.mint : C.dim,
        borderWidth: i === points.length - 1 ? 2 : 0, borderColor: C.text }} />)}
      {!points.length ? <Text style={s.traceEmpty}>Waiting for a measured query</Text> : null}
    </View><View style={s.traceAxis}><Text style={s.small}>0 ms</Text><Text style={s.small}>{points.length > 1 ? "Oldest → latest observation" : "One dot per actual sample"}</Text></View>
  </View>;
}
function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <View style={s.stat}><Text style={s.micro}>{label}</Text><Text style={s.statValue}>{value}</Text><Text style={s.statNote}>{note}</Text></View>;
}
function Legend({ color, label }: { color: string; label: string }) { return <View style={s.legendItem}><View style={[s.legendSquare, { backgroundColor: color }]} /><Text style={s.small}>{label}</Text></View>; }
function Banner({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <View style={[s.banner, warning && { borderColor: "#755331" }]}><Text accessibilityLiveRegion="polite" style={[s.body, warning && { color: C.amber }]}>{children}</Text></View>;
}
function StudioButton({ label, onPress, disabled = false, expanded }: { label: string; onPress: () => void; disabled?: boolean; expanded?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    accessibilityState={{ disabled, ...(expanded !== undefined ? { expanded } : {}) }} {...(expanded !== undefined ? { "aria-expanded": expanded } : {})}
    onPress={onPress} style={({ pressed }) => [s.button, disabled && { opacity: 0.6 }, pressed && { backgroundColor: "#243348" }]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  outer: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 24, overflow: "hidden" },
  header: { padding: 28, gap: 10, borderBottomWidth: 1, borderColor: C.border }, headerRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  wordmark: { flexDirection: "row", gap: 10, alignItems: "center" }, brandMark: { width: 25, height: 25, backgroundColor: "#532939", borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#A95870" }, brandLetter: { color: "#FFB7CA", fontSize: 14, fontWeight: "800" },
  overline: { color: C.muted, fontSize: 10, lineHeight: 16, fontWeight: "700", letterSpacing: 1.4 }, title: { color: C.text, fontSize: 37, lineHeight: 46, fontWeight: "800", letterSpacing: -1.2 }, subtitle: { color: C.muted, fontSize: 15, lineHeight: 23 },
  pill: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 11, borderWidth: 1 }, livePill: { backgroundColor: "#16332B", borderColor: "#315747" }, mutedPill: { backgroundColor: "#28261E", borderColor: "#665337" }, pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7, flexShrink: 1 }, statusDot: { width: 5, height: 5, borderRadius: 3 },
  workspace: { minWidth: 0 }, stage: { minWidth: 0 }, stageTop: { padding: 20, flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }, micro: { color: C.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.8, lineHeight: 16 },
  orbitStage: { height: 248, position: "relative", justifyContent: "center", overflow: "hidden", paddingHorizontal: 14 }, backgroundOrbit: { position: "absolute", top: "46%", left: "50%", borderRadius: 500, borderWidth: 1, borderColor: "#2C3B4E" }, gridLine: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#172335", opacity: 0.5 },
  routePath: { position: "absolute", left: 40, right: 40, top: 103 }, routeTrack: { height: 1, backgroundColor: C.border },
  routeEndpoints: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, endpoint: { width: 67, alignItems: "center", gap: 7 }, endpointIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: "#142336", borderWidth: 1, borderColor: "#425772", justifyContent: "center", alignItems: "center" }, endpointGlyph: { color: C.muted, fontSize: 21 }, endpointLabel: { color: C.muted, fontSize: 8, letterSpacing: 1 }, endpointAddress: { color: C.muted, fontSize: 8, textAlign: "center", fontFamily: "monospace" },
  medallion: { width: 188, height: 188, borderRadius: 150, backgroundColor: "#122634", borderWidth: 1, borderColor: "#496A69", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 1 }, ringOuter: { position: "absolute", top: -14, bottom: -14, left: -14, right: -14, borderWidth: 1, borderColor: "#324051", borderRadius: 150 }, ringInner: { position: "absolute", top: 6, bottom: 6, left: 6, right: 6, borderRadius: 150, borderWidth: 1, borderColor: "#304454" }, orbitDiamond: { position: "absolute", top: -17, width: 6, height: 6, backgroundColor: C.lilac, transform: [{ rotate: "45deg" }] },
  amountLabel: { fontSize: 7, color: C.muted, letterSpacing: 1.2 }, amount: { color: C.text, fontWeight: "700", letterSpacing: -1.8, maxWidth: "85%" }, asset: { color: C.mint, fontSize: 13, letterSpacing: 3, fontWeight: "700" }, signal: { fontSize: 6, letterSpacing: 0.8, marginTop: 7, fontWeight: "700" },
  traceTag: { alignSelf: "center", marginTop: 23, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#182134", borderWidth: 1, borderColor: "#354060", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 }, traceTagText: { color: C.muted, fontSize: 9 },
  blockSection: { padding: 20, gap: 10 }, sectionHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }, sectionTitle: { color: C.text, fontSize: 16, fontWeight: "700", letterSpacing: -0.3 },
  ledger: { overflow: "hidden", borderBottomWidth: 1, borderColor: C.border }, ribbon: { paddingHorizontal: 4, paddingTop: 2, paddingBottom: 8 }, blockSlot: { width: 70, height: 143, alignItems: "center" }, blockCount: { color: C.muted, fontSize: 10, marginTop: 4, fontFamily: "monospace" }, cube: { width: 64, height: 95 }, cubeFace: { position: "absolute", left: 10, width: 44, height: 44, borderWidth: 1, borderRadius: 5, transform: [{ scaleY: 0.62 }, { rotate: "45deg" }] }, cubeShadow: { position: "absolute", left: 10, top: 65, width: 48, height: 15, backgroundColor: "#142239", borderRadius: 30 }, cubeCenter: { position: "absolute", left: 29, top: 47, width: 5, height: 5, transform: [{ rotate: "45deg" }] }, blockNumber: { fontFamily: "monospace", color: C.muted, fontSize: 9 }, blockIndicator: { height: 3, width: 15, borderRadius: 2, marginTop: 6, backgroundColor: "transparent" }, sweep: { position: "absolute", top: 0, bottom: 14, width: 36, backgroundColor: "#B0F6DC", transform: [{ skewX: "-12deg" }] },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 6 }, legendSquare: { width: 6, height: 6, borderRadius: 2 }, inspector: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 7 }, inspectorTitle: { fontSize: 12, color: C.text, fontWeight: "700" },
  evidence: { padding: 22, borderColor: C.border, borderTopWidth: 1, backgroundColor: "#0E1726", gap: 13 }, evidenceTitle: { color: C.text, fontSize: 22, lineHeight: 29, letterSpacing: -0.7, fontWeight: "700", marginBottom: 4 }, step: { flexDirection: "row", minHeight: 74, gap: 11 }, stepTrack: { width: 28, alignItems: "center" }, stepDot: { width: 27, height: 27, borderWidth: 1, borderColor: "#465269", backgroundColor: C.panel, borderRadius: 14, alignItems: "center", justifyContent: "center" }, stepDotDone: { borderColor: "#517765", backgroundColor: "#19382D" }, stepNumber: { color: C.muted, fontSize: 9, fontWeight: "700" }, stepLine: { flex: 1, width: 1, marginTop: 5, backgroundColor: C.border }, stepContent: { flex: 1, minWidth: 0, gap: 5, paddingBottom: 10 }, stepSource: { color: C.dim, fontSize: 7, fontWeight: "700", letterSpacing: 1 }, stepTitle: { color: C.text, fontSize: 12, fontWeight: "600", lineHeight: 18 }, stepDetail: { color: C.muted, fontSize: 10, lineHeight: 16 }, referenceCard: { borderWidth: 1, borderColor: C.border, padding: 12, borderRadius: 10, gap: 6 },
  stats: { paddingHorizontal: 26, paddingVertical: 22, flexDirection: "row", flexWrap: "wrap", gap: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, backgroundColor: "#101A2A" }, stat: { flexGrow: 1, flexBasis: 135, gap: 7 }, statValue: { color: C.text, fontSize: 25, lineHeight: 31, fontWeight: "700", letterSpacing: -0.8 }, statNote: { color: C.muted, fontSize: 10 },
  bottomGrid: { padding: 20, gap: 14 }, telemetry: { borderWidth: 1, borderColor: C.border, borderRadius: 14, backgroundColor: C.inset, padding: 17, gap: 13, minWidth: 0 }, tracePlot: { height: 80, position: "relative" }, traceGrid: { height: 1, position: "absolute", left: 12, right: 12, backgroundColor: "#253348" }, traceAxis: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, traceEmpty: { textAlign: "center", marginTop: 28, color: C.muted, fontSize: 11 }, transactionCard: { borderWidth: 1, borderColor: C.border, borderRadius: 14, backgroundColor: C.inset, padding: 17, gap: 15, minWidth: 0 }, txMeta: { flexDirection: "row", justifyContent: "space-between" }, explorer: { paddingVertical: 12, minHeight: 44, borderTopWidth: 1, borderColor: C.border }, explorerText: { color: C.lilac, fontSize: 12, fontWeight: "600" },
  controls: { paddingHorizontal: 20, paddingBottom: 18, flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { minHeight: 44, backgroundColor: "#172337", borderWidth: 1, borderColor: "#35445A", borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11, alignItems: "center", justifyContent: "center" }, buttonText: { color: C.text, fontSize: 11, lineHeight: 18, fontWeight: "600" },
  details: { margin: 20, marginTop: 0, padding: 18, gap: 12, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, borderRadius: 12 }, banner: { marginHorizontal: 20, marginBottom: 16, padding: 14, borderWidth: 1, borderColor: C.border, backgroundColor: "#191F2B", borderRadius: 12 }, body: { color: C.muted, fontSize: 13, lineHeight: 21 }, small: { color: C.muted, fontSize: 10, lineHeight: 16 }, hash: { color: C.muted, fontFamily: "monospace", fontSize: 10, lineHeight: 17, flexShrink: 1 }, footnote: { color: C.muted, fontSize: 9, lineHeight: 15 }, footer: { padding: 20, paddingTop: 4, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }, footerBrand: { color: C.dim, fontSize: 8, fontWeight: "800", letterSpacing: 1 }, emptyLedger: { minHeight: 125, justifyContent: "center", alignItems: "center", gap: 8, borderBottomWidth: 1, borderColor: C.border }, emptyGlyph: { fontSize: 34, color: C.dim },
});
