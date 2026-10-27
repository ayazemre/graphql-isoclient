import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import {
  circularQueryResolvers,
  circularSchemaPath,
  circularSubscriptionResolvers,
  mutationResolvers,
  queryResolvers,
  queryMutationSubscriptionSchemaPath,
  readSchemaSdl,
  runCli,
  startGraphqlServer,
  subscriptionResolvers,
  temporaryDirectoryPath,
  type RunningGraphqlServer,
} from "../utilities.ts";

export function subscriptionTests() {
  return describe("Subscription", function () {
    let server: RunningGraphqlServer;
    let clientModule: any;

    before(async () => {
      server = await startGraphqlServer(readSchemaSdl(queryMutationSubscriptionSchemaPath), {
        ...queryResolvers,
        ...mutationResolvers,
        ...subscriptionResolvers,
      });
      await mkdir(temporaryDirectoryPath, { recursive: true });
      const outputFile = join(temporaryDirectoryPath, "subscription-client.ts");
      const result = await runCli([`--schema-source=${server.endpoint}`, `--output=${outputFile}`]);
      assert.equal(result.exitCode, 0, result.stderr);
      clientModule = await import(outputFile);
    });

    after(async () => {
      await server.stop();
    });

    test("Streams Three Events", async () => {
      const events: unknown[] = [];

      for await (const event of clientModule.subscription(
        { listedTodoChanges: { todo: { id: true, title: true } } },
        { endpoint: server.endpoint },
      )) {
        events.push(event);

        if (events.length === 3) {
          break;
        }
      }

      assert.equal(events.length, 3);
    });

    test("Event Contains Todo Id", async () => {
      const events: any[] = [];

      for await (const event of clientModule.subscription(
        { listedTodoChanges: { todo: { id: true, title: true } } },
        { endpoint: server.endpoint },
      )) {
        events.push(event);

        if (events.length === 1) {
          break;
        }
      }

      assert.equal(events[0]?.todo?.id, "1");
    });

    describe("Stream Termination", function () {
      let rawServer: Server;
      let rawEndpoint: string;
      let rawClientModule: any;

      before(async () => {
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const clientFile = join(temporaryDirectoryPath, "subscription-termination-client.ts");
        const liveServer = await startGraphqlServer(readSchemaSdl(queryMutationSubscriptionSchemaPath), {
          ...queryResolvers,
          ...mutationResolvers,
          ...subscriptionResolvers,
        });
        const result = await runCli([`--schema-source=${liveServer.endpoint}`, `--output=${clientFile}`]);
        await liveServer.stop();
        assert.equal(result.exitCode, 0, result.stderr);
        rawClientModule = await import(clientFile);

        rawServer = createServer((_request, response) => {
          response.statusCode = 200;
          response.setHeader("content-type", "text/event-stream");
          response.write('data: {"data":{"listedTodoChanges":{"todo":{"id":"1"}}}}\n\n');
          response.end('data: {"data":{"listedTodoChanges":{"todo":{"id":"2"}}}}');
        });
        await new Promise<void>((resolve) => rawServer.listen(0, "127.0.0.1", () => resolve()));
        rawEndpoint = `http://127.0.0.1:${(rawServer.address() as { port: number }).port}/graphql`;
      });

      after(async () => {
        await new Promise<void>((resolve) => rawServer.close(() => resolve()));
      });

      test("Final Event Without Trailing Blank Line Is Delivered", async () => {
        const events: any[] = [];

        for await (const event of rawClientModule.subscription({ listedTodoChanges: { todo: { id: true } } }, { endpoint: rawEndpoint })) {
          events.push(event);
        }

        assert.deepEqual(events, [{ todo: { id: "1" } }, { todo: { id: "2" } }]);
      });
    });

    describe("Input Object Filter", function () {
      let filterServer: RunningGraphqlServer;
      let filterClientModule: any;

      before(async () => {
        filterServer = await startGraphqlServer(readSchemaSdl(circularSchemaPath), { ...circularQueryResolvers, ...circularSubscriptionResolvers });
        await mkdir(temporaryDirectoryPath, { recursive: true });
        const outputFile = join(temporaryDirectoryPath, "subscription-filter-client.ts");
        const result = await runCli([`--schema-source=${filterServer.endpoint}`, `--output=${outputFile}`]);
        assert.equal(result.exitCode, 0, result.stderr);
        filterClientModule = await import(outputFile);
      });

      after(async () => {
        await filterServer.stop();
      });

      test("Filter Input Object Streams Matching Event", async () => {
        const events: any[] = [];

        for await (const event of filterClientModule.subscription(
          { todoChanges: { __arguments: { filter: { ownerId: "1" } }, todo: { id: true, owner: { username: true } }, type: true } },
          { endpoint: filterServer.endpoint },
        )) {
          events.push(event);
        }

        assert.deepEqual(events, [{ todo: { id: "10", owner: { username: "alice" } }, type: "created" }]);
      });

      test("Filter Input Object With No Match Streams Nothing", async () => {
        const events: any[] = [];

        for await (const event of filterClientModule.subscription(
          { todoChanges: { __arguments: { filter: { ownerId: "2" } }, type: true } },
          { endpoint: filterServer.endpoint },
        )) {
          events.push(event);
        }

        assert.equal(events.length, 0);
      });
    });
  });
}
