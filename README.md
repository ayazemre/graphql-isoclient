# graphql-isoclient

A GraphQL client generator that emits one self-contained, fully typed TypeScript file.

The generated file imports nothing. It has no client instance, no configuration file, and no runtime dependency. It exposes plain functions that build a request, send it, and return the typed result.

## Install

```bash
npm install --save-dev graphql-isoclient
```

Requires Node.js 24 or newer to run the generator. The generated client itself runs anywhere `fetch` is available.

## Generate a client

The command line takes the schema source and the output path.

```bash
npx graphql-isoclient <schemaSource> <outputPath>
```

The schema source may be an introspection endpoint, an SDL file, or a saved introspection JSON file.

```bash
npx graphql-isoclient https://api.example.com/graphql src/graphql/client.ts
npx graphql-isoclient schema.graphql src/graphql/client.ts
npx graphql-isoclient introspection.json src/graphql/client.ts
```

From code:

```ts
import { generateClientFile } from "graphql-isoclient/lib/generator";
import { parseSDLFile } from "graphql-isoclient/lib/parsers";

const schemaModel = parseSDLFile(sdlText);

await generateClientFile(schemaModel, "src/graphql/client.ts", "https://api.example.com/graphql");
```

`generateClientFile` accepts a `SchemaModel`, the output path, and an optional default endpoint baked into the generated client.

## Use the generated client

```ts
import { mutation, query } from "./graphql/client.ts";

const userResult = await query({
  User: { __arguments: { id: "user-1" }, id: true, username: true },
});

const tweetResult = await mutation({
  createTweet: { __arguments: { body: "hello" }, id: true, body: true },
});
```

## License

Apache-2.0. The full text is in `LICENSE`.
