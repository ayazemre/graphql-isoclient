import type { GenerateOptions } from "./generate.ts";

import { generateClient } from "./generate.ts";

export function parseCliOptions(commandLineArguments: ReadonlyArray<string>): GenerateOptions {
  checkKnownFlags(commandLineArguments);

  const outputPath = readRequiredFlagValue("output", commandLineArguments);
  const schemaEndpoint = readOptionalFlagValue("schema-endpoint", commandLineArguments);
  const introspectionJsonFile = readOptionalFlagValue("introspection-json-file", commandLineArguments);

  if (schemaEndpoint === undefined && introspectionJsonFile === undefined) {
    throw new Error("either --schema-endpoint or --introspection-json-file must be provided");
  }

  return {
    endpoint: readOptionalFlagValue("endpoint", commandLineArguments),
    headers: readFlagHeaderValues("header", commandLineArguments),
    includeDeprecatedFields: readBooleanFlagValue("include-deprecated-fields", commandLineArguments),
    introspectionJsonFile,
    output: outputPath,
    schemaEndpoint,
  };
}

export async function runCli(commandLineArguments: ReadonlyArray<string>): Promise<number> {
  const [commandName, ...commandFlagArguments] = commandLineArguments;

  if (commandName === undefined) {
    printUsage(true);

    return 1;
  }

  if (commandName === "help") {
    printUsage(false);

    return 0;
  }

  if (commandName !== "generate") {
    printMessage(`unknown command ${commandName}`);

    return 1;
  }

  try {
    const generateOptions = parseCliOptions(commandFlagArguments);
    const generationResult = await generateClient(generateOptions);

    printMessage(`generated ${generationResult.byteLength} bytes`);

    process.stdout.write(`${generationResult.outputFile}\n`);

    return 0;
  } catch (cliError) {
    printMessage(readErrorMessage(cliError));

    return 1;
  }
}

const knownFlagNames = ["endpoint", "header", "include-deprecated-fields", "introspection-json-file", "output", "schema-endpoint"];

function checkKnownFlags(commandLineArguments: ReadonlyArray<string>): void {
  for (const commandLineArgument of commandLineArguments) {
    if (commandLineArgument.startsWith("--") === false) {
      throw new Error(`unexpected argument ${commandLineArgument}`);
    }

    const flagName = commandLineArgument.slice(2, commandLineArgument.indexOf("=") === -1 ? undefined : commandLineArgument.indexOf("="));

    if (knownFlagNames.includes(flagName) === false) {
      throw new Error(`unknown flag --${flagName}`);
    }
  }
}

function readRequiredFlagValue(flagName: string, commandLineArguments: ReadonlyArray<string>): string {
  const flagValue = readOptionalFlagValue(flagName, commandLineArguments);

  if (flagValue === undefined) {
    throw new Error(`missing required flag --${flagName}`);
  }

  return flagValue;
}

function readOptionalFlagValue(flagName: string, commandLineArguments: ReadonlyArray<string>): string | undefined {
  const flagPrefix = `--${flagName}=`;

  for (const commandLineArgument of commandLineArguments) {
    if (commandLineArgument.startsWith(flagPrefix) === false) {
      continue;
    }

    const flagValue = commandLineArgument.slice(flagPrefix.length);

    if (flagValue.length === 0) {
      throw new Error(`flag --${flagName} must not be empty`);
    }

    return flagValue;
  }

  return undefined;
}

function readBooleanFlagValue(flagName: string, commandLineArguments: ReadonlyArray<string>): boolean | undefined {
  const flagValue = readOptionalFlagValue(flagName, commandLineArguments);

  if (flagValue === undefined) {
    return undefined;
  }

  if (flagValue !== "true" && flagValue !== "false") {
    throw new Error(`flag --${flagName} must be true or false`);
  }

  return flagValue === "true";
}

function readFlagHeaderValues(flagName: string, commandLineArguments: ReadonlyArray<string>): Record<string, string> | undefined {
  const headerValues: Record<string, string> = {};
  const flagPrefix = `--${flagName}=`;

  for (const commandLineArgument of commandLineArguments) {
    if (commandLineArgument.startsWith(flagPrefix) === false) {
      continue;
    }

    const headerValue = commandLineArgument.slice(flagPrefix.length);
    const separatorIndex = headerValue.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex === headerValue.length - 1) {
      throw new Error(`flag --${flagName} must use the name:value format`);
    }

    headerValues[headerValue.slice(0, separatorIndex)] = headerValue.slice(separatorIndex + 1);
  }

  if (Object.keys(headerValues).length === 0) {
    return undefined;
  }

  return headerValues;
}

function printUsage(writeToStandardError: boolean): void {
  const writeLine = writeToStandardError
    ? (text: string): void => {
        process.stderr.write(`${text}\n`);
      }
    : (text: string): void => {
        process.stdout.write(`${text}\n`);
      };

  writeLine("Usage: graphql-isoclient <command> [--flag=value]");
  writeLine("");
  writeLine("Commands:");
  writeLine("  generate    Generate a typed client from a GraphQL schema");
  writeLine("  help        Show this message");
  writeLine("");
  writeLine("Flags:");
  writeLine("  --schema-endpoint=<url>           Read the schema from a GraphQL introspection endpoint");
  writeLine("  --introspection-json-file=<path>  Read the schema from a saved introspection payload");
  writeLine("  --output=<path>                   Path of the generated client file");
  writeLine("  --endpoint=<url>                  Default endpoint baked into the generated client");
  writeLine("  --header=<name:value>             Header for the introspection request, repeatable");
  writeLine("  --include-deprecated-fields=<bool> Include deprecated fields, true or false");
}

function printMessage(message: string): void {
  process.stderr.write(`${message}\n`);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
