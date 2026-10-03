import type { ReadSample } from "./transactionLiveModel";

export type TracePoint = Readonly<{ x: number; y: number; observedAt: number; queryMs: number }>;
/** Geometric interpolation only: no extra measurements or generated sample values. */
export function tracePoints(samples: readonly ReadSample[], width: number, height: number): readonly TracePoint[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const ordered = [...new Map(samples.filter((sample) => Number.isFinite(sample.observedAt)
    && Number.isFinite(sample.queryMs) && sample.queryMs >= 0).map((sample) => [sample.observedAt, sample])).values()]
    .sort((a, b) => a.observedAt - b.observedAt).slice(-16);
  if (!ordered.length) return [];
  const first = ordered[0]!.observedAt, span = ordered.at(-1)!.observedAt - first;
  const maximum = Math.max(1, ...ordered.map((sample) => sample.queryMs));
  return ordered.map((sample) => Object.freeze({ observedAt: sample.observedAt, queryMs: sample.queryMs,
    x: span ? (sample.observedAt - first) / span * width : width / 2,
    y: height - sample.queryMs / maximum * height }));
}
export function segment(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return { left: (a.x + b.x) / 2 - Math.hypot(dx, dy) / 2, top: (a.y + b.y) / 2,
    length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) + "rad" };
}
/** Preserve exact token digits; formatting must not round a real payment. */
export function displayTokenAmount(formatted: string): string {
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(formatted)) return formatted;
  const [whole = "0", fraction = ""] = formatted.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
}
