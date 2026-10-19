import { strict as assert } from "node:assert";
import { readFile, readdir } from "node:fs/promises";
import { describe, test } from "node:test";

describe("Dependency Boundary", () => {
  test("No Runtime Dependencies", async () => {
    const packageJsonText = await readFile(new URL("../../package.json", import.meta.url), "utf8");
    const packageJson: { dependencies?: Record<string, string> } = JSON.parse(packageJsonText);

    assert.equal(packageJson.dependencies, undefined);
  });

  test("No Graphql Library Imports", async () => {
    const sourceDirectoryUrl = new URL("../../src/", import.meta.url);
    const sourceFileNames = await readdir(sourceDirectoryUrl, { recursive: true });
    const typescriptFileNames = sourceFileNames.filter((sourceFileName) => sourceFileName.endsWith(".ts"));

    assert.ok(typescriptFileNames.length > 0);

    for (const typescriptFileName of typescriptFileNames) {
      const sourceText = await readFile(new URL(typescriptFileName, sourceDirectoryUrl), "utf8");

      assert.ok(sourceText.includes('from "graphql"') === false, `${typescriptFileName} imports the graphql library`);
    }
  });
});
