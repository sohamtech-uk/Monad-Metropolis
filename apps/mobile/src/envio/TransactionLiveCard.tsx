import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import type { TransferProgress } from "../mera/transferProgress";
import { changedFork, fresh, readSnapshot, readIndexedPayment, type IndexedState, type Snapshot } from "./live";
import { anchorBlock, appendSample, indexedFocus, snapshotUsable, supportedProgress,
  transactionEvidence, type ReadSample } from "./transactionLiveModel";
import { SettlementStudio } from "./SettlementStudio";
export { SettlementStudio as TransactionLiveVisual } from "./SettlementStudio";

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
  useEffect(() => { notify.current(indexed); }, [indexed, progress]);
  const missing = !snapshot || (needsSeparateReference && !referenceSnapshot);
  const stale = (snapshot !== null && !fresh(snapshot, now))
    || (needsSeparateReference && referenceSnapshot !== null && !fresh(referenceSnapshot, now));
  const partial = (snapshot !== null && !snapshot.complete)
    || (needsSeparateReference && referenceSnapshot !== null && !referenceSnapshot.complete);
  const state = !watching ? "PAUSED" : effectiveError ? "UNAVAILABLE" : recheck || evidence.conflict ? "RECHECK REQUIRED"
    : missing ? "CONNECTING" : stale ? "STALE" : partial ? "PARTIAL SCAN" : "LIVE · PROVISIONAL";
  return <SettlementStudio progress={progress} snapshot={snapshot} samples={samples} now={now}
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
