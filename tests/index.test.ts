import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe } from "node:test";

const testsDirectoryPath = new URL(".", import.meta.url).pathname;
await rm(join(testsDirectoryPath, "temporary"), { force: true, recursive: true });

import { unitTests } from "./unit/index.test.ts";

describe("Tests", async function () {
  unitTests();
  await import("./e2e/index.test.ts");
});
