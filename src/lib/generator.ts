import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  SchemaArgumentModel,
  SchemaEnumTypeModel,
  SchemaFieldModel,
  SchemaInputObjectTypeModel,
  SchemaInterfaceTypeModel,
  SchemaModel,
  SchemaObjectTypeModel,
  SchemaTypeModel,
  SchemaTypeReference,
} from "./models.ts";

import { createEnumTypeModel, createFieldTypeModel, createInputTypeModel, createRuntimeModel } from "./runtime.ts";

function tsType(typeReference: SchemaTypeReference, schemaModel: SchemaModel): string {
  if (typeReference.kind === "NON_NULL") {
    return tsType(typeReference.ofType, schemaModel);
  }

  if (typeReference.kind === "LIST") {
    return `${tsType(typeReference.ofType, schemaModel)}[]`;
  }

  const scalarTypeMap: Record<string, string> = {
    Boolean: "boolean",
    Float: "number",
    ID: "string",
    Int: "number",
    String: "string",
  };

  if (scalarTypeMap[typeReference.name] !== undefined) {
    return scalarTypeMap[typeReference.name];
  }

  return typeReference.name;
}

function namedTypeName(typeReference: SchemaTypeReference): string {
  if (typeReference.kind === "NAME") {
    return typeReference.name;
  }

  return namedTypeName(typeReference.ofType);
}

function findTypeModel(schemaModel: SchemaModel, name: string): SchemaTypeModel | undefined {
  return schemaModel.types.find((typeModel) => typeModel.name === name);
}

function renderObjectType(typeModel: SchemaTypeModel, schemaModel: SchemaModel): string {
  if (typeModel.kind === "INPUT_OBJECT") {
    const inputFields = (typeModel as SchemaInputObjectTypeModel).inputFields;
    const fields = inputFields
      .map((inputField) => {
        const optionalMarker = inputField.typeReference.kind === "NON_NULL" ? "" : "?";
        return `  ${inputField.name}${optionalMarker}: ${tsType(inputField.typeReference, schemaModel)};`;
      })
      .join("\n");

    return `export type ${typeModel.name} = {\n${fields}\n};`;
  }

  if (typeModel.kind !== "OBJECT" && typeModel.kind !== "INTERFACE") {
    return "";
  }

  const fields = typeModel.fields
    .map((field) => {
      const optionalMarker = field.typeReference.kind === "NON_NULL" ? "" : "?";
      return `  ${field.name}${optionalMarker}: ${tsType(field.typeReference, schemaModel)};`;
    })
    .join("\n");

  return `export type ${typeModel.name} = {\n${fields}\n};`;
}

