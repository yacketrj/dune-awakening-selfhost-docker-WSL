import test from "node:test";
import assert from "node:assert/strict";
import { MetricRegistry, formatSample } from "../src/services/prometheusText.js";

test("formats a basic metric sample", () => {
  const line = formatSample("dune_console_ready", 1, { service: "api" });
  assert.equal(line.includes("dune_console_ready"), true);
  assert.equal(line.includes("service"), true);
  assert.equal(line.endsWith(" 1"), true);
});

test("renders registry output", () => {
  const registry = new MetricRegistry();
  registry.counter("dune_console_api_requests_total", { labelNames: ["method"] }).inc({ method: "GET" });
  registry.gauge("dune_console_stack_ready", { labelNames: ["stack"] }).set({ stack: "game" }, 1);
  const output = registry.render();
  assert.equal(output.includes("dune_console_api_requests_total"), true);
  assert.equal(output.includes("dune_console_stack_ready"), true);
});
