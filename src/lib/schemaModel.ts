export function isLeafTypeReference(typeReference: SchemaTypeReference, typesByName: Record<string, SchemaTypeModel>): boolean {
  const typeName = namedTypeName(typeReference);
  const namedType = typesByName[typeName];

  if (namedType === undefined) {
    throw new Error(`Schema model has no type named ${typeName}`);
  }

  return namedType.kind === "SCALAR" || namedType.kind === "ENUM";
}

export function compareByName<NamedValue extends { name: string }>(firstValue: NamedValue, secondValue: NamedValue): number {
  if (firstValue.name === secondValue.name) {
    return 0;
  }

  return firstValue.name < secondValue.name ? -1 : 1;
}

export function indexSchemaTypes(schemaModel: SchemaModel): Record<string, SchemaTypeModel> {
  const typesByName: Record<string, SchemaTypeModel> = {};

  for (const schemaType of schemaModel.types) {
    typesByName[schemaType.name] = schemaType;
  }

  return typesByName;
}

export function namedTypeName(typeReference: SchemaTypeReference): string {
  if (typeReference.kind === "NAME") {
    return typeReference.name;
  }

  return namedTypeName(typeReference.ofType);
}

export function renderTypeReferenceString(typeReference: SchemaTypeReference): string {
  if (typeReference.kind === "NON_NULL") {
    return `${renderTypeReferenceString(typeReference.ofType)}!`;
  }

  if (typeReference.kind === "LIST") {
    return `[${renderTypeReferenceString(typeReference.ofType)}]`;
  }

  return typeReference.name;
}

export type SchemaModel = {
  queryTypeName: string;
  mutationTypeName: string | undefined;
  subscriptionTypeName: string | undefined;
  types: SchemaTypeModel[];
};

export type SchemaTypeModel =
  | SchemaScalarTypeModel
  | SchemaEnumTypeModel
  | SchemaObjectTypeModel
  | SchemaInterfaceTypeModel
  | SchemaUnionTypeModel
  | SchemaInputObjectTypeModel;

export type SchemaScalarTypeModel = {
  kind: "SCALAR";
  name: string;
  description: string | undefined;
};

export type SchemaEnumTypeModel = {
  kind: "ENUM";
  name: string;
  description: string | undefined;
  enumValues: SchemaEnumValueModel[];
};

export type SchemaEnumValueModel = {
  name: string;
  description: string | undefined;
  deprecationReason: string | undefined;
};

export type SchemaObjectTypeModel = {
  kind: "OBJECT";
  name: string;
  description: string | undefined;
  interfaces: string[];
  fields: SchemaFieldModel[];
};

export type SchemaInterfaceTypeModel = {
  kind: "INTERFACE";
  name: string;
  description: string | undefined;
  interfaces: string[];
  possibleTypeNames: string[];
  fields: SchemaFieldModel[];
};

export type SchemaUnionTypeModel = {
  kind: "UNION";
  name: string;
  description: string | undefined;
  possibleTypeNames: string[];
};

export type SchemaInputObjectTypeModel = {
  kind: "INPUT_OBJECT";
  name: string;
  description: string | undefined;
  inputFields: SchemaInputFieldModel[];
};

export type SchemaFieldModel = {
  name: string;
  description: string | undefined;
  deprecationReason: string | undefined;
  arguments: SchemaArgumentModel[];
  typeReference: SchemaTypeReference;
};

export type SchemaArgumentModel = {
  name: string;
  description: string | undefined;
  typeReference: SchemaTypeReference;
};

export type SchemaInputFieldModel = {
  name: string;
  description: string | undefined;
  typeReference: SchemaTypeReference;
};

export type SchemaTypeReference =
  | { kind: "NON_NULL"; ofType: SchemaTypeReference }
  | { kind: "LIST"; ofType: SchemaTypeReference }
  | { kind: "NAME"; name: string };
