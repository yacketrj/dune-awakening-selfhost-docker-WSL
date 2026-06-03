import test from "node:test";
import assert from "node:assert/strict";
import { parseFlsSummary, parseHomeStatus, parsePortRows, parseRabbitConnections, parseReadyRows, parseStatusGameServers, parseStatusListenerRows } from "../src/statusParsers.js";

const healthyStatus = `=== Dune status ===
Overall:     READY
Title:       My Local Dune
Region:      Europe
Mode:        public
Server IP:   37.76.210.36
Battlegroup: test-bg
Population:  0/60

=== Database ===
World partitions: 30

=== RabbitMQ game connections ===
Director connections:    1
Game server connections: 4
TextRouter connections:  0

=== Funcom/FLS summary ===
Director heartbeat:       OK
Population declaration:   OK
Max capacity declaration: OK
Gateway DB monitoring:    OK`;

const healthyReady = `=== Container checks ===
OK   container dune-postgres
OK   container dune-rmq-admin
OK   container dune-rmq-game
OK   container dune-text-router
OK   container dune-director
OK   container dune-server-gateway
OK   container dune-server-survival-1
OK   container dune-server-overmap

=== Listener checks ===
OK   TCP 15432 Postgres localhost
OK   TCP 32573 RabbitMQ admin localhost
OK   TCP 31982 RabbitMQ game public
OK   TCP 31983 RabbitMQ game HTTP public
OK   TCP 5059 TextRouter localhost
OK   TCP 11717 Director localhost
OK   UDP 7777 Overmap clients
OK   UDP 7778 Survival_1 clients
OK   UDP 7888 Survival_1 S2S
OK   UDP 7889 Overmap S2S

=== Database world partition checks ===
OK   world_partition rows: 30

=== Readiness log checks ===
OK   Survival_1 ready
OK   Overmap ready
OK   Director FLS population
OK   Gateway monitoring DB

=== Dynamic game map checks ===
OK   no dynamic game maps currently running

=== RabbitMQ game users ===
OK   game server sg.* RMQ connections

READY: Dune Awakening Self-Host Docker stack looks healthy.`;

const healthyStatusWithSections = `${healthyStatus}

=== Containers ===
SERVICE                    STATUS
dune-postgres              Up 29 minutes
dune-rmq-admin             Up 29 minutes
dune-rmq-game              Up 29 minutes
dune-text-router           Up 29 minutes
dune-director              Up 2 minutes
dune-server-gateway        Up 29 minutes
dune-server-survival-1     Up 29 minutes
dune-server-overmap        Up 29 minutes
dune-orchestrator          Up 29 minutes

=== Listeners ===
CHECK                    PORT     STATUS
Postgres localhost       15432/tcp OK
RabbitMQ admin           32573/tcp OK
RabbitMQ game            31982/tcp OK
RabbitMQ game HTTP       31983/tcp OK
TextRouter               5059/tcp OK
Director                 11717/tcp OK
Overmap clients          7777/udp OK
Survival_1 clients       7778/udp OK
Survival_1 S2S           7888/udp OK
Overmap S2S              7889/udp OK

=== Game servers ===
MAP          STATE        UPTIME
Survival_1   READY        Up 29 minutes
Overmap      READY        Up 29 minutes`;

test("healthy home status does not create false warnings", () => {
  const summary = parseHomeStatus(healthyStatus);
  assert.equal(summary.population, "0/60");
  assert.equal(summary.database, "Ready");
  assert.equal(summary.rabbitmq, "Ready");
  assert.equal(summary.fls, "Ready");
});

test("ready parser ignores section headings and keeps only check rows", () => {
  const rows = parseReadyRows(`=== Container checks ===
OK   container dune-postgres
OK   container dune-rmq-game

=== Listener checks ===
OK   TCP 15432 Postgres localhost
OK   world_partition rows: 30
READY: Dune Awakening Self-Host Docker stack looks healthy.`);
  assert.deepEqual(rows.map((row) => row.label), [
    "container dune-postgres",
    "container dune-rmq-game",
    "TCP 15432 Postgres localhost"
  ]);
});

test("port parser ignores diagnostics and deduplicates logical listeners", () => {
  const rows = parsePortRows(`=== Expected endpoints ===
Overmap game          7777/udp       advertised as 37.76.210.36:7777
WARN Public mode advertises 37.76.210.36 while game UDP is bound on private host IP 10.0.0.5.
OK   Overmap game listening on UDP 7777
OK   Survival_1 game listening on UDP 7778
OK   Survival_1 IGW listening on UDP 7888
OK   Overmap IGW listening on UDP 7889
OK   RabbitMQ game listening on TCP 31982
OK   RabbitMQ game listening on TCP 31982`);
  assert.deepEqual(rows.map((row) => `${row.name}:${row.port}/${row.protocol}`), [
    "Overmap game:7777/UDP",
    "Survival_1 game:7778/UDP",
    "Survival_1 IGW:7888/UDP",
    "Overmap IGW:7889/UDP",
    "RabbitMQ game:31982/TCP"
  ]);
});

test("healthy ready fixture keeps expected checks and omits database partition row", () => {
  const rows = parseReadyRows(healthyReady);
  assert(rows.some((row) => row.label === "container dune-postgres"));
  assert(rows.some((row) => row.label === "Survival_1 ready"));
  assert(rows.some((row) => row.label === "Overmap ready"));
  assert(rows.some((row) => row.label === "game server sg.* RMQ connections"));
  assert(!rows.some((row) => /world_partition/.test(row.label)));
  assert(!rows.some((row) => /^===/.test(row.label)));
});

test("status fixture exposes exact logical listeners and game servers", () => {
  const listeners = parseStatusListenerRows(healthyStatusWithSections);
  assert.deepEqual(listeners.map((row) => `${row.name}:${row.port}/${row.protocol}`), [
    "Postgres localhost:15432/TCP",
    "RabbitMQ admin:32573/TCP",
    "RabbitMQ game:31982/TCP",
    "RabbitMQ game HTTP:31983/TCP",
    "TextRouter:5059/TCP",
    "Director:11717/TCP",
    "Overmap clients:7777/UDP",
    "Survival_1 clients:7778/UDP",
    "Survival_1 S2S:7888/UDP",
    "Overmap S2S:7889/UDP"
  ]);
  assert.deepEqual(parseStatusGameServers(healthyStatusWithSections).map((row) => row.map), ["Survival_1", "Overmap"]);
});

test("RabbitMQ TextRouter zero and FLS OK values are not failures", () => {
  const rabbit = parseRabbitConnections(healthyStatus);
  const fls = parseFlsSummary(healthyStatus);
  assert.equal(rabbit["TextRouter connections"], "0");
  assert.equal(rabbit["Director connections"], "1");
  assert.equal(fls["Director heartbeat"], "OK");
  assert.equal(fls["Gateway DB monitoring"], "OK");
});
