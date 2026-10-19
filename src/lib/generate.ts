import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { RuntimeSectionFileName } from "./runtimeSections.ts";
import type { SchemaModel } from "./schemaModel.ts";

import { buildSchemaRuntimeData } from "./fieldMap.ts";
import { runtimeSectionFileNames } from "./runtimeSections.ts";
import { loadSchemaFromEndpoint, loadSchemaFromIntrospectionJson, resolveRootTypeNames } from "./schema.ts";
import { assembleGeneratedFile, renderClientConfig, renderRuntimeDataLiterals } from "./typescriptMap.ts";
import { renderOperationExports, renderTypeSurface } from "./typeSurface.ts";

export async function readRuntimeSectionSource(sectionFileName: RuntimeSectionFileName): Promise<string> {
  return readFile(new URL(`./${sectionFileName}`, import.meta.url), "utf8");
}

export function stripRuntimeSectionModuleSyntax(sectionSource: string): string {
  const keptSourceLines: string[] = [];
  let isInsideImportStatement = false;

  for (const sourceLine of sectionSource.split("\n")) {
    const trimmedSourceLine = sourceLine.trim();

    if (isInsideImportStatement) {
      if (trimmedSourceLine.endsWith(";")) {
        isInsideImportStatement = false;
      }

      continue;
    }

    if (trimmedSourceLine.startsWith("import ")) {
      if (trimmedSourceLine.endsWith(";") === false) {
        isInsideImportStatement = true;
      }

      continue;
    }

    keptSourceLines.push(stripExportKeyword(sourceLine));
  }

  return keptSourceLines.join("\n");
}

function stripExportKeyword(sourceLine: string): string {
  const hasExportKeyword =
    sourceLine.startsWith("export function ") || sourceLine.startsWith("export async function ") || sourceLine.startsWith("export const ");

  return hasExportKeyword ? sourceLine.slice("export ".length) : sourceLine;
}

export async function renderGeneratedFile(schemaModel: SchemaModel, options: GenerateOptions): Promise<string> {
  const rootTypeNames = resolveRootTypeNames(schemaModel);
  const includeDeprecatedFields = options.includeDeprecatedFields ?? false;
  const schemaRuntimeData = buildSchemaRuntimeData(schemaModel, includeDeprecatedFields);
  const runtimeSections = await renderRuntimeSectionsSource();

  return assembleGeneratedFile({
    clientConfig: renderClientConfig(options.introspectionJsonFile ?? options.schemaEndpoint ?? "unknown schema source", options.endpoint),
    operationExports: renderOperationExports(schemaModel, rootTypeNames, includeDeprecatedFields),
    runtimeDataLiterals: renderRuntimeDataLiterals(schemaRuntimeData),
    runtimeSections,
    typeSurface: renderTypeSurface(schemaModel, rootTypeNames, includeDeprecatedFields),
  });
}

export async function generateClient(options: GenerateOptions): Promise<GeneratedFileWriteResult> {
  const schemaModel = await loadSchemaForGenerateOptions(options);
  const generatedFileText = await renderGeneratedFile(schemaModel, options);

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, generatedFileText, "utf8");

  return {
    byteLength: Buffer.byteLength(generatedFileText, "utf8"),
    outputFile: options.output,
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
