import assert from "node:assert/strict";
import test from "node:test";
import { parseStatusJson } from "../src/integrations/discord/statusProvider.js";

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

test("sanitizes non-json status output fallback", () => {
  const result = parseStatusJson("failed at 127.0.0.1 with postgresql://dune:secret@127.0.0.1:15432/dune");
  assert.match(result.output, /<internal-address>|<redacted-connection-string>/);
  assert.doesNotMatch(result.output, /secret/);
  assert.doesNotMatch(result.output, /127\.0\.0\.1/);
});
