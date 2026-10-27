import { rm } from "node:fs/promises";
import { describe } from "node:test";

import { endToEndTests } from "./e2e/index.test.ts";
import { unitTests } from "./unit/index.test.ts";
import { temporaryDirectoryPath } from "./utilities.ts";

await rm(temporaryDirectoryPath, { force: true, recursive: true });

describe("Tests", function () {
  unitTests();
  endToEndTests();
});
