import { describe } from "node:test";

describe("Tests", async function () {
  await import("./e2e/index.test.ts");
  await import("./integration/index.test.ts");
});
