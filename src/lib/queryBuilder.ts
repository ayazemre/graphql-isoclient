import type { OperationSelection, OperationTypeName, SelectionMap } from "./documentBuilder.ts";
import type { RuntimeFieldMap, RuntimeScalarFieldLists } from "./fieldMap.ts";
import type { OperationRequest, RequestOptions, SubscriptionTransport } from "./transport.ts";

import { buildOperationDocument, lowerSelectionMap } from "./documentBuilder.ts";
import { sendOperationRequest, startSubscriptionStream } from "./transport.ts";

export function runOperation(
  operationType: OperationTypeName,
  rootTypeName: string,
  requestMap: SelectionMap,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | undefined,
): Promise<unknown> {
  const operationRequest = buildOperationRequest(operationType, rootTypeName, requestMap, runtimeData, options);

  return sendOperationRequest(operationRequest);
}

export function runSubscriptionOperation(
  rootTypeName: string,
  requestMap: SelectionMap,
  runtimeData: OperationRuntimeData,
  options: SubscriptionRequestOptions,
): AsyncIterableIterator<unknown> {
  const operationRequest = buildOperationRequest("subscription", rootTypeName, requestMap, runtimeData, options);

  return startSubscriptionStream(operationRequest, options.transport);
}

function buildOperationRequest(
  operationType: OperationTypeName,
  rootTypeName: string,
  requestMap: SelectionMap,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | undefined,
): OperationRequest {
  const operationSelection: OperationSelection = lowerSelectionMap(requestMap);
  const builtOperation = buildOperationDocument(operationType, rootTypeName, operationSelection, runtimeData.fieldMap, runtimeData.scalarFieldLists);

  const endpoint = options?.endpoint ?? runtimeData.defaultEndpoint;

  if (endpoint === undefined) {
    throw new Error("no endpoint is configured; pass endpoint in the request options or set endpoint during generation");
  }

  return {
    document: builtOperation.document,
    endpoint,
    headers: { ...runtimeData.defaultHeaders, ...options?.headers },
    operationName: builtOperation.operationName,
    signal: options?.signal,
    variables: builtOperation.variables,
  };
}

export type OperationRuntimeData = {
  fieldMap: RuntimeFieldMap;
  scalarFieldLists: RuntimeScalarFieldLists;
  defaultEndpoint: string | undefined;
  defaultHeaders: Record<string, string>;
};

export type SubscriptionRequestOptions = RequestOptions & {
  transport: SubscriptionTransport;
};
