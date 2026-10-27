import { describe } from "node:test";

import { cliTests } from "./cli.test.ts";

describe("End To End", async function () {
  cliTests();
});
