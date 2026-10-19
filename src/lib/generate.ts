import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { SchemaModel } from "./schemaModel.ts";

import { buildSchemaRuntimeData } from "./fieldMap.ts";
import { loadSchemaFromEndpoint, loadSchemaFromIntrospectionJson, resolveRootTypeNames } from "./schema.ts";
import { assembleGeneratedFile, renderGeneratedFileHeader, renderOperationExports, renderRuntimeDataLiterals } from "./typescriptMap.ts";

export const runtimeSectionFileNames = ["transport.ts", "documentBuilder.ts", "queryBuilder.ts"] as const;

export async function readRuntimeSectionSource(sectionFileName: RuntimeSectionFileName): Promise<string> {
  return readFile(new URL(`./${sectionFileName}`, import.meta.url), "utf8");
}

export function stripRuntimeSectionModuleSyntax(sectionSource: string): string {
  return sectionSource
    .split("\n")
    .filter((sourceLine) => sourceLine.startsWith("import ") === false)
    .map((sourceLine) =>
      sourceLine.startsWith("export function ") || sourceLine.startsWith("export async function ") || sourceLine.startsWith("export const ")
        ? sourceLine.slice("export ".length)
        : sourceLine,
    )
    .join("\n");
}

export async function renderGeneratedFile(schemaModel: SchemaModel, options: GenerateOptions): Promise<string> {
  const rootTypeNames = resolveRootTypeNames(schemaModel);
  const schemaRuntimeData = buildSchemaRuntimeData(schemaModel, options.includeDeprecatedFields ?? false);
  const runtimeSections = await renderRuntimeSectionsSource();

  return assembleGeneratedFile({
    fileHeader: renderGeneratedFileHeader(options.introspectionJsonFile ?? options.schemaEndpoint ?? "unknown schema source"),
    runtimeDataLiterals: renderRuntimeDataLiterals(schemaRuntimeData, options.endpoint),
    typeSurface: "",
    runtimeSections,
    operationExports: renderOperationExports(rootTypeNames),
  });
}

export async function generateClient(options: GenerateOptions): Promise<GeneratedFileWriteResult> {
  const schemaModel = await loadSchemaForGenerateOptions(options);
  const generatedFileText = await renderGeneratedFile(schemaModel, options);

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, generatedFileText, "utf8");

  return {
    outputFile: options.output,
    byteLength: Buffer.byteLength(generatedFileText, "utf8"),
  };
}

async function loadSchemaForGenerateOptions(options: GenerateOptions): Promise<SchemaModel> {
  if (options.introspectionJsonFile !== undefined) {
    return loadSchemaFromIntrospectionJson(options.introspectionJsonFile);
  }

  if (options.schemaEndpoint !== undefined) {
    return loadSchemaFromEndpoint(options.schemaEndpoint, options.headers);
  }

  throw new Error("Generate options must define introspectionJsonFile or schemaEndpoint");
}

async function renderRuntimeSectionsSource(): Promise<string> {
  const sectionSources = await Promise.all(runtimeSectionFileNames.map((sectionFileName) => readRuntimeSectionSource(sectionFileName)));

  return sectionSources.map((sectionSource) => stripRuntimeSectionModuleSyntax(sectionSource).trimEnd()).join("\n\n");
}

export type GenerateOptions = {
  introspectionJsonFile?: string;
  schemaEndpoint?: string;
  output: string;
  endpoint?: string;
  headers?: Record<string, string>;
  includeDeprecatedFields?: boolean;
};

export type GeneratedFileWriteResult = {
  outputFile: string;
  byteLength: number;
};

export type RuntimeSectionFileName = (typeof runtimeSectionFileNames)[number];
