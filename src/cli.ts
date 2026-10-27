#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { introspectionQueryText } from "./lib/constants.ts";
import { generateClientFile } from "./lib/generator.ts";
import { cliInputSchema } from "./lib/models.ts";
import { parseIntrospectionJSON, parseSDLFile } from "./lib/parsers.ts";

type ParsedCliArguments = {
  headers: Record<string, string>;
  outputPath: string;
  schemaSource: string;
};

type HeaderParseResult = { kind: "success"; headers: Record<string, string> } | { kind: "failure"; errorMessage: string };

function parseHeadersJson(headersText: string): HeaderParseResult {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(headersText);
  } catch {
    return { errorMessage: '--headers must be valid JSON, for example --headers=\'{"authorization":"Bearer token"}\'', kind: "failure" };
  }

  if (parsedValue === null || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return { errorMessage: "--headers must be a JSON object of header names to values", kind: "failure" };
  }

  const headers: Record<string, string> = {};

  for (const [headerName, headerValue] of Object.entries(parsedValue)) {
    if (typeof headerValue !== "string" && typeof headerValue !== "number" && typeof headerValue !== "boolean") {
      return { errorMessage: `--headers value for "${headerName}" must be a string, number, or boolean`, kind: "failure" };
    }

    headers[headerName] = String(headerValue);
  }

  return { headers, kind: "success" };
}

type ParsedCliArgumentsResult = { kind: "success"; parsedArguments: ParsedCliArguments } | { kind: "failure"; errorMessage: string };

function parseCliArguments(argumentList: string[]): ParsedCliArgumentsResult {
  let headers: Record<string, string> = {};
  let outputPath = "";
  let schemaSource = "";

  for (const argument of argumentList) {
    if (argument.startsWith("--schema-source=")) {
      schemaSource = argument.slice("--schema-source=".length);
    } else if (argument.startsWith("--output=")) {
      outputPath = argument.slice("--output=".length);
    } else if (argument.startsWith("--headers=")) {
      const headersResult = parseHeadersJson(argument.slice("--headers=".length));

      if (headersResult.kind === "failure") {
        return headersResult;
      }

      headers = headersResult.headers;
    }
  }

  return { kind: "success", parsedArguments: { headers, outputPath, schemaSource } };
}

async function main(): Promise<void> {
  const parsedArgumentsResult = parseCliArguments(process.argv.slice(2));

  if (parsedArgumentsResult.kind === "failure") {
    throw new Error(parsedArgumentsResult.errorMessage);
  }

  const parsedArguments = parsedArgumentsResult.parsedArguments;
  const cliInput = cliInputSchema.parse({
    headers: parsedArguments.headers,
    outputPath: parsedArguments.outputPath,
    schemaSource: parsedArguments.schemaSource,
  });

  const schemaModel = await loadSchemaModel(cliInput.schemaSource, cliInput.headers ?? {});

  await generateClientFile(schemaModel, cliInput.outputPath);
  console.log(`Generated ${cliInput.outputPath}`);
}

async function loadSchemaModel(schemaSource: string, headers: Record<string, string>) {
  if (isUrl(schemaSource)) {
    const response = await fetch(schemaSource, {
      body: JSON.stringify({ query: introspectionQueryText }),
      headers: { "content-type": "application/json", ...headers },
      method: "POST",
    });

    if (response.ok === false) {
      throw new Error(`Introspection request failed with status ${response.status}`);
    }

    const payloadText = await response.text();

    return parseIntrospectionJSON(payloadText);
  }

  const fileText = await readFile(schemaSource, "utf8");

  try {
    return parseIntrospectionJSON(fileText);
  } catch {
    return parseSDLFile(fileText);
  }
}

function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
