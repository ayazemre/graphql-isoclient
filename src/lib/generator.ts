import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  SchemaArgumentModel,
  SchemaFieldModel,
  SchemaInterfaceTypeModel,
  SchemaModel,
  SchemaObjectTypeModel,
  SchemaTypeModel,
  SchemaTypeReference,
} from "./models.ts";

import { createRuntimeModel } from "./runtime.ts";

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
      (typeModel): typeModel is SchemaObjectTypeModel | SchemaInterfaceTypeModel =>
        (typeModel.kind === "OBJECT" || typeModel.kind === "INTERFACE") && typeModel.name.startsWith("__") === false,
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

    return `export type ${rootTypeName}Fields = {\n${fields}\n};`;
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
      `export type ${rootTypeName}Result<Request> = {\n  [K in keyof Request & keyof ${rootTypeName}Fields]: ResultOf<${rootTypeName}Fields[K & keyof ${rootTypeName}Fields], Request[K]>;\n};`,
      `export type ${rootTypeName}SingleKey<Request> = {\n  [K in keyof ${rootTypeName}Fields]: Request extends Record<K, any> & { [P in Exclude<keyof Request, K>]?: never } ? K : never;\n}[keyof ${rootTypeName}Fields];`,
      `export type ${rootTypeName}ReturnType<Request> = ${rootTypeName}SingleKey<Request> extends infer SelectedKey\n  ? SelectedKey extends keyof ${rootTypeName}Fields\n    ? ResultOf<${rootTypeName}Fields[SelectedKey], Request[SelectedKey & keyof Request]>\n    : ${rootTypeName}Result<Request>\n  : ${rootTypeName}Result<Request>;`,
    ].join("\n\n");
  });

  const resultOfHelper = `export type ResultOf<Base, Selection> =\n  Selection extends true\n    ? Base\n    : Base extends (infer U)[]\n      ? ResultOf<U, Selection>[]\n      : Base extends object\n        ? { [K in keyof Selection & keyof Base]: ResultOf<Base[K & keyof Base], Selection[K]> }\n        : Base;`;

  return [resultOfHelper, ...objectTypes, ...rootTypeAliases, ...requestTypes, ...resultTypes].join("\n\n");
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
    body: JSON.stringify({ query: buildQuery(operation, queryRuntimeModel, "query") }),
    headers: { "content-type": "application/json", ...clientConfig.headers, ...requestOptions.headers },
    method: "POST",
  });

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
    body: JSON.stringify({ query: buildQuery(operation, mutationRuntimeModel, "mutation") }),
    headers: { "content-type": "application/json", ...clientConfig.headers, ...requestOptions.headers },
    method: "POST",
  });

  const result = await response.json();

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    throw new Error(result.errors.map((error: { message?: string }) => error.message ?? "GraphQL error").join("; "));
  }

  return result.data as MutationReturnType<MutationOperation>;
}`;
}

export function renderSubscriptionFunction(): string {
  return `export async function* subscription<SubscriptionOperation extends SubscriptionSelection>(operation: SubscriptionOperation, requestOptions: RequestOptions = clientConfig): AsyncGenerator<SubscriptionReturnType<SubscriptionOperation>, void, unknown> {
  const endpoint = (requestOptions.endpoint ?? clientConfig.endpoint) as string;
  const queryText = buildQuery(operation, subscriptionRuntimeModel, "subscription");
  const response = await fetch(endpoint + "?query=" + encodeURIComponent(queryText), {
    headers: { accept: "text/event-stream", ...clientConfig.headers, ...requestOptions.headers },
    method: "GET",
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }

    let separatorIndex = buffer.indexOf("\\n\\n");

    while (separatorIndex !== -1) {
      const eventText = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLine = eventText.split("\\n").find((line) => line.startsWith("data:"));

      if (dataLine !== undefined) {
        const dataText = dataLine.slice(5).trim();

        if (dataText.length > 0) {
          const parsed = JSON.parse(dataText);

          if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
            throw new Error(parsed.errors.map((error: { message?: string }) => error.message ?? "GraphQL error").join("; "));
          }

          if (parsed.data !== undefined) {
            yield parsed.data as SubscriptionReturnType<SubscriptionOperation>;
          }
        }
      }

      separatorIndex = buffer.indexOf("\\n\\n");
    }

    if (done) {
      break;
    }
  }
}`;
}

export function renderHelpers(): string {
  return `function buildQuery(operation: unknown, runtimeModel: unknown, operationType: string = "query"): string {
  function selection(requestValue: unknown, modelValue: unknown): string {
    if (requestValue === null || typeof requestValue !== "object") {
      return "";
    }

    const requestRecord = requestValue as Record<string, unknown>;
    const modelRecord = (modelValue !== null && typeof modelValue === "object") ? (modelValue as Record<string, unknown>) : {};

    return Object.keys(requestRecord)
      .filter((key) => key !== "__arguments")
      .map((key) => {
        const nestedRequest = requestRecord[key];
        const nestedModel = modelRecord[key];
        const argumentEntries = (nestedRequest !== null && typeof nestedRequest === "object" && "__arguments" in (nestedRequest as Record<string, unknown>))
          ? Object.entries((nestedRequest as Record<string, unknown>).__arguments as Record<string, unknown>)
          : [];
        const argumentsText = argumentEntries.length > 0
          ? "(" + argumentEntries.map(([argumentName, argumentValue]) => argumentName + ": " + JSON.stringify(argumentValue)).join(", ") + ")"
          : "";
        const nestedSelection = (nestedRequest !== null && typeof nestedRequest === "object") ? selection(nestedRequest, nestedModel) : "";
        const body = nestedSelection.length > 0 ? " { " + nestedSelection + " }" : "";

        return key + argumentsText + body;
      })
      .join(" ");
  }

  return operationType + " { " + selection(operation, runtimeModel) + " }";
}`;
}

export function renderRuntimeModels(schemaModel: SchemaModel): string {
  const sections: string[] = [];

  sections.push(`export const queryRuntimeModel = ${JSON.stringify(createRuntimeModel(schemaModel, schemaModel.queryTypeName))};`);

  if (schemaModel.mutationTypeName !== undefined) {
    sections.push(`export const mutationRuntimeModel = ${JSON.stringify(createRuntimeModel(schemaModel, schemaModel.mutationTypeName))};`);
  }

  if (schemaModel.subscriptionTypeName !== undefined) {
    sections.push(`export const subscriptionRuntimeModel = ${JSON.stringify(createRuntimeModel(schemaModel, schemaModel.subscriptionTypeName))};`);
  }

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
