# graphql-isoclient

A GraphQL client generator that emits one self-contained, fully typed TypeScript file.

The generated file imports nothing. It has no client instance, no configuration file, and no runtime dependency. It exposes plain functions that build a request, send it, and return the typed result.

## Install

```bash
npm install --save-dev graphql-isoclient
```

Requires Node.js 24 or newer to run the generator. The generated client itself runs anywhere `fetch` is available.

## Generate a client

From the command line:

```bash
npx graphql-isoclient https://api.example.com/graphql src/graphql/client.ts
```

From an SDL file:

```bash
npx graphql-isoclient schema.graphql src/graphql/client.ts
```

From a saved introspection payload:

```bash
npx graphql-isoclient introspection.json src/graphql/client.ts
```

From code:

```ts
import { generateClient } from "graphql-isoclient";

await generateClient({
  schemaEndpoint: "https://api.example.com/graphql",
  output: "src/graphql/client.ts",
});
```

## Generation process

The generator reads a schema, turns it into a schema model, renders five parts, and joins them into one file. There is no template and no runtime package. The runtime in the generated file is the generator's own source code, copied in, which is why the generated client needs no dependency.

### The pipeline

| Step | File                       | What it does                                                 |
| ---- | -------------------------- | ------------------------------------------------------------ |
| 1    | `src/lib/cli.ts`           | Reads the flags into an options object                       |
| 2    | `src/lib/schema.ts`        | Loads the schema from an endpoint or from a saved payload    |
| 3    | `src/lib/introspection.ts` | Turns the introspection payload into a schema model          |
| 4    | `src/lib/schema.ts`        | Resolves which root types the schema has                     |
| 5    | `src/lib/fieldMap.ts`      | Builds the runtime field map and the scalar field lists      |
| 6    | `src/lib/typescriptMap.ts` | Renders the client config block and the runtime data literal |
| 7    | `src/lib/typeSurface.ts`   | Renders the operation exports                                |
| 8    | `src/lib/generate.ts`      | Copies the runtime sections the schema needs                 |
| 9    | `src/lib/typeSurface.ts`   | Renders the type surface                                     |
| 10   | `src/lib/typescriptMap.ts` | Joins the parts into the final file                          |
| 11   | `src/lib/generate.ts`      | Writes the file to disk                                      |

### Step 1, read the options

The command line goes through `runCli` in `src/lib/cli.ts`. It rejects an unknown command, rejects an unknown flag, and reads `--output`, `--schema-endpoint`, `--introspection-json-file`, `--endpoint`, `--header`, and `--include-deprecated-fields` into a `GenerateOptions` object. A programmatic call skips this step and passes the same object to `generateClient` directly.

### Step 2, load the schema

`loadSchemaFromEndpoint` in `src/lib/schema.ts` posts the introspection query from `src/lib/introspection.ts` to the schema endpoint, with the headers the options carry. A non-2xx answer is an error. `loadSchemaFromIntrospectionJson` reads the same payload from a file instead. Both end at the same place.

### Step 3, build the schema model

`buildSchemaModelFromIntrospectionPayload` in `src/lib/introspection.ts` converts the raw payload into a `SchemaModel`, which is the type in `src/lib/schemaModel.ts`. The model holds the three root type names and a flat list of the schema types, where each type is a scalar, an enum, an object, an interface, a union, or an input object. Every field keeps its argument list and its type reference, and a type reference is a name, a list, or a non-null wrapper.

The model is the only thing the rest of the pipeline reads. Nothing after this step touches the raw payload, so the endpoint path and the file path produce the same result.

### Step 4, resolve the root types

`resolveRootTypeNames` in `src/lib/schema.ts` reads the root type names out of the model. A root type that the schema does not have stays undefined, and that is what the rest of the pipeline keys on. A schema with no mutation root type produces no mutation function, no mutation types, and no mutation runtime.

### Step 5, build the runtime data

`buildSchemaRuntimeData` in `src/lib/fieldMap.ts` produces the two lookup tables the runtime needs at request time.

`buildRuntimeFieldMap` walks every object type and every field, and records what the runtime has to know about that field: the type to select for an object field, and the type of each argument. A field with neither is a plain leaf and is left out.

`buildRuntimeScalarFieldLists` records the scalar field names of every type, which is what the `__scalar` marker expands into at request time.

Both tables are plain data, so they are emitted as a literal in the generated file rather than computed at runtime.

### Step 6, render the config block and the runtime data

`renderClientConfig` in `src/lib/typescriptMap.ts` writes the `clientConfig` object and the boundary comment that tells a reader where the hand-edited part ends. The endpoint and the headers live there, because that block is the editing surface of the generated file.

`renderRuntimeDataLiterals` in the same file writes the `runtimeData` object, which holds the default endpoint, the default headers, the field map, and the scalar field lists.

### Step 7, render the operation exports

`renderOperationExports` in `src/lib/typeSurface.ts` writes one function per root type the schema has. Each function takes the request map and the request options, and calls the runtime runner for its operation type.

