import type { SchemaModel, SchemaTypeModel, SchemaTypeReference } from "./models.ts";

export function createRuntimeModel(schemaModel: SchemaModel, rootTypeName: string = schemaModel.queryTypeName): Record<string, unknown> {
  const typesByName = indexTypes(schemaModel.types);

  return buildFieldTemplate(rootTypeName, typesByName, new Set<string>());
}

export type FieldTypeEntry = { argumentTypes: Record<string, string>; childTypeName: string };

export function createFieldTypeModel(schemaModel: SchemaModel): Record<string, Record<string, FieldTypeEntry>> {
  const fieldTypeModel: Record<string, Record<string, FieldTypeEntry>> = {};

  for (const typeModel of schemaModel.types) {
    if ((typeModel.kind !== "OBJECT" && typeModel.kind !== "INTERFACE") || typeModel.name.startsWith("__")) {
      continue;
    }

    const fieldEntries: Record<string, FieldTypeEntry> = {};

    for (const field of typeModel.fields) {
      const argumentTypes: Record<string, string> = {};

      for (const argument of field.arguments) {
        argumentTypes[argument.name] = referenceText(argument.typeReference);
      }

      fieldEntries[field.name] = { argumentTypes, childTypeName: namedTypeName(field.typeReference) };
    }

    fieldTypeModel[typeModel.name] = fieldEntries;
  }

  return fieldTypeModel;
}

export function createInputTypeModel(schemaModel: SchemaModel): Record<string, Record<string, string>> {
  const inputTypeModel: Record<string, Record<string, string>> = {};

  for (const typeModel of schemaModel.types) {
    if (typeModel.kind !== "INPUT_OBJECT") {
      continue;
    }

    const fieldsByName: Record<string, string> = {};

    for (const inputField of typeModel.inputFields) {
      fieldsByName[inputField.name] = referenceText(inputField.typeReference);
    }

    inputTypeModel[typeModel.name] = fieldsByName;
  }

  return inputTypeModel;
}

export function createEnumTypeModel(schemaModel: SchemaModel): Record<string, string[]> {
  const enumTypeModel: Record<string, string[]> = {};

  for (const typeModel of schemaModel.types) {
    if (typeModel.kind !== "ENUM" || typeModel.name.startsWith("__")) {
      continue;
    }

    enumTypeModel[typeModel.name] = typeModel.enumValues.map((enumValue) => enumValue.name);
  }

  return enumTypeModel;
}

function referenceText(typeReference: SchemaTypeReference): string {
  if (typeReference.kind === "NON_NULL") {
    return referenceText(typeReference.ofType);
  }

  if (typeReference.kind === "LIST") {
    return `[${referenceText(typeReference.ofType)}]`;
  }

  return typeReference.name;
}

function buildFieldTemplate(typeName: string, typesByName: Record<string, SchemaTypeModel>, visitedTypeNames: Set<string>): Record<string, unknown> {
  const typeModel = typesByName[typeName];

  if (visitedTypeNames.has(typeName) || typeModel === undefined || (typeModel.kind !== "OBJECT" && typeModel.kind !== "INTERFACE")) {
    return {};
  }

  const nextVisitedTypeNames = new Set(visitedTypeNames);
  nextVisitedTypeNames.add(typeName);

  const fieldTemplate: Record<string, unknown> = {};

  for (const field of typeModel.fields) {
    const childTypeName = namedTypeName(field.typeReference);
    const childTypeModel = typesByName[childTypeName];

    const isCompositeType =
      childTypeModel !== undefined && (childTypeModel.kind === "OBJECT" || childTypeModel.kind === "INTERFACE" || childTypeModel.kind === "UNION");

    if (isCompositeType === false) {
      fieldTemplate[field.name] = true;
      continue;
    }

    if (visitedTypeNames.has(childTypeName) || nextVisitedTypeNames.has(childTypeName)) {
      continue;
    }

    fieldTemplate[field.name] = buildFieldTemplate(childTypeName, typesByName, nextVisitedTypeNames);
  }

  return fieldTemplate;
}

function indexTypes(types: SchemaTypeModel[]): Record<string, SchemaTypeModel> {
  const typesByName: Record<string, SchemaTypeModel> = {};

  for (const typeModel of types) {
    typesByName[typeModel.name] = typeModel;
  }

  return typesByName;
}

function namedTypeName(typeReference: SchemaTypeReference): string {
  if (typeReference.kind === "NAME") {
    return typeReference.name;
  }

  return namedTypeName(typeReference.ofType);
}
