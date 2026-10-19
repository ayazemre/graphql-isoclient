import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, test } from "node:test";

import { sendOperationRequest, startSubscriptionStream } from "#src/lib/transport.ts";

import type { OperationRequest, SubscriptionTransport } from "#src/lib/transport.ts";
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

    const operationResult = await sendOperationRequest(operationRequest);

    assert.deepEqual(operationResult, { data: { ok: true }, errors: [] });

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

  test("Graphql Errors Are Returned", async () => {
    runningCaptureServer.setResponse(
      200,
      JSON.stringify({
        data: { Tweet: null },
        errors: [{ extensions: { code: "BOOM" }, message: "boom", path: ["Tweet"] }],
      }),
    );

    const operationResult = await sendOperationRequest(buildTestOperationRequest());

    assert.deepEqual(operationResult, {
      data: { Tweet: null },
      errors: [{ extensions: { code: "BOOM" }, message: "boom", path: ["Tweet"] }],
    });
  });

  test("Http Error Status", async () => {
    runningCaptureServer.setResponse(500, JSON.stringify({ message: "internal" }));

    await assert.rejects(sendOperationRequest(buildTestOperationRequest()), {
      message: `GraphQL request failed with status 500 for ${runningCaptureServer.endpoint}`,
    });
  });

  test("Http Error With Graphql Errors", async () => {
    runningCaptureServer.setResponse(400, JSON.stringify({ errors: [{ message: "bad query" }] }));

    await assert.rejects(sendOperationRequest(buildTestOperationRequest()), {
      message: `GraphQL request failed with status 400 for ${runningCaptureServer.endpoint}`,
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
        return createEventIterator([{ tick: 1 }, { tick: 2 }]);
      },
    };
    const operationRequest = buildTestOperationRequest();

    const subscriptionIterator = startSubscriptionStream(operationRequest, testTransport);
    const firstEvent = await subscriptionIterator.next();

    assert.deepEqual(firstEvent, { done: false, value: { tick: 1 } });
    assert.deepEqual(receivedOperationRequests, [operationRequest]);
  });

  test("Missing Subscription Transport", () => {
    assert.throws(() => startSubscriptionStream(buildTestOperationRequest(), undefined), {
      message: "subscription requires a transport with a subscribe function",
    });
  });

  test("Invalid Subscription Transport", () => {
    const invalidTransport = { subscribe: () => ({}) } as unknown as SubscriptionTransport;

    assert.throws(() => startSubscriptionStream(buildTestOperationRequest(), invalidTransport), {
      message: "subscription transport subscribe must return an async iterable",
    });
  });
});

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
