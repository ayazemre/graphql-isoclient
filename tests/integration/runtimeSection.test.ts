import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { stripRuntimeSectionModuleSyntax } from "#src/lib/generate.ts";

describe("Runtime Section Source", () => {
  test("Single Line Import Removed", () => {
    const sectionSource = ['import { sendOperationRequest } from "./transport.ts";', "function run(): void {}"].join("\n");

    const strippedSource = stripRuntimeSectionModuleSyntax(sectionSource);

    assert.equal(strippedSource, "function run(): void {}");
  });

  test("Multi Line Import Removed", () => {
    const sectionSource = [
      "import type {",
      "  ArgumentValues,",
      "  OperationSelection,",
      '} from "./documentBuilder.ts";',
      "function run(): void {}",
    ].join("\n");

    const strippedSource = stripRuntimeSectionModuleSyntax(sectionSource);

    assert.equal(strippedSource, "function run(): void {}");
  });

  test("Export Keyword Removed From Runtime Declarations", () => {
    const sectionSource = [
      "export function run(): void {}",
      "export async function send(): Promise<void> {}",
      "export const runtimeData = {};",
      "export type RuntimeData = { value: string };",
    ].join("\n");

    const strippedSource = stripRuntimeSectionModuleSyntax(sectionSource);

    assert.equal(
      strippedSource,
      [
        "function run(): void {}",
        "async function send(): Promise<void> {}",
        "const runtimeData = {};",
        "export type RuntimeData = { value: string };",
      ].join("\n"),
    );
  });
});
