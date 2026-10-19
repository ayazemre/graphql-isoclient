import type { OperationTypeName } from "./documentBuilder.ts";
import type { RootTypeNames } from "./schema.ts";
import type {
  SchemaEnumTypeModel,
  SchemaFieldModel,
  SchemaInputFieldModel,
  SchemaInputObjectTypeModel,
  SchemaModel,
  SchemaObjectTypeModel,
  SchemaTypeModel,
  SchemaTypeReference,
} from "./schemaModel.ts";

import { listEmittableTypes } from "./schema.ts";
import { indexSchemaTypes, isLeafTypeReference, namedTypeName } from "./schemaModel.ts";

const builtInScalarTypeNames: Record<string, string> = {
  Boolean: "boolean",
  Float: "number",
  ID: "string",
  Int: "number",
  String: "string",
};

const reservedBuilderMethodNames = ["as", "run"];

export function renderTypeSurface(schemaModel: SchemaModel, rootTypeNames: RootTypeNames, includeDeprecatedFields: boolean): string {
  const typeSurfaceParts: GeneratedTypeSurfaceParts = {
    argumentTypes: renderArgumentTypes(schemaModel, includeDeprecatedFields),
    enumTypes: renderEnumTypes(schemaModel),
    inputObjectTypes: renderInputObjectTypes(schemaModel),
    operationBuilderTypes: renderOperationBuilderTypes(schemaModel, rootTypeNames, includeDeprecatedFields),
    responseTypes: renderResponseTypes(schemaModel, includeDeprecatedFields),
    resultTypes: renderResultTypes(schemaModel, rootTypeNames, includeDeprecatedFields),
    selectionMapTypes: renderSelectionMapTypes(schemaModel, includeDeprecatedFields),
  };

  return [
    typeSurfaceParts.enumTypes,
    typeSurfaceParts.inputObjectTypes,
    typeSurfaceParts.argumentTypes,
    typeSurfaceParts.selectionMapTypes,
    typeSurfaceParts.responseTypes,
    typeSurfaceParts.resultTypes,
    typeSurfaceParts.operationBuilderTypes,
  ]
    .filter((typeSurfacePart) => typeSurfacePart.trim().length > 0)
    .join("\n\n");
}

export function renderEnumTypes(schemaModel: SchemaModel): string {
  const enumTypeSources = schemaModel.types.filter(isEnumType).map((enumType) => {
    const enumValueNames = enumType.enumValues.map((enumValue) => JSON.stringify(enumValue.name));

    return `export type ${enumType.name} = ${enumValueNames.join(" | ")};`;
  });

  return enumTypeSources.join("\n\n");
}

export function renderInputObjectTypes(schemaModel: SchemaModel): string {
  const inputObjectTypeSources = schemaModel.types.filter(isInputObjectType).map((inputObjectType) => {
    const propertySources = inputObjectType.inputFields.map((inputField) => renderInputPropertySource(inputField, schemaModel));

    return [`export type ${inputObjectType.name} = {`, ...propertySources, "};"].join("\n");
  });

  return inputObjectTypeSources.join("\n\n");
}

export function renderArgumentTypes(schemaModel: SchemaModel, includeDeprecatedFields: boolean): string {
  const argumentTypeSources: string[] = [];

  for (const objectType of listEmittableTypes(schemaModel)) {
    for (const field of listTypeSurfaceFields(objectType, schemaModel, includeDeprecatedFields)) {
      if (field.arguments.length === 0) {
        continue;
      }

      const propertySources = field.arguments.map((argument) => renderInputPropertySource(argument, schemaModel));
      const argumentTypeName = renderArgumentTypeName(objectType.name, field.name);

      argumentTypeSources.push([`export type ${argumentTypeName} = {`, ...propertySources, "};"].join("\n"));
    }
  }

  return argumentTypeSources.join("\n\n");
}

export function renderSelectionMapTypes(schemaModel: SchemaModel, includeDeprecatedFields: boolean): string {
  const selectionMapTypeSources = listEmittableTypes(schemaModel).map((objectType) => {
    const propertySources = listTypeSurfaceFields(objectType, schemaModel, includeDeprecatedFields).map((field) => {
      const fieldSelectionType = renderFieldSelectionType(field, schemaModel);

      return `\t${field.name}?: ${fieldSelectionType};`;
    });

    return [
      `export type ${objectType.name}SelectionMap = {`,
      "\t__args?: Record<string, unknown>;",
      "\t__scalar?: boolean;",
      ...propertySources,
      "};",
    ].join("\n");
  });

  return selectionMapTypeSources.join("\n\n");
}

