import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, test } from "node:test";

import { runOperation } from "#src/lib/queryBuilder.ts";

import type { OperationRuntimeData } from "#src/lib/queryBuilder.ts";
import type { RunningCaptureHttpServer } from "../helpers.ts";

import { startCaptureHttpServer } from "../helpers.ts";

let runningCaptureServer: RunningCaptureHttpServer;

describe("Operation Runner", () => {
  before(async () => {
    runningCaptureServer = await startCaptureHttpServer();
  });

  beforeEach(() => {
    runningCaptureServer.receivedRequests.length = 0;
    runningCaptureServer.setResponse(200, JSON.stringify({ data: {} }));
  });

  after(async () => {
    await runningCaptureServer.stop();
  });

  test("Map And Options", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { Tweets: [], User: { username: "emre" } } }));

    const operationData = await runOperation(
      "query",
      "Query",
      {
        Tweets: { __arguments: { limit: 2 }, body: true },
        User: { __arguments: { id: "user-1" }, username: true },
      },
      buildTestRuntimeData(runningCaptureServer.endpoint),
      { headers: { "x-builder-header": "yes" } },
    );

    assert.deepEqual(operationData, { Tweets: [], User: { username: "emre" } });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.equal(capturedRequest.headers["x-builder-header"], "yes");
    assert.deepEqual(JSON.parse(capturedRequest.bodyText), {
      operationName: "QueryTweetsUser",
      query: [
        "query QueryTweetsUser($limit: Int, $id: ID!) {",
        "  Tweets(limit: $limit) {",
        "    body",
        "  }",
        "  User(id: $id) {",
        "    username",
        "  }",
        "}",
      ].join("\n"),
      variables: { id: "user-1", limit: 2 },
    });
  });

  test("Nested Field Arguments", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { Tweet: { Author: { username: "emre" } } } }));

    const operationData = await runOperation(
      "query",
      "Query",
      {
        Tweet: {
          Author: { __arguments: { id: "user-1" }, username: true },
          __arguments: { id: "tweet-1" },
        },
      },
      buildTestRuntimeData(runningCaptureServer.endpoint),
      undefined,
    );

    assert.deepEqual(operationData, { Tweet: { Author: { username: "emre" } } });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.deepEqual(JSON.parse(capturedRequest.bodyText), {
      operationName: "QueryTweet",
      query: [
        "query QueryTweet($id: ID!, $id_2: ID!) {",
        "  Tweet(id: $id) {",
        "    Author(id: $id_2) {",
        "      username",
        "    }",
        "  }",
        "}",
      ].join("\n"),
      variables: { id: "tweet-1", id_2: "user-1" },
    });
  });

  test("Arguments Marker Rejects A Non Object", () => {
    assert.throws(
      () =>
        runOperation(
          "query",
          "Query",
          { Tweet: { __arguments: "not-an-object" as never, body: true } },
          buildTestRuntimeData(runningCaptureServer.endpoint),
          undefined,
        ),
      { message: "field arguments must be an object" },
    );
  });

  test("Endpoint From Request Options", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { User: { username: "emre" } } }));
    const runtimeData = buildTestRuntimeData("http://127.0.0.1:1/graphql");

    const operationData = await runOperation("query", "Query", { User: { __arguments: { id: "user-1" }, username: true } }, runtimeData, {
      endpoint: runningCaptureServer.endpoint,
    });

    assert.deepEqual(operationData, { User: { username: "emre" } });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.ok(capturedRequest.bodyText.includes("query QueryUser("));
  });

  test("Missing Endpoint", () => {
    const runtimeData = buildTestRuntimeData(undefined);

    assert.throws(() => runOperation("query", "Query", { User: { __arguments: { id: "user-1" }, username: true } }, runtimeData, undefined), {
      message: /no endpoint is configured/,
    });
  });

  test("Empty Selection", () => {
    const runtimeData = buildTestRuntimeData(runningCaptureServer.endpoint);

    assert.throws(() => runOperation("query", "Query", {}, runtimeData, undefined), { message: "selection for Query is empty" });
  });
});

function buildTestRuntimeData(defaultEndpoint: string | undefined): OperationRuntimeData {
  return {
    defaultEndpoint,
    defaultHeaders: {},
    fieldMap: {
      "Query.Tweet": { arguments: { id: "ID!" }, select: "Tweet" },
      "Query.Tweets": { arguments: { limit: "Int" }, select: "Tweet" },
      "Query.User": { arguments: { id: "ID!" }, select: "User" },
      "Tweet.Author": { arguments: { id: "ID!" }, select: "User" },
    },
    scalarFieldLists: {
      Tweet: ["body"],
      User: ["username"],
    },
  };
}
