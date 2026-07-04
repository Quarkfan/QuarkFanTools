import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { checkRemoteAuth, enforceRemoteAuthPolicy, nextRemoteAuthCheckDelayMs, parseRemoteAuthStatus } from "../auth-gate.js";

test("parses remote auth status", () => {
  assert.equal(parseRemoteAuthStatus("Auth=open\n"), "open");
  assert.equal(parseRemoteAuthStatus(" Auth = close "), "close");
  assert.equal(parseRemoteAuthStatus("Other=open"), null);
});

test("allows only explicit Auth=open", async () => {
  const open = await checkRemoteAuth({ fetchImpl: async () => new Response("Auth=open") });
  const close = await checkRemoteAuth({ fetchImpl: async () => new Response("Auth=close") });
  const unknown = await checkRemoteAuth({ fetchImpl: async () => new Response("hello") });

  assert.equal(open.allowed, true);
  assert.equal(open.status, "open");
  assert.equal(close.allowed, false);
  assert.equal(close.status, "close");
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.status, "unknown");
});

test("fails closed on remote auth request errors", async () => {
  const result = await checkRemoteAuth({
    fetchImpl: async () => {
      throw new Error("network unavailable");
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, "unknown");
});

test("allows temporary network-unreachable auth checks while accumulating state", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qft-auth-gate-"));
  const statePath = path.join(dir, "auth-gate.json");
  try {
    const result = await enforceRemoteAuthPolicy({
      statePath,
      now: new Date("2026-07-03T00:00:00.000Z"),
      fetchImpl: async () => {
        throw new Error("network unavailable");
      }
    });
    const state = JSON.parse(await readFile(statePath, "utf8")) as { unreachableCount: number };

    assert.equal(result.allowed, true);
    assert.equal(result.networkUnreachable, true);
    assert.equal(state.unreachableCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("denies network-unreachable auth after ninety days and two hundred checks", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qft-auth-gate-"));
  const statePath = path.join(dir, "auth-gate.json");
  try {
    await writeFile(statePath, JSON.stringify({
      firstUnreachableAt: "2026-01-01T00:00:00.000Z",
      lastUnreachableAt: "2026-03-01T00:00:00.000Z",
      unreachableCount: 199
    }));
    const result = await enforceRemoteAuthPolicy({
      statePath,
      now: new Date("2026-04-01T00:00:00.000Z"),
      fetchImpl: async () => {
        throw new Error("network unavailable");
      }
    });

    assert.equal(result.allowed, false);
    assert.equal(result.networkUnreachable, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resets network-unreachable auth state when Auth=open is reachable", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qft-auth-gate-"));
  const statePath = path.join(dir, "auth-gate.json");
  try {
    await writeFile(statePath, JSON.stringify({
      firstUnreachableAt: "2026-01-01T00:00:00.000Z",
      lastUnreachableAt: "2026-03-01T00:00:00.000Z",
      unreachableCount: 88
    }));
    const result = await enforceRemoteAuthPolicy({
      statePath,
      fetchImpl: async () => new Response("Auth=open")
    });

    assert.equal(result.allowed, true);
    await assert.rejects(readFile(statePath, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("keeps runtime auth recheck delay in the random window", () => {
  for (let index = 0; index < 20; index += 1) {
    const delay = nextRemoteAuthCheckDelayMs();
    assert.ok(delay >= 10 * 60 * 1000);
    assert.ok(delay <= 30 * 60 * 1000);
  }
});
