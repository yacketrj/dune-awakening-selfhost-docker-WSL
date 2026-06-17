const COLORS = {
  ready: 0x2ecc71,
  issue: 0xf1c40f,
  down: 0xe74c3c,
  neutral: 0x95a5a6,
  info: 0x3498db
};

const FOOTER = {
  text: "Read-only Discord adapter • No server mutation commands enabled"
};

export function formatCommandResponse(command, payload) {
  const clean = redact(payload);
  if (isFailure(clean)) return formatErrorResponse(commandTitle(command), clean);

  if (command === "health") return formatHealthResponse(clean);
  if (command === "status") return formatPublicStatusResponse(clean);
  if (command === "statusDetail") return formatDiagnosticResponse("Arrakis Control Plane — Detailed Status", clean);
  if (command === "readiness") return formatReadinessResponse(clean);
  if (command === "services") return formatServicesResponse(clean);

  return formatDiagnosticResponse(commandTitle(command), clean);
}

export function formatDiagnosticJson(title, payload) {
  const clean = redact(payload);
  const data = clean.result || clean.payload?.result || clean;
  const rows = flattenObject(data).slice(0, 18);
  const body = renderKeyValueTable(rows.length ? rows : [["Result", "No diagnostic fields returned."]]);
  return `**${escapeMarkdown(title.replace("raw diagnostic payload", "diagnostic table"))}**\n` + "```text\n" + body + "\n```";
}

function commandTitle(command) {
  if (command === "health") return "Arrakis Control Plane — Adapter Health";
  if (command === "status") return "Arrakis Control Plane — Server Status";
  if (command === "statusDetail") return "Arrakis Control Plane — Detailed Status";
  if (command === "readiness") return "Arrakis Control Plane — Readiness";
  if (command === "services") return "Arrakis Control Plane — Services";
  return "Arrakis Control Plane";
}

function formatHealthResponse(payload) {
  const liveRoutes = Array.isArray(payload.liveRoutes) ? payload.liveRoutes.length : 0;
  const plannedRoutes = Array.isArray(payload.plannedRoutes) ? payload.plannedRoutes.length : 0;
  const policy = payload.rolePolicy || {};
  const roleLines = [
    roleLine("Observer", policy.observerConfigured),
    roleLine("Moderator", policy.moderatorConfigured),
    roleLine("Admin", policy.adminConfigured),
    roleLine("Owner", policy.ownerConfigured)
  ].join("\n");

  return {
    content: "",
    embeds: [baseEmbed({
      title: "Arrakis Control Plane — Adapter Health",
      description: "The Discord adapter is online and operating in read-only mode.",
      color: payload.ok ? COLORS.ready : COLORS.issue,
      fields: [
        field("State", lines([
          statusLine("API", payload.ok ? "ONLINE" : "ISSUE"),
          statusLine("Experimental", truthLabel(payload.experimental)),
          statusLine("Enabled", truthLabel(payload.enabled))
        ]), true),
        field("Safety", lines([
          statusLine("Read-only", truthLabel(payload.readOnly)),
          statusLine("Writes", payload.writesEnabled ? "ENABLED" : "DISABLED")
        ]), true),
        field("Routes", `${liveRoutes} live / ${plannedRoutes} planned`, true),
        field("Role policy", roleLines || "No role policy returned.", false)
      ]
    })]
  };
}

function formatPublicStatusResponse(payload) {
  const data = payload.result || payload.payload?.result || payload;
  const overall = data.overall || data.status || (payload.ok ? "READY" : "ISSUE");
  const maps = asArray(data.maps || data.services || data.instances);
  const issues = asArray(data.issues);

  return {
    content: "",
    embeds: [baseEmbed({
      title: data.title || "Arrakis Control Plane — Server Status",
      description: `Overall state: **${escapeMarkdown(statusText(overall))}**`,
      color: colorForStatus(overall),
      fields: compactFields([
        field("Overall", statusText(overall), true),
        field("Region", safeValue(data.region || data.shardRegion || "Unknown"), true),
        field("Population", safeValue(data.population ?? data.playerCount ?? "Unknown"), true),
        field("Maps", formatMapList(maps), false),
        field("Issues", formatIssueList(issues), false)
      ])
    })]
  };
}

