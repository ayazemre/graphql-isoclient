import type { SelectionMap } from "./documentBuilder.ts";
import type { OperationRuntimeData } from "./queryBuilder.ts";
import type { OperationGraphqlError, OperationRequest, RequestOptions } from "./transport.ts";

import { buildOperationRequest } from "./queryBuilder.ts";
import { createOperationError } from "./transport.ts";

export type OperationResponse = {
  data?: unknown;
  errors?: ReadonlyArray<OperationGraphqlError>;
};

export type SubscriptionTransport = {
  subscribe(operationRequest: OperationRequest): AsyncIterableIterator<OperationResponse>;
};

export type SubscriptionRequestOptions = RequestOptions & {
  transport: SubscriptionTransport;
};

export function runSubscriptionOperation(
  rootTypeName: string,
  requestMap: SelectionMap,
  runtimeData: OperationRuntimeData,
  options: SubscriptionRequestOptions,
): AsyncIterableIterator<unknown> {
  const operationRequest = buildOperationRequest("subscription", rootTypeName, requestMap, runtimeData, options);

  return startSubscriptionStream(operationRequest, options.transport);
}

export function startSubscriptionStream(
  operationRequest: OperationRequest,
  subscriptionTransport: SubscriptionTransport | undefined,
): AsyncIterableIterator<unknown> {
  if (!subscriptionTransport || typeof subscriptionTransport.subscribe !== "function") {
    throw new Error("subscription requires a transport with a subscribe function");
  }

  const subscriptionIterator = subscriptionTransport.subscribe(operationRequest);

  if (!subscriptionIterator || typeof subscriptionIterator.next !== "function") {
    throw new Error("subscription transport subscribe must return an async iterable");
  }

  return readSubscriptionEvents(subscriptionIterator);
}

async function* readSubscriptionEvents(subscriptionIterator: AsyncIterableIterator<OperationResponse>): AsyncIterableIterator<unknown> {
  for await (const subscriptionResponse of subscriptionIterator) {
    yield readOperationData(subscriptionResponse);
  }
}

function readOperationData(operationResponse: OperationResponse): unknown {
  const operationErrors = operationResponse.errors ?? [];

  if (operationErrors.length > 0) {
    throw createOperationError(operationErrors, operationResponse.data, "the subscription endpoint", 200);
  }

  if (operationResponse.data === undefined) {
    throw new Error("the subscription response did not contain data");
  }

  return operationResponse.data;
}
