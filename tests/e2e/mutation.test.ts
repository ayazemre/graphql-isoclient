import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import {
  circularMutationResolvers,
  circularQueryResolvers,
  circularSchemaPath,
  enumMutationResolvers,
  enumSchemaPath,
  mutationResolvers,
  queryMutationSchemaPath,
  readSchemaSdl,
  runCli,
  startGraphqlServer,
  temporaryDirectoryPath,
  queryResolvers,
  type RunningGraphqlServer,
} from "../utilities.ts";

export function mutationTests() {
  return describe("Mutation", function () {
    let server: RunningGraphqlServer;
    let clientModule: any;

    before(async () => {
      server = await startGraphqlServer(readSchemaSdl(queryMutationSchemaPath), { ...queryResolvers, ...mutationResolvers });
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "mutation-client.ts");
      const result = await runCli([`--schema-source=${server.endpoint}`, `--output=${outputFile}`]);
      assert.equal(result.exitCode, 0, result.stderr);
      clientModule = await import(outputFile);
    });

    after(async () => {
      await server.stop();
    });

    test("Create Todo", async () => {
      const response = await clientModule.mutation(
        { createTodo: { __arguments: { title: "buy bread" }, id: true, title: true } },
        { endpoint: server.endpoint },
      );
      assert.equal(response?.id, "3");
      assert.equal(response?.title, "buy bread");
    });

    test("Update Todo", async () => {
      const response = await clientModule.mutation(
        {
          updateTodo: { __arguments: { completed: true, id: "1", title: "updated" }, completed: true, id: true, title: true },
        },
        { endpoint: server.endpoint },
      );
      assert.equal(response?.title, "updated");
      assert.equal(response?.completed, true);
    });

    test("Delete Todo", async () => {
      const response = await clientModule.mutation(
        { deleteTodo: { __arguments: { id: "1" }, id: true, title: true } },
        { endpoint: server.endpoint },
      );
      assert.equal(response?.id, "1");
    });

    test("Multiple Mutations Returns Object", async () => {
      const response = await clientModule.mutation(
        {
          createTodo: { __arguments: { title: "a" }, id: true, title: true },
          deleteTodo: { __arguments: { id: "2" }, id: true },
        },
        { endpoint: server.endpoint },
      );
      assert.equal(typeof response, "object");
    });

    describe("Input Object", function () {
      let inputServer: RunningGraphqlServer;
      let inputClientModule: any;

      before(async () => {
        inputServer = await startGraphqlServer(readSchemaSdl(circularSchemaPath), { ...circularQueryResolvers, ...circularMutationResolvers });
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "mutation-input-client.ts");
        const result = await runCli([`--schema-source=${inputServer.endpoint}`, `--output=${outputFile}`]);
        assert.equal(result.exitCode, 0, result.stderr);
        inputClientModule = await import(outputFile);
      });

      after(async () => {
        await inputServer.stop();
      });

      test("Scalar Input Field", async () => {
        const response = await inputClientModule.mutation(
          { createTodo: { __arguments: { input: { title: "buy bread" } }, id: true, title: true } },
          { endpoint: inputServer.endpoint },
        );

        assert.deepEqual(response, { id: "11", title: "buy bread" });
      });

      test("Nested Input Object Field", async () => {
        const response = await inputClientModule.mutation(
          { createTodo: { __arguments: { input: { owner: { id: "2" }, title: "walk dog" } }, id: true, owner: { username: true } } },
          { endpoint: inputServer.endpoint },
        );

        assert.deepEqual(response, { id: "11", owner: { username: "bob" } });
      });

      test("Missing Required Input Field Is Rejected", async () => {
        await assert.rejects(() =>
          inputClientModule.mutation(
            { createTodo: { __arguments: { input: { owner: { id: "2" } } }, id: true } },
            { endpoint: inputServer.endpoint },
          ),
        );
      });
    });

    describe("Enum Arguments", function () {
      let enumServer: RunningGraphqlServer;
      let enumClientModule: any;

      before(async () => {
        enumServer = await startGraphqlServer(readSchemaSdl(enumSchemaPath), enumMutationResolvers);
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "mutation-enum-client.ts");
        const result = await runCli([`--schema-source=${enumServer.endpoint}`, `--output=${outputFile}`]);
        assert.equal(result.exitCode, 0, result.stderr);
        enumClientModule = await import(outputFile);
      });

      after(async () => {
        await enumServer.stop();
      });

      test("Enum Mutation Argument", async () => {
        const response = await enumClientModule.mutation(
          { setAccountStatus: { __arguments: { id: "1", status: "INACTIVE" }, id: true, status: true } },
          { endpoint: enumServer.endpoint },
        );

        assert.deepEqual(response, { id: "1", status: "INACTIVE" });
      });
    });
  });
}
