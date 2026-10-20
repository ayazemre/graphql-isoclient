import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";

import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { parseCliOptions, runCli } from "#src/lib/cli.ts";

describe("Command Line Interface", () => {
  test("Parse Options From Flags", () => {
    const generateOptions = parseCliOptions([
      "--schema-endpoint=https://example.com/graphql",
      "--output=generated/isoclient.ts",
      "--header=authorization:Bearer token",
      "--include-deprecated-fields=true",
    ]);

    assert.deepEqual(generateOptions, {
      endpoint: undefined,
      headers: { authorization: "Bearer token" },
      includeDeprecatedFields: true,
      introspectionJsonFile: undefined,
      output: "generated/isoclient.ts",
      schemaEndpoint: "https://example.com/graphql",
    });
  });

  test("Missing Required Flag", () => {
    assert.throws(() => parseCliOptions(["--schema-endpoint=https://example.com/graphql"]), {
      message: "missing required flag --output",
    });
  });

  test("Unknown Flag", () => {
    assert.throws(() => parseCliOptions(["--output=isoclient.ts", "--unknown=value"]), {
      message: "unknown flag --unknown",
    });
  });

  test("Missing Schema Source", () => {
    assert.throws(() => parseCliOptions(["--output=isoclient.ts"]), {
      message: "either --schema-endpoint or --introspection-json-file must be provided",
    });
  });

  test("Empty Flag Value", () => {
    assert.throws(() => parseCliOptions(["--output="]), { message: "flag --output must not be empty" });
  });

  test("Unknown Command", async () => {
    const commandResult = await captureCommandOutput(["unknown"]);

    assert.equal(commandResult.exitCode, 1);
    assert.ok(commandResult.standardError.includes("unknown command unknown"));
  });

  test("Help Command", async () => {
    const commandResult = await captureCommandOutput(["help"]);

    assert.equal(commandResult.exitCode, 0);
    assert.ok(commandResult.standardOutput.includes("Usage: graphql-isoclient"));
  });

  test("Missing Command", async () => {
    const commandResult = await captureCommandOutput([]);

    assert.equal(commandResult.exitCode, 1);
    assert.ok(commandResult.standardError.includes("Usage: graphql-isoclient"));
  });

  test("Generate From Introspection File", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-cli-"));
    const introspectionJsonFile = join(outputDirectory, "introspection.json");
    const outputFile = join(outputDirectory, "isoclient.ts");

    await writeFile(introspectionJsonFile, await buildIntrospectionPayload(), "utf8");

    const commandResult = await captureCommandOutput(["generate", `--introspection-json-file=${introspectionJsonFile}`, `--output=${outputFile}`]);

    assert.equal(commandResult.exitCode, 0, commandResult.standardError);
    assert.equal(commandResult.standardOutput.trim(), outputFile);

    const generatedFileText = await readFile(outputFile, "utf8");

    assert.ok(generatedFileText.includes("export function query(requestMap: QueryRequest"));
    assert.ok(generatedFileText.includes("export type QueryRequest = {"));
  });
});

async function buildIntrospectionPayload(): Promise<string> {
  const schemaSource = await readFile(new URL("../sampeSchema.graphql", import.meta.url), "utf8");
  const introspectionResult = graphqlSync({ schema: buildSchema(schemaSource), source: getIntrospectionQuery() });

  if (introspectionResult.errors !== undefined) {
    throw new Error(`introspection failed: ${introspectionResult.errors.map((error) => error.message).join(", ")}`);
  }

  return JSON.stringify(introspectionResult.data);
}

async function captureCommandOutput(commandLineArguments: string[]): Promise<CommandOutput> {
  const originalStandardOutputWrite = process.stdout.write.bind(process.stdout);
  const originalStandardErrorWrite = process.stderr.write.bind(process.stderr);
  let standardOutputText = "";
  let standardErrorText = "";

  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    standardOutputText += chunk.toString();

    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    standardErrorText += chunk.toString();

    return true;
  }) as typeof process.stderr.write;

  try {
    const exitCode = await runCli(commandLineArguments);

    return { exitCode, standardError: standardErrorText, standardOutput: standardOutputText };
  } finally {
    process.stdout.write = originalStandardOutputWrite;
    process.stderr.write = originalStandardErrorWrite;
  }
}

type CommandOutput = {
  exitCode: number;
  standardError: string;
  standardOutput: string;
};
