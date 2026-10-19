import { describe } from "node:test";

describe("End To End", async function () {
  await import("./generateClient.test.ts");
});
