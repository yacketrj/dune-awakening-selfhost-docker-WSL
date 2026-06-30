import { MetricRegistry } from "./prometheusText.js";

const DEFAULT_REGISTRY = new MetricRegistry();
const HTTP_ROUTE_REPLACEMENTS = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ":uuid"],
  [/\b[A-Fa-f0-9]{16,}\b/g, ":hex"],
  [/\b\d{4,}\b/g, ":id"]
];

export function createRequestMetrics(registry = DEFAULT_REGISTRY) {
  const requests = registry.counter("dune_console_api_requests_total", {
    help: "Total Console API HTTP requests by method, normalized route, and status class.",
    labelNames: ["method", "route", "status_class"]
  });
  const durations = registry.histogram("dune_console_api_request_duration_seconds", {
    help: "Console API HTTP request duration in seconds by method, normalized route, and status class.",
    labelNames: ["method", "route", "status_class"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
  });

  return {
    registry,
    record({ method = "GET", path = "/", statusCode = 200, durationSeconds = 0 }) {
      const labels = {
        method: normalizeMethod(method),
        route: normalizeRoute(path),
        status_class: statusClass(statusCode)
      };
      requests.inc(labels);
      durations.observe(labels, durationSeconds);
      return labels;
    },
    render() {
      return registry.render();
    },
    reset() {
      registry.reset();
    }
  };
}

export function normalizeMethod(method) {
  const normalized = String(method || "GET").toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return "OTHER";
  return normalized;
}

export function normalizeRoute(path) {
  const parsed = safePathname(path);
  const trimmed = parsed.replace(/\/+$/g, "") || "/";
  const parts = trimmed.split("/").map((part) => normalizeSegment(part));
  return parts.join("/") || "/";
}

export function statusClass(statusCode) {
  const code = Number(statusCode);
  if (!Number.isFinite(code) || code < 100 || code > 599) return "unknown";
  return `${Math.trunc(code / 100)}xx`;
}

function safePathname(path) {
  try {
    return new URL(String(path || "/"), "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function normalizeSegment(segment) {
  if (!segment) return segment;
  let normalized = segment;
  for (const [pattern, replacement] of HTTP_ROUTE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  if (/^tasks?[-_][A-Za-z0-9_-]{8,}$/.test(normalized)) return ":task";
  if (/^[A-Za-z0-9_-]{24,}$/.test(normalized)) return ":id";
  return normalized;
}