function formatReadinessResponse(payload) {
  const data = payload.result || payload.payload?.result || payload;
  const ready = data.ready ?? data.ok ?? payload.ok;
  const issues = asArray(data.issues || data.blockingIssues || data.failures);
  const services = asArray(data.services || data.maps || data.checks);
  const counts = serviceCounts(services);

  return {
    content: "",
    embeds: [baseEmbed({
      title: "Arrakis Control Plane — Readiness",
      description: ready ? "Server readiness checks are passing." : "Server readiness has one or more blocking issues.",
      color: ready ? COLORS.ready : COLORS.issue,
      fields: compactFields([
        field("Ready", ready ? "YES" : "NO", true),
        field("Services", `${counts.ready} ready / ${counts.issue} issue / ${counts.down} down`, true),
        field("Blocking issues", formatIssueList(issues), false),
        services.length ? field("Checks", formatMapList(services), false) : null
      ])
    })]
  };
}

function formatServicesResponse(payload) {
  const data = payload.result || payload.payload?.result || payload;
  const services = asArray(data.services || data.maps || data.instances || data.result);
  const counts = serviceCounts(services);

  return {
    content: "",
    embeds: [baseEmbed({
      title: "Arrakis Control Plane — Services",
      description: services.length
        ? `${counts.ready} ready / ${counts.issue} issue / ${counts.down} down`
        : "No service records were returned by the Console adapter.",
      color: counts.down ? COLORS.down : counts.issue ? COLORS.issue : COLORS.ready,
      fields: compactFields([
        field("Summary", `${counts.ready} ready / ${counts.issue} issue / ${counts.down} down`, true),
        field("Services", formatMapList(services), false)
      ])
    })]
  };
}

function formatDiagnosticResponse(title, payload) {
  const data = payload.result || payload.payload?.result || payload;
  const overall = data.overall || data.status || (payload.ok ? "OK" : "ISSUE");
  const issues = asArray(data.issues || data.errors || data.failures);

  return {
    content: formatDiagnosticJson(`${title} — raw diagnostic payload`, payload),
    embeds: [baseEmbed({
      title,
      description: `Diagnostic summary: **${escapeMarkdown(statusText(overall))}**`,
      color: colorForStatus(overall),
      fields: compactFields([
        field("Overall", statusText(overall), true),
        field("Issues", formatIssueList(issues), false)
      ])
    })]
  };
}

function formatErrorResponse(title, payload) {
  const error = payload.payload?.error || payload.error || payload.message || "Command failed.";
  const code = payload.payload?.code || payload.code || "unknown";
  const status = payload.status ?? "unknown";

  return {
    content: "",
    embeds: [baseEmbed({
      title: `${title} — Command Failed`,
      description: safeValue(error),
      color: status === 403 || code === "not_authorized" ? COLORS.issue : COLORS.down,
      fields: compactFields([
        field("Status", String(status), true),
        field("Code", safeValue(code), true)
      ])
    })]
  };
}

function baseEmbed({ title, description, color, fields }) {
  return {
    title: truncateEmbedText(title, 256),
    description: truncateEmbedText(description || "", 4096),
    color: color || COLORS.neutral,
    fields: compactFields(fields).slice(0, 25),
    footer: FOOTER,
    timestamp: new Date().toISOString()
  };
}

function field(name, value, inline = false) {
  if (value === null || value === undefined || value === "") return null;
  return {
    name: truncateEmbedText(name, 256),
    value: truncateEmbedText(String(value), 1024),
    inline
  };
}

function compactFields(fields) {
  return (fields || []).filter(Boolean);
}

function formatMapList(items) {
  const rows = asArray(items).map((item) => {
    if (typeof item === "string") return `• ${escapeMarkdown(item)}`;
    const name = item.name || item.service || item.map || item.id || "Unknown";
    const state = item.state || item.status || item.overall || "UNKNOWN";
    const uptime = item.uptime || item.uptimeHuman || item.age || "";
    const extras = [uptime, clientSummary(item), s2sSummary(item)].filter(Boolean).join(" • ");
    return `• **${escapeMarkdown(name)}** — ${escapeMarkdown(statusText(state))}${extras ? ` — ${escapeMarkdown(extras)}` : ""}`;
  });
  return truncateEmbedText(rows.length ? rows.join("\n") : "No service or map records returned.", 1024);
}

