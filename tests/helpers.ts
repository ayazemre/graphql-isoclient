import { createSchema, createYoga } from "graphql-yoga";

import { readFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";

export async function startGraphqlYogaServer(sdlFile: string | URL): Promise<RunningGraphqlServer> {
  const typeDefinitions = await readFile(sdlFile, "utf8");
  const yoga = createYoga({ logging: false, schema: createSchema({ typeDefs: typeDefinitions }) });
  const httpServer = createServer(yoga);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const address = httpServer.address();

  if (address === null || typeof address === "string") {
    throw new Error("GraphQL yoga server did not expose a TCP port");
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}/graphql`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.closeAllConnections();
        httpServer.close((closeError) => {
          if (closeError === undefined) {
            resolve();
            return;
          }

          reject(closeError);
        });
      }),
  };
}

export async function* createEventIterator(events: unknown[]): AsyncIterableIterator<unknown> {
  for (const event of events) {
    yield event;
  }
}

export async function startCaptureHttpServer(): Promise<RunningCaptureHttpServer> {
  const receivedRequests: CapturedHttpRequest[] = [];
  const responseState = { statusCode: 200, bodyText: "{}" };
  const httpServer = createServer((request, response) => {
    const requestChunks: Buffer[] = [];

    request.on("data", (requestChunk: Buffer) => requestChunks.push(requestChunk));
    request.on("end", () => {
      receivedRequests.push({
        headers: request.headers,
        bodyText: Buffer.concat(requestChunks).toString("utf8"),
      });
      response.writeHead(responseState.statusCode, { "content-type": "application/json" });
      response.end(responseState.bodyText);
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const address = httpServer.address();

  if (address === null || typeof address === "string") {
    throw new Error("capture http server did not expose a TCP port");
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}/graphql`,
    receivedRequests,
    setResponse: (statusCode: number, bodyText: string) => {
      responseState.statusCode = statusCode;
      responseState.bodyText = bodyText;
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.closeAllConnections();
        httpServer.close((closeError) => {
          if (closeError === undefined) {
            resolve();
            return;
          }

          reject(closeError);
        });
      }),
  };
}

export type RunningGraphqlServer = {
  endpoint: string;
  stop(): Promise<void>;
};

export type CapturedHttpRequest = {
  headers: IncomingHttpHeaders;
  bodyText: string;
};

export type RunningCaptureHttpServer = {
  endpoint: string;
  receivedRequests: CapturedHttpRequest[];
  setResponse(statusCode: number, bodyText: string): void;
  stop(): Promise<void>;
};
