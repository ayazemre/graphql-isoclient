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
        output: outputFile,
        schemaEndpoint: runningGraphqlServer.endpoint,
      });

      const generatedFileText = await readFile(outputFile, "utf8");

      assert.equal(generationResult.outputFile, outputFile);
      assert.equal(generationResult.byteLength, Buffer.byteLength(generatedFileText, "utf8"));
      assert.ok(generatedFileText.includes("export function query(): QueryBuilder"));
      assert.ok(generatedFileText.includes("export function mutation(): MutationBuilder"));
      assert.ok(generatedFileText.includes("export function subscription(") === false);
      assert.ok(generatedFileText.includes("export type QueryBuilder = {"));
      assert.ok(generatedFileText.includes("export type UserSelectionMap = {"));
      assert.ok(generatedFileText.includes("export type QueryResult = {"));
      assert.ok(generatedFileText.includes("createOperationBuilderCore("));
      assert.ok(generatedFileText.includes("runOperation(") === false);
      assert.ok(generatedFileText.includes("const clientConfig: ClientConfig = {"));
      assert.ok(generatedFileText.startsWith("const clientConfig: ClientConfig = {"));
      assert.ok(generatedFileText.includes("// Do not edit below this line."));
      assert.ok(generatedFileText.includes("defaultEndpoint: clientConfig.endpoint"));
      assert.ok(generatedFileText.includes("defaultHeaders: clientConfig.headers"));
      assert.ok(
        generatedFileText.indexOf("const clientConfig: ClientConfig = {") < generatedFileText.indexOf("export function query(): QueryBuilder"),
      );
      assert.ok(generatedFileText.indexOf("export function query(): QueryBuilder") < generatedFileText.indexOf("export type QueryBuilder = {"));
      assert.ok(generatedFileText.includes('"Query.Tweets"'));
      assert.ok(generatedFileText.includes('"Tweet.Author"'));
      assert.ok(generatedFileText.includes('"Tweet.id"') === false);
      assert.ok(generatedFileText.split("\n").every((sourceLine) => sourceLine.startsWith("import ") === false));
      assert.ok(generatedFileText.includes('from "./') === false);
    } finally {
      await runningGraphqlServer.stop();
    }
  });
});
