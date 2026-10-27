import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { parseSDLFile, parseIntrospectionJSON } from "#src/lib/parsers.ts";

export function parserTests() {
  return describe("Parser", function () {
    test("Parse SDL", () => {
      const schemaModel = parseSDLFile("type Query { hello: String }");
      assert.equal(schemaModel.queryTypeName, "Query");
    });

    test("Parse SDL Malformed", () => {
      assert.throws(() => parseSDLFile("type Query { hello: "));
    });

    test("Parse Introspection JSON", () => {
      const introspectionJson = JSON.stringify({
        data: { __schema: { queryType: { kind: "OBJECT", name: "Query" }, types: [{ fields: [], interfaces: [], kind: "OBJECT", name: "Query" }] } },
      });
      const schemaModel = parseIntrospectionJSON(introspectionJson);
      assert.equal(schemaModel.queryTypeName, "Query");
    });

    test("Parse Introspection JSON Malformed", () => {
      assert.throws(() => parseIntrospectionJSON("{ not json"));
    });
  });
}