```ts
export function query(requestMap: QueryRequest, options?: RequestOptions): Promise<QueryResult> {
  return runOperation("query", "Query", requestMap, runtimeData, options) as Promise<QueryResult>;
}
```

### Step 8, copy the runtime sections

The runtime is a list of sections in `src/lib/runtimeSections.ts`. Each section is a source file of the generator itself, and each one names the root type it needs.

| Section                          | Needs                      | Holds                                           |
| -------------------------------- | -------------------------- | ----------------------------------------------- |
| `src/lib/transport.ts`           | nothing                    | The request, the response, and the error path   |
| `src/lib/documentBuilder.ts`     | nothing                    | The request map lowered into a GraphQL document |
| `src/lib/queryBuilder.ts`        | nothing                    | The runner for query and mutation               |
| `src/lib/subscriptionRuntime.ts` | the subscription root type | The runner and the stream for subscriptions     |

`renderRuntimeSectionsSource` in `src/lib/generate.ts` drops the sections whose root type the schema does not have, and copies the rest. `readRuntimeSectionSource` reads a section from the source map of the built bundle, so the copied text is the original TypeScript, not the compiled output. `stripRuntimeSectionModuleSyntax` then removes the import statements and the `export` keyword from the function and const declarations, because the section becomes part of a single file instead of a module.

A section that the schema does not need is never copied, so the generated file holds no dead code.

### Step 9, render the type surface

`renderTypeSurface` in `src/lib/typeSurface.ts` writes the types, in this order: the enum types, the input object types, the argument types of every field that takes arguments, the two field argument helpers, the operation type union, the request types, the response types, and the result types.

The request types are what makes the request map typed. A field of an object type becomes the request type of that type, and the arguments of the field are added to it as `__arguments`. The response types and the result types are derived from the schema rather than from the request map, so the result type is the same whatever the map selects.

### Step 10, assemble the file

`assembleGeneratedFile` in `src/lib/typescriptMap.ts` joins the parts in a fixed order and drops the empty ones.

```
client config block
runtime data literal
operation exports
runtime sections
type surface
```

The order puts the hand-edited block first, the runtime in the middle, and the types last.

### Step 11, write the file

`generateClient` in `src/lib/generate.ts` creates the directory of the output path and writes the file, then reports the path and the byte length.

## Use the generated client

```ts
import { mutation, query } from "./graphql/client.ts";

const userResult = await query(
  {
    User: { __arguments: { id: "user-1" }, id: true, username: true },
  },
  { headers: { authorization: `Bearer ${token}` } },
);

const username = userResult.User?.username;

const tweetResult = await mutation({
  createTweet: { __arguments: { body: "hello" }, id: true, body: true },
});

const tweetBody = tweetResult.createTweet?.body;
```

`query` and `mutation` take the request map as the first argument and the request options as the second. The request map describes the fields to read and the arguments to send. `subscription` has the same shape and returns an async iterable.

### What the generated file contains

The generated file holds only what the schema needs. A schema with a query root type and no mutation root type gets a `query` function and no `mutation` function. A schema with no subscription root type gets no subscription function, no subscription transport, and no subscription types.

| Schema root types   | Generated operations    |
| ------------------- | ----------------------- |
| Query               | `query`                 |
| Query, Mutation     | `query`, `mutation`     |
| Query, Subscription | `query`, `subscription` |

Query and mutation share one runtime, because both send the same request and differ only in the operation keyword. Subscriptions have their own runtime, because they stream through an injected transport instead of sending a request.

### Client configuration

The generated file opens with an editable configuration block. Change the URL and the headers there, no regeneration needed.

```ts
const clientConfig: ClientConfig = {
  endpoint: "https://api.example.com/graphql",
  headers: {
    authorization: "Bearer token",
  },
};
```

The endpoint is the default for every operation and the headers are sent with every request. Per call options override them.

### Regenerating a client

Running the generator again on an existing file keeps the configuration block above the boundary comment and replaces everything below it. The endpoint and the headers that were edited by hand stay as they are, so a regeneration does not overwrite them.

```
const clientConfig: ClientConfig = {
  endpoint: "https://api.example.com/graphql",
  headers: {
    authorization: "Bearer token",
  },
};

// ----------------------------------------------------------------------------------------------------
// Generated by graphql-isoclient from https://api.example.com/graphql.
// Do not edit below this line.
// ----------------------------------------------------------------------------------------------------
```

Everything above the boundary line is preserved. Everything below it is regenerated.

If the file does not exist, or has no boundary comment, the file is written from scratch.

### Request maps

A request map describes the fields to read. It is a plain object, and it nests to any depth.

```ts
{
  id: true,                          // leaf field
  Author: { username: true },         // nested object
  __scalar: true,                     // every scalar field of the type
  __arguments: { id: "user-1" },      // arguments for the field that holds this map
}
```

