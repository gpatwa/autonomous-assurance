import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify } from "./recovery.js";

test("stableStringify sorts object keys recursively", () => {
  assert.equal(
    stableStringify({
      z: 1,
      a: { b: 2, a: 1 },
      list: [{ y: true, x: false }],
    }),
    '{"a":{"a":1,"b":2},"list":[{"x":false,"y":true}],"z":1}',
  );
});

test("stableStringify omits undefined values like JSON object serialization", () => {
  assert.equal(
    stableStringify({ keep: "yes", skip: undefined }),
    '{"keep":"yes"}',
  );
});
