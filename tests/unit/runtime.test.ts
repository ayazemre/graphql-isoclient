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

    test("Cyclic Type Is Omitted", () => {
      const schemaModel = parseSDLFile("type User { id: ID! friend: User } type Query { user: User }");
      const runtimeModel = createRuntimeModel(schemaModel);
      assert.deepEqual(runtimeModel, { user: { id: true } });
    });

    test("Runtime Model Has No Scalar Marker", () => {
      const schemaModel = parseSDLFile("type User { id: ID! friend: User } type Query { user: User }");
      const runtimeModelText = JSON.stringify(createRuntimeModel(schemaModel));
      assert.equal(runtimeModelText.includes("__scalar"), false);
    });
  });
}
