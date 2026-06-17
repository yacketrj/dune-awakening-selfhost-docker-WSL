import test from "node:test";
import assert from "node:assert/strict";

import { formatCommandResponse } from "../scripts/discord-formatters.mjs";

test("health formatter emits a Discord embed with table content", () => {
  const response = formatCommandResponse("health", {
    ok: true,
    service: "dune-console-discord-adapter",
    enabled: true,
    experimental: true,
    readOnly: true,
    writesEnabled: false,
    liveRoutes: ["/health"],
    plannedRoutes: ["/population"],
    rolePolicy: {
      observerConfigured: true,
      moderatorConfigured: false,
      adminConfigured: true,
      ownerConfigured: true
    }
  });

  assert.match(response.content, /```text/);
  assert.match(response.content, /Read-only/);
  assert.equal(response.embeds.length, 1);
  assert.equal(response.embeds[0].title, "Arrakis Control Plane — Adapter Health");
  assert.match(response.embeds[0].fields.find((field) => field.name === "Safety").value, /Read-only/);
});

test("public status formatter summarizes maps and issues", () => {
  const response = formatCommandResponse("status", {
    ok: true,
    result: {
      title: "My Dune Server",
      overall: "ISSUE",
      region: "North America",
      population: "0/60",
      maps: [
        { name: "Survival 1", state: "READY", uptime: "Up 39 minutes" },
        { name: "Overmap", state: "READY", uptime: "Up 39 minutes" }
      ],
      issues: ["Overmap status is ISSUE"]
    }
  });

  const embed = response.embeds[0];
  assert.equal(embed.title, "My Dune Server");
  assert.equal(embed.fields.find((field) => field.name === "Population").value, "0/60");
  assert.match(embed.fields.find((field) => field.name === "Maps").value, /Survival 1/);
  assert.match(embed.fields.find((field) => field.name === "Issues").value, /Overmap status/);
});

test("formatter redacts secret-shaped values inside embeds and diagnostic table", () => {
  const response = formatCommandResponse("statusDetail", {
    ok: true,
    result: {
      overall: "READY",
      token: "abc.def.ghi",
      issues: ["safe issue"]
    }
  });

  const combined = `${response.content}\n${JSON.stringify(response.embeds)}`;
  assert.match(response.content, /```text/);
  assert.doesNotMatch(response.content, /```json/);
  assert.match(combined, /\[REDACTED\]/);
  assert.doesNotMatch(combined, /abc\.def\.ghi/);
});
