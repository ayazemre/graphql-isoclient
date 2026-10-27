import { buildSchema, introspectionFromSchema } from "graphql";

import type {
  SchemaArgumentModel,
  SchemaEnumValueModel,
  SchemaFieldModel,
  SchemaInputFieldModel,
  SchemaModel,
  SchemaTypeModel,
  SchemaTypeReference,
} from "./models.ts";

import { schemaModelSchema } from "./models.ts";

export function parseSDLFile(schemaSource: string): SchemaModel {
  const graphqlSchema = buildSchema(schemaSource);
  const introspectionResult = introspectionFromSchema(graphqlSchema);

  return buildSchemaModelFromIntrospectionPayload(introspectionResult, "SDL");
}

export function parseIntrospectionJSON(jsonText: string): SchemaModel {
  let introspectionPayload: unknown;

  try {
    introspectionPayload = JSON.parse(jsonText);
  } catch (parseError) {
    throw new Error(`Introspection JSON is not valid JSON: ${readErrorMessage(parseError)}`, { cause: parseError });
  }

  return buildSchemaModelFromIntrospectionPayload(introspectionPayload, "introspection JSON");
}

export function buildSchemaModelFromIntrospectionPayload(introspectionPayload: unknown, payloadSourceDescription: string): SchemaModel {
  const introspectionResult = unwrapIntrospectionPayload(introspectionPayload, payloadSourceDescription);

  try {
    const schemaModel = buildSchemaModelFromIntrospectionResult(introspectionResult);
    return schemaModelSchema.parse(schemaModel);
  } catch (conversionError) {
    throw new Error(`Introspection result is malformed for ${payloadSourceDescription}: ${readErrorMessage(conversionError)}`, {
      cause: conversionError,
    });
  }
}

function buildSchemaModelFromIntrospectionResult(introspectionResult: unknown): SchemaModel {
  const resultRecord = readRecord(introspectionResult, "introspection result");
  const schemaRecord = readRecord(resultRecord.__schema, "__schema");
  const queryTypeName = readRootTypeName(schemaRecord.queryType, "__schema.queryType");
  const mutationTypeName = readOptionalRootTypeName(schemaRecord.mutationType, "__schema.mutationType");
  const subscriptionTypeName = readOptionalRootTypeName(schemaRecord.subscriptionType, "__schema.subscriptionType");
  const typeValues = readArray(schemaRecord.types, "__schema.types");
  const types = typeValues.map((typeValue, typeIndex) => convertSchemaType(typeValue, `__schema.types[${typeIndex}]`));
  const schemaModel: SchemaModel = { mutationTypeName, queryTypeName, subscriptionTypeName, types };

  assertTypeReferencesResolve(schemaModel);

  return schemaModel;
}

function readRootTypeName(rootTypeValue: unknown, rootTypePath: string): string {
  const rootTypeRecord = readRecord(rootTypeValue, rootTypePath);

  return readStringValue(rootTypeRecord.name, `${rootTypePath}.name`);
}

function readOptionalRootTypeName(rootTypeValue: unknown, rootTypePath: string): string | undefined {
  if (rootTypeValue === undefined || rootTypeValue === null) {
    return undefined;
  }

  return readRootTypeName(rootTypeValue, rootTypePath);
}