export function renderResponseTypes(schemaModel: SchemaModel, includeDeprecatedFields: boolean): string {
  const responseTypeSources = listEmittableTypes(schemaModel).map((objectType) => {
    const propertySources = listTypeSurfaceFields(objectType, schemaModel, includeDeprecatedFields).map((field) =>
      renderResponsePropertySource(field, schemaModel),
    );

    return [`export type ${objectType.name}Response = {`, ...propertySources, "};"].join("\n");
  });

  return responseTypeSources.join("\n\n");
}

export function renderResultTypes(schemaModel: SchemaModel, rootTypeNames: RootTypeNames, includeDeprecatedFields: boolean): string {
  const resultTypeSources = collectRootTypeNames(rootTypeNames).map((rootTypeName) => {
    const rootType = findObjectType(rootTypeName, schemaModel);
    const propertySources = listTypeSurfaceFields(rootType, schemaModel, includeDeprecatedFields).map((field) =>
      renderResponsePropertySource(field, schemaModel),
    );

    return [`export type ${rootTypeName}Result = {`, ...propertySources, "} & Record<string, unknown>;"].join("\n");
  });

  return resultTypeSources.join("\n\n");
}

export function renderOperationBuilderTypes(schemaModel: SchemaModel, rootTypeNames: RootTypeNames, includeDeprecatedFields: boolean): string {
  const builderTypeSources = collectRootTypeNames(rootTypeNames).map((rootTypeName) => {
    const rootType = findObjectType(rootTypeName, schemaModel);
    const methodSources = listTypeSurfaceFields(rootType, schemaModel, includeDeprecatedFields).map((field) => {
      const methodName = resolveBuilderMethodName(field.name);
      const parameterSources = renderBuilderMethodParameters(rootTypeName, field, schemaModel);

      return `\t${methodName}(${parameterSources.join(", ")}): ${rootTypeName}Builder;`;
    });
    const isSubscriptionRoot = rootTypeName === rootTypeNames.subscription;
    const runReturnType = isSubscriptionRoot
      ? `AsyncIterableIterator<OperationResult<${rootTypeName}Result>>`
      : `Promise<OperationResult<${rootTypeName}Result>>`;
    const runParameter = isSubscriptionRoot ? "options: SubscriptionRequestOptions" : "options?: RequestOptions";

    return [
      `export type ${rootTypeName}Builder = {`,
      ...methodSources,
      `\tas(alias: string): ${rootTypeName}Builder;`,
      `\trun(${runParameter}): ${runReturnType};`,
      "};",
    ].join("\n");
  });

  return builderTypeSources.join("\n\n");
}

export function renderOperationExports(schemaModel: SchemaModel, rootTypeNames: RootTypeNames, includeDeprecatedFields: boolean): string {
  const operationExportSources: string[] = [renderOperationEntryPoint("query", rootTypeNames.query)];

  if (rootTypeNames.mutation !== undefined) {
    operationExportSources.push(renderOperationEntryPoint("mutation", rootTypeNames.mutation));
  }

  if (rootTypeNames.subscription !== undefined) {
    operationExportSources.push(renderOperationEntryPoint("subscription", rootTypeNames.subscription));
  }

  operationExportSources.push(renderOperationBuilderFactory("query", rootTypeNames.query, schemaModel, includeDeprecatedFields));

  if (rootTypeNames.mutation !== undefined) {
    operationExportSources.push(renderOperationBuilderFactory("mutation", rootTypeNames.mutation, schemaModel, includeDeprecatedFields));
  }

  if (rootTypeNames.subscription !== undefined) {
    operationExportSources.push(renderOperationBuilderFactory("subscription", rootTypeNames.subscription, schemaModel, includeDeprecatedFields));
  }

  return operationExportSources.join("\n\n");
}

