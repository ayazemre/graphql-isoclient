import type {
  ArgumentValues,
  BuiltOperation,
  OperationSelection,
  OperationSelectionEntry,
  OperationTypeName,
  SelectionMap,
} from "./documentBuilder.ts";
import type { RuntimeFieldMap, RuntimeScalarFieldLists } from "./fieldMap.ts";
import type { OperationRequest, RequestOptions, SubscriptionTransport } from "./transport.ts";

import { buildOperationDocument, lowerSelectionMap } from "./documentBuilder.ts";
import { sendOperationRequest, startSubscriptionStream } from "./transport.ts";

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
  if (operationType === "subscription") {
    return createSubscriptionOperationBuilder(rootTypeName, runtimeData, []);
  }

  return createQueryOperationBuilder(operationType, rootTypeName, runtimeData, []);
}

function createQueryOperationBuilder(
  operationType: "query" | "mutation",
  rootTypeName: string,
  runtimeData: OperationRuntimeData,
  appendedFields: ReadonlyArray<AppendedOperationField>,
): QueryOperationBuilderCore {
  return {
    appendField(fieldName, fieldArguments, selectionMap) {
      const nextAppendedFields = appendOperationField(appendedFields, fieldName, fieldArguments, selectionMap);

      return createQueryOperationBuilder(operationType, rootTypeName, runtimeData, nextAppendedFields);
    },
    as(alias) {
      const nextAppendedFields = aliasLastOperationField(appendedFields, alias);

      return createQueryOperationBuilder(operationType, rootTypeName, runtimeData, nextAppendedFields);
    },
    run(options) {
      return runAppendedFieldsPromiseOperation(operationType, rootTypeName, appendedFields, runtimeData, options);
    },
  };
}

function createSubscriptionOperationBuilder(
  rootTypeName: string,
  runtimeData: OperationRuntimeData,
  appendedFields: ReadonlyArray<AppendedOperationField>,
): SubscriptionOperationBuilderCore {
  return {
    appendField(fieldName, fieldArguments, selectionMap) {
      const nextAppendedFields = appendOperationField(appendedFields, fieldName, fieldArguments, selectionMap);

      return createSubscriptionOperationBuilder(rootTypeName, runtimeData, nextAppendedFields);
    },
    as(alias) {
      const nextAppendedFields = aliasLastOperationField(appendedFields, alias);

      return createSubscriptionOperationBuilder(rootTypeName, runtimeData, nextAppendedFields);
    },
    run(options) {
      return runAppendedFieldsSubscriptionOperation(rootTypeName, appendedFields, runtimeData, options);
    },
  };
}

async function runLoweredSelectionPromiseOperation(
  operationType: "query" | "mutation",
  rootTypeName: string,
  operationSelection: OperationSelection,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | undefined,
): Promise<unknown> {
  const operationRequest = buildRequestFromLoweredSelection(operationType, rootTypeName, operationSelection, runtimeData, options);

  return sendOperationRequest(operationRequest);
}

async function runAppendedFieldsPromiseOperation(
  operationType: "query" | "mutation",
  rootTypeName: string,
  appendedFields: ReadonlyArray<AppendedOperationField>,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | undefined,
): Promise<unknown> {
  const operationSelection = buildOperationSelectionFromAppendedFields(appendedFields);

  return runLoweredSelectionPromiseOperation(operationType, rootTypeName, operationSelection, runtimeData, options);
}

function startLoweredSubscriptionOperation(
  rootTypeName: string,
  operationSelection: OperationSelection,
  runtimeData: OperationRuntimeData,
  options: SubscriptionRequestOptions | undefined,
): AsyncIterableIterator<unknown> {
  const operationRequest = buildRequestFromLoweredSelection("subscription", rootTypeName, operationSelection, runtimeData, options);

  return startSubscriptionStream(operationRequest, options?.transport);
}

function runAppendedFieldsSubscriptionOperation(
  rootTypeName: string,
  appendedFields: ReadonlyArray<AppendedOperationField>,
  runtimeData: OperationRuntimeData,
  options: SubscriptionRequestOptions,
): AsyncIterableIterator<unknown> {
  const operationSelection = buildOperationSelectionFromAppendedFields(appendedFields);

  return startLoweredSubscriptionOperation(rootTypeName, operationSelection, runtimeData, options);
}

function appendOperationField(
  appendedFields: ReadonlyArray<AppendedOperationField>,
  fieldName: string,
  fieldArguments: ArgumentValues | undefined,
  selectionMap: SelectionMap | undefined,
): AppendedOperationField[] {
  return [...appendedFields, { alias: undefined, fieldArguments, fieldName, selectionMap }];
}

function aliasLastOperationField(appendedFields: ReadonlyArray<AppendedOperationField>, alias: string): AppendedOperationField[] {
  const lastAppendedField = appendedFields.at(-1);

  if (lastAppendedField === undefined) {
    throw new Error("as requires an appended field");
  }

  if (lastAppendedField.alias !== undefined) {
    throw new Error(`field ${lastAppendedField.fieldName} already has an alias`);
  }

  return [...appendedFields.slice(0, -1), { ...lastAppendedField, alias }];
}

function buildOperationSelectionFromAppendedFields(appendedFields: ReadonlyArray<AppendedOperationField>): OperationSelection {
  return appendedFields.map(buildOperationSelectionEntry);
}

function buildOperationSelectionEntry(appendedField: AppendedOperationField): OperationSelectionEntry {
  const operationSelectionEntry: OperationSelectionEntry = { field: appendedField.fieldName };

  if (appendedField.alias !== undefined) {
    operationSelectionEntry.alias = appendedField.alias;
  }

  if (appendedField.fieldArguments !== undefined) {
    operationSelectionEntry.arguments = appendedField.fieldArguments;
  }

  if (appendedField.selectionMap !== undefined) {
    const fieldSelection = lowerSelectionMap(appendedField.selectionMap);

    if (fieldSelection.length > 0) {
      operationSelectionEntry.selection = fieldSelection;
    }
  }

  return operationSelectionEntry;
}

function buildRequestFromLoweredSelection(
  operationType: OperationTypeName,
  rootTypeName: string,
  operationSelection: OperationSelection,
  runtimeData: OperationRuntimeData,
  options: RequestOptions | SubscriptionRequestOptions | undefined,
): OperationRequest {
  const builtOperation = buildOperationDocument(operationType, rootTypeName, operationSelection, runtimeData.fieldMap, runtimeData.scalarFieldLists);

  return buildOperationRequest(builtOperation, runtimeData, options);
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

type AppendedOperationField = {
  fieldName: string;
  alias: string | undefined;
  fieldArguments: ArgumentValues | undefined;
  selectionMap: SelectionMap | undefined;
};
