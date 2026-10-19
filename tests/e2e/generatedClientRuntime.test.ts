import { strict as assert } from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";

import { generateClient } from "#src/lib/generate.ts";

import { runTypeScriptCheck, startGraphqlYogaServer } from "../helpers.ts";

const consumerSource = `import { mutation, query } from "./isoclient.ts";

const userResult = await query()
	.User({ id: "user-1" }, { id: true, username: true })
	.as("viewer")
	.run({ endpoint: "http://127.0.0.1:9999/graphql", headers: { authorization: "Bearer token" } });

const username: string | null | undefined = userResult.User?.username;

const tweetResult = await mutation()
	.createTweet({ body: "hello" }, { body: true, id: true })
	.run();

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

  test("Chained Query Against Live Server", async () => {
    const runningGraphqlServer = await startGraphqlYogaServer(new URL("../sampeSchema.graphql", import.meta.url));

    try {
      const outputDirectory = await mkdtemp(join(tmpdir(), "graphql-isoclient-"));
      const outputFile = join(outputDirectory, "isoclient.ts");

      await generateClient({ output: outputFile, schemaEndpoint: runningGraphqlServer.endpoint });

      const generatedClient = (await import(pathToFileURL(outputFile).href)) as GeneratedClientModule;

      const operationResult = await generatedClient
        .query()
        .Tweet({ id: "tweet-1" }, { body: true, id: true })
        .run({ endpoint: runningGraphqlServer.endpoint });

      assert.deepEqual(operationResult, { Tweet: null });
    } finally {
      await runningGraphqlServer.stop();
    }
  });
});

type GeneratedClientModule = {
  query(): GeneratedQueryBuilder;
};

type GeneratedQueryBuilder = {
  Tweet(fieldArguments: { id: string }, selectionMap: { body?: boolean; id?: boolean }): GeneratedQueryBuilder;
  run(options?: { endpoint?: string }): Promise<unknown>;
};
