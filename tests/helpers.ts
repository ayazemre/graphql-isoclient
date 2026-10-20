import { createSchema, createYoga } from "graphql-yoga";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

export async function* createEventIterator<T>(events: T[]): AsyncIterableIterator<T> {
  for (const event of events) {
    yield event;
  }
}

export async function startCaptureHttpServer(): Promise<RunningCaptureHttpServer> {
  const receivedRequests: CapturedHttpRequest[] = [];
  const responseState = { bodyText: "{}", statusCode: 200 };
  const httpServer = createServer((request, response) => {
    const requestChunks: Buffer[] = [];

    request.on("data", (requestChunk: Buffer) => requestChunks.push(requestChunk));
    request.on("end", () => {
      receivedRequests.push({
        bodyText: Buffer.concat(requestChunks).toString("utf8"),
        headers: request.headers,
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

export async function runTypeScriptCheck(sourceFilePaths: string[], workingDirectoryPath: string): Promise<TypeScriptCheckResult> {
  const repositoryRootPath = fileURLToPath(new URL("../", import.meta.url));
  const typescriptBinaryPath = join(repositoryRootPath, "node_modules", ".bin", "tsc");
  const typeCheckArguments = [
    "--noEmit",
    "--strict",
    "--target",
    "esnext",
    "--module",
    "esnext",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
    "--allowImportingTsExtensions",
    ...sourceFilePaths,
  ];

  const typeCheckResult = await runProcess(typescriptBinaryPath, typeCheckArguments, workingDirectoryPath);

  return { ok: typeCheckResult.exitCode === 0, output: typeCheckResult.output };
}

async function runProcess(commandPath: string, commandArguments: string[], workingDirectoryPath: string): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const spawnedProcess = spawn(commandPath, commandArguments, { cwd: workingDirectoryPath });
    let processOutput = "";

    spawnedProcess.stdout.on("data", (outputChunk: Buffer) => {
      processOutput += outputChunk.toString("utf8");
    });
    spawnedProcess.stderr.on("data", (outputChunk: Buffer) => {
      processOutput += outputChunk.toString("utf8");
    });
    spawnedProcess.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, output: processOutput });
    });
  });
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

export type TypeScriptCheckResult = {
  ok: boolean;
  output: string;
};

type ProcessRunResult = {
  exitCode: number;
  output: string;
};
