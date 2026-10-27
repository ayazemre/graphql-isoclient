#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { introspectionQueryText } from "./lib/constants.ts";
import { generateClientFile } from "./lib/generator.ts";
import { cliInputSchema } from "./lib/models.ts";
import { parseIntrospectionJSON, parseSDLFile } from "./lib/parsers.ts";

async function main(): Promise<void> {
  const cliInput = cliInputSchema.parse({
    outputPath: process.argv[3],
    schemaSource: process.argv[2],
  });

  const isSchemaSourceUrl = isUrl(cliInput.schemaSource);
  const schemaModel = await loadSchemaModel(cliInput.schemaSource);

  await generateClientFile(schemaModel, cliInput.outputPath, isSchemaSourceUrl ? cliInput.schemaSource : undefined);
  console.log(`Generated ${cliInput.outputPath}`);
}

async function loadSchemaModel(schemaSource: string) {
  if (isUrl(schemaSource)) {
    const response = await fetch(schemaSource, {
      body: JSON.stringify({ query: introspectionQueryText }),
      headers: { "content-type": "application/json" },
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
