import test from "node:test";
import assert from "node:assert/strict";
import { tracePoints, segment, displayTokenAmount } from "../apps/mobile/src/envio/studioGeometry.ts";
const sample = (observedAt: number, queryMs: number) => ({ observedAt, queryMs, archiveHeight: 100 });

test("a trace never invents measurements when the service has no data", () => {
  assert.deepEqual(tracePoints([], 300, 60), []);
  assert.deepEqual(tracePoints([sample(0, 10)], 0, 60), []);
  assert.deepEqual(tracePoints([sample(0, 10)], NaN, 60), []);
  assert.deepEqual(tracePoints([sample(0, NaN), sample(1, -2)], 300, 60), []);
});
test("plot time spacing and zeros match real measurement values", () => {
  const points = tracePoints([sample(100, 0), sample(200, 20), sample(500, 40)], 400, 80);
  assert.deepEqual(points.map((point) => [point.x, point.y]), [[0, 80], [100, 40], [400, 0]]);
  assert.deepEqual(points.map((point) => point.queryMs), [0, 20, 40]);
  assert.equal(points.length, 3);
});
test("one measurement is a dot, duplicate cached snapshots are not extra measurements", () => {
  const points = tracePoints([sample(100, 0), sample(100, 0)], 300, 60);
  assert.equal(points.length, 1); assert.equal(points[0]?.x, 150); assert.equal(points[0]?.y, 60);
});
test("telemetry is bounded and ordered without changing measurements", () => {
  const points = tracePoints(Array.from({ length: 30 }, (_, i) => sample(30 - i, i)), 300, 60);
  assert.equal(points.length, 16);
  assert.ok(points.every((point, i) => i === 0 || point.observedAt > points[i - 1]!.observedAt));
});
test("straight trace segment is geometry, not a synthetic data point", () => {
  const line = segment({ x: 0, y: 0 }, { x: 3, y: 4 });
  assert.equal(line.length, 5); assert.equal(line.left, -1); assert.equal(line.top, 2);
});
test("the payment hero keeps atomic precision and does not round money", () => {
  assert.equal(displayTokenAmount("5"), "5.00");
  assert.equal(displayTokenAmount("0.000001"), "0.000001");
  assert.equal(displayTokenAmount("123456789.012345"), "123,456,789.012345");
});
