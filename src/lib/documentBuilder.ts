import type { RuntimeFieldEntry, RuntimeFieldMap, RuntimeScalarFieldLists } from "./fieldMap.ts";
import type { OperationTypeName } from "./operationType.ts";

const selectAllScalarFieldsMarker = "__scalar";
const fieldArgumentsMarker = "__arguments";

export function lowerSelectionMap(selectionMap: SelectionMap): OperationSelection {
  if (!selectionMap || typeof selectionMap !== "object" || Array.isArray(selectionMap)) {
    throw new Error("selection must be an object");
  }

  const operationSelection: OperationSelection = [];

  for (const [fieldName, selectionValue] of Object.entries(selectionMap)) {
    if (selectionValue === undefined || selectionValue === false) {
      continue;
    }

    if (fieldName === selectAllScalarFieldsMarker) {
      if (selectionValue === true) {
        operationSelection.push({ field: selectAllScalarFieldsMarker });
      }

      continue;
    }

    if (fieldName === fieldArgumentsMarker) {
      continue;
    }

    checkGraphqlName(fieldName, "field name");

    const operationSelectionEntry: OperationSelectionEntry = { field: fieldName };

    if (selectionValue === true) {
      operationSelection.push(operationSelectionEntry);
      continue;
    }

    if (!selectionValue || typeof selectionValue !== "object" || Array.isArray(selectionValue)) {
      throw new Error(`selection for field ${fieldName} must be true, false, or a selection map`);
    }

    const fieldSelectionMap = selectionValue as SelectionMap;
    const fieldArguments = readFieldArguments(fieldSelectionMap);

    if (fieldArguments !== undefined) {
      operationSelectionEntry.arguments = fieldArguments;
    }

    const fieldSelection = lowerSelectionMap(fieldSelectionMap);

    if (fieldSelection.length > 0) {
      operationSelectionEntry.selection = fieldSelection;
    }

    operationSelection.push(operationSelectionEntry);
  }

  return operationSelection;
}

export function buildOperationDocument(
  operationType: OperationTypeName,
  rootTypeName: string,
  operationSelection: OperationSelection,
  fieldMap: RuntimeFieldMap,
  scalarFieldLists: RuntimeScalarFieldLists,
): BuiltOperation {
  const documentBuildContext: DocumentBuildContext = {
    usedVariableNames: new Set<string>(),
    variableDefinitions: [],
    variables: {},
  };

  const rootSelection = expandSelection(operationSelection, rootTypeName, fieldMap, scalarFieldLists);

  if (rootSelection.length === 0) {
    throw new Error(`selection for ${rootTypeName} is empty`);
  }

  const operationName = buildOperationName(operationType, rootSelection);
  const selectionSource = renderSelectionSet(rootSelection, rootTypeName, 1, fieldMap, scalarFieldLists, documentBuildContext);
  const variableDefinitionsSource =
    documentBuildContext.variableDefinitions.length > 0 ? `(${documentBuildContext.variableDefinitions.join(", ")})` : "";
  const document = `${operationType} ${operationName}${variableDefinitionsSource} {\n${selectionSource}\n}`;

  return { document, operationName, variables: documentBuildContext.variables };
}

function readFieldArguments(fieldSelectionMap: SelectionMap): ArgumentValues | undefined {
  const fieldArguments = fieldSelectionMap[fieldArgumentsMarker];

  if (fieldArguments === undefined) {
    return undefined;
  }

  if (!fieldArguments || typeof fieldArguments !== "object" || Array.isArray(fieldArguments)) {
    throw new Error("field arguments must be an object");
  }

  return fieldArguments as ArgumentValues;
}

function expandSelection(
  operationSelection: OperationSelection,
  typeName: string,
  fieldMap: RuntimeFieldMap,
  scalarFieldLists: RuntimeScalarFieldLists,
): OperationSelection {
  const expandedSelection: OperationSelection = [];
  const selectedFieldNames = new Set<string>();
  let includeAllScalarFields = false;

  for (const operationSelectionEntry of operationSelection) {
    if (operationSelectionEntry.field === selectAllScalarFieldsMarker) {
      includeAllScalarFields = true;
      continue;
    }

    if (selectedFieldNames.has(operationSelectionEntry.field)) {
      throw new Error(`field ${operationSelectionEntry.field} is selected more than once on type ${typeName}`);
    }

    selectedFieldNames.add(operationSelectionEntry.field);
    expandedSelection.push(operationSelectionEntry);
  }

  if (includeAllScalarFields) {
    for (const scalarFieldName of scalarFieldLists[typeName] ?? []) {
      if (selectedFieldNames.has(scalarFieldName)) {
        continue;
      }

      const scalarFieldEntry = fieldMap[`${typeName}.${scalarFieldName}`];

      if (scalarFieldEntry?.arguments !== undefined) {
        continue;
      }

      expandedSelection.push({ field: scalarFieldName });
    }
  }

  const selectedResponseKeys = new Set<string>();

  for (const operationSelectionEntry of expandedSelection) {
    const responseKey = operationSelectionEntry.alias ?? operationSelectionEntry.field;

    if (selectedResponseKeys.has(responseKey)) {
      throw new Error(`response key ${responseKey} is selected more than once on type ${typeName}`);
    }

    selectedResponseKeys.add(responseKey);
  }

  expandedSelection.sort(compareSelectionEntries);

  return expandedSelection;
}

function renderSelectionSet(
  operationSelection: OperationSelection,
  typeName: string,
  indentationLevel: number,
  fieldMap: RuntimeFieldMap,
  scalarFieldLists: RuntimeScalarFieldLists,
  documentBuildContext: DocumentBuildContext,
): string {
  const expandedSelection = expandSelection(operationSelection, typeName, fieldMap, scalarFieldLists);

  return expandedSelection
    .map((operationSelectionEntry) =>
      renderSelectionEntry(operationSelectionEntry, typeName, indentationLevel, fieldMap, scalarFieldLists, documentBuildContext),
    )
    .join("\n");
}

