import test from "node:test";
import assert from "node:assert/strict";
import { createRequestMetrics, normalizeMethod, normalizeRoute, statusClass } from "../src/services/requestMetrics.js";

test("normalizes methods", () => {
  assert.equal(normalizeMethod("get"), "GET");
  assert.equal(normalizeMethod("bad method"), "OTHER");
});

test("normalizes routes without query strings", () => {
  assert.equal(normalizeRoute("/api/setup/tasks/task_abc123456789"), "/api/setup/tasks/:task");
  assert.equal(normalizeRoute("/api/server/logs?token=secret"), "/api/server/logs");
});

test("classifies status codes", () => {
  assert.equal(statusClass(200), "2xx");
  assert.equal(statusClass(404), "4xx");
  assert.equal(statusClass(700), "unknown");
});

test("records request counters and durations", () => {
  const metrics = createRequestMetrics();
  metrics.reset();
  const labels = metrics.record({ method: "post", path: "/api/server/start", statusCode: 202, durationSeconds: 0.25 });
  assert.deepEqual(labels, { method: "POST", route: "/api/server/start", status_class: "2xx" });
  const output = metrics.render();
  assert.match(output, /dune_console_api_requests_total/);
  assert.match(output, /dune_console_api_request_duration_seconds/);
});
