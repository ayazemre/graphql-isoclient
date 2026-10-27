import { describe } from "node:test";

import { cliTests } from "./cli.test.ts";
import { mutationTests } from "./mutation.test.ts";
import { queryTests } from "./query.test.ts";
import { subscriptionTests } from "./subscription.test.ts";

export function endToEndTests() {
  return describe("End To End", function () {
    cliTests();
    queryTests();
    mutationTests();
    subscriptionTests();
  });
}