function renderOperationBuilderFactory(
  operationType: OperationTypeName,
  rootTypeName: string,
  schemaModel: SchemaModel,
  includeDeprecatedFields: boolean,
): string {
  const rootType = findObjectType(rootTypeName, schemaModel);
  const methodSources = listTypeSurfaceFields(rootType, schemaModel, includeDeprecatedFields).map((field) =>
    renderBuilderMethodSource(rootTypeName, field, schemaModel),
  );
  const isSubscriptionRoot = operationType === "subscription";
  const coreTypeName = isSubscriptionRoot ? "SubscriptionOperationBuilderCore" : "QueryOperationBuilderCore";
  const runReturnType = isSubscriptionRoot
    ? `AsyncIterableIterator<OperationResult<${rootTypeName}Result>>`
    : `Promise<OperationResult<${rootTypeName}Result>>`;

  return [
    `function create${rootTypeName}Builder(operationBuilderCore: ${coreTypeName}): ${rootTypeName}Builder {`,
    "\treturn {",
    ...methodSources,
    "\t\tas(alias) {",
    `\t\t\treturn create${rootTypeName}Builder(operationBuilderCore.as(alias));`,
    "\t\t},",
    "\t\trun(options) {",
    `\t\t\treturn operationBuilderCore.run(options) as ${runReturnType};`,
    "\t\t},",
    "\t};",
    "}",
  ].join("\n");
}

function renderOperationEntryPoint(operationType: OperationTypeName, rootTypeName: string): string {
  return [
    `export function ${operationType}(): ${rootTypeName}Builder {`,
    `\treturn create${rootTypeName}Builder(createOperationBuilderCore(${JSON.stringify(operationType)}, ${JSON.stringify(rootTypeName)}, runtimeData));`,
    "}",
  ].join("\n");
}

function renderBuilderMethodSource(rootTypeName: string, field: SchemaFieldModel, schemaModel: SchemaModel): string {
  const methodName = resolveBuilderMethodName(field.name);
  const hasArguments = field.arguments.length > 0;
  const hasSelectionMap = renderChildSelectionMapTypeName(field, schemaModel) !== undefined;
  const parameterNames: string[] = [];

  if (hasArguments) {
    parameterNames.push("fieldArguments");
  }

  if (hasSelectionMap) {
    parameterNames.push("selectionMap");
  }

  const appendArgumentSource = hasArguments ? "fieldArguments" : "undefined";
  const appendSelectionSource = hasSelectionMap ? "selectionMap" : "undefined";

  return [
    `\t\t${methodName}(${parameterNames.join(", ")}) {`,
    `\t\t\treturn create${rootTypeName}Builder(operationBuilderCore.appendField(${JSON.stringify(field.name)}, ${appendArgumentSource}, ${appendSelectionSource}));`,
    "\t\t},",
  ].join("\n");
}

function renderBuilderMethodParameters(rootTypeName: string, field: SchemaFieldModel, schemaModel: SchemaModel): string[] {
  const parameterSources: string[] = [];
  const argumentTypeName = renderArgumentTypeName(rootTypeName, field.name);

  if (field.arguments.length > 0) {
    const hasRequiredArgument = field.arguments.some((argument) => argument.typeReference.kind === "NON_NULL");

    parameterSources.push(hasRequiredArgument ? `fieldArguments: ${argumentTypeName}` : `fieldArguments: ${argumentTypeName} | undefined`);
  }

  const selectionMapTypeName = renderChildSelectionMapTypeName(field, schemaModel);

  if (selectionMapTypeName !== undefined) {
    parameterSources.push(`selectionMap: ${selectionMapTypeName}`);
  }

  return parameterSources;
}

function renderChildSelectionMapTypeName(field: SchemaFieldModel, schemaModel: SchemaModel): string | undefined {
  const childType = findSchemaType(namedTypeName(field.typeReference), schemaModel);

  if (childType.kind !== "OBJECT") {
    return undefined;
  }

  return `${childType.name}SelectionMap`;
}

function renderFieldSelectionType(field: SchemaFieldModel, schemaModel: SchemaModel): string {
  const childType = findSchemaType(namedTypeName(field.typeReference), schemaModel);

  if (childType.kind !== "OBJECT") {
    return "boolean";
  }

  return `boolean | ${childType.name}SelectionMap`;
}

function renderInputPropertySource(inputField: SchemaInputFieldModel, schemaModel: SchemaModel): string {
  const propertyType = renderInputTypeReference(inputField.typeReference, schemaModel);

  if (inputField.typeReference.kind === "NON_NULL") {
    return `\t${inputField.name}: ${propertyType};`;
  }

  return `\t${inputField.name}?: ${propertyType} | null;`;
}

function renderResponsePropertySource(field: SchemaFieldModel, schemaModel: SchemaModel): string {
  const propertyType = renderResponseTypeReference(field.typeReference, schemaModel);

  if (field.typeReference.kind === "NON_NULL") {
    return `\t${field.name}?: ${propertyType};`;
  }

  return `\t${field.name}?: ${propertyType} | null;`;
}

