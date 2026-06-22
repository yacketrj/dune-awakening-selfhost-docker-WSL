import test from "node:test";
import assert from "node:assert/strict";
import { DESTRUCTIVE_SQL_CONFIRMATION, sqlSafetyDecision } from "../src/sqlGuardrails.js";

test("SQL guardrail allows read-only queries without confirmation", () => {
  assert.deepEqual(sqlSafetyDecision("select * from dune.player_state"), {
    readOnly: true,
    destructive: false,
    allowDestructive: false,
    needsConfirmation: false
  });
});

test("SQL guardrail requires exact confirmation for destructive queries", () => {
  assert.deepEqual(sqlSafetyDecision("delete from dune.items", { allowDestructive: true, confirmation: "DELETE" }), {
    readOnly: false,
    destructive: true,
    allowDestructive: false,
    needsConfirmation: true
  });
  assert.deepEqual(sqlSafetyDecision("delete from dune.items", { allowDestructive: true, confirmation: DESTRUCTIVE_SQL_CONFIRMATION }), {
    readOnly: false,
    destructive: true,
    allowDestructive: true,
    needsConfirmation: false
  });
});