function formatIssueList(issues) {
  const rows = asArray(issues).map((issue) => {
    if (typeof issue === "string") return `• ${escapeMarkdown(issue)}`;
    return `• ${escapeMarkdown(issue.message || issue.error || issue.name || JSON.stringify(issue))}`;
  });
  return truncateEmbedText(rows.length ? rows.join("\n") : "No issues reported.", 1024);
}

function serviceCounts(services) {
  const counts = { ready: 0, issue: 0, down: 0 };
  for (const service of asArray(services)) {
    const state = statusText(service?.state || service?.status || service?.overall || service);
    if (/down|failed|error|offline|stopped/i.test(state)) counts.down += 1;
    else if (/issue|degraded|missing|warn|unknown/i.test(state)) counts.issue += 1;
    else counts.ready += 1;
  }
  return counts;
}

function clientSummary(item) {
  const clients = item.clients ?? item.clientCount ?? item.players;
  if (clients === null || clients === undefined || clients === "") return "";
  return `clients ${clients}`;
}

function s2sSummary(item) {
  const s2s = item.s2s ?? item.s2sState ?? item.serverToServer;
  if (s2s === null || s2s === undefined || s2s === "") return "";
  return `S2S ${s2s}`;
}

function statusLine(label, value) {
  return `**${escapeMarkdown(label)}:** ${escapeMarkdown(value)}`;
}

function roleLine(label, configured) {
  return `${configured ? "Configured" : "Missing"} — ${escapeMarkdown(label)}`;
}

function truthLabel(value) {
  return value ? "YES" : "NO";
}

function statusText(value) {
  return String(value || "UNKNOWN").toUpperCase();
}

function colorForStatus(value) {
  const text = statusText(value);
  if (/ready|online|ok|healthy|pass/.test(text.toLowerCase())) return COLORS.ready;
  if (/down|failed|error|offline|stopped/.test(text.toLowerCase())) return COLORS.down;
  if (/issue|degraded|missing|warn|unknown/.test(text.toLowerCase())) return COLORS.issue;
  return COLORS.neutral;
}

function isFailure(payload) {
  return payload?.ok === false || (Number(payload?.status) >= 400);
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.entries(value).map(([name, item]) => ({ name, ...(typeof item === "object" && item !== null ? item : { status: item }) }));
  return [value];
}

function flattenObject(value, prefix = "") {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [[prefix || "value", value]];
  const rows = [];
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item)) rows.push(...flattenObject(item, path));
    else if (Array.isArray(item)) rows.push([path, `${item.length} item(s)`]);
    else rows.push([path, item]);
  }
  return rows;
}

function renderKeyValueTable(rows) {
  const keyWidth = Math.min(34, Math.max("Field".length, ...rows.map(([key]) => plainCell(key).length)));
  const valueWidth = 72;
  const header = `${padPlain("Field", keyWidth)} | Value`;
  const separator = `${"-".repeat(keyWidth)}-+-${"-".repeat(24)}`;
  const body = rows.map(([key, value]) => `${padPlain(truncatePlain(plainCell(key), keyWidth), keyWidth)} | ${truncatePlain(plainCell(value), valueWidth)}`);
  return [header, separator, ...body].join("\n");
}

function lines(values) {
  return values.filter(Boolean).join("\n");
}

function safeValue(value) {
  return escapeMarkdown(String(value ?? "Unknown"));
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/\|/g, "\\|")
    .replace(/>/g, "\\>");
}

function plainCell(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function padPlain(value, width) {
  const text = String(value || "");
  return text + " ".repeat(Math.max(0, width - text.length));
}

function truncatePlain(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function truncateEmbedText(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 12))}\n…truncated` : text;
}

function redact(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (/token|secret|password|authorization|cookie|api[-_]?key/i.test(key)) return "[REDACTED]";
    if (typeof item === "string" && /(Bearer\s+|Bot\s+|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,})/.test(item)) return "[REDACTED]";
    return item;
  }));
}
