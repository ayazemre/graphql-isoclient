import type { SchemaModel } from "./schemaModel.ts";

import { listEmittableTypes, listFieldArgumentTypes, listScalarFieldNames } from "./schema.ts";
import { compareByName, indexSchemaTypes, isLeafTypeReference, namedTypeName } from "./schemaModel.ts";

export function buildRuntimeFieldMap(schemaModel: SchemaModel): RuntimeFieldMap {
  const typesByName = indexSchemaTypes(schemaModel);
  const runtimeFieldMap: RuntimeFieldMap = {};

  for (const objectType of listEmittableTypes(schemaModel)) {
    for (const field of [...objectType.fields].sort(compareByName)) {
      const runtimeFieldEntry: RuntimeFieldEntry = {};

      const argumentTypes = listFieldArgumentTypes(field);

      if (Object.keys(argumentTypes).length > 0) {
        runtimeFieldEntry.arguments = argumentTypes;
      }

      if (isLeafTypeReference(field.typeReference, typesByName) === false) {
        runtimeFieldEntry.select = namedTypeName(field.typeReference);
      }

      if (runtimeFieldEntry.select === undefined && runtimeFieldEntry.arguments === undefined) {
        continue;
      }

      runtimeFieldMap[`${objectType.name}.${field.name}`] = runtimeFieldEntry;
    }
  }

  return runtimeFieldMap;
}

export function buildRuntimeScalarFieldLists(schemaModel: SchemaModel, includeDeprecatedFields: boolean): RuntimeScalarFieldLists {
  const typesByName = indexSchemaTypes(schemaModel);
  const runtimeScalarFieldLists: RuntimeScalarFieldLists = {};

  for (const objectType of listEmittableTypes(schemaModel)) {
    const scalarFieldNames = listScalarFieldNames(objectType, typesByName, includeDeprecatedFields);

    if (scalarFieldNames.length === 0) {
      continue;
    }

    runtimeScalarFieldLists[objectType.name] = scalarFieldNames;
  }

  return runtimeScalarFieldLists;
}

export function buildSchemaRuntimeData(schemaModel: SchemaModel, includeDeprecatedFields: boolean): SchemaRuntimeData {
  return {
    fieldMap: buildRuntimeFieldMap(schemaModel),
    scalarFieldLists: buildRuntimeScalarFieldLists(schemaModel, includeDeprecatedFields),
  };
}

export type RuntimeFieldEntry = {
  arguments?: Record<string, string>;
  select?: string;
};

export type RuntimeFieldMap = Record<string, RuntimeFieldEntry>;

export type RuntimeScalarFieldLists = Record<string, string[]>;

export type SchemaRuntimeData = {
  fieldMap: RuntimeFieldMap;
  scalarFieldLists: RuntimeScalarFieldLists;
};
