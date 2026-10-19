# graphql-isoclient

A GraphQL client generator that emits one self-contained, fully typed TypeScript file.

The generated file imports nothing. It has no client instance, no configuration file, and no runtime dependency. It exposes plain functions that build a request, send it, and return the typed result.

## Why

- No runtime dependency. The generated file has zero imports, so the `graphql` package never reaches the consumer.
- No client instance. `query()`, `mutation()`, and `subscription()` are plain functions.
- Typed end to end. Argument types, selection maps, response types, result types, and builder types are generated from the schema.
- Chainable. Operations are assembled with a chain and executed with `run`.

## Install

```bash
npm install --save-dev graphql-isoclient
```

Requires Node.js 24 or newer to run the generator. The generated client itself runs anywhere `fetch` is available.

## Generate a client

From the command line:

```bash
npx graphql-isoclient generate \
  --schema-endpoint=https://api.example.com/graphql \
  --output=src/graphql/client.ts
```

From a saved introspection payload:

```bash
npx graphql-isoclient generate \
  --introspection-json-file=schema.json \
  --output=src/graphql/client.ts
```

From code:

```ts
import { generateClient } from "graphql-isoclient";

await generateClient({
  schemaEndpoint: "https://api.example.com/graphql",
  output: "src/graphql/client.ts",
});
```

## Use the generated client

```ts
import { mutation, query } from "./graphql/client.ts";

const userResult = await query()
  .User({ id: "user-1" }, { id: true, username: true })
  .run({ headers: { authorization: `Bearer ${token}` } });

const username = userResult.data?.User?.username;

const tweetResult = await mutation().createTweet({ body: "hello" }, { id: true, body: true }).run();

const tweetBody = tweetResult.data?.createTweet?.body;
```

Each root field of the schema becomes a method on the builder. The first argument carries the field arguments, the second argument carries the selection map for the field, and `run` sends the operation.

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

### Selection maps

A selection map describes the fields to read.

```ts
{ id: true, username: true }              // leaf fields
{ Author: { username: true } }             // nested object
{ __scalar: true }                        // every scalar field of the type
{ __args: { id: "user-1" }, username: true } // arguments for a nested field
```

### Aliases

`as` renames the response key of the field that was appended last. Aliases are supported on operation root fields.

```ts
const result = await query().User({ id: "user-1" }, { username: true }).as("viewer").run();

const viewerName = result.data?.viewer?.username;
```

### Request options

`run` accepts the request options.

| Option     | Type                     | Description                                   |
| ---------- | ------------------------ | --------------------------------------------- |
| `headers`  | `Record<string, string>` | Headers sent with the request                 |
| `endpoint` | `string`                 | Overrides the endpoint baked in at generation |
| `signal`   | `AbortSignal`            | Aborts the request                            |

```ts
const controller = new AbortController();

const result = await query().User({ id: "user-1" }, { username: true }).run({ signal: controller.signal });
```

### Subscriptions

A subscription returns an async iterable. The transport is injected, so the client stays free of a websocket dependency.

```ts
import { subscription } from "./graphql/client.ts";

const stream = subscription().notificationAdded({ id: true, type: true }).run({ transport: mySubscriptionTransport });

for await (const event of stream) {
  console.log(event);
}
```

A transport implements a single method.

```ts
type SubscriptionTransport = {
  subscribe(operationRequest: OperationRequest): AsyncIterableIterator<unknown>;
};
```

### Errors

An operation resolves with the result of the GraphQL operation, a `data` object and an `errors` array. GraphQL errors never throw, so the outcome of every call is one value to inspect.

```ts
const result = await query().User({ id: "user-1" }, { username: true }).run();

if (result.errors.length > 0) {
  for (const operationError of result.errors) {
    console.log(operationError.message);
  }
}
```

A plain `Error` is thrown only when the request itself fails, which means the endpoint was unreachable, the response body was not JSON, or the server answered with a status other than 200.

```ts
try {
  await query().User({ id: "user-1" }, { username: true }).run();
} catch (requestError) {
  console.log(requestError instanceof Error ? requestError.message : requestError);
}
```

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

- Aliases are supported on operation root fields only.
- The same field cannot be selected twice in one operation.
- Fields typed as an interface or a union cannot be selected, because the runtime reads plain object types.
- Custom scalars are typed as `unknown`.
- Deprecated leaf fields are hidden unless `includeDeprecatedFields` is enabled.

## Development

```bash
npm run build      # type check and bundle into dist
npm test           # run the test suite
npm run lint       # run oxlint
npm run format     # run oxfmt
```

Repository operations live in `scripts/repository.sh`. The CI workflows source that file and call `check_changelog_version`, `get_package_version`, `publish_package`, and `run_npm_tests`. `check_npm_package` packs the tarball, installs it into a clean project, and runs the published binary, which is the release gate before `npm publish`.

Publishing uses npm trusted publishing, so the repository needs the npm trusted publisher configured for `graphql-isoclient` and the workflow needs the `id-token` permission. The version in `package.json` and the latest `CHANGELOG.md` entry must match, which `check_changelog_version` verifies.

## License

ISC
