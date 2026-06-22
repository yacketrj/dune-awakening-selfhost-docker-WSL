import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, publicConfig } from "../src/config.js";

test("web config exposes safe deployment flags and JSON body limit", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "arrakis-config-"));
  const previous = { ...process.env };
  process.env.DUNE_DOCKER_DIR = repoRoot;
  process.env.NODE_ENV = "production";
  process.env.ADMIN_MAX_JSON_BYTES = "12345";
  process.env.ADMIN_MAX_UPLOAD_BYTES = "45678";
  process.env.ADMIN_MAX_SSE_CONNECTIONS = "9";
  try {
    const config = loadConfig();
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.secureCookies, true);
    assert.equal(config.maxJsonBytes, 12345);
    assert.equal(config.maxUploadBytes, 45678);
    assert.equal(config.maxSseConnections, 9);
    const exposed = publicConfig(config);
    assert.equal(exposed.secureCookies, true);
    assert.equal(exposed.authDisabled, false);
    assert.equal(exposed.mockMode, false);
    assert.equal(Object.hasOwn(exposed, "adminPassword"), false);
    assert.equal(Object.hasOwn(exposed, "sessionSecret"), false);

    process.env.ADMIN_SECURE_COOKIES = "0";
    assert.equal(loadConfig().secureCookies, false);
  } finally {
    process.env = previous;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("web config allows explicit bind hosts when authentication remains enabled", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "arrakis-config-bind-"));
  const previous = { ...process.env };
  process.env = {
    ...previous,
    DUNE_DOCKER_DIR: repoRoot,
    ADMIN_BIND_HOST: "0.0.0.0",
    ADMIN_AUTH_DISABLED: "0"
  };
  try {
    assert.equal(loadConfig().host, "0.0.0.0");
  } finally {
    process.env = previous;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("web config refuses auth-disabled mode on non-loopback bind hosts", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "arrakis-config-auth-disabled-"));
  const previous = { ...process.env };
  process.env = {
    ...previous,
    DUNE_DOCKER_DIR: repoRoot,
    ADMIN_BIND_HOST: "0.0.0.0",
    ADMIN_AUTH_DISABLED: "1"
  };
  try {
    assert.throws(
      () => loadConfig(),
      /ADMIN_AUTH_DISABLED=1 is only allowed/
    );

    process.env.ADMIN_BIND_HOST = "127.0.0.1";
    const config = loadConfig();
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.authDisabled, true);
  } finally {
    process.env = previous;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("web config uses tighter upload and stream defaults", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "arrakis-config-limits-"));
  const previous = { ...process.env };
  process.env = {
    ...previous,
    DUNE_DOCKER_DIR: repoRoot
  };
  delete process.env.ADMIN_MAX_UPLOAD_BYTES;
  delete process.env.ADMIN_MAX_SSE_CONNECTIONS;
  try {
    const config = loadConfig();
    assert.equal(config.maxUploadBytes, 128 * 1024 * 1024);
    assert.equal(config.maxSseConnections, 20);
  } finally {
    process.env = previous;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
