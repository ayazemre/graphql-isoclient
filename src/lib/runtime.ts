import type { SchemaModel, SchemaTypeModel, SchemaTypeReference } from "./models.ts";

export function createRuntimeModel(schemaModel: SchemaModel, rootTypeName: string = schemaModel.queryTypeName): Record<string, unknown> {
  const typesByName = indexTypes(schemaModel.types);

  return buildFieldTemplate(rootTypeName, typesByName, new Set<string>());
}

function buildFieldTemplate(typeName: string, typesByName: Record<string, SchemaTypeModel>, visitedTypeNames: Set<string>): Record<string, unknown> {
  if (visitedTypeNames.has(typeName)) {
    return { __scalar: true };
  }

  const typeModel = typesByName[typeName];

  if (typeModel === undefined || (typeModel.kind !== "OBJECT" && typeModel.kind !== "INTERFACE")) {
    return { __scalar: true };
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

    fieldTemplate[field.name] = buildFieldTemplate(childTypeName, typesByName, nextVisitedTypeNames);

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
