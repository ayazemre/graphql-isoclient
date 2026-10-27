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

function parseCliArguments(argumentList: string[]): ParsedCliArguments {
  const headers: Record<string, string> = {};
  let outputPath = "";
  let schemaSource = "";
  const positionalArguments: string[] = [];

  for (const argument of argumentList) {
    if (argument.startsWith("--schema-source=")) {
      schemaSource = argument.slice("--schema-source=".length);
    } else if (argument.startsWith("--output=")) {
      outputPath = argument.slice("--output=".length);
    } else if (argument.startsWith("--headers=")) {
      const headerValue = argument.slice("--headers=".length);

      try {
        const parsedHeaders = JSON.parse(headerValue) as Record<string, unknown>;

        if (parsedHeaders !== null && typeof parsedHeaders === "object" && Array.isArray(parsedHeaders) === false) {
          for (const [headerName, headerValueEntry] of Object.entries(parsedHeaders)) {
            headers[headerName] = String(headerValueEntry);
          }
        }
      } catch {
        // Ignore malformed header JSON and fall back to individual header flags.
      }
    } else if (argument.startsWith("--header=")) {
      const headerEntry = argument.slice("--header=".length);
      const separatorIndex = headerEntry.indexOf(":");

      if (separatorIndex !== -1) {
        const headerName = headerEntry.slice(0, separatorIndex).trim();
        const headerValue = headerEntry.slice(separatorIndex + 1).trim();

        headers[headerName] = headerValue;
      }
    } else if (argument.startsWith("--") === false) {
      positionalArguments.push(argument);
    }
  }

  if (schemaSource === "" && positionalArguments.length >= 1) {
    schemaSource = positionalArguments[0];
  }

  if (outputPath === "" && positionalArguments.length >= 2) {
    outputPath = positionalArguments[1];
  }

  return { headers, outputPath, schemaSource };
}

async function main(): Promise<void> {
  const parsedArguments = parseCliArguments(process.argv.slice(2));
  const cliInput = cliInputSchema.parse({
    headers: parsedArguments.headers,
    outputPath: parsedArguments.outputPath,
    schemaSource: parsedArguments.schemaSource,
  });

  const isSchemaSourceUrl = isUrl(cliInput.schemaSource);

  const schemaModel = await loadSchemaModel(cliInput.schemaSource, cliInput.headers ?? {});

  await generateClientFile(schemaModel, cliInput.outputPath, isSchemaSourceUrl ? cliInput.schemaSource : undefined);
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
