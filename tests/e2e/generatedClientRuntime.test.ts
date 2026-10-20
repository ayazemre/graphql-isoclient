import { strict as assert } from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";

import { generateClient } from "#src/lib/generate.ts";

import { runTypeScriptCheck, startGraphqlYogaServer } from "../helpers.ts";

const consumerSource = `import { mutation, query } from "./isoclient.ts";

const userResult = await query({
  User: { __arguments: { id: "user-1" }, id: true, username: true },
});

const username: string | null | undefined = userResult.User?.username;

const tweetResult = await mutation({
  createTweet: { __arguments: { body: "hello" }, body: true, id: true },
});

const tweetBody: string | null | undefined = tweetResult.createTweet?.body;

console.log(username, tweetBody);
`;

describe("Generated Client Runtime", () => {
  test("Strict Type Check", async () => {
    const runningGraphqlServer = await startGraphqlYogaServer(new URL("../sampeSchema.graphql", import.meta.url));

    try {
      const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
      const outputFile = join(outputDirectory, "isoclient.ts");
      const consumerFile = join(outputDirectory, "consumer.ts");

      await generateClient({ output: outputFile, schemaEndpoint: runningGraphqlServer.endpoint });
      await writeFile(consumerFile, consumerSource, "utf8");

      const typeCheckResult = await runTypeScriptCheck([outputFile, consumerFile], outputDirectory);

      assert.equal(typeCheckResult.ok, true, typeCheckResult.output);
    } finally {
      await runningGraphqlServer.stop();
    }
  });

  test("Map Query Against Live Server", async () => {
    const runningGraphqlServer = await startGraphqlYogaServer(new URL("../sampeSchema.graphql", import.meta.url));

    try {
      const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
      const outputFile = join(outputDirectory, "isoclient.ts");

      await generateClient({ output: outputFile, schemaEndpoint: runningGraphqlServer.endpoint });

      const generatedClient = (await import(pathToFileURL(outputFile).href)) as GeneratedClientModule;

      const operationData = await generatedClient.query(
        { Tweet: { __arguments: { id: "tweet-1" }, body: true, id: true } },
        { endpoint: runningGraphqlServer.endpoint },
      );

      assert.deepEqual(operationData, { Tweet: null });
    } finally {
      await runningGraphqlServer.stop();
    }
  });
});

type GeneratedClientModule = {
  query(
    requestMap: { Tweet?: { __arguments?: { id: string }; body?: boolean; id?: boolean } },
    options?: { endpoint?: string },
  ): Promise<{ Tweet?: unknown }>;
};
