import test from "node:test";
import assert from "node:assert/strict";
import { assertIdentifier, discoverDbConfig, isReadOnlySql, quoteQualified, redactDbError } from "../src/db.js";
import { listPlayers, tablePreview } from "../src/duneDb.js";

test("discovers RedBlink Postgres defaults and env overrides", () => {
  assert.deepEqual(discoverDbConfig({}), {
    host: "127.0.0.1",
    port: 15432,
    database: "dune",
    user: "dune",
    password: "dune",
    source: "RedBlink defaults"
  });
  assert.equal(discoverDbConfig({ ADMIN_DATABASE_URL: "postgres://user:secret@host/db" }).source, "ADMIN_DATABASE_URL");
  assert.equal(discoverDbConfig({ DUNE_DB_HOST: "db", DUNE_DB_PORT: "5432" }).host, "db");
});

test("validates and quotes SQL identifiers", () => {
  assert.equal(assertIdentifier("player_state"), "player_state");
  assert.equal(quoteQualified("dune", "player_state"), '"dune"."player_state"');
  assert.throws(() => assertIdentifier("player_state;drop"));
  assert.throws(() => quoteQualified("dune", "../accounts"));
});

test("detects destructive SQL and redacts connection strings", () => {
  assert.equal(isReadOnlySql("/* ok */ select * from dune.player_state"), true);
  assert.equal(isReadOnlySql("with x as (select 1) select * from x"), true);
  assert.equal(isReadOnlySql("delete from dune.items"), false);
  assert.doesNotMatch(redactDbError("postgres://dune:secret@127.0.0.1:15432/dune password=secret"), /secret/);
});

test("builds table preview query with quoted identifiers and parameters", async () => {
  const calls = [];
  const db = {
    query: async (text, values) => {
      calls.push({ text, values });
      return { fields: [{ name: "id", dataTypeID: 20 }], rows: [{ id: 1 }] };
    }
  };
  const result = await tablePreview(db, "dune", "player_state", 25, 5);
  assert.match(calls[0].text, /"dune"\."player_state" limit \$1 offset \$2/);
  assert.deepEqual(calls[0].values, [25, 5]);
  assert.equal(result.rows[0].id, 1);
});

test("players query uses parameterized search input", async () => {
  const calls = [];
  const db = {
    query: async (text, values) => {
      calls.push({ text, values });
      if (text.includes("to_regclass")) return { rows: [{ exists: true }] };
      return { rows: [] };
    }
  };
  await listPlayers(db, { q: "RedBlink'; drop table dune.actors; --" });
  const playerQuery = calls.find((call) => call.text.includes("from dune.actors"));
  assert.ok(playerQuery);
  assert.match(playerQuery.text, /\$1/);
  assert.deepEqual(playerQuery.values, ["%RedBlink'; drop table dune.actors; --%"]);
});
