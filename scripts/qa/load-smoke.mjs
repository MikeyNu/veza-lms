import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4000";
const requests = Number(process.env.LOAD_REQUESTS ?? 500);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 25);
const maximumP95 = Number(process.env.LOAD_MAXIMUM_P95_MS ?? 300);
const latencies = [];
let failures = 0;
let cursor = 0;

async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= requests) return;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/v1/health/live`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - started);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
latencies.sort((left, right) => left - right);
const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * value) - 1)] ?? Infinity;
const p95 = percentile(0.95);
const failureRate = failures / requests;
assert.ok(failureRate <= 0.01, `failure rate ${(failureRate * 100).toFixed(2)}% exceeded 1%`);
assert.ok(p95 <= maximumP95, `p95 ${p95.toFixed(1)}ms exceeded ${maximumP95}ms`);
process.stdout.write(JSON.stringify({ requests, concurrency, failures, failureRate, p50Ms: percentile(0.5), p95Ms: p95, p99Ms: percentile(0.99) }, null, 2) + "\n");
