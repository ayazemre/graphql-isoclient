import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { generateClient } from "#src/lib/generate.ts";

const minimalIntrospectionPayload = {
  data: {
    __schema: {
      queryType: { name: "Query" },
      mutationType: null,
      subscriptionType: null,
      types: [
        {
          kind: "OBJECT",
          name: "Query",
          description: null,
          interfaces: [],
          fields: [
            {
              name: "greeting",
              description: null,
              args: [],
              type: { kind: "SCALAR", name: "String", ofType: null },
              isDeprecated: false,
              deprecationReason: null,
            },
            {
              name: "oldGreeting",
              description: null,
              args: [],
              type: { kind: "SCALAR", name: "String", ofType: null },
              isDeprecated: true,
              deprecationReason: "Use greeting",
            },
            {
              name: "user",
              description: null,
              args: [
                {
                  name: "id",
                  description: null,
                  type: {
                    kind: "NON_NULL",
                    ofType: { kind: "SCALAR", name: "ID", ofType: null },
                  },
                },
              ],
              type: { kind: "OBJECT", name: "User", ofType: null },
              isDeprecated: false,
              deprecationReason: null,
            },
          ],
        },
        {
          kind: "OBJECT",
          name: "User",
          description: null,
          interfaces: [],
          fields: [
            {
              name: "username",
              description: null,
              args: [],
              type: {
                kind: "NON_NULL",
                ofType: { kind: "SCALAR", name: "String", ofType: null },
              },
              isDeprecated: false,
              deprecationReason: null,
            },
          ],
        },
        { kind: "SCALAR", name: "String", description: null },
        { kind: "SCALAR", name: "ID", description: null },
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
      introspectionJsonFile,
      output: outputFile,
      includeDeprecatedFields: true,
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
