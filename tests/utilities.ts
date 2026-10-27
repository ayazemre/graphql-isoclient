import { serve } from "@hono/node-server";
import { createSchema, createYoga } from "graphql-yoga";
import { Hono } from "hono";

import type { AddressInfo } from "node:net";

export type RunningGraphqlServer = {
  endpoint: string;
  stop(): Promise<void>;
};

export async function startGraphqlServer(sdl: string, resolvers?: Record<string, any>): Promise<RunningGraphqlServer> {
  const yoga = createYoga({ logging: false, schema: createSchema({ resolvers, typeDefs: sdl }) });
  const application = new Hono();

  application.all("/graphql", (context) => yoga(context.req.raw));

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