function renderInputTypeReference(typeReference: SchemaTypeReference, schemaModel: SchemaModel): string {
  if (typeReference.kind === "NON_NULL") {
    return renderInputTypeReference(typeReference.ofType, schemaModel);
  }

  if (typeReference.kind === "LIST") {
    return `${renderInputTypeReference(typeReference.ofType, schemaModel)}[]`;
  }

  const namedType = findSchemaType(typeReference.name, schemaModel);

  if (namedType.kind === "ENUM" || namedType.kind === "INPUT_OBJECT") {
    return namedType.name;
  }

  if (namedType.kind === "SCALAR") {
    return renderScalarTypeName(namedType.name);
  }

  throw new Error(`type ${namedType.name} cannot be used as an input type`);
}

function renderResponseTypeReference(typeReference: SchemaTypeReference, schemaModel: SchemaModel): string {
  if (typeReference.kind === "NON_NULL") {
    return renderResponseTypeReference(typeReference.ofType, schemaModel);
  }

  if (typeReference.kind === "LIST") {
    return `${renderResponseTypeReference(typeReference.ofType, schemaModel)}[]`;
  }

  const namedType = findSchemaType(typeReference.name, schemaModel);

  if (namedType.kind === "OBJECT") {
    return `${namedType.name}Response`;
  }

  if (namedType.kind === "ENUM") {
    return namedType.name;
  }

  if (namedType.kind === "SCALAR") {
    return renderScalarTypeName(namedType.name);
  }

  return "unknown";
}

function renderScalarTypeName(scalarTypeName: string): string {
  return builtInScalarTypeNames[scalarTypeName] ?? "unknown";
}

function renderArgumentTypeName(parentTypeName: string, fieldName: string): string {
  return `${parentTypeName}${capitalizeFirstLetter(fieldName)}Arguments`;
}

function resolveBuilderMethodName(fieldName: string): string {
  if (reservedBuilderMethodNames.includes(fieldName)) {
    return `${fieldName}Field`;
  }

  return fieldName;
}

function listTypeSurfaceFields(objectType: SchemaObjectTypeModel, schemaModel: SchemaModel, includeDeprecatedFields: boolean): SchemaFieldModel[] {
  const typesByName = indexSchemaTypes(schemaModel);

  return objectType.fields
    .filter((field) => isSelectableFieldType(field, typesByName))
    .filter(
      (field) => includeDeprecatedFields || isLeafTypeReference(field.typeReference, typesByName) === false || field.deprecationReason === undefined,
    );
}

function isSelectableFieldType(field: SchemaFieldModel, typesByName: Record<string, SchemaTypeModel>): boolean {
  const fieldTypeName = namedTypeName(field.typeReference);
  const namedType = typesByName[fieldTypeName];

  if (namedType === undefined) {
    throw new Error(`schema has no type named ${fieldTypeName}`);
  }

  return namedType.kind === "SCALAR" || namedType.kind === "ENUM" || namedType.kind === "OBJECT";
}

function collectRootTypeNames(rootTypeNames: RootTypeNames): string[] {
  const rootTypeNameList = [rootTypeNames.query];

  if (rootTypeNames.mutation !== undefined) {
    rootTypeNameList.push(rootTypeNames.mutation);
  }

  if (rootTypeNames.subscription !== undefined) {
    rootTypeNameList.push(rootTypeNames.subscription);
  }

  return rootTypeNameList;
}

function findSchemaType(typeName: string, schemaModel: SchemaModel): SchemaTypeModel {
  const typesByName = indexSchemaTypes(schemaModel);
  const foundType = typesByName[typeName];

  if (foundType === undefined) {
    throw new Error(`schema has no type named ${typeName}`);
  }

  return foundType;
}

function findObjectType(typeName: string, schemaModel: SchemaModel): SchemaObjectTypeModel {
  const foundType = findSchemaType(typeName, schemaModel);

  if (foundType.kind !== "OBJECT") {
    throw new Error(`type ${typeName} is not an object type`);
  }

  return foundType;
}

function isEnumType(schemaType: SchemaTypeModel): schemaType is SchemaEnumTypeModel {
  return schemaType.kind === "ENUM";
}

function isInputObjectType(schemaType: SchemaTypeModel): schemaType is SchemaInputObjectTypeModel {
  return schemaType.kind === "INPUT_OBJECT";
}

function capitalizeFirstLetter(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export type GeneratedTypeSurfaceParts = {
  argumentTypes: string;
  enumTypes: string;
  inputObjectTypes: string;
  operationBuilderTypes: string;
  responseTypes: string;
  resultTypes: string;
  selectionMapTypes: string;
};
