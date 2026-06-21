import test from "node:test";
import assert from "node:assert/strict";
import { classifyDockerDaemonFailure } from "../src/preflight.js";

test("classifies Docker socket permission failures", () => {
  const failure = classifyDockerDaemonFailure({
    stderr: Buffer.from("permission denied while trying to connect to /var/run/docker.sock")
  });

  assert.equal(failure.code, "docker_socket_permission");
  assert.match(failure.message, /permission denied/i);
  assert.match(failure.detail, /repair-docker-socket/);
});

test("classifies unavailable Docker daemon failures", () => {
  const failure = classifyDockerDaemonFailure({
    stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?"
  });

  assert.equal(failure.code, "docker_daemon_unavailable");
  assert.match(failure.detail, /Start Docker/);
});
