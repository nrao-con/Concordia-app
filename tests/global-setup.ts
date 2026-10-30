/**
 * Vitest global setup: starts a dedicated test server with NODE_ENV=test on
 * port 5001 before the Care Navigator E2E suite runs, then tears it down.
 *
 * The test server is a separate process so it runs with NODE_ENV=test without
 * affecting the main development server (NODE_ENV=development on port 5000).
 * The isAuthenticated middleware accepts X-Test-User-Id only when
 * NODE_ENV === "test", so the bypass is never active in the dev server.
 */

import { spawn, type ChildProcess } from "child_process";
import net from "net";

let testServer: ChildProcess | null = null;
const TEST_PORT = 5001;

function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      const sock = net.createConnection({ port, host: "127.0.0.1" });
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 300);
        }
      });
    }
    attempt();
  });
}

export async function setup() {
  testServer = spawn(
    "npx",
    ["tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(TEST_PORT),
      },
      stdio: "ignore",
      detached: false,
    }
  );

  testServer.on("error", (err) => {
    console.error("[test-server] Failed to start:", err);
  });

  await waitForPort(TEST_PORT);
}

export async function teardown() {
  if (testServer) {
    testServer.kill("SIGTERM");
    testServer = null;
  }
}
