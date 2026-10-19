import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, test } from "node:test";

import { createOperationBuilderCore } from "#src/lib/queryBuilder.ts";

import type { OperationRuntimeData } from "#src/lib/queryBuilder.ts";
import type { OperationRequest, SubscriptionTransport } from "#src/lib/transport.ts";
import type { RunningCaptureHttpServer } from "../helpers.ts";

import { createEventIterator, startCaptureHttpServer } from "../helpers.ts";

let runningCaptureServer: RunningCaptureHttpServer;

describe("Query Builder", () => {
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

  test("Chained Fields And Options", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { Tweets: [], User: { username: "emre" } } }));

    const queryBuilder = createOperationBuilderCore("query", "Query", buildTestRuntimeData(runningCaptureServer.endpoint))
      .appendField("User", { id: "user-1" }, { username: true })
      .appendField("Tweets", { limit: 2 }, { body: true });

    const operationResult = await queryBuilder.run({ headers: { "x-builder-header": "yes" } });

    assert.deepEqual(operationResult, { Tweets: [], User: { username: "emre" } });

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

  test("Endpoint From Request Options", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { User: { username: "emre" } } }));
    const runtimeData = buildTestRuntimeData("http://127.0.0.1:1/graphql");

    const queryBuilder = createOperationBuilderCore("query", "Query", runtimeData).appendField(
      "User",
      { id: "user-1" },
      {
        username: true,
      },
    );

    const operationResult = await queryBuilder.run({ endpoint: runningCaptureServer.endpoint });

    assert.deepEqual(operationResult, { User: { username: "emre" } });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.ok(capturedRequest.bodyText.includes("query QueryUser("));
  });

  test("Missing Endpoint", async () => {
    const runtimeData = buildTestRuntimeData(undefined);
    const queryBuilder = createOperationBuilderCore("query", "Query", runtimeData).appendField(
      "User",
      { id: "user-1" },
      {
        username: true,
      },
    );

    await assert.rejects(queryBuilder.run(), { message: /no endpoint is configured/ });
  });

  test("Alias On Chained Field", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { viewer: null } }));

    const queryBuilder = createOperationBuilderCore("query", "Query", buildTestRuntimeData(runningCaptureServer.endpoint))
      .appendField("User", { id: "user-1" }, { username: true })
      .as("viewer");

    const operationResult = await queryBuilder.run();

    assert.deepEqual(operationResult, { viewer: null });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.deepEqual(JSON.parse(capturedRequest.bodyText), {
      operationName: "QueryViewer",
      query: ["query QueryViewer($id: ID!) {", "  viewer: User(id: $id) {", "    username", "  }", "}"].join("\n"),
      variables: { id: "user-1" },
    });
  });

  test("Alias Requires Appended Field", () => {
    const queryBuilder = createOperationBuilderCore("query", "Query", buildTestRuntimeData(runningCaptureServer.endpoint));

    assert.throws(() => queryBuilder.as("viewer"), { message: "as requires an appended field" });
  });

  test("Alias Rejected When Already Set", () => {
    const queryBuilder = createOperationBuilderCore("query", "Query", buildTestRuntimeData(runningCaptureServer.endpoint))
      .appendField("User", { id: "user-1" }, { username: true })
      .as("viewer");

    assert.throws(() => queryBuilder.as("author"), { message: "field User already has an alias" });
  });

  test("Runs Are Isolated Between Builders", async () => {
    const runtimeData = buildTestRuntimeData(runningCaptureServer.endpoint);
    const baseQueryBuilder = createOperationBuilderCore("query", "Query", runtimeData).appendField(
      "User",
      { id: "user-1" },
      {
        username: true,
      },
    );
    const aliasedQueryBuilder = baseQueryBuilder.as("viewer");

    await baseQueryBuilder.run();
    await aliasedQueryBuilder.run();

    const capturedRequests = runningCaptureServer.receivedRequests;
    assert.equal(capturedRequests.length, 2);

    const firstCapturedRequest = capturedRequests[0];
    const secondCapturedRequest = capturedRequests[1];
    assert.ok(firstCapturedRequest !== undefined);
    assert.ok(secondCapturedRequest !== undefined);

    assert.ok(firstCapturedRequest.bodyText.includes("query QueryUser("));
    assert.ok(firstCapturedRequest.bodyText.includes("viewer") === false);
    assert.ok(secondCapturedRequest.bodyText.includes("query QueryViewer("));
  });

  test("Run Rejects Missing Selection", async () => {
    const runtimeData = buildTestRuntimeData(runningCaptureServer.endpoint);
    const queryBuilder = createOperationBuilderCore("query", "Query", runtimeData).appendField("User", { id: "user-1" }, undefined);

    await assert.rejects(queryBuilder.run(), { message: "field User on type Query requires a selection" });
  });

  test("Run Rejects Empty Selection", async () => {
    const runtimeData = buildTestRuntimeData(runningCaptureServer.endpoint);
    const queryBuilder = createOperationBuilderCore("query", "Query", runtimeData);

    await assert.rejects(queryBuilder.run(), { message: "selection for Query is empty" });
  });

  test("Subscription Builder Streams Through Transport", async () => {
    const receivedOperationRequests: OperationRequest[] = [];
    const testTransport: SubscriptionTransport = {
      subscribe: (operationRequest) => {
        receivedOperationRequests.push(operationRequest);
        return createEventIterator([{ notificationAdded: { id: "n-1" } }]);
      },
    };
    const runtimeData = buildTestRuntimeData("http://subscription.invalid/graphql");
    const subscriptionBuilder = createOperationBuilderCore("subscription", "Subscription", runtimeData).appendField("notificationAdded", undefined, {
      __scalar: true,
    });

    const subscriptionIterator = subscriptionBuilder.run({ transport: testTransport });
    const firstEvent = await subscriptionIterator.next();

    assert.deepEqual(firstEvent, { done: false, value: { notificationAdded: { id: "n-1" } } });

    const receivedRequest = receivedOperationRequests[0];
    assert.ok(receivedRequest !== undefined);
    assert.equal(receivedRequest.endpoint, "http://subscription.invalid/graphql");
    assert.equal(receivedRequest.operationName, "SubscriptionNotificationAdded");
    assert.equal(
      receivedRequest.document,
      ["subscription SubscriptionNotificationAdded {", "  notificationAdded {", "    id", "    type", "  }", "}"].join("\n"),
    );
  });

  test("Subscription Run Requires Endpoint", () => {
    const runtimeData = buildTestRuntimeData(undefined);
    const subscriptionBuilder = createOperationBuilderCore("subscription", "Subscription", runtimeData).appendField("notificationAdded", undefined, {
      __scalar: true,
    });

    assert.throws(() => subscriptionBuilder.run({ transport: createTestTransport() }), {
      message: /no endpoint is configured/,
    });
  });
});

function buildTestRuntimeData(defaultEndpoint: string | undefined): OperationRuntimeData {
  return {
    defaultEndpoint,
    fieldMap: {
      "Query.Tweets": { arguments: { limit: "Int" }, select: "Tweet" },
      "Query.User": { arguments: { id: "ID!" }, select: "User" },
      "Subscription.notificationAdded": { select: "Notification" },
    },
    scalarFieldLists: {
      Notification: ["id", "type"],
      Tweet: ["body"],
      User: ["username"],
    },
  };
}

function createTestTransport(): SubscriptionTransport {
  return {
    subscribe: () => createEventIterator([]),
  };
}
