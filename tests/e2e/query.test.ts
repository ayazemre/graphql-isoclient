import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import {
  circularQueryResolvers,
  circularSchemaPath,
  enumQueryResolvers,
  enumSchemaPath,
  queryResolvers,
  readSchemaSdl,
  runCli,
  startGraphqlServer,
  temporaryDirectoryPath,
  queryMutationSubscriptionSchemaPath,
  type RunningGraphqlServer,
} from "../utilities.ts";

export function queryTests() {
  return describe("Query", function () {
    let server: RunningGraphqlServer;
    let clientModule: any;

    before(async () => {
      server = await startGraphqlServer(readSchemaSdl(queryMutationSubscriptionSchemaPath), queryResolvers);
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "query-client.ts");
      const result = await runCli([`--schema-source=${server.endpoint}`, `--output=${outputFile}`]);
      assert.equal(result.exitCode, 0, result.stderr);
      clientModule = await import(outputFile);
    });

    after(async () => {
      await server.stop();
    });

    test("Users Returns All", async () => {
      const response = await clientModule.query({ users: { email: true, id: true, username: true } });
      assert.equal(response?.[0]?.username, "alice");
    });

    test("User By Id Returns One", async () => {
      const response = await clientModule.query({ user: { __arguments: { id: "2" }, email: true, id: true, username: true } });
      assert.equal(response?.username, "bob");
    });

    test("Todos With Limit", async () => {
      const response = await clientModule.query({ todos: { __arguments: { limit: 1 }, id: true, title: true } });
      assert.equal(response?.length, 1);
    });

    test("Todo By Id Returns One", async () => {
      const response = await clientModule.query({ todo: { __arguments: { id: "1" }, id: true, owner: { username: true }, title: true } });
      assert.equal(response?.title, "Buy milk");
      assert.equal(response?.owner?.username, "alice");
    });

    test("Missing User Returns Null", async () => {
      const response = await clientModule.query({ user: { __arguments: { id: "999" }, id: true } });
      assert.equal(response, null);
    });

    describe("Circular Types", function () {
      let circularServer: RunningGraphqlServer;
      let circularClientModule: any;

      before(async () => {
        circularServer = await startGraphqlServer(readSchemaSdl(circularSchemaPath), circularQueryResolvers);
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "query-circular-client.ts");
        const result = await runCli([`--schema-source=${circularServer.endpoint}`, `--output=${outputFile}`]);
        assert.equal(result.exitCode, 0, result.stderr);
        circularClientModule = await import(outputFile);
      });

      after(async () => {
        await circularServer.stop();
      });

      test("Mutual Friends One Level", async () => {
        const response = await circularClientModule.query(
          { users: { friends: { id: true, username: true }, id: true } },
          { endpoint: circularServer.endpoint },
        );

        assert.deepEqual(response, [
          { friends: [{ id: "2", username: "bob" }], id: "1" },
          { friends: [{ id: "1", username: "alice" }], id: "2" },
        ]);
      });

      test("Mutual Friends Three Levels", async () => {
        const response = await circularClientModule.query(
          { users: { friends: { friends: { username: true } }, id: true } },
          { endpoint: circularServer.endpoint },
        );

        assert.deepEqual(response, [
          { friends: [{ friends: [{ username: "alice" }] }], id: "1" },
          { friends: [{ friends: [{ username: "bob" }] }], id: "2" },
        ]);
      });

      test("Todo Owner Friends Cycle", async () => {
        const response = await circularClientModule.query(
          { todos: { id: true, owner: { friends: { username: true } } } },
          { endpoint: circularServer.endpoint },
        );

        assert.deepEqual(response, [{ id: "10", owner: { friends: [{ username: "bob" }] } }]);
      });

      test("Unknown Field In Cycle Is Rejected", async () => {
        await assert.rejects(() => circularClientModule.query({ users: { friends: { missingField: true } } }, { endpoint: circularServer.endpoint }));
      });
    });

    describe("HTTP Errors", function () {
      let rawServer: Server;
      let rawEndpoint: string;
      let rawClientModule: any;

      before(async () => {
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const clientFile = join(temporaryDirectoryPath, "query-http-client.ts");
        const liveServer = await startGraphqlServer(readSchemaSdl(queryMutationSubscriptionSchemaPath), queryResolvers);
        const result = await runCli([`--schema-source=${liveServer.endpoint}`, `--output=${clientFile}`]);
        await liveServer.stop();
        assert.equal(result.exitCode, 0, result.stderr);
        rawClientModule = await import(clientFile);

        rawServer = createServer((_request, response) => {
          response.statusCode = 502;
          response.setHeader("content-type", "text/html");
          response.end("<html>Bad Gateway</html>");
        });
        await new Promise<void>((resolve) => rawServer.listen(0, "127.0.0.1", () => resolve()));
        rawEndpoint = `http://127.0.0.1:${(rawServer.address() as { port: number }).port}/graphql`;
      });

      after(async () => {
        await new Promise<void>((resolve) => rawServer.close(() => resolve()));
      });

      test("Gateway Error Reports Status", async () => {
        await assert.rejects(
          () => rawClientModule.query({ users: { id: true } }, { endpoint: rawEndpoint }),
          /Query request failed with HTTP status 502/,
        );
      });
    });

    describe("Enum Arguments", function () {
      let enumServer: RunningGraphqlServer;
      let enumClientModule: any;

      before(async () => {
        enumServer = await startGraphqlServer(readSchemaSdl(enumSchemaPath), enumQueryResolvers);
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "query-enum-client.ts");
        const result = await runCli([`--schema-source=${enumServer.endpoint}`, `--output=${outputFile}`]);
        assert.equal(result.exitCode, 0, result.stderr);
        enumClientModule = await import(outputFile);
      });

      after(async () => {
        await enumServer.stop();
      });

      test("Top Level Enum Argument", async () => {
        const response = await enumClientModule.query(
          { accounts: { __arguments: { status: "ACTIVE" }, id: true, name: true } },
          { endpoint: enumServer.endpoint },
        );

        assert.deepEqual(response, [{ id: "1", name: "Acme" }]);
      });

      test("Enum Inside Input Object", async () => {
        const response = await enumClientModule.query(
          { accounts: { __arguments: { filter: { status: "INACTIVE" } }, id: true } },
          { endpoint: enumServer.endpoint },
        );

        assert.deepEqual(response, [{ id: "2" }]);
      });

      test("Invalid Enum Value Is Rejected", async () => {
        await assert.rejects(() =>
          enumClientModule.query({ accounts: { __arguments: { status: "DELETED" }, id: true } }, { endpoint: enumServer.endpoint }),
        );
      });
    });
  });
}
