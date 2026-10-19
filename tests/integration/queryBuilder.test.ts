import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, test } from "node:test";

import { runOperation } from "#src/lib/queryBuilder.ts";

import type { OperationRuntimeData } from "#src/lib/queryBuilder.ts";
import type { OperationRequest, SubscriptionTransport } from "#src/lib/transport.ts";
import type { RunningCaptureHttpServer } from "../helpers.ts";

import { createEventIterator, startCaptureHttpServer } from "../helpers.ts";

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

  test("Document From Selection Reaches Endpoint", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { User: { username: "emre" } } }));
    const runtimeData = buildTestRuntimeData(runningCaptureServer.endpoint);

    const operationResult = await runOperation("query", "Query", { User: { __args: { id: "user-1" }, __scalar: true } }, runtimeData);

    assert.deepEqual(operationResult, { User: { username: "emre" } });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.deepEqual(JSON.parse(capturedRequest.bodyText), {
      operationName: "QueryUser",
      query: ["query QueryUser($id: ID!) {", "  User(id: $id) {", "    username", "  }", "}"].join("\n"),
      variables: { id: "user-1" },
    });
  });

  test("Options Endpoint And Headers", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { User: { username: "emre" } } }));
    const runtimeData = buildTestRuntimeData("http://127.0.0.1:1/graphql");

    const operationResult = await runOperation("query", "Query", { User: { __args: { id: "user-1" }, __scalar: true } }, runtimeData, {
      endpoint: runningCaptureServer.endpoint,
      headers: { "x-call-header": "yes" },
    });

    assert.deepEqual(operationResult, { User: { username: "emre" } });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.equal(capturedRequest.headers["x-call-header"], "yes");
  });

  test("Missing Endpoint", async () => {
    const runtimeData = buildTestRuntimeData(undefined);

    await assert.rejects(runOperation("query", "Query", { User: { __args: { id: "user-1" }, __scalar: true } }, runtimeData), {
      message: /no endpoint is configured/,
    });
  });

  test("Subscription Operation", async () => {
    const receivedOperationRequests: OperationRequest[] = [];
    const testTransport: SubscriptionTransport = {
      subscribe: (operationRequest) => {
        receivedOperationRequests.push(operationRequest);
        return createEventIterator([{ notificationAdded: { id: "n-1" } }]);
      },
    };
    const runtimeData = buildTestRuntimeData("http://subscription.invalid/graphql");

    const subscriptionIterator = runOperation("subscription", "Subscription", { notificationAdded: { __scalar: true } }, runtimeData, {
      transport: testTransport,
    });
    const firstEvent = await subscriptionIterator.next();

    assert.deepEqual(firstEvent, { value: { notificationAdded: { id: "n-1" } }, done: false });

    const receivedRequest = receivedOperationRequests[0];
    assert.ok(receivedRequest !== undefined);
    assert.equal(receivedRequest.endpoint, "http://subscription.invalid/graphql");
    assert.equal(receivedRequest.operationName, "SubscriptionNotificationAdded");
    assert.deepEqual(receivedRequest.variables, {});
    assert.equal(
      receivedRequest.document,
      ["subscription SubscriptionNotificationAdded {", "  notificationAdded {", "    id", "    type", "  }", "}"].join("\n"),
    );
  });
});

function buildTestRuntimeData(defaultEndpoint: string | undefined): OperationRuntimeData {
  return {
    fieldMap: {
      "Query.User": { select: "User", arguments: { id: "ID!" } },
      "Subscription.notificationAdded": { select: "Notification" },
    },
    scalarFieldLists: {
      Notification: ["id", "type"],
      User: ["username"],
    },
    defaultEndpoint,
  };
}
