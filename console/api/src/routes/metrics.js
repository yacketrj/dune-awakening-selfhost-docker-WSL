import { withSecurityHeaders } from "../auth.js";

export const PROMETHEUS_METRICS_PATH = "/api/metrics/prometheus";

export function isPrometheusMetricsRoute(path) {
  return path === PROMETHEUS_METRICS_PATH;
}

export function writePrometheusMetrics(res, metrics) {
  const body = metrics.render();
  res.writeHead(200, withSecurityHeaders({
    "content-type": "text/plain; version=0.0.4; charset=utf-8",
    "cache-control": "no-store"
  }));
  res.end(body);
}
