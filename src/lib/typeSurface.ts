import type { OperationTypeName } from "./operationType.ts";
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

import { listEmittableTypes, isEmittableTypeName } from "./schema.ts";
import { indexSchemaTypes, isLeafTypeReference, namedTypeName } from "./schemaModel.ts";

const builtInScalarTypeNames: Record<string, string> = {
  Boolean: "boolean",
  Float: "number",
  ID: "string",
  Int: "number",
  String: "string",
};

export function renderTypeSurface(schemaModel: SchemaModel, rootTypeNames: RootTypeNames, includeDeprecatedFields: boolean): string {
  const typeSurfaceParts: GeneratedTypeSurfaceParts = {
    argumentTypes: renderArgumentTypes(schemaModel, includeDeprecatedFields),
    enumTypes: renderEnumTypes(schemaModel),
    fieldArgumentTypes: renderFieldArgumentTypes(),
    inputObjectTypes: renderInputObjectTypes(schemaModel),
    operationTypes: renderOperationTypes(rootTypeNames),
    requestTypes: renderRequestTypes(schemaModel, includeDeprecatedFields),
    responseTypes: renderResponseTypes(schemaModel, includeDeprecatedFields),
    resultTypes: renderResultTypes(schemaModel, rootTypeNames, includeDeprecatedFields),
  };

  return [
    typeSurfaceParts.enumTypes,
    typeSurfaceParts.inputObjectTypes,
    typeSurfaceParts.argumentTypes,
    typeSurfaceParts.fieldArgumentTypes,
    typeSurfaceParts.operationTypes,
    typeSurfaceParts.requestTypes,
    typeSurfaceParts.responseTypes,
    typeSurfaceParts.resultTypes,
  ]
    .filter((typeSurfacePart) => typeSurfacePart.trim().length > 0)
    .join("\n\n");
}

export function renderOperationTypes(rootTypeNames: RootTypeNames): string {
  const operationTypeSources = collectOperationTypeNames(rootTypeNames).map((operationTypeName) => JSON.stringify(operationTypeName));

  return `export type OperationTypeName = ${operationTypeSources.join(" | ")};`;
}

export function renderEnumTypes(schemaModel: SchemaModel): string {
  const enumTypeSources = schemaModel.types
    .filter((schemaType) => isEmittableTypeName(schemaType.name))
    .filter(isEnumType)
    .map((enumType) => {
      const enumValueSources = enumType.enumValues.map((enumValue) => JSON.stringify(enumValue.name));

      return `export type ${enumType.name} = ${enumValueSources.join(" | ")};`;
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

export function renderFieldArgumentTypes(): string {
  return [
    "export type RequiredFieldArguments<Arguments> = { __arguments: Arguments };",
    "",
    "export type OptionalFieldArguments<Arguments> = { __arguments?: Arguments };",
  ].join("\n");
}

export function renderRequestTypes(schemaModel: SchemaModel, includeDeprecatedFields: boolean): string {
  const requestTypeSources = listEmittableTypes(schemaModel).map((objectType) => {
    const propertySources = listTypeSurfaceFields(objectType, schemaModel, includeDeprecatedFields).map((field) => {
      const requestType = renderFieldRequestType(objectType.name, field, schemaModel);

      return `\t${field.name}?: ${requestType};`;
    });

    return [`export type ${objectType.name}Request = {`, "\t__scalar?: boolean;", ...propertySources, "};"].join("\n");
  });

  return requestTypeSources.join("\n\n");
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

export function renderOperationExports(rootTypeNames: RootTypeNames): string {
  const operationExportSources: string[] = [renderOperationEntryPoint("query", rootTypeNames.query)];

  if (rootTypeNames.mutation !== undefined) {
    operationExportSources.push(renderOperationEntryPoint("mutation", rootTypeNames.mutation));
  }

  if (rootTypeNames.subscription !== undefined) {
    operationExportSources.push(renderOperationEntryPoint("subscription", rootTypeNames.subscription));
  }

  return operationExportSources.join("\n\n");
}

function renderOperationEntryPoint(operationType: OperationTypeName, rootTypeName: string): string {
  const isSubscriptionRoot = operationType === "subscription";
  const requestTypeName = `${rootTypeName}Request`;
  const resultTypeName = `${rootTypeName}Result`;
  const optionsTypeName = isSubscriptionRoot ? "SubscriptionRequestOptions" : "RequestOptions";
  const optionsParameter = isSubscriptionRoot ? `options: ${optionsTypeName}` : `options?: ${optionsTypeName}`;
  const returnTypeName = isSubscriptionRoot ? `AsyncIterableIterator<${resultTypeName}>` : `Promise<${resultTypeName}>`;
  const runnerName = isSubscriptionRoot ? "runSubscriptionOperation" : "runOperation";
  const runnerArguments = isSubscriptionRoot
    ? `${JSON.stringify(rootTypeName)}, requestMap, runtimeData, options`
    : `${JSON.stringify(operationType)}, ${JSON.stringify(rootTypeName)}, requestMap, runtimeData, options`;

  return [
    `export function ${operationType}(requestMap: ${requestTypeName}, ${optionsParameter}): ${returnTypeName} {`,
    `\treturn ${runnerName}(${runnerArguments}) as ${returnTypeName};`,
    "}",
  ].join("\n");
}

function renderFieldRequestType(parentTypeName: string, field: SchemaFieldModel, schemaModel: SchemaModel): string {
  const childType = findSchemaType(namedTypeName(field.typeReference), schemaModel);
  const hasArguments = field.arguments.length > 0;
  const hasRequiredArgument = field.arguments.some((argument) => argument.typeReference.kind === "NON_NULL");
  const argumentTypeName = renderArgumentTypeName(parentTypeName, field.name);
  const fieldArgumentTypeName = hasRequiredArgument ? "RequiredFieldArguments" : "OptionalFieldArguments";
  const fieldArgumentType = `${fieldArgumentTypeName}<${argumentTypeName}>`;

  if (childType.kind !== "OBJECT") {
    if (hasArguments === false) {
      return "boolean";
    }

    return `boolean | ${fieldArgumentType}`;
  }

  const childRequestTypeName = `${childType.name}Request`;

  if (hasArguments === false) {
    return childRequestTypeName;
  }

  return `(${childRequestTypeName} & ${fieldArgumentType})`;
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

  if (propertyType === "unknown") {
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

function collectOperationTypeNames(rootTypeNames: RootTypeNames): OperationTypeName[] {
  const operationTypeNameList: OperationTypeName[] = ["query"];

  if (rootTypeNames.mutation !== undefined) {
    operationTypeNameList.push("mutation");
  }

  if (rootTypeNames.subscription !== undefined) {
    operationTypeNameList.push("subscription");
  }

  return operationTypeNameList;
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
  fieldArgumentTypes: string;
  inputObjectTypes: string;
  operationTypes: string;
  requestTypes: string;
  responseTypes: string;
  resultTypes: string;
};