function convertSchemaType(typeValue: unknown, typePath: string): SchemaTypeModel {
  const typeRecord = readRecord(typeValue, typePath);
  const kind = readStringValue(typeRecord.kind, `${typePath}.kind`);
  const name = readStringValue(typeRecord.name, `${typePath}.name`);
  const description = readOptionalStringValue(typeRecord.description, `${typePath}.description`);

  if (kind === "SCALAR") {
    return { description, kind, name };
  }

  if (kind === "ENUM") {
    const enumValues = readArray(typeRecord.enumValues, `${typePath}.enumValues`).map((enumValue, enumValueIndex) =>
      convertSchemaEnumValue(enumValue, `${typePath}.enumValues[${enumValueIndex}]`),
    );

    return { description, enumValues, kind, name };
  }

  if (kind === "OBJECT") {
    return {
      description,
      fields: readFieldModels(typeRecord.fields, `${typePath}.fields`),
      interfaces: readTypeNames(typeRecord.interfaces, `${typePath}.interfaces`),
      kind,
      name,
    };
  }

  if (kind === "INTERFACE") {
    return {
      description,
      fields: readFieldModels(typeRecord.fields, `${typePath}.fields`),
      interfaces: readTypeNames(typeRecord.interfaces, `${typePath}.interfaces`),
      kind,
      name,
      possibleTypeNames: readTypeNames(typeRecord.possibleTypes, `${typePath}.possibleTypes`),
    };
  }

  if (kind === "UNION") {
    return {
      description,
      kind,
      name,
      possibleTypeNames: readTypeNames(typeRecord.possibleTypes, `${typePath}.possibleTypes`),
    };
  }

  if (kind === "INPUT_OBJECT") {
    const inputFields = readArray(typeRecord.inputFields, `${typePath}.inputFields`).map((inputField, inputFieldIndex) =>
      convertSchemaInputField(inputField, `${typePath}.inputFields[${inputFieldIndex}]`),
    );

    return { description, inputFields, kind, name };
  }

  throw new Error(`${typePath}.kind is not a supported type kind: ${kind}`);
}

function readFieldModels(fieldValues: unknown, fieldsPath: string): SchemaFieldModel[] {
  return readArray(fieldValues, fieldsPath).map((field, fieldIndex) => convertSchemaField(field, `${fieldsPath}[${fieldIndex}]`));
}

function readTypeNames(typeValues: unknown, typeNamesPath: string): string[] {
  return readArray(typeValues, typeNamesPath).map((typeValue, typeIndex) => {
    const typeRecord = readRecord(typeValue, `${typeNamesPath}[${typeIndex}]`);

    return readStringValue(typeRecord.name, `${typeNamesPath}[${typeIndex}].name`);
  });
}

function convertSchemaField(field: unknown, fieldPath: string): SchemaFieldModel {
  const fieldRecord = readRecord(field, fieldPath);
  const argumentValues = readArray(fieldRecord.args, `${fieldPath}.args`);

  return {
    arguments: argumentValues.map((argument, argumentIndex) => convertSchemaArgument(argument, `${fieldPath}.args[${argumentIndex}]`)),
    deprecationReason: readDeprecationReason(fieldRecord, fieldPath),
    description: readOptionalStringValue(fieldRecord.description, `${fieldPath}.description`),
    name: readStringValue(fieldRecord.name, `${fieldPath}.name`),
    typeReference: convertTypeReference(fieldRecord.type, `${fieldPath}.type`),
  };
}

function convertSchemaArgument(argument: unknown, argumentPath: string): SchemaArgumentModel {
  const argumentRecord = readRecord(argument, argumentPath);

  return {
    description: readOptionalStringValue(argumentRecord.description, `${argumentPath}.description`),
    name: readStringValue(argumentRecord.name, `${argumentPath}.name`),
    typeReference: convertTypeReference(argumentRecord.type, `${argumentPath}.type`),
  };
}

function convertSchemaInputField(inputField: unknown, inputFieldPath: string): SchemaInputFieldModel {
  const inputFieldRecord = readRecord(inputField, inputFieldPath);

  return {
    description: readOptionalStringValue(inputFieldRecord.description, `${inputFieldPath}.description`),
    name: readStringValue(inputFieldRecord.name, `${inputFieldPath}.name`),
    typeReference: convertTypeReference(inputFieldRecord.type, `${inputFieldPath}.type`),
  };
}

function convertSchemaEnumValue(enumValue: unknown, enumValuePath: string): SchemaEnumValueModel {
  const enumValueRecord = readRecord(enumValue, enumValuePath);

  return {
    deprecationReason: readDeprecationReason(enumValueRecord, enumValuePath),
    description: readOptionalStringValue(enumValueRecord.description, `${enumValuePath}.description`),
    name: readStringValue(enumValueRecord.name, `${enumValuePath}.name`),
  };
}

