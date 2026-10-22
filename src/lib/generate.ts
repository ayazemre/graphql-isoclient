import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { RuntimeSectionDefinition, RuntimeSectionFileName } from "./runtimeSections.ts";
import type { RootTypeNames } from "./schema.ts";
import type { SchemaModel } from "./schemaModel.ts";

import { buildSchemaRuntimeData } from "./fieldMap.ts";
import { runtimeSectionDefinitions } from "./runtimeSections.ts";
import { loadSchemaFromEndpoint, loadSchemaFromIntrospectionJson, resolveRootTypeNames } from "./schema.ts";
import { assembleGeneratedFile, preserveExistingConfiguration, renderClientConfig, renderRuntimeDataLiterals } from "./typescriptMap.ts";
import { renderOperationExports, renderTypeSurface } from "./typeSurface.ts";

export async function readRuntimeSectionSource(sectionFileName: RuntimeSectionFileName): Promise<string> {
  const sourceMapFileName = sectionFileName.replace(/\.ts$/, ".js.map");
  const sourceMapText = await readFile(new URL(`./${sourceMapFileName}`, import.meta.url), "utf8").catch(() => undefined);

  if (sourceMapText !== undefined) {
    const embeddedSource = readEmbeddedSourceFromMap(sourceMapText, sectionFileName);

    if (embeddedSource !== undefined) {
      return embeddedSource;
    }
  }

  return readFile(new URL(`./${sectionFileName}`, import.meta.url), "utf8");
}

function readEmbeddedSourceFromMap(sourceMapText: string, sectionFileName: string): string | undefined {
  let sourceMap: unknown;

  try {
    sourceMap = JSON.parse(sourceMapText);
  } catch {
    return undefined;
  }

  if (!sourceMap || typeof sourceMap !== "object" || Array.isArray(sourceMap)) {
    return undefined;
  }

  const sourceMapRecord = sourceMap as { sources?: unknown; sourcesContent?: unknown };

  if (!Array.isArray(sourceMapRecord.sources) || !Array.isArray(sourceMapRecord.sourcesContent)) {
    return undefined;
  }

  const sourceIndex = sourceMapRecord.sources.findIndex((sourcePath) => typeof sourcePath === "string" && sourcePath.endsWith(sectionFileName));

  if (sourceIndex === -1) {
    return undefined;
  }

  const embeddedSource = sourceMapRecord.sourcesContent[sourceIndex];

  return typeof embeddedSource === "string" ? embeddedSource : undefined;
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
  const runtimeSections = await renderRuntimeSectionsSource(rootTypeNames);

  return assembleGeneratedFile({
    clientConfig: renderClientConfig(options.introspectionJsonFile ?? options.schemaEndpoint ?? "unknown schema source", options.endpoint),
    operationExports: renderOperationExports(rootTypeNames),
    runtimeDataLiterals: renderRuntimeDataLiterals(schemaRuntimeData),
    runtimeSections,
    typeSurface: renderTypeSurface(schemaModel, rootTypeNames, includeDeprecatedFields),
  });
}

export async function generateClient(options: GenerateOptions): Promise<GeneratedFileWriteResult> {
  const schemaModel = await loadSchemaForGenerateOptions(options);
  const generatedFileText = await renderGeneratedFile(schemaModel, options);
  const existingFileText = await readExistingFileText(options.output);
  const preservedFileResult = preserveExistingConfiguration(existingFileText, generatedFileText);

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, preservedFileResult.fileText, "utf8");

  return {
    byteLength: Buffer.byteLength(preservedFileResult.fileText, "utf8"),
    configurationPreserved: preservedFileResult.configurationPreserved,
    outputFile: options.output,
  };
}

async function readExistingFileText(outputFilePath: string): Promise<string | undefined> {
  try {
    return await readFile(outputFilePath, "utf8");
  } catch (readError) {
    if (isMissingFileError(readError)) {
      return undefined;
    }

    throw readError;
  }
}

function isMissingFileError(readError: unknown): boolean {
  return readError instanceof Error && "code" in readError && (readError as { code: string }).code === "ENOENT";
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

async function renderRuntimeSectionsSource(rootTypeNames: RootTypeNames): Promise<string> {
  const includedSectionFileNames = runtimeSectionDefinitions
    .filter((sectionDefinition) => isRuntimeSectionIncluded(sectionDefinition, rootTypeNames))
    .map((sectionDefinition) => sectionDefinition.fileName);

  const sectionSources = await Promise.all(includedSectionFileNames.map((sectionFileName) => readRuntimeSectionSource(sectionFileName)));

  return sectionSources.map((sectionSource) => stripRuntimeSectionModuleSyntax(sectionSource).trimEnd()).join("\n\n");
}

function isRuntimeSectionIncluded(sectionDefinition: RuntimeSectionDefinition, rootTypeNames: RootTypeNames): boolean {
  if (sectionDefinition.requiredRootType === undefined) {
    return true;
  }

  return rootTypeNames[sectionDefinition.requiredRootType] !== undefined;
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
  byteLength: number;
  configurationPreserved: boolean;
  outputFile: string;
};
