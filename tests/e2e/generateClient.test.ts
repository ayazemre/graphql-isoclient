import { strict as assert } from "node:assert";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { generateClient } from "#src/lib/generate.ts";

import { startGraphqlYogaServer } from "../helpers.ts";

describe("Client Generation", () => {
  test("Live Introspection Endpoint", async () => {
    const schemaFile = new URL("../sampeSchema.graphql", import.meta.url);
    const runningGraphqlServer = await startGraphqlYogaServer(schemaFile);

    try {
      const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
      const outputFile = join(outputDirectory, "isoclient.ts");

      const generationResult = await generateClient({
        schemaEndpoint: runningGraphqlServer.endpoint,
        output: outputFile,
      });

      const generatedFileText = await readFile(outputFile, "utf8");

      assert.equal(generationResult.outputFile, outputFile);
      assert.equal(generationResult.byteLength, Buffer.byteLength(generatedFileText, "utf8"));
      assert.ok(generatedFileText.includes("export function query("));
      assert.ok(generatedFileText.includes("export function mutation("));
      assert.ok(generatedFileText.includes("export function subscription(") === false);
      assert.ok(generatedFileText.includes('"Query.Tweets"'));
      assert.ok(generatedFileText.includes('"Tweet.Author"'));
      assert.ok(generatedFileText.includes('"Tweet.id"') === false);
      assert.ok(generatedFileText.includes("return runOperation("));
      assert.ok(generatedFileText.split("\n").every((sourceLine) => sourceLine.startsWith("import ") === false));
      assert.ok(generatedFileText.includes('from "./') === false);
    } finally {
      await runningGraphqlServer.stop();
    }
  });
});
