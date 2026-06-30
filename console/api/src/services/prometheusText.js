const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED_LABEL_PREFIX_RE = /^__/;
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export function assertMetricName(name) {
  const metric = String(name ?? "");
  if (!METRIC_NAME_RE.test(metric)) {
    throw new Error(`Invalid Prometheus metric name: ${name}`);
  }
  return metric;
}

export function assertLabelName(name) {
  const label = String(name ?? "");
  if (!LABEL_NAME_RE.test(label) || RESERVED_LABEL_PREFIX_RE.test(label)) {
    throw new Error(`Invalid Prometheus label name: ${name}`);
  }
  return label;
}

export function escapeHelp(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

export function escapeLabelValue(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, "\\\"");
}

export function formatNumber(value) {
  if (value === Number.POSITIVE_INFINITY || value === "Infinity" || value === "+Inf") return "+Inf";
  if (value === Number.NEGATIVE_INFINITY || value === "-Inf") return "-Inf";
  const number = Number(value);
  if (!Number.isFinite(number)) return "NaN";
  return Object.is(number, -0) ? "0" : String(number);
}

export function formatLabels(labels = {}) {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return "";
  const formatted = entries.map(([name, value]) => `${assertLabelName(name)}="${escapeLabelValue(value)}"`);
  return `{${formatted.join(",")}}`;
}

export function formatSample(name, value, labels = {}) {
  return `${assertMetricName(name)}${formatLabels(labels)} ${formatNumber(value)}`;
}

export function renderMetricFamily({ name, help, type, samples }) {
  const metric = assertMetricName(name);
  const output = [];
  if (help) output.push(`# HELP ${metric} ${escapeHelp(help)}`);
  if (type) output.push(`# TYPE ${metric} ${type}`);
  for (const sample of samples ?? []) {
    output.push(formatSample(sample.name ?? metric, sample.value, sample.labels));
  }
  return output.join("\n");
}

export function renderMetrics(families) {
  return `${families.filter(Boolean).map(renderMetricFamily).join("\n")}\n`;
}

export class MetricRegistry {
  #families = new Map();

  counter(name, options = {}) {
    return this.#family(name, "counter", options, CounterMetric);
  }

  gauge(name, options = {}) {
    return this.#family(name, "gauge", options, GaugeMetric);
  }

  histogram(name, options = {}) {
    return this.#family(name, "histogram", options, HistogramMetric);
  }

  reset() {
    for (const family of this.#families.values()) family.reset();
  }

  render() {
    return renderMetrics([...this.#families.values()].map((family) => family.toFamily()));
  }

  #family(name, type, options, MetricClass) {
    const metric = assertMetricName(name);
    const existing = this.#families.get(metric);
    if (existing) {
      if (existing.type !== type) throw new Error(`Metric ${metric} already registered as ${existing.type}`);
      return existing;
    }
    const family = new MetricClass(metric, options);
    this.#families.set(metric, family);
    return family;
  }
}

class BaseMetric {
  constructor(name, { help = "", labelNames = [] } = {}) {
    this.name = assertMetricName(name);
    this.help = help;
    this.labelNames = labelNames.map(assertLabelName);
    this.values = new Map();
  }

  key(labels = {}) {
    const normalized = {};
    for (const label of this.labelNames) normalized[label] = labels[label] ?? "";
    return JSON.stringify(normalized);
  }

  labelsForKey(key) {
    return JSON.parse(key);
  }

  assertLabels(labels = {}) {
    for (const label of Object.keys(labels)) assertLabelName(label);
    for (const label of Object.keys(labels)) {
      if (!this.labelNames.includes(label)) throw new Error(`Unexpected label ${label} for metric ${this.name}`);
    }
  }

  reset() {
    this.values.clear();
  }
}

class CounterMetric extends BaseMetric {
  type = "counter";

  inc(labels = {}, amount = 1) {
    this.assertLabels(labels);
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) throw new Error("Counter increment must be a non-negative finite number");
    const key = this.key(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  toFamily() {
    return {
      name: this.name,
      help: this.help,
      type: this.type,
      samples: [...this.values.entries()].map(([key, value]) => ({ labels: this.labelsForKey(key), value }))
    };
  }
}

class GaugeMetric extends BaseMetric {
  type = "gauge";

  set(labels = {}, value = 0) {
    this.assertLabels(labels);
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Gauge value must be a finite number");
    this.values.set(this.key(labels), number);
  }

  inc(labels = {}, amount = 1) {
    this.set(labels, (this.values.get(this.key(labels)) ?? 0) + Number(amount));
  }

  dec(labels = {}, amount = 1) {
    this.inc(labels, -Number(amount));
  }

  toFamily() {
    return {
      name: this.name,
      help: this.help,
      type: this.type,
      samples: [...this.values.entries()].map(([key, value]) => ({ labels: this.labelsForKey(key), value }))
    };
  }
}

class HistogramMetric extends BaseMetric {
  type = "histogram";

  constructor(name, options = {}) {
    super(name, options);
    this.buckets = [...(options.buckets ?? DEFAULT_BUCKETS)].map(Number).sort((a, b) => a - b);
  }

  observe(labels = {}, value = 0) {
    this.assertLabels(labels);
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error("Histogram observation must be a non-negative finite number");
    const key = this.key(labels);
    const current = this.values.get(key) ?? { count: 0, sum: 0, buckets: new Map(this.buckets.map((bucket) => [bucket, 0])) };
    current.count += 1;
    current.sum += number;
    for (const bucket of this.buckets) {
      if (number <= bucket) current.buckets.set(bucket, current.buckets.get(bucket) + 1);
    }
    this.values.set(key, current);
  }

  toFamily() {
    const samples = [];
    for (const [key, value] of this.values.entries()) {
      const labels = this.labelsForKey(key);
      for (const bucket of this.buckets) {
        samples.push({ name: `${this.name}_bucket`, labels: { ...labels, le: bucket }, value: value.buckets.get(bucket) ?? 0 });
      }
      samples.push({ name: `${this.name}_bucket`, labels: { ...labels, le: "+Inf" }, value: value.count });
      samples.push({ name: `${this.name}_sum`, labels, value: value.sum });
      samples.push({ name: `${this.name}_count`, labels, value: value.count });
    }
    return { name: this.name, help: this.help, type: this.type, samples };
  }
}
