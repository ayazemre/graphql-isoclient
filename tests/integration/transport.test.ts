import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, test } from "node:test";

import { sendOperationRequest, startSubscriptionStream } from "#src/lib/transport.ts";

import type { OperationRequest, OperationResponse, SubscriptionTransport } from "#src/lib/transport.ts";
import type { RunningCaptureHttpServer } from "../helpers.ts";

import { createEventIterator, startCaptureHttpServer } from "../helpers.ts";

let runningCaptureServer: RunningCaptureHttpServer;

describe("Transport", () => {
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

  test("Request Shape", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({ data: { ok: true } }));

    const operationRequest = buildTestOperationRequest({
      document: "query TestOperation { ok }",
      headers: { "x-test-header": "present" },
      operationName: "TestOperation",
      variables: { limit: 2 },
    });

    const operationData = await sendOperationRequest(operationRequest);

    assert.deepEqual(operationData, { ok: true });

    const capturedRequest = runningCaptureServer.receivedRequests[0];
    assert.ok(capturedRequest !== undefined);
    assert.equal(capturedRequest.headers["content-type"], "application/json");
    assert.equal(capturedRequest.headers["x-test-header"], "present");
    assert.deepEqual(JSON.parse(capturedRequest.bodyText), {
      operationName: "TestOperation",
      query: "query TestOperation { ok }",
      variables: { limit: 2 },
    });
  });

  test("Graphql Errors Are Thrown", async () => {
    runningCaptureServer.setResponse(
      200,
      JSON.stringify({
        data: { Tweet: null },
        errors: [
          {
            extensions: { code: "BOOM" },
            locations: [{ column: 3, line: 2 }],
            message: "boom",
            path: ["Tweet"],
          },
        ],
      }),
    );

    const operationError = await captureOperationError(sendOperationRequest(buildTestOperationRequest()));

    assert.equal(operationError.message, "GraphQL request failed: boom");
    assert.deepEqual(operationError.errors, [
      {
        extensions: { code: "BOOM" },
        locations: [{ column: 3, line: 2 }],
        message: "boom",
        path: ["Tweet"],
      },
    ]);
    assert.deepEqual(operationError.data, { Tweet: null });
  });

  test("Http Error Status", async () => {
    runningCaptureServer.setResponse(500, JSON.stringify({ message: "internal" }));

    await assert.rejects(sendOperationRequest(buildTestOperationRequest()), {
      message: `GraphQL request failed with status 500 for ${runningCaptureServer.endpoint}`,
    });
  });

  test("Http Error With Graphql Errors", async () => {
    runningCaptureServer.setResponse(400, JSON.stringify({ errors: [{ message: "bad query" }] }));

    const operationError = await captureOperationError(sendOperationRequest(buildTestOperationRequest()));

    assert.equal(operationError.message, `GraphQL request failed with status 400 for ${runningCaptureServer.endpoint}: bad query`);
    assert.deepEqual(operationError.errors, [{ message: "bad query" }]);
  });

  test("Http Error Without Graphql Errors", async () => {
    runningCaptureServer.setResponse(401, JSON.stringify({ message: "unauthorized" }));

    await assert.rejects(sendOperationRequest(buildTestOperationRequest()), {
      message: `GraphQL request failed with status 401 for ${runningCaptureServer.endpoint}`,
    });
  });

  test("Missing Data", async () => {
    runningCaptureServer.setResponse(200, JSON.stringify({}));

    await assert.rejects(sendOperationRequest(buildTestOperationRequest()), {
      message: `GraphQL response did not contain data for ${runningCaptureServer.endpoint}`,
    });
  });

  test("Malformed Json", async () => {
    runningCaptureServer.setResponse(200, "not json");

    await assert.rejects(sendOperationRequest(buildTestOperationRequest()), { message: /not valid JSON/ });
  });

  test("Unreachable Endpoint", async () => {
    const operationRequest = buildTestOperationRequest({ endpoint: "http://127.0.0.1:1/graphql" });

    await assert.rejects(sendOperationRequest(operationRequest), { message: /failed to reach/ });
  });

  test("Abort Signal", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const operationRequest = buildTestOperationRequest({ signal: abortController.signal });

    await assert.rejects(sendOperationRequest(operationRequest), { name: "AbortError" });
  });

  test("Subscription Stream", async () => {
    const receivedOperationRequests: OperationRequest[] = [];
    const testTransport: SubscriptionTransport = {
      subscribe: (operationRequest) => {
        receivedOperationRequests.push(operationRequest);
        return createEventIterator([{ data: { notificationAdded: { id: "n-1" } } }]);
      },
    };
    const operationRequest = buildTestOperationRequest();

    const subscriptionIterator = startSubscriptionStream(operationRequest, testTransport);
    const firstEvent = await subscriptionIterator.next();

    assert.deepEqual(firstEvent, { done: false, value: { notificationAdded: { id: "n-1" } } });
  });

  test("Subscription Errors Are Thrown", async () => {
    const testTransport: SubscriptionTransport = {
      subscribe: () => createEventIterator([{ data: null, errors: [{ message: "subscription failed" }] }]),
    };

    const subscriptionIterator = startSubscriptionStream(buildTestOperationRequest(), testTransport);

    await assert.rejects(subscriptionIterator.next(), { message: "GraphQL request failed: subscription failed" });
  });

  test("Missing Subscription Transport", () => {
    assert.throws(() => startSubscriptionStream(buildTestOperationRequest(), undefined), {
      message: "subscription requires a transport with a subscribe function",
    });
  });

  test("Invalid Subscription Transport", () => {
    assert.throws(() => startSubscriptionStream(buildTestOperationRequest(), { subscribe: () => ({}) as never }), {
      message: "subscription transport subscribe must return an async iterable",
    });
  });
});

async function captureOperationError(operation: Promise<unknown>): Promise<Error & { errors: unknown; data: unknown }> {
  try {
    await operation;
  } catch (operationError) {
    return operationError as Error & { errors: unknown; data: unknown };
  }

  throw new Error("the operation was expected to throw");
}

function buildTestOperationRequest(overrides: Partial<OperationRequest> = {}): OperationRequest {
  return {
    document: "query TestOperation { ok }",
    endpoint: runningCaptureServer.endpoint,
    headers: {},
    operationName: "TestOperation",
    variables: {},
    ...overrides,
  };
}

export type { OperationResponse };
