import { serve } from "@hono/node-server";
import { createSchema, createYoga } from "graphql-yoga";
import { Hono } from "hono";

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AddressInfo } from "node:net";

export type RunningGraphqlServer = {
  endpoint: string;
  stop(): Promise<void>;
};

export type CliResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export const repositoryRootPath = new URL("../", import.meta.url).pathname;
export const cliPath = join(repositoryRootPath, "src", "cli.ts");
export const temporaryDirectoryPath = join(repositoryRootPath, "tests", "temporary");
export const sampleFilesDirectoryPath = join(repositoryRootPath, "tests", "sampleFiles");

export const querySchemaPath = join(sampleFilesDirectoryPath, "querySchema.graphql");
export const queryMutationSchemaPath = join(sampleFilesDirectoryPath, "queryMutationSchema.graphql");
export const queryMutationSubscriptionSchemaPath = join(sampleFilesDirectoryPath, "queryMutationSubscriptionSchema.graphql");

export const users = [
  { email: "alice@example.com", id: "1", username: "alice" },
  { email: "bob@example.com", id: "2", username: "bob" },
];

export const todos = [
  { completed: false, id: "1", owner: users[0], title: "Buy milk" },
  { completed: true, id: "2", owner: users[1], title: "Walk dog" },
];

export const circularSchemaPath = join(sampleFilesDirectoryPath, "circularSchema.graphql");
export const enumSchemaPath = join(sampleFilesDirectoryPath, "enumSchema.graphql");

export const enumAccounts = [
  { id: "1", name: "Acme", status: "ACTIVE" },
  { id: "2", name: "Globex", status: "INACTIVE" },
];

export const enumQueryResolvers = {
  Query: {
    accounts: (_: unknown, args: { filter?: { status?: string }; status?: string }) => {
      const requestedStatus = args.status ?? args.filter?.status;

      return requestedStatus === undefined ? enumAccounts : enumAccounts.filter((account) => account.status === requestedStatus);
    },
  },
};

export const enumMutationResolvers = {
  Mutation: {
    setAccountStatus: (_: unknown, args: { id: string; status: string }) => {
      const account = enumAccounts.find((entry) => entry.id === args.id);

      return account === undefined ? null : { ...account, status: args.status };
    },
  },
};

export const circularUsers = [
  { friends: [] as unknown[], id: "1", todos: [] as unknown[], username: "alice" },
  { friends: [] as unknown[], id: "2", todos: [] as unknown[], username: "bob" },
];
circularUsers[0].friends = [circularUsers[1]];
circularUsers[1].friends = [circularUsers[0]];

export const circularTodos = [{ id: "10", owner: circularUsers[0], title: "Buy milk" }];

export const circularQueryResolvers = {
  Query: {
    todos: (_: unknown, args: { filter?: { completed?: boolean; ownerId?: string } }) =>
      args.filter === undefined ? circularTodos : circularTodos.filter((todo) => todo.owner.id === args.filter?.ownerId),
    users: () => circularUsers,
  },
};

export const circularMutationResolvers = {
  Mutation: {
    createTodo: (_: unknown, args: { input: { owner?: { id: string }; title: string } }) => ({
      id: "11",
      owner: args.input.owner === undefined ? null : (circularUsers.find((user) => user.id === args.input.owner?.id) ?? null),
      title: args.input.title,
    }),
  },
};

export const circularSubscriptionResolvers = {
  Subscription: {
    todoChanges: {
      subscribe: (_: unknown, args: { filter?: { completed?: boolean; ownerId?: string } }) =>
        (async function* () {
          const matchingTodos = args.filter === undefined ? circularTodos : circularTodos.filter((todo) => todo.owner.id === args.filter?.ownerId);

          for (const todo of matchingTodos) {
            yield { todoChanges: { todo, type: "created" } };
          }
        })(),
    },
  },
};

export const queryResolvers = {
  Query: {
    todo: (_: unknown, args: { id: string }) => todos.find((entry) => entry.id === args.id) ?? null,
    todos: (_: unknown, args: { limit?: number }) => (args.limit === undefined ? todos : todos.slice(0, args.limit)),
    user: (_: unknown, args: { id: string }) => users.find((entry) => entry.id === args.id) ?? null,
    users: () => users,
  },
};

export const mutationResolvers = {
  Mutation: {
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
  },
};

export const subscriptionResolvers = {
  Subscription: {
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
  },
};

export function readSchemaSdl(schemaPath: string): string {
  return readFileSync(schemaPath, "utf8");
}

export const requiredHeaderName = "x-api-key";
export const requiredHeaderValue = "secret-key";

export async function startGraphqlServer(
  sdl: string,
  resolvers?: Record<string, any>,
  options?: { requireHeader?: boolean },
): Promise<RunningGraphqlServer> {
  const yoga = createYoga({ logging: false, schema: createSchema({ resolvers, typeDefs: sdl }) });
  const application = new Hono();

  if (options?.requireHeader === true) {
    application.all("/graphql", (context) => {
      if (context.req.header(requiredHeaderName) !== requiredHeaderValue) {
        return context.json({ errors: [{ message: "Missing or invalid API key" }] }, 401);
      }

      return yoga(context.req.raw);
    });
  } else {
    application.all("/graphql", (context) => yoga(context.req.raw));
  }

  const server = serve({ fetch: application.fetch, port: 0 });

  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("GraphQL server did not expose a TCP port");
  }

  const port = (address as AddressInfo).port;

  return {
    endpoint: `http://127.0.0.1:${port}/graphql`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((closeError) => {
          if (closeError === undefined) {
            resolve();
            return;
          }

          reject(closeError);
        });
      }),
  };
}

export function runCli(argumentsList: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [cliPath, ...argumentsList]);
    let standardOutput = "";
    let standardError = "";

    childProcess.stdout.on("data", (chunk: Buffer) => {
      standardOutput += chunk.toString("utf8");
    });

    childProcess.stderr.on("data", (chunk: Buffer) => {
      standardError += chunk.toString("utf8");
    });

    childProcess.on("error", reject);

    childProcess.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stderr: standardError, stdout: standardOutput });
    });
  });
}
