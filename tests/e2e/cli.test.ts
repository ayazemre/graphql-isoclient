import { strict as assert } from "node:assert";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import {
  mutationResolvers,
  queryMutationSchemaPath,
  queryMutationSubscriptionSchemaPath,
  queryResolvers,
  querySchemaPath,
  readSchemaSdl,
  requiredHeaderName,
  requiredHeaderValue,
  runCli,
  startGraphqlServer,
  subscriptionResolvers,
  temporaryDirectoryPath,
  type RunningGraphqlServer,
} from "../utilities.ts";

const queryExports = ["query", "QuerySelection", "QueryReturnType"];
const mutationExports = ["mutation", "MutationSelection", "MutationReturnType"];
const subscriptionExports = ["subscription", "SubscriptionSelection", "SubscriptionReturnType"];
const forbiddenExports = [
  "ResultOf",
  "QueryResult",
  "QuerySingleKey",
  "QueryFields",
  "MutationResult",
  "MutationSingleKey",
  "MutationFields",
  "SubscriptionFields",
];

export function cliTests() {
  return describe("Command Line Interface", function () {
    let server: RunningGraphqlServer;

    before(async () => {
      server = await startGraphqlServer(readSchemaSdl(queryMutationSubscriptionSchemaPath), {
        ...queryResolvers,
        ...mutationResolvers,
        ...subscriptionResolvers,
      });
    });

    after(async () => {
      await server.stop();
    });

    test("Query Only", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-query-only.ts");

      const result = await runCli([`--schema-source=${querySchemaPath}`, `--output=${outputFile}`]);

      assert.equal(result.exitCode, 0, result.stderr);
      const generatedFile = await readFile(outputFile, "utf8");
      for (const exportName of queryExports) {
        assert.match(generatedFile, new RegExp(`export (async )?(function\\*? |type |const )${exportName}\\b`));
      }
      for (const exportName of [...mutationExports, ...subscriptionExports, ...forbiddenExports]) {
        assert.doesNotMatch(generatedFile, new RegExp(`export (async )?(function\\*? |type |const )${exportName}\\b`));
      }
    });

    test("Query And Mutation", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-query-mutation.ts");

      const result = await runCli([`--schema-source=${queryMutationSchemaPath}`, `--output=${outputFile}`]);

      assert.equal(result.exitCode, 0, result.stderr);
      const generatedFile = await readFile(outputFile, "utf8");
      for (const exportName of [...queryExports, ...mutationExports]) {
        assert.match(generatedFile, new RegExp(`export (async )?(function\\*? |type |const )${exportName}\\b`));
      }
      for (const exportName of [...subscriptionExports, ...forbiddenExports]) {
        assert.doesNotMatch(generatedFile, new RegExp(`export (async )?(function\\*? |type |const )${exportName}\\b`));
      }
    });

    test("Query Mutation And Subscription", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-query-mutation-subscription.ts");

      const result = await runCli([`--schema-source=${queryMutationSubscriptionSchemaPath}`, `--output=${outputFile}`]);

      assert.equal(result.exitCode, 0, result.stderr);
      const generatedFile = await readFile(outputFile, "utf8");
      for (const exportName of [...queryExports, ...mutationExports, ...subscriptionExports]) {
        assert.match(generatedFile, new RegExp(`export (async )?(function\\*? |type |const )${exportName}\\b`));
      }
      for (const exportName of forbiddenExports) {
        assert.doesNotMatch(generatedFile, new RegExp(`export (async )?(function\\*? |type |const )${exportName}\\b`));
      }
    });

    test("Endpoint Generates Client", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-endpoint.ts");

      const result = await runCli([`--schema-source=${server.endpoint}`, `--output=${outputFile}`]);

      assert.equal(result.exitCode, 0, result.stderr);
      const clientModule = await import(outputFile);
      const response = await clientModule.query({ users: { email: true, id: true, username: true } });
      assert.equal(response?.[0]?.username, "alice");
    });

    test("Missing Arguments Exits One", async () => {
      const result = await runCli([]);

      assert.equal(result.exitCode, 1);
    });

    test("Invalid Schema Source Exits One", async () => {
      const result = await runCli([
        `--schema-source=${join(temporaryDirectoryPath, "does-not-exist.graphql")}`,
        `--output=${join(temporaryDirectoryPath, "invalid.ts")}`,
      ]);

      assert.equal(result.exitCode, 1);
    });

    test("Headers Reach Introspection Endpoint", async () => {
      const headerServer = await startGraphqlServer(readSchemaSdl(querySchemaPath), queryResolvers, { requireHeader: true });

      try {
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "cli-headers-valid.ts");
        const headersArgument = `--headers=${JSON.stringify({ [requiredHeaderName]: requiredHeaderValue })}`;

        const result = await runCli([`--schema-source=${headerServer.endpoint}`, `--output=${outputFile}`, headersArgument]);

        assert.equal(result.exitCode, 0, result.stderr);
        const generatedFile = await readFile(outputFile, "utf8");
        assert.match(generatedFile, /export async function query\b/);
      } finally {
        await headerServer.stop();
      }
    });

    test("Missing Header Fails Introspection", async () => {
      const headerServer = await startGraphqlServer(readSchemaSdl(querySchemaPath), queryResolvers, { requireHeader: true });

      try {
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "cli-headers-missing.ts");

        const result = await runCli([`--schema-source=${headerServer.endpoint}`, `--output=${outputFile}`]);

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr, /Introspection request failed with status 401/);
      } finally {
        await headerServer.stop();
      }
    });

    test("Wrong Header Value Fails Introspection", async () => {
      const headerServer = await startGraphqlServer(readSchemaSdl(querySchemaPath), queryResolvers, { requireHeader: true });

      try {
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "cli-headers-wrong.ts");
        const headersArgument = `--headers=${JSON.stringify({ [requiredHeaderName]: "wrong-key" })}`;

        const result = await runCli([`--schema-source=${headerServer.endpoint}`, `--output=${outputFile}`, headersArgument]);

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr, /Introspection request failed with status 401/);
      } finally {
        await headerServer.stop();
      }
    });

    test("Malformed Headers JSON Exits One", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-headers-malformed.ts");

      const result = await runCli([`--schema-source=${querySchemaPath}`, `--output=${outputFile}`, "--headers={not json"]);

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /--headers must be valid JSON/);
    });

    test("Headers Array Exits One", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-headers-array.ts");

      const result = await runCli([`--schema-source=${querySchemaPath}`, `--output=${outputFile}`, '--headers=["a"]']);

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /--headers must be a JSON object/);
    });

    test("Headers Nested Value Exits One", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-headers-nested.ts");

      const result = await runCli([`--schema-source=${querySchemaPath}`, `--output=${outputFile}`, '--headers={"a":{"b":1}}']);

      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /must be a string, number, or boolean/);
    });

    test("Positional Arguments Are Rejected", async () => {
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "cli-positional.ts");

      const result = await runCli([querySchemaPath, outputFile]);

      assert.equal(result.exitCode, 1);
    });
  });
}
