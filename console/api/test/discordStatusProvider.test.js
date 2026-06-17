import assert from "node:assert/strict";
import test from "node:test";
import { detailedStatusSummary, parseStatusJson, parseStatusOutput, publicStatusSummary } from "../src/integrations/discord/statusProvider.js";

test("parses plain JSON status output", () => {
  const result = parseStatusJson('{"db_connected":true,"runtime":"docker"}');
  assert.equal(result.db_connected, true);
  assert.equal(result.runtime, "docker");
});

test("parses last JSON object after banner output", () => {
  const result = parseStatusJson('checking status...\n{"db_connected":true,"ssh_host":"172.19.240.122:22"}');
  assert.equal(result.db_connected, true);
  assert.equal(result.ssh_host, "172.19.240.122:22");
});

test("parses text status into a structured summary", () => {
  const result = parseStatusOutput(`=== Dune status ===
Overall:     ISSUE
Title:       My Dune Server
Region:      North America
Mode:        public
Server IP:   50.123.64.61
Battlegroup: sh-example
Population:  0/60

=== Containers ===
SERVICE                    STATUS
dune-postgres              Up 2 minutes
dune-server-gateway        missing

=== Listeners ===
CHECK                    PORT     STATUS
Postgres localhost       15432/tcp OK
Survival_1 clients       7778/udp MISSING

=== Game servers ===
MAP          STATE        UPTIME
Survival_1   WARMING      Up About a minute
Overmap      READY        Up 50 seconds`);

  assert.equal(result.overall, "ISSUE");
  assert.equal(result.title, "My Dune Server");
  assert.equal(result.region, "North America");
  assert.equal(result.mode, "public");
  assert.equal(result.population, "0/60");
  assert.deepEqual(result.maps, [
    { name: "Survival_1", state: "WARMING", uptime: "Up About a minute" },
    { name: "Overmap", state: "READY", uptime: "Up 50 seconds" }
  ]);
  assert.deepEqual(result.services, [
    { name: "dune-postgres", status: "up" },
    { name: "dune-server-gateway", status: "missing" }
  ]);
  assert.deepEqual(result.listeners, [
    { check: "Postgres localhost", status: "OK" },
    { check: "Survival_1 clients", status: "MISSING" }
  ]);
  assert.deepEqual(result.issues, [
    "Overall status is ISSUE",
    "dune-server-gateway is missing",
    "Survival_1 clients is MISSING",
    "Survival_1 is WARMING"
  ]);
});

test("public summary omits topology and diagnostic fields", () => {
  const result = publicStatusSummary({
    overall: "ISSUE",
    title: "My Dune Server",
    population: "0/60",
    ssh_host: "172.19.240.122:22",
    server_ip: "50.123.64.61",
    battlegroup: "sh-example",
    containers: ["dune-postgres"],
    listeners: ["15432/tcp"],
    maps: [{ name: "Overmap", state: "READY", uptime: "Up 50 seconds" }]
  });

  assert.deepEqual(Object.keys(result).sort(), ["maps", "overall", "population", "title"]);
  assert.equal(result.server_ip, undefined);
  assert.equal(result.battlegroup, undefined);
  assert.equal(result.ssh_host, undefined);
  assert.equal(result.containers, undefined);
  assert.equal(result.listeners, undefined);
});

test("detailed summary includes redacted capped raw output", () => {
  const result = detailedStatusSummary({ overall: "ISSUE" }, "Server at 127.0.0.1:15432 postgresql://dune:sample@127.0.0.1:15432/dune");
  assert.equal(result.overall, "ISSUE");
  assert.match(result.redactedOutput, /<internal-address>|<redacted-connection-string>/);
  assert.doesNotMatch(result.redactedOutput, /127\.0\.0\.1/);
  assert.doesNotMatch(result.redactedOutput, /postgresql:\/\//);
});
