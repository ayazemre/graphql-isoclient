import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { runSubscriptionOperation, startSubscriptionStream } from "#src/lib/subscriptionRuntime.ts";

import type { OperationRuntimeData } from "#src/lib/queryBuilder.ts";
import type { OperationResponse, SubscriptionTransport } from "#src/lib/subscriptionRuntime.ts";
import type { OperationRequest } from "#src/lib/transport.ts";

import { createEventIterator } from "../helpers.ts";

describe("Subscription Runtime", () => {
  test("Operation Streams Through Transport", async () => {
    const receivedOperationRequests: OperationRequest[] = [];
    const testTransport: SubscriptionTransport = {
      subscribe: (operationRequest) => {
        receivedOperationRequests.push(operationRequest);
        return createEventIterator([{ data: { notificationAdded: { id: "n-1" } } }]);
      },
    };
    const runtimeData = buildTestRuntimeData("http://subscription.invalid/graphql");

    const subscriptionIterator = runSubscriptionOperation("Subscription", { notificationAdded: { __scalar: true } }, runtimeData, {
      transport: testTransport,
    });
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

  test("Run Requires Endpoint", () => {
    const runtimeData = buildTestRuntimeData(undefined);

    assert.throws(
      () => runSubscriptionOperation("Subscription", { notificationAdded: { __scalar: true } }, runtimeData, { transport: createTestTransport() }),
      { message: /no endpoint is configured/ },
    );
  });

  test("Stream Yields Events", async () => {
    const testTransport: SubscriptionTransport = {
      subscribe: () => createEventIterator([{ data: { notificationAdded: { id: "n-1" } } }]),
    };

    const subscriptionIterator = startSubscriptionStream(buildTestOperationRequest(), testTransport);
    const firstEvent = await subscriptionIterator.next();

    assert.deepEqual(firstEvent, { done: false, value: { notificationAdded: { id: "n-1" } } });
  });

  test("Stream Errors Are Thrown", async () => {
    const testTransport: SubscriptionTransport = {
      subscribe: () => createEventIterator([{ data: null, errors: [{ message: "subscription failed" }] }]),
    };

    const subscriptionIterator = startSubscriptionStream(buildTestOperationRequest(), testTransport);

    await assert.rejects(subscriptionIterator.next(), { message: "GraphQL request failed: subscription failed" });
  });

  test("Missing Transport", () => {
    assert.throws(() => startSubscriptionStream(buildTestOperationRequest(), undefined), {
      message: "subscription requires a transport with a subscribe function",
    });
  });

  test("Invalid Transport", () => {
    assert.throws(() => startSubscriptionStream(buildTestOperationRequest(), { subscribe: () => ({}) as never }), {
      message: "subscription transport subscribe must return an async iterable",
    });
  });
});

function buildTestRuntimeData(defaultEndpoint: string | undefined): OperationRuntimeData {
  return {
    defaultEndpoint,
    defaultHeaders: {},
    fieldMap: {
      "Subscription.notificationAdded": { select: "Notification" },
    },
    scalarFieldLists: {
      Notification: ["id", "type"],
    },
  };
}

function buildTestOperationRequest(): OperationRequest {
  return {
    document: "subscription TestSubscription { notificationAdded { id } }",
    endpoint: "http://subscription.invalid/graphql",
    headers: {},
    operationName: "TestSubscription",
    variables: {},
  };
}

function createTestTransport(): SubscriptionTransport {
  return {
    subscribe: () => createEventIterator([]),
  };
}

export type { OperationResponse };
