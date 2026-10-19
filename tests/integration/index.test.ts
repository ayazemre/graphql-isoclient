import { describe } from "node:test";

describe("Integration", async function () {
  await import("./dependencyBoundary.test.ts");
  await import("./documentBuilder.test.ts");
  await import("./introspectionInput.test.ts");
  await import("./queryBuilder.test.ts");
  await import("./runtimeSection.test.ts");
  await import("./transport.test.ts");
});
