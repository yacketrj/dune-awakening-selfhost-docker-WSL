import test from "node:test";
import assert from "node:assert/strict";
import { isPrometheusMetricsRoute, PROMETHEUS_METRICS_PATH, writePrometheusMetrics } from "../src/routes/metrics.js";

test("matches only the Prometheus metrics route", () => {
  assert.equal(isPrometheusMetricsRoute(PROMETHEUS_METRICS_PATH), true);
  assert.equal(isPrometheusMetricsRoute("/api/metrics"), false);
  assert.equal(isPrometheusMetricsRoute("/api/server/status"), false);
});

test("writes Prometheus text exposition with defensive headers", () => {
  const calls = [];
  const res = {
    writeHead(status, headers) {
      calls.push({ status, headers });
    },
    end(body) {
      calls.push({ body });
    }
  };
  writePrometheusMetrics(res, { render: () => "dune_console_ready 1\n" });
  assert.equal(calls[0].status, 200);
  assert.equal(calls[0].headers["content-type"], "text/plain; version=0.0.4; charset=utf-8");
  assert.equal(calls[0].headers["cache-control"], "no-store");
  assert.equal(calls[0].headers["x-content-type-options"], "nosniff");
  assert.equal(calls[1].body, "dune_console_ready 1\n");
});
