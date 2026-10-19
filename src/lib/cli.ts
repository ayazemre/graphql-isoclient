import type { GenerateOptions } from "./generate.ts";

export function parseCliOptions(commandLineArguments: ReadonlyArray<string>): GenerateOptions {
  throw new Error("parseCliOptions is not implemented");
}

export async function runCli(commandLineArguments: ReadonlyArray<string>): Promise<number> {
  throw new Error("runCli is not implemented");
}