function renderSelectionEntry(
  operationSelectionEntry: OperationSelectionEntry,
  typeName: string,
  indentationLevel: number,
  fieldMap: RuntimeFieldMap,
  scalarFieldLists: RuntimeScalarFieldLists,
  documentBuildContext: DocumentBuildContext,
): string {
  const { field, alias } = operationSelectionEntry;
  const fieldEntry = fieldMap[`${typeName}.${field}`];
  const scalarFieldNames = scalarFieldLists[typeName] ?? [];

  if (fieldEntry === undefined && scalarFieldNames.includes(field) === false) {
    throw new Error(`field ${field} does not exist on type ${typeName}`);
  }

  if (alias !== undefined && indentationLevel > 1) {
    throw new Error(`alias ${alias} is only supported on operation root fields`);
  }

  const fieldSource = alias !== undefined ? `${alias}: ${field}` : field;
  const argumentSource = renderArguments(operationSelectionEntry, fieldEntry, documentBuildContext);
  const indentationSource = "  ".repeat(indentationLevel);

  if (fieldEntry?.select !== undefined) {
    const nestedSelection = operationSelectionEntry.selection;

    if (nestedSelection === undefined || nestedSelection.length === 0) {
      throw new Error(`field ${field} on type ${typeName} requires a selection`);
    }

    const nestedSource = renderSelectionSet(
      nestedSelection,
      fieldEntry.select,
      indentationLevel + 1,
      fieldMap,
      scalarFieldLists,
      documentBuildContext,
    );

    return `${indentationSource}${fieldSource}${argumentSource} {\n${nestedSource}\n${indentationSource}}`;
  }

  const nestedSelection = operationSelectionEntry.selection;

  if (nestedSelection !== undefined && nestedSelection.length > 0) {
    throw new Error(`field ${field} on type ${typeName} does not support a selection`);
  }

  return `${indentationSource}${fieldSource}${argumentSource}`;
}

function renderArguments(
  operationSelectionEntry: OperationSelectionEntry,
  fieldEntry: RuntimeFieldEntry | undefined,
  documentBuildContext: DocumentBuildContext,
): string {
  const argumentValues = operationSelectionEntry.arguments;

  if (argumentValues === undefined) {
    return "";
  }

  const argumentNames = Object.keys(argumentValues).sort();
  const renderedArguments: string[] = [];

  for (const argumentName of argumentNames) {
    const argumentValue = argumentValues[argumentName];

    if (argumentValue === undefined) {
      continue;
    }

    checkGraphqlName(argumentName, "argument name");

    const argumentType = fieldEntry?.arguments?.[argumentName];

    if (argumentType === undefined) {
      throw new Error(`field ${operationSelectionEntry.field} does not accept argument ${argumentName}`);
    }

    const variableName = allocateVariableName(argumentName, documentBuildContext);

    documentBuildContext.variables[variableName] = argumentValue;
    documentBuildContext.variableDefinitions.push(`$${variableName}: ${argumentType}`);

    renderedArguments.push(`${argumentName}: $${variableName}`);
  }

  if (renderedArguments.length === 0) {
    return "";
  }

  return `(${renderedArguments.join(", ")})`;
}

function buildOperationName(operationType: OperationTypeName, rootSelection: OperationSelection): string {
  const responseKeyPart = rootSelection
    .map((operationSelectionEntry) => capitalizeFirstLetter(operationSelectionEntry.alias ?? operationSelectionEntry.field))
    .join("");

  return `${capitalizeFirstLetter(operationType)}${responseKeyPart}`;
}

function allocateVariableName(argumentName: string, documentBuildContext: DocumentBuildContext): string {
  let variableName = argumentName;
  let suffixNumber = 1;

  while (documentBuildContext.usedVariableNames.has(variableName)) {
    suffixNumber += 1;
    variableName = `${argumentName}_${suffixNumber}`;
  }

  documentBuildContext.usedVariableNames.add(variableName);

  return variableName;
}

function compareSelectionEntries(firstEntry: OperationSelectionEntry, secondEntry: OperationSelectionEntry): number {
  const firstResponseKey = firstEntry.alias ?? firstEntry.field;
  const secondResponseKey = secondEntry.alias ?? secondEntry.field;

  if (firstResponseKey === secondResponseKey) {
    return 0;
  }

  return firstResponseKey < secondResponseKey ? -1 : 1;
}

function capitalizeFirstLetter(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function checkGraphqlName(value: string, valueDescription: string): void {
  if (/^[_A-Za-z][_0-9A-Za-z]*$/.test(value) === false) {
    throw new Error(`${valueDescription} ${value} is not a valid GraphQL name`);
  }
}

export type ArgumentValues = Record<string, unknown>;

export type SelectionValue = boolean | SelectionMap | undefined;

export type SelectionMap = {
  readonly __scalar?: boolean;
  readonly __arguments?: ArgumentValues;
  readonly [fieldName: string]: SelectionValue | ArgumentValues;
};

export type OperationSelectionEntry = {
  field: string;
  alias?: string;
  arguments?: ArgumentValues;
  selection?: OperationSelection;
};

export type OperationSelection = OperationSelectionEntry[];

export type BuiltOperation = {
  document: string;
  operationName: string;
  variables: Record<string, unknown>;
};

type DocumentBuildContext = {
  usedVariableNames: Set<string>;
  variableDefinitions: string[];
  variables: Record<string, unknown>;
};
