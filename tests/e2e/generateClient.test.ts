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
      assert.ok(generatedFileText.includes("export function query(requestMap: QueryRequest"));
      assert.ok(generatedFileText.includes("export function mutation(requestMap: MutationRequest"));
      assert.ok(generatedFileText.includes("export function subscription(") === false);
      assert.ok(generatedFileText.includes('export type OperationTypeName = "query" | "mutation";'));
      assert.ok(generatedFileText.includes("export type QueryRequest = {"));
      assert.ok(generatedFileText.includes("export type UserRequest = {"));
      assert.ok(generatedFileText.includes("export type QueryResult = {"));
      assert.ok(generatedFileText.includes("export type RequiredFieldArguments<"));
      assert.ok(generatedFileText.includes("export type OptionalFieldArguments<"));
      assert.ok(generatedFileText.includes("runOperation("));
      assert.ok(generatedFileText.includes("const clientConfig: ClientConfig = {"));
      assert.ok(generatedFileText.startsWith("const clientConfig: ClientConfig = {"));
      assert.ok(generatedFileText.includes("// Do not edit below this line."));
      assert.ok(generatedFileText.includes("defaultEndpoint: clientConfig.endpoint"));
      assert.ok(generatedFileText.includes("defaultHeaders: clientConfig.headers"));
      assert.ok(
        generatedFileText.indexOf("const clientConfig: ClientConfig = {") <
          generatedFileText.indexOf("export function query(requestMap: QueryRequest"),
      );
      assert.ok(
        generatedFileText.indexOf("export function query(requestMap: QueryRequest") < generatedFileText.indexOf("export type QueryRequest = {"),
      );
      assert.ok(generatedFileText.includes('"Query.Tweets"'));
      assert.ok(generatedFileText.includes('"Tweet.Author"'));
      assert.ok(generatedFileText.includes('"Tweet.id"') === false);
      assert.ok(generatedFileText.split("\n").every((sourceLine) => sourceLine.startsWith("import ") === false));
      assert.ok(generatedFileText.includes('from "./') === false);
    } finally {
      await runningGraphqlServer.stop();
    }
  });

  test("Query Only Schema Has No Mutation Or Subscription", async () => {
    const schemaFile = new URL("../queryOnlySchema.graphql", import.meta.url);
    const runningGraphqlServer = await startGraphqlYogaServer(schemaFile);

    try {
      const generatedFileText = await generateClientText(runningGraphqlServer.endpoint);

      assert.ok(generatedFileText.includes("export function query(requestMap: QueryRequest"));
      assert.ok(generatedFileText.includes("export function mutation(") === false);
      assert.ok(generatedFileText.includes("export function subscription(") === false);
      assert.ok(generatedFileText.includes("Mutation") === false);
      assert.ok(generatedFileText.includes("Subscription") === false);
      assert.ok(generatedFileText.includes('export type OperationTypeName = "query";'));
      assert.ok(generatedFileText.includes("runSubscriptionOperation") === false);
      assert.ok(generatedFileText.includes("startSubscriptionStream") === false);
      assert.ok(generatedFileText.includes("SubscriptionTransport") === false);
      assert.ok(generatedFileText.includes("SubscriptionRequestOptions") === false);
      assert.ok(generatedFileText.includes("export type __TypeKind") === false);
      assert.ok(generatedFileText.includes("export type __DirectiveLocation") === false);
    } finally {
      await runningGraphqlServer.stop();
    }
  });

  test("Schema Without Subscription Has No Subscription Runtime", async () => {
    const schemaFile = new URL("../sampeSchema.graphql", import.meta.url);
    const runningGraphqlServer = await startGraphqlYogaServer(schemaFile);

    try {
      const generatedFileText = await generateClientText(runningGraphqlServer.endpoint);

      assert.ok(generatedFileText.includes("export function mutation(requestMap: MutationRequest"));
      assert.ok(generatedFileText.includes("export function subscription(") === false);
      assert.ok(generatedFileText.includes("runSubscriptionOperation") === false);
      assert.ok(generatedFileText.includes("SubscriptionTransport") === false);
      assert.ok(generatedFileText.includes("SubscriptionRequestOptions") === false);
      assert.ok(generatedFileText.includes('export type OperationTypeName = "query" | "mutation";'));
    } finally {
      await runningGraphqlServer.stop();
    }
  });

  test("Schema With Subscription Has The Subscription Runtime", async () => {
    const schemaFile = new URL("../subscriptionSchema.graphql", import.meta.url);
    const runningGraphqlServer = await startGraphqlYogaServer(schemaFile);

    try {
      const generatedFileText = await generateClientText(runningGraphqlServer.endpoint);

      assert.ok(generatedFileText.includes("export function query(requestMap: QueryRequest"));
      assert.ok(generatedFileText.includes("export function mutation(requestMap: MutationRequest"));
      assert.ok(generatedFileText.includes("export function subscription(requestMap: SubscriptionRequest"));
      assert.ok(generatedFileText.includes("runSubscriptionOperation"));
      assert.ok(generatedFileText.includes("startSubscriptionStream"));
      assert.ok(generatedFileText.includes("export type SubscriptionTransport = {"));
      assert.ok(generatedFileText.includes("export type SubscriptionRequestOptions = RequestOptions & {"));
      assert.ok(generatedFileText.includes("export type SubscriptionRequest = {"));
      assert.ok(generatedFileText.includes("export type SubscriptionResult = {"));
      assert.ok(generatedFileText.includes('export type OperationTypeName = "query" | "mutation" | "subscription";'));
    } finally {
      await runningGraphqlServer.stop();
    }
  });
});

async function generateClientText(schemaEndpoint: string): Promise<string> {
  const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
  const outputFile = join(outputDirectory, "isoclient.ts");

  await generateClient({ output: outputFile, schemaEndpoint });

  return readFile(outputFile, "utf8");
}
