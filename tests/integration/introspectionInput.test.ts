import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { generateClient } from "#src/lib/generate.ts";

const minimalIntrospectionPayload = {
  data: {
    __schema: {
      mutationType: null,
      queryType: { name: "Query" },
      subscriptionType: null,
      types: [
        {
          description: null,
          fields: [
            {
              args: [],
              deprecationReason: null,
              description: null,
              isDeprecated: false,
              name: "greeting",
              type: { kind: "SCALAR", name: "String", ofType: null },
            },
            {
              args: [],
              deprecationReason: "Use greeting",
              description: null,
              isDeprecated: true,
              name: "oldGreeting",
              type: { kind: "SCALAR", name: "String", ofType: null },
            },
            {
              args: [
                {
                  description: null,
                  name: "id",
                  type: {
                    kind: "NON_NULL",
                    ofType: { kind: "SCALAR", name: "ID", ofType: null },
                  },
                },
              ],
              deprecationReason: null,
              description: null,
              isDeprecated: false,
              name: "user",
              type: { kind: "OBJECT", name: "User", ofType: null },
            },
          ],
          interfaces: [],
          kind: "OBJECT",
          name: "Query",
        },
        {
          description: null,
          fields: [
            {
              args: [],
              deprecationReason: null,
              description: null,
              isDeprecated: false,
              name: "username",
              type: {
                kind: "NON_NULL",
                ofType: { kind: "SCALAR", name: "String", ofType: null },
              },
            },
          ],
          interfaces: [],
          kind: "OBJECT",
          name: "User",
        },
        { description: null, kind: "SCALAR", name: "String" },
        { description: null, kind: "SCALAR", name: "ID" },
      ],
    },
  },
};

describe("Introspection Json Input", () => {
  test("Minimal Schema", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
    const introspectionJsonFile = join(outputDirectory, "introspection.json");
    const outputFile = join(outputDirectory, "isoclient.ts");

    await writeFile(introspectionJsonFile, JSON.stringify(minimalIntrospectionPayload), "utf8");

    await generateClient({ introspectionJsonFile, output: outputFile });

    const generatedFileText = await readFile(outputFile, "utf8");

    assert.ok(generatedFileText.includes(introspectionJsonFile));
    assert.ok(generatedFileText.includes('"Query.user"'));
    assert.ok(generatedFileText.includes('"select": "User"'));
    assert.ok(generatedFileText.includes('"id": "ID!"'));
    assert.ok(generatedFileText.includes('"Query": ['));
    assert.ok(generatedFileText.includes('"greeting"'));
    assert.ok(generatedFileText.includes('"username"'));
    assert.ok(generatedFileText.includes('"Query.greeting"') === false);
    assert.ok(generatedFileText.includes('"User.username"') === false);
    assert.ok(generatedFileText.includes('"select": "String"') === false);
    assert.ok(generatedFileText.includes('"oldGreeting"') === false);
    assert.ok(generatedFileText.includes("export function query("));
    assert.ok(generatedFileText.includes("export function mutation(") === false);
    assert.ok(generatedFileText.split("\n").every((sourceLine) => sourceLine.startsWith("import ") === false));
  });

  test("Deprecated Fields Included", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
    const introspectionJsonFile = join(outputDirectory, "introspection.json");
    const outputFile = join(outputDirectory, "isoclient.ts");

    await writeFile(introspectionJsonFile, JSON.stringify(minimalIntrospectionPayload), "utf8");

    await generateClient({
      includeDeprecatedFields: true,
      introspectionJsonFile,
      output: outputFile,
    });

    const generatedFileText = await readFile(outputFile, "utf8");

    assert.ok(generatedFileText.includes('"oldGreeting"'));
  });

  test("Malformed Types", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
    const introspectionJsonFile = join(outputDirectory, "introspection.json");
    const outputFile = join(outputDirectory, "isoclient.ts");

    const malformedPayload = {
      data: { __schema: { queryType: { name: "Query" }, types: "not-an-array" } },
    };

    await writeFile(introspectionJsonFile, JSON.stringify(malformedPayload), "utf8");

    await assert.rejects(generateClient({ introspectionJsonFile, output: outputFile }), {
      message: /__schema\.types is not an array/,
    });
  });

  test("Invalid Json", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
    const introspectionJsonFile = join(outputDirectory, "introspection.json");
    const outputFile = join(outputDirectory, "isoclient.ts");

    await writeFile(introspectionJsonFile, "not json {", "utf8");

    await assert.rejects(generateClient({ introspectionJsonFile, output: outputFile }), {
      message: /not valid JSON/,
    });
  });
});
