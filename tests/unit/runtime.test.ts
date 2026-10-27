import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { parseSDLFile } from "#src/lib/parsers.ts";
import { createRuntimeModel } from "#src/lib/runtime.ts";

export function runtimeTests() {
  return describe("Runtime", function () {
    test("Create Runtime Model", () => {
      const schemaModel = parseSDLFile("type Query { hello: String }");
      const runtimeModel = createRuntimeModel(schemaModel);
      assert.equal(runtimeModel.hello, true);
    });
  });
}
