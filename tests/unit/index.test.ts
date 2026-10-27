import { describe } from "node:test";

import { modelsTests } from "./models.test.ts";
import { parserTests } from "./parser.test.ts";
import { runtimeTests } from "./runtime.test.ts";

export function unitTests() {
  return describe("Unit", function () {
    modelsTests();
    parserTests();
    runtimeTests();
  });
}
