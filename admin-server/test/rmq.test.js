import test from "node:test";
import assert from "node:assert/strict";
import { buildBroadcastCommand, buildShutdownBroadcastCommand, validateBroadcastMessage } from "../src/rmq.js";

test("builds verified ServiceBroadcast generic command payload", () => {
  const command = buildBroadcastCommand({ message: "Server event starts soon", durationSec: 45, title: "Event" });
  assert.equal(command.ServerCommand, "ServiceBroadcast");
  assert.equal(command.BroadcastType, "Generic");
  assert.equal(command.BroadcastPayload.BroadcastDuration, 45);
  assert.equal(command.BroadcastPayload.LocalizedText[0].Body, "Server event starts soon");
});

test("validates broadcast and whisper-style message bounds", () => {
  assert.equal(validateBroadcastMessage("hello"), "hello");
  assert.throws(() => validateBroadcastMessage(""));
  assert.throws(() => validateBroadcastMessage("x".repeat(501)));
  assert.throws(() => validateBroadcastMessage("bad\u0001message"));
});

test("builds shutdown ServiceBroadcast with strict shutdown type", () => {
  const before = Math.floor(Date.now() / 1000) + 10 * 60;
  const command = buildShutdownBroadcastCommand({ shutdownType: "Restart", delayMinutes: 10, frequency: 30, duration: 15 });
  assert.equal(command.ServerCommand, "ServiceBroadcast");
  assert.equal(command.BroadcastType, "ServerShutdown");
  assert.equal(command.BroadcastPayload.ShutdownType, "Restart");
  assert.equal(command.BroadcastPayload.BroadcastFrequency, 30);
  assert.equal(command.BroadcastPayload.ShutdownDuration, 15);
  assert.ok(command.BroadcastPayload.ShutdownTimestamp >= before);
  assert.throws(() => buildShutdownBroadcastCommand({ shutdownType: "RebootEverything" }));
});