Arguments live in `__arguments` on the map of the field they belong to, so every field carries its own arguments at every depth. The argument names and their types are checked against the schema, at every level.

```ts
const result = await query({
  Tweet: {
    __arguments: { id: "tweet-1" },
    body: true,
    Author: { __arguments: { id: "user-1" }, username: true },
  },
});
```

A field with required arguments must have `__arguments`, and the compiler says so when it is missing.

### Request options

The second argument accepts the request options.

| Option     | Type                     | Description                                   |
| ---------- | ------------------------ | --------------------------------------------- |
| `headers`  | `Record<string, string>` | Headers sent with the request                 |
| `endpoint` | `string`                 | Overrides the endpoint baked in at generation |
| `signal`   | `AbortSignal`            | Aborts the request                            |

```ts
const controller = new AbortController();

const result = await query({ User: { __arguments: { id: "user-1" }, username: true } }, { signal: controller.signal });
```

### Subscriptions

A subscription returns an async iterable. The transport is injected, so the client stays free of a websocket dependency. The subscription function and its types exist only when the schema has a subscription root type.

```ts
import { subscription } from "./graphql/client.ts";

const stream = subscription({ notificationAdded: { id: true, type: true } }, { transport: mySubscriptionTransport });

for await (const event of stream) {
  console.log(event);
}
```

A transport implements a single method.

```ts
type SubscriptionTransport = {
  subscribe(operationRequest: OperationRequest): AsyncIterableIterator<OperationResponse>;
};
```

### Errors

An operation resolves with the data of the GraphQL operation, and throws when the operation reports errors.

```ts
const data = await query({ User: { __arguments: { id: "user-1" }, username: true } });

console.log(data.User?.username);
```

A GraphQL error is thrown as an `OperationError`, which carries the errors the server reported and the partial data it sent along with them.

```ts
try {
  await query({ User: { __arguments: { id: "user-1" }, username: true } });
} catch (operationError) {
  if (operationError instanceof Error) {
    console.log(operationError.message);

    for (const reportedError of operationError.errors) {
      console.log(reportedError.message);
    }
  }
}
```

A plain `Error` is thrown when the request itself fails, which means the endpoint was unreachable, the response body was not JSON, or the server answered with a status other than 200 without a GraphQL error body.

## Generation options

| Option                    | Type                     | Description                                      |
| ------------------------- | ------------------------ | ------------------------------------------------ |
| `schemaEndpoint`          | `string`                 | Endpoint the schema is read from                 |
| `introspectionJsonFile`   | `string`                 | File the schema is read from                     |
| `output`                  | `string`                 | Path of the generated file                       |
| `endpoint`                | `string`                 | Default endpoint baked into the generated client |
| `headers`                 | `Record<string, string>` | Headers used for the introspection request       |
| `includeDeprecatedFields` | `boolean`                | Includes deprecated fields, false by default     |

Either `schemaEndpoint` or `introspectionJsonFile` is required.

The command line exposes the same options as flags.

| Flag                            | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `--schema-endpoint=<url>`       | Read the schema from an introspection endpoint   |
| `--introspection-json-file=<p>` | Read the schema from a saved payload             |
| `--output=<path>`               | Path of the generated file                       |
| `--endpoint=<url>`              | Default endpoint baked into the client           |
| `--header=<name:value>`         | Header for the introspection request, repeatable |
| `--include-deprecated-fields=`  | `true` or `false`                                |

The client config block in the generated file is meant to be edited by hand after generation, so there is no flag for the headers it holds.

## Known limitations

- The same field cannot be selected twice in one operation, because the request map is a plain object.
- Fields typed as an interface or a union cannot be selected, because the runtime reads plain object types.
- Custom scalars are typed as `unknown`.
- Deprecated leaf fields are hidden unless `includeDeprecatedFields` is enabled.
- Batching is not supported yet. It will be a separate function that takes a list of request maps.

## Development

```bash
npm run build      # type check and bundle into dist
npm test           # run the test suite
npm run lint       # run oxlint
npm run format     # run oxfmt
```

Repository operations live in `repository.sh` at the repository root. The CI workflows and local work source that file and call its functions. `run_integrity_checks` covers the structure, changelog, lint and format checks, `run_tests` runs the suite, `check_package_install` packs the tarball, installs it into a clean project and runs the published binary, and `publish_package` publishes the version. `git_push` commits and pushes with a validated `development:` or `maintenance:` message.

Publishing uses npm trusted publishing, so the repository needs the npm trusted publisher configured for `graphql-isoclient` and the workflow needs the `id-token` permission. The version in `package.json` and the latest `CHANGELOG.md` entry must match, which `check_changelog_version` verifies.

The publish job runs on every push to `main`. The version decides whether a publish happens: the integrity job exports the version from `package.json`, the publish job passes it to `publish_new_version`, and that function compares it against the version already on the registry. A version that is already published is skipped without an error, a version that is newer is published, and a version that does not match the manifest is an error.

## License

Apache-2.0. The full text is in `LICENSE`.