export function renderTypeSurface(schemaModel: SchemaModel): string {
  const objectTypes = schemaModel.types
    .filter(
      (typeModel): typeModel is SchemaObjectTypeModel | SchemaInterfaceTypeModel | SchemaInputObjectTypeModel =>
        (typeModel.kind === "OBJECT" || typeModel.kind === "INTERFACE" || typeModel.kind === "INPUT_OBJECT") &&
        typeModel.name.startsWith("__") === false,
    )
    .map((typeModel) => renderObjectType(typeModel, schemaModel))
    .filter((renderedType) => renderedType.length > 0);

  const rootTypeNames = [schemaModel.queryTypeName, schemaModel.mutationTypeName, schemaModel.subscriptionTypeName].filter(
    (typeName): typeName is string => typeName !== undefined,
  );

  const rootTypeAliases = rootTypeNames.map((rootTypeName) => {
    const rootTypeModel = findTypeModel(schemaModel, rootTypeName);

    if (rootTypeModel === undefined || (rootTypeModel.kind !== "OBJECT" && rootTypeModel.kind !== "INTERFACE")) {
      return "";
    }

    const fields = rootTypeModel.fields.map((field) => `  ${field.name}: ${tsType(field.typeReference, schemaModel)};`).join("\n");

    return `type ${rootTypeName}Fields = {\n${fields}\n};`;
  });

  const requestTypes = schemaModel.types
    .filter(
      (typeModel): typeModel is SchemaObjectTypeModel | SchemaInterfaceTypeModel =>
        (typeModel.kind === "OBJECT" || typeModel.kind === "INTERFACE") && typeModel.name.startsWith("__") === false,
    )
    .map((typeModel) => {
      const fields = typeModel.fields
        .map((field: SchemaFieldModel) => {
          const childTypeName = namedTypeName(field.typeReference);
          const childTypeModel = findTypeModel(schemaModel, childTypeName);
          const isCompositeType =
            childTypeModel !== undefined &&
            (childTypeModel.kind === "OBJECT" || childTypeModel.kind === "INTERFACE" || childTypeModel.kind === "UNION");
          const argumentsText =
            field.arguments.length > 0
              ? "{ __arguments?: { " +
                field.arguments
                  .map(
                    (argument: SchemaArgumentModel) =>
                      `${argument.name}${argument.typeReference.kind === "NON_NULL" ? "" : "?"}: ${tsType(argument.typeReference, schemaModel)};`,
                  )
                  .join(" ") +
                " } }"
              : "";

          let valueType: string;

          if (isCompositeType) {
            valueType = argumentsText.length > 0 ? `${argumentsText} & ${childTypeName}Selection` : `${childTypeName}Selection`;
          } else if (argumentsText.length > 0) {
            valueType = argumentsText;
          } else {
            valueType = "boolean";
          }

          return `  ${field.name}?: ${valueType};`;
        })
        .join("\n");

      return `export type ${typeModel.name}Selection = {\n${fields}\n};`;
    });

  const resultTypes = rootTypeNames.map((rootTypeName) => {
    return [
      `type ${rootTypeName}Result<Request> = {\n  [K in keyof Request & keyof ${rootTypeName}Fields]: ResultOf<${rootTypeName}Fields[K & keyof ${rootTypeName}Fields], Request[K]>;\n};`,
      `type ${rootTypeName}SingleKey<Request> = {\n  [K in keyof ${rootTypeName}Fields]: Request extends Record<K, any> & { [P in Exclude<keyof Request, K>]?: never } ? K : never;\n}[keyof ${rootTypeName}Fields];`,
      `export type ${rootTypeName}ReturnType<Request> = ${rootTypeName}SingleKey<Request> extends infer SelectedKey\n  ? SelectedKey extends keyof ${rootTypeName}Fields\n    ? ResultOf<${rootTypeName}Fields[SelectedKey], Request[SelectedKey & keyof Request]>\n    : ${rootTypeName}Result<Request>\n  : ${rootTypeName}Result<Request>;`,
    ].join("\n\n");
  });

  const resultOfHelper = `type ResultOf<Base, Selection> =\n  Selection extends true\n    ? Base\n    : Base extends (infer U)[]\n      ? ResultOf<U, Selection>[]\n      : Base extends object\n        ? { [K in keyof Selection & keyof Base]: ResultOf<Base[K & keyof Base], Selection[K]> }\n        : Base;`;

  const enumTypes = schemaModel.types
    .filter((typeModel) => typeModel.kind === "ENUM" && typeModel.name.startsWith("__") === false)
    .map((typeModel) => {
      const enumTypeModel = typeModel as SchemaEnumTypeModel;
      const values = enumTypeModel.enumValues.map((enumValue) => JSON.stringify(enumValue.name)).join(" | ");
      return `export type ${enumTypeModel.name} = ${values};`;
    });

  return [resultOfHelper, ...enumTypes, ...objectTypes, ...rootTypeAliases, ...requestTypes, ...resultTypes].join("\n\n");
}

export function renderClientConfig(endpoint: string | undefined): string {
  return `const clientConfig = {
  endpoint: ${JSON.stringify(endpoint)},
  headers: {},
};`;
}

export function renderRequestOptionsType(): string {
  return `type RequestOptions = {
  endpoint?: string;
  headers?: Record<string, string>;
};`;
}

export function renderBoundaryComment(): string {
  return `// ----------------------------------------------------------------------------------------------------
// Generated by graphql-isoclient.
// Do not edit below this line.
// ----------------------------------------------------------------------------------------------------`;
}

export function renderQueryFunction(): string {
  return `export async function query<QueryOperation extends QuerySelection>(operation: QueryOperation, requestOptions: RequestOptions = clientConfig): Promise<QueryReturnType<QueryOperation>> {
  const response = await fetch((requestOptions.endpoint ?? clientConfig.endpoint) as string, {
    body: JSON.stringify({ query: buildQuery(operation, queryRuntimeModel, queryRootTypeName, typeContext, "query") }),
    headers: { "content-type": "application/json", ...clientConfig.headers, ...requestOptions.headers },
    method: "POST",
  });

  if (response.ok === false) {
    throw new Error(\`Query request failed with HTTP status \${response.status}\`);
  }

  const result = await response.json();

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    throw new Error(result.errors.map((error: { message?: string }) => error.message ?? "GraphQL error").join("; "));
  }

  const selectedKeys = Object.keys(operation);

  if (selectedKeys.length === 1) {
    return result.data[selectedKeys[0]] as QueryReturnType<QueryOperation>;
  }

  return result.data as QueryReturnType<QueryOperation>;
}`;
}

