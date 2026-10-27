import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, test } from "node:test";

import { startGraphqlServer } from "../utilities.ts";

const repositoryRootPath = new URL("../../", import.meta.url).pathname;
const cliPath = join(repositoryRootPath, "dist", "cli.js");

const schemaFiles = [
  "tests/sampleFiles/querySchema.graphql",
  "tests/sampleFiles/queryMutationSchema.graphql",
  "tests/sampleFiles/queryMutationSubscriptionSchema.graphql",
];

function runCli(argumentsList: string[]): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    const childProcess = spawn(process.execPath, [cliPath, ...argumentsList]);
    let standardOutput = "";
    let standardError = "";

    childProcess.stdout.on("data", (chunk: Buffer) => {
      standardOutput += chunk.toString("utf8");
    });

    childProcess.stderr.on("data", (chunk: Buffer) => {
      standardError += chunk.toString("utf8");
    });

    childProcess.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stderr: standardError, stdout: standardOutput });
    });
  });
}

export function cliTests() {
  return describe("Command Line Interface", function () {
    test("Missing Arguments", async () => {
      const result = await runCli([]);

      assert.equal(result.exitCode, 1);
    });

    test("Invalid Schema Source", async () => {
      const result = await runCli([
        "--schema-source=/tmp/does-not-exist.graphql",
        `--output=${join(repositoryRootPath, "tests", "temporary", "invalid.ts")}`,
      ]);

      assert.equal(result.exitCode, 1);
    });

    for (const schemaFile of schemaFiles) {
      test(`Generate from ${schemaFile.split("/").pop()}`, async () => {
        const outputDirectory = join(repositoryRootPath, "tests", "temporary");
        await mkdir(outputDirectory, { recursive: true });
        const outputFile = join(outputDirectory, `${schemaFile.split("/").pop()?.replace(".graphql", "") ?? "client"}.ts`);
        const schemaPath = join(repositoryRootPath, schemaFile);

        const result = await runCli([`--schema-source=${schemaPath}`, `--output=${outputFile}`]);

        assert.equal(result.exitCode, 0, result.stderr);
        const generatedFile = await readFile(outputFile, "utf8");
        assert.ok(generatedFile.includes("export async function query"));
      });
    }

    for (const schemaFile of schemaFiles) {
      test(`Endpoint from ${schemaFile.split("/").pop()}`, async () => {
        const sdl = await readFile(join(repositoryRootPath, schemaFile), "utf8");

        const users = [
          { email: "alice@example.com", id: "1", username: "alice" },
          { email: "bob@example.com", id: "2", username: "bob" },
        ];

        const todos = [
          { completed: false, id: "1", owner: users[0], title: "Buy milk" },
          { completed: true, id: "2", owner: users[1], title: "Walk dog" },
        ];

        const resolvers: Record<string, any> = {
          Query: {
            todo: (_: unknown, args: { id: string }) => todos.find((entry) => entry.id === args.id) ?? null,
            todos: (_: unknown, args: { limit?: number }) => (args.limit === undefined ? todos : todos.slice(0, args.limit)),
            user: (_: unknown, args: { id: string }) => users.find((entry) => entry.id === args.id) ?? null,
            users: () => users,
          },
        };

        if (schemaFile.includes("Mutation")) {
          resolvers.Mutation = {
            createTodo: (_: unknown, args: { ownerId?: string; title: string }) => ({
              completed: false,
              id: "3",
              owner: users.find((entry) => entry.id === (args.ownerId ?? "1")) ?? users[0],
              title: args.title,
            }),
            deleteTodo: (_: unknown, args: { id: string }) => todos.find((entry) => entry.id === args.id) ?? null,
            updateTodo: (_: unknown, args: { completed?: boolean; id: string; title?: string }) => {
              const todo = todos.find((entry) => entry.id === args.id);

              if (todo === undefined) {
                return null;
              }

              return {
                ...todo,
                completed: args.completed ?? todo.completed,
                title: args.title ?? todo.title,
              };
            },
          };
        }

        if (schemaFile.includes("Subscription")) {
          resolvers.Subscription = {
            listedTodoChanges: {
              subscribe: () =>
                (async function* () {
                  for (let index = 0; index < 3; index += 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    yield {
                      listedTodoChanges: {
                        todo: { completed: false, id: "1", owner: users[0], title: "Buy milk" },
                        type: "created",
                      },
                    };
                  }
                })(),
            },
          };
        }

        const server = await startGraphqlServer(sdl, resolvers);

        try {
          const outputDirectory = join(repositoryRootPath, "tests", "temporary");
          await mkdir(outputDirectory, { recursive: true });
          const outputFile = join(outputDirectory, `endpoint-${schemaFile.split("/").pop()?.replace(".graphql", "")}.ts`);

          const result = await runCli([server.endpoint, outputFile]);

          assert.equal(result.exitCode, 0, result.stderr);
          const generatedFile = await readFile(outputFile, "utf8");
          assert.ok(generatedFile.includes("export async function query"));

          const clientModule = await import(outputFile);
          const response = await clientModule.query({ users: { email: true, id: true, username: true } });
          assert.equal(response?.[0]?.username, "alice");

          if (schemaFile.includes("Subscription")) {
            const subscriptionClientModule = await import(outputFile);
            const events = [];

            for await (const event of subscriptionClientModule.subscription({ listedTodoChanges: { todo: { id: true, title: true } } })) {
              events.push(event);

              if (events.length === 3) {
                break;
              }
            }

            assert.equal(events.length, 3);
          }

          const errorServerSdl = await readFile(join(repositoryRootPath, "tests/sampleFiles/querySchema.graphql"), "utf8");
          const errorServer = await startGraphqlServer(errorServerSdl, {
            Query: {
              user: () => {
                throw new Error("resolver boom");
              },
              users: () => [{ email: "alice@example.com", id: "1", username: "alice" }],
            },
          });

          try {
            const errorOutputFile = join(outputDirectory, `endpoint-error-${schemaFile.split("/").pop()?.replace(".graphql", "")}.ts`);
            const errorResult = await runCli([errorServer.endpoint, errorOutputFile]);
            assert.equal(errorResult.exitCode, 0, errorResult.stderr);

            const errorClientModule = await import(errorOutputFile);
            await assert.rejects(
              () => errorClientModule.query({ user: { __arguments: { id: "1" }, email: true, id: true, username: true } }),
              /Unexpected error|resolver boom|GraphQL error/,
            );
          } finally {
            await errorServer.stop();
          }

          const transportClientModule = await import(outputFile);
          await assert.rejects(
            () => transportClientModule.query({ users: { email: true, id: true, username: true } }, { endpoint: "http://127.0.0.1:1/graphql" }),
            /fetch failed|ECONNREFUSED|network/i,
          );
        } finally {
          await server.stop();
        }
      });
    }
  });
}
