import type { ArgumentValues, BuiltOperation, OperationTypeName, SelectionMap } from "./documentBuilder.ts";
import type { RuntimeFieldMap, RuntimeScalarFieldLists } from "./fieldMap.ts";
import type { OperationRequest, RequestOptions, SubscriptionTransport } from "./transport.ts";

import { buildOperationDocument, lowerSelectionMap } from "./documentBuilder.ts";
import { sendOperationRequest, startSubscriptionStream } from "./transport.ts";

export function runOperation(
  operationType: "subscription",
  rootTypeName: string,
  selection: SelectionMap,
  runtimeData: OperationRuntimeData,
  options: SubscriptionRequestOptions,
): AsyncIterableIterator<unknown>;
export function runOperation(
  operationType: "query" | "mutation",
  rootTypeName: string,
  selection: SelectionMap,
  runtimeData: OperationRuntimeData,
  options?: RequestOptions,
): Promise<unknown>;
export function runOperation(
  operationType: OperationTypeName,
  rootTypeName: string,
  selection: SelectionMap,
  runtimeData: OperationRuntimeData,
  options?: RequestOptions | SubscriptionRequestOptions,
): Promise<unknown> | AsyncIterableIterator<unknown> {
  if (operationType === "subscription") {
    const operationRequest = buildRequestForSelection(operationType, rootTypeName, selection, runtimeData, options);
    const subscriptionTransport = (options as SubscriptionRequestOptions | undefined)?.transport;

    return startSubscriptionStream(operationRequest, subscriptionTransport);
  }

  return runPromiseOperation(operationType, rootTypeName, selection, runtimeData, options);
}

async function runPromiseOperation(
  operationType: "query" | "mutation",
  rootTypeName: string,
  selection: SelectionMap,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | undefined,
): Promise<unknown> {
  const operationRequest = buildRequestForSelection(operationType, rootTypeName, selection, runtimeData, options);

  return sendOperationRequest(operationRequest);
}

function buildRequestForSelection(
  operationType: OperationTypeName,
  rootTypeName: string,
  selection: SelectionMap,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | SubscriptionRequestOptions | undefined,
): OperationRequest {
  const operationSelection = lowerSelectionMap(selection);
  const builtOperation = buildOperationDocument(operationType, rootTypeName, operationSelection, runtimeData.fieldMap, runtimeData.scalarFieldLists);

  return buildOperationRequest(builtOperation, runtimeData, options);
}

export function createOperationBuilderCore(
  operationType: "subscription",
  rootTypeName: string,
  runtimeData: OperationRuntimeData,
): SubscriptionOperationBuilderCore;
export function createOperationBuilderCore(
  operationType: "query" | "mutation",
  rootTypeName: string,
  runtimeData: OperationRuntimeData,
): QueryOperationBuilderCore;
export function createOperationBuilderCore(
  operationType: OperationTypeName,
  rootTypeName: string,
  runtimeData: OperationRuntimeData,
): QueryOperationBuilderCore | SubscriptionOperationBuilderCore {
  throw new Error(`createOperationBuilderCore is not implemented for ${operationType}`);
}

function buildOperationRequest(
  builtOperation: BuiltOperation,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | SubscriptionRequestOptions | undefined,
): OperationRequest {
  const endpoint = options?.endpoint ?? runtimeData.defaultEndpoint;

  if (endpoint === undefined) {
    throw new Error("no endpoint is configured; pass endpoint in the request options or set endpoint during generation");
  }

  return {
    endpoint,
    headers: { ...options?.headers },
    document: builtOperation.document,
    variables: builtOperation.variables,
    operationName: builtOperation.operationName,
    signal: options?.signal,
  };
}

export type OperationRuntimeData = {
  fieldMap: RuntimeFieldMap;
  scalarFieldLists: RuntimeScalarFieldLists;
  defaultEndpoint: string | undefined;
};

export type SubscriptionRequestOptions = RequestOptions & {
  transport: SubscriptionTransport;
};

export type QueryOperationBuilderCore = {
  appendField(fieldName: string, fieldArguments: ArgumentValues | undefined, selectionMap: SelectionMap | undefined): QueryOperationBuilderCore;
  as(alias: string): QueryOperationBuilderCore;
  run(options?: RequestOptions): Promise<unknown>;
};

export type SubscriptionOperationBuilderCore = {
  appendField(
    fieldName: string,
    fieldArguments: ArgumentValues | undefined,
    selectionMap: SelectionMap | undefined,
  ): SubscriptionOperationBuilderCore;
  as(alias: string): SubscriptionOperationBuilderCore;
  run(options: SubscriptionRequestOptions): AsyncIterableIterator<unknown>;
};