export function renderMutationFunction(): string {
  return `export async function mutation<MutationOperation extends MutationSelection>(operation: MutationOperation, requestOptions: RequestOptions = clientConfig): Promise<MutationReturnType<MutationOperation>> {
  const response = await fetch((requestOptions.endpoint ?? clientConfig.endpoint) as string, {
    body: JSON.stringify({ query: buildQuery(operation, mutationRuntimeModel, mutationRootTypeName, typeContext, "mutation") }),
    headers: { "content-type": "application/json", ...clientConfig.headers, ...requestOptions.headers },
    method: "POST",
  });

  if (response.ok === false) {
    throw new Error(\`Mutation request failed with HTTP status \${response.status}\`);
  }

  const result = await response.json();

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    throw new Error(result.errors.map((error: { message?: string }) => error.message ?? "GraphQL error").join("; "));
  }

  const selectedKeys = Object.keys(operation);

  if (selectedKeys.length === 1) {
    return result.data[selectedKeys[0]] as MutationReturnType<MutationOperation>;
  }

  return result.data as MutationReturnType<MutationOperation>;
}`;
}

export function renderSubscriptionFunction(): string {
  return `export async function* subscription<SubscriptionOperation extends SubscriptionSelection>(operation: SubscriptionOperation, requestOptions: RequestOptions = clientConfig): AsyncGenerator<SubscriptionReturnType<SubscriptionOperation>, void, unknown> {
  const endpoint = (requestOptions.endpoint ?? clientConfig.endpoint) as string;
  const selectedKeys = Object.keys(operation);
  const queryText = buildQuery(operation, subscriptionRuntimeModel, subscriptionRootTypeName, typeContext, "subscription");
  const response = await fetch(endpoint + "?query=" + encodeURIComponent(queryText), {
    headers: { accept: "text/event-stream", ...clientConfig.headers, ...requestOptions.headers },
    method: "GET",
  });

  if (response.ok === false) {
    throw new Error(\`Subscription request failed with HTTP status \${response.status}\`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamFinished = false;

  while (streamFinished === false) {
    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      streamFinished = true;
    } else {
      buffer += decoder.decode(value, { stream: true });
    }

    let separatorIndex = buffer.indexOf("\\n\\n");

    while (separatorIndex !== -1 || (streamFinished && buffer.trim().length > 0)) {
      const eventEndIndex = separatorIndex !== -1 ? separatorIndex : buffer.length;
      const eventText = buffer.slice(0, eventEndIndex);
      buffer = buffer.slice(separatorIndex !== -1 ? separatorIndex + 2 : buffer.length);

      const dataLine = eventText.split("\\n").find((line) => line.startsWith("data:"));

      if (dataLine !== undefined) {
        const dataText = dataLine.slice(5).trim();

        if (dataText.length > 0) {
          const parsed = JSON.parse(dataText);

          if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
            throw new Error(parsed.errors.map((error: { message?: string }) => error.message ?? "GraphQL error").join("; "));
          }

          if (parsed.data !== undefined) {
            if (selectedKeys.length === 1) {
              yield parsed.data[selectedKeys[0]] as SubscriptionReturnType<SubscriptionOperation>;
            } else {
              yield parsed.data as SubscriptionReturnType<SubscriptionOperation>;
            }
          }
        }
      }

      separatorIndex = buffer.indexOf("\\n\\n");
    }
  }
}`;
}

