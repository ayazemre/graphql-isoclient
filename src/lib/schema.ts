import { readFile } from "node:fs/promises";

import type { SchemaFieldModel, SchemaModel, SchemaObjectTypeModel, SchemaTypeModel } from "./schemaModel.ts";

import { buildSchemaModelFromIntrospectionPayload, introspectionQueryText, readErrorMessage } from "./introspection.ts";
import { compareByName, isLeafTypeReference, renderTypeReferenceString } from "./schemaModel.ts";

export async function loadSchemaFromEndpoint(schemaEndpoint: string, headers: Record<string, string> | undefined): Promise<SchemaModel> {
  const introspectionResponse = await fetch(schemaEndpoint, {
    body: JSON.stringify({
      operationName: "IntrospectionQuery",
      query: introspectionQueryText,
    }),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

  if (introspectionResponse.ok === false) {
    throw new Error(`Introspection request failed with status ${introspectionResponse.status} for ${schemaEndpoint}`);
  }

  const introspectionPayload: unknown = await introspectionResponse.json();

  return buildSchemaModelFromIntrospectionPayload(introspectionPayload, schemaEndpoint);
}

export async function loadSchemaFromIntrospectionJson(introspectionJsonFile: string): Promise<SchemaModel> {
  const introspectionJsonText = await readFile(introspectionJsonFile, "utf8");

  let introspectionPayload: unknown;

  try {
    introspectionPayload = JSON.parse(introspectionJsonText);
  } catch (parseError) {
    throw new Error(`Introspection JSON is not valid JSON for ${introspectionJsonFile}: ${readErrorMessage(parseError)}`, { cause: parseError });
  }

  return buildSchemaModelFromIntrospectionPayload(introspectionPayload, introspectionJsonFile);
}

export function resolveRootTypeNames(schemaModel: SchemaModel): RootTypeNames {
  return {
    mutation: schemaModel.mutationTypeName,
    query: schemaModel.queryTypeName,
    subscription: schemaModel.subscriptionTypeName,
  };
}

export function listEmittableTypes(schemaModel: SchemaModel): SchemaObjectTypeModel[] {
  return schemaModel.types
    .filter((schemaType) => isEmittableTypeName(schemaType.name))
    .filter(isObjectTypeModel)
    .sort(compareByName);
}

export function isEmittableTypeName(typeName: string): boolean {
  return typeName.startsWith("__") === false;
}

export function listScalarFieldNames(
  objectType: SchemaObjectTypeModel,
  typesByName: Record<string, SchemaTypeModel>,
  includeDeprecatedFields: boolean,
): string[] {
  return objectType.fields
    .filter((field) => isLeafTypeReference(field.typeReference, typesByName))
    .filter((field) => includeDeprecatedFields || isFieldDeprecated(field) === false)
    .map((field) => field.name)
    .sort();
}

export function listFieldArgumentTypes(field: SchemaFieldModel): Record<string, string> {
  const argumentTypes: Record<string, string> = {};

  for (const argument of field.arguments) {
    argumentTypes[argument.name] = renderTypeReferenceString(argument.typeReference);
  }

  return argumentTypes;
}

function isObjectTypeModel(schemaType: SchemaTypeModel): schemaType is SchemaObjectTypeModel {
  return schemaType.kind === "OBJECT";
}

function isFieldDeprecated(field: SchemaFieldModel): boolean {
  return field.deprecationReason !== undefined;
}

export type RootTypeNames = {
  query: string;
  mutation: string | undefined;
  subscription: string | undefined;
};