function convertTypeReference(typeReference: unknown, referencePath: string): SchemaTypeReference {
  const referenceRecord = readRecord(typeReference, referencePath);
  const kind = readStringValue(referenceRecord.kind, `${referencePath}.kind`);

  if (kind === "NON_NULL" || kind === "LIST") {
    return { kind, ofType: convertTypeReference(referenceRecord.ofType, `${referencePath}.ofType`) };
  }

  if (kind === "SCALAR" || kind === "ENUM" || kind === "OBJECT" || kind === "INTERFACE" || kind === "UNION" || kind === "INPUT_OBJECT") {
    return { kind: "NAME", name: readStringValue(referenceRecord.name, `${referencePath}.name`) };
  }

  throw new Error(`${referencePath}.kind is not a supported type reference kind: ${kind}`);
}

function unwrapIntrospectionPayload(introspectionPayload: unknown, payloadSourceDescription: string): unknown {
  const payloadRecord = readRecord(introspectionPayload, "introspection payload");

  if (payloadRecord.errors !== undefined) {
    const errorValues = readArray(payloadRecord.errors, "introspection payload.errors");

    if (errorValues.length > 0) {
      const firstErrorRecord = readRecord(errorValues[0], "introspection payload.errors[0]");
      const firstErrorMessage = readStringValue(firstErrorRecord.message, "introspection payload.errors[0].message");

      throw new Error(`Introspection payload contains errors for ${payloadSourceDescription}: ${firstErrorMessage}`);
    }
  }

  if (payloadRecord.data !== undefined) {
    return payloadRecord.data;
  }

  return payloadRecord;
}

function assertTypeReferencesResolve(schemaModel: SchemaModel): void {
  const typesByName: Record<string, SchemaTypeModel> = {};

  for (const schemaType of schemaModel.types) {
    typesByName[schemaType.name] = schemaType;
  }

  for (const schemaType of schemaModel.types) {
    if (schemaType.kind === "OBJECT" || schemaType.kind === "INTERFACE") {
      for (const field of schemaType.fields) {
        assertReferenceResolves(field.typeReference, typesByName);

        for (const argument of field.arguments) {
          assertReferenceResolves(argument.typeReference, typesByName);
        }
      }
    }

    if (schemaType.kind === "INPUT_OBJECT") {
      for (const inputField of schemaType.inputFields) {
        assertReferenceResolves(inputField.typeReference, typesByName);
      }
    }
  }
}

function assertReferenceResolves(typeReference: SchemaTypeReference, typesByName: Record<string, SchemaTypeModel>): void {
  const typeName = namedTypeName(typeReference);

  if (typesByName[typeName] === undefined) {
    throw new Error(`the type list has no entry named ${typeName} referenced by a field or argument`);
  }
}

function namedTypeName(typeReference: SchemaTypeReference): string {
  if (typeReference.kind === "NAME") {
    return typeReference.name;
  }

  return namedTypeName(typeReference.ofType);
}

function readRecord(value: unknown, valuePath: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${valuePath} is not an object`);
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown, valuePath: string): unknown[] {
  if (Array.isArray(value) === false) {
    throw new Error(`${valuePath} is not an array`);
  }

  return value;
}

function readStringValue(value: unknown, valuePath: string): string {
  if (typeof value !== "string") {
    throw new Error(`${valuePath} is not a string`);
  }

  return value;
}

function readOptionalStringValue(value: unknown, valuePath: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readStringValue(value, valuePath);
}

function readDeprecationReason(valueRecord: Record<string, unknown>, valuePath: string): string | undefined {
  if (valueRecord.isDeprecated !== true) {
    return undefined;
  }

  return readOptionalStringValue(valueRecord.deprecationReason, `${valuePath}.deprecationReason`);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