export function renderHelpers(): string {
  return `type TypeContext = {
  enumTypeModel: Record<string, string[]>;
  fieldTypeModel: Record<string, Record<string, { argumentTypes: Record<string, string>; childTypeName: string }>>;
  inputTypeModel: Record<string, Record<string, string>>;
};

function buildQuery(operation: unknown, runtimeModel: unknown, rootTypeName: string, typeContext: TypeContext, operationType: string = "query"): string {
  function serializeValue(value: unknown, typeReferenceText: string | undefined): string {
    if (value === null || value === undefined) {
      return "null";
    }

    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }

    if (typeof value === "number") {
      return String(value);
    }

    if (typeof value === "string") {
      if (typeReferenceText !== undefined && typeContext.enumTypeModel[typeReferenceText] !== undefined) {
        return value;
      }

      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      const elementTypeReferenceText = typeReferenceText?.startsWith("[") ? typeReferenceText.slice(1, -1) : undefined;

      return "[" + value.map((entry) => serializeValue(entry, elementTypeReferenceText)).join(", ") + "]";
    }

    if (typeof value === "object") {
      const inputFieldTypes = typeReferenceText !== undefined ? typeContext.inputTypeModel[typeReferenceText] : undefined;
      const entries = Object.entries(value as Record<string, unknown>).map(
        ([entryKey, entryValue]) => entryKey + ": " + serializeValue(entryValue, inputFieldTypes?.[entryKey]),
      );

      return "{" + entries.join(", ") + "}";
    }

    return JSON.stringify(value);
  }

  function selection(requestValue: unknown, modelValue: unknown, parentTypeName: string): string {
    if (requestValue === null || typeof requestValue !== "object") {
      return "";
    }

    const requestRecord = requestValue as Record<string, unknown>;
    const modelRecord = (modelValue !== null && typeof modelValue === "object") ? (modelValue as Record<string, unknown>) : {};
    const parentFieldTypes = typeContext.fieldTypeModel[parentTypeName] ?? {};

    return Object.keys(requestRecord)
      .filter((key) => key !== "__arguments")
      .map((key) => {
        const nestedRequest = requestRecord[key];
        const nestedModel = modelRecord[key];
        const fieldEntry = parentFieldTypes[key];
        const argumentEntries = (nestedRequest !== null && typeof nestedRequest === "object" && "__arguments" in (nestedRequest as Record<string, unknown>))
          ? Object.entries((nestedRequest as Record<string, unknown>).__arguments as Record<string, unknown>)
          : [];
        const argumentsText = argumentEntries.length > 0
          ? "(" + argumentEntries.map(([argumentName, argumentValue]) => argumentName + ": " + serializeValue(argumentValue, fieldEntry?.argumentTypes[argumentName])).join(", ") + ")"
          : "";
        const nestedSelection = (nestedRequest !== null && typeof nestedRequest === "object")
          ? selection(nestedRequest, nestedModel, fieldEntry?.childTypeName ?? "")
          : "";
        const body = nestedSelection.length > 0 ? " { " + nestedSelection + " }" : "";

        return key + argumentsText + body;
      })
      .join(" ");
  }

  return operationType + " { " + selection(operation, runtimeModel, rootTypeName) + " }";
}`;
}

export function renderRuntimeModels(schemaModel: SchemaModel): string {
  const sections: string[] = [];

  sections.push(`export const queryRootTypeName = ${JSON.stringify(schemaModel.queryTypeName)};`);
  sections.push(`export const queryRuntimeModel = ${JSON.stringify(createRuntimeModel(schemaModel, schemaModel.queryTypeName))};`);

  if (schemaModel.mutationTypeName !== undefined) {
    sections.push(`export const mutationRootTypeName = ${JSON.stringify(schemaModel.mutationTypeName)};`);
    sections.push(`export const mutationRuntimeModel = ${JSON.stringify(createRuntimeModel(schemaModel, schemaModel.mutationTypeName))};`);
  }

  if (schemaModel.subscriptionTypeName !== undefined) {
    sections.push(`export const subscriptionRootTypeName = ${JSON.stringify(schemaModel.subscriptionTypeName)};`);
    sections.push(`export const subscriptionRuntimeModel = ${JSON.stringify(createRuntimeModel(schemaModel, schemaModel.subscriptionTypeName))};`);
  }

  sections.push(
    `const typeContext: TypeContext = {\n  enumTypeModel: ${JSON.stringify(createEnumTypeModel(schemaModel))},\n  fieldTypeModel: ${JSON.stringify(createFieldTypeModel(schemaModel))},\n  inputTypeModel: ${JSON.stringify(createInputTypeModel(schemaModel))},\n};`,
  );

  return sections.join("\n\n");
}

export async function generateClientFile(schemaModel: SchemaModel, outputPath: string, endpoint?: string): Promise<void> {
  const fileSections: string[] = [renderClientConfig(endpoint), renderBoundaryComment(), renderQueryFunction()];

  if (schemaModel.mutationTypeName !== undefined) {
    fileSections.push(renderMutationFunction());
  }

  if (schemaModel.subscriptionTypeName !== undefined) {
    fileSections.push(renderSubscriptionFunction());
  }

  fileSections.push(renderHelpers(), renderRuntimeModels(schemaModel), renderRequestOptionsType(), renderTypeSurface(schemaModel));

  const fileText = `${fileSections.join("\n\n")}\n`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, fileText, "utf8");
}
