import assert from "node:assert/strict";
import test from "node:test";
import { createZipBuffer, redactDiagnosticsValue } from "../diagnostics-export.js";

test("redacts sensitive diagnostics fields recursively", () => {
  const redacted = redactDiagnosticsValue({
    apiKey: "key",
    appSecret: "secret",
    nested: {
      refreshToken: "token",
      safe: "value"
    },
    providers: [{
      name: "provider",
      apiKeyEnv: "ANTHROPIC_AUTH_TOKEN",
      apiKey: "provider-key"
    }]
  }) as Record<string, unknown>;

  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.appSecret, "[REDACTED]");
  assert.deepEqual(redacted.nested, { refreshToken: "[REDACTED]", safe: "value" });
  assert.deepEqual(redacted.providers, [{ name: "provider", apiKeyEnv: "[REDACTED]", apiKey: "[REDACTED]" }]);
});

test("creates a zip archive buffer", () => {
  const zip = createZipBuffer([
    { name: "README.txt", data: Buffer.from("hello") },
    { name: "../safe.json", data: Buffer.from("{}") }
  ]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("README.txt")), true);
  assert.equal(zip.includes(Buffer.from("safe.json")), true);
  assert.equal(zip.includes(Buffer.from("../safe.json")), false);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
