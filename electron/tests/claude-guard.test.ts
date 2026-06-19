import assert from "node:assert/strict";
import test from "node:test";
import { detectRawLarkDriveFileCommand } from "../lark-drive-guard.js";

function bashItem(command: string): unknown {
  return {
    type: "assistant",
    message: {
      content: [{
        type: "tool_use",
        name: "Bash",
        input: { command }
      }]
    }
  };
}

test("detects raw lark drive download and export commands", () => {
  assert.equal(detectRawLarkDriveFileCommand(bashItem("lark-cli drive +download --file-token abc --as user")), "lark-cli drive +download --file-token abc --as user");
  assert.equal(detectRawLarkDriveFileCommand(bashItem("node_modules/.bin/lark-cli drive +export --doc-type slides --file-extension pptx")), "node_modules/.bin/lark-cli drive +export --doc-type slides --file-extension pptx");
});

test("allows non-download lark and non-bash commands", () => {
  assert.equal(detectRawLarkDriveFileCommand(bashItem("lark-cli drive +search --as user")), null);
  assert.equal(detectRawLarkDriveFileCommand({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "x" } }] } }), null);
});
