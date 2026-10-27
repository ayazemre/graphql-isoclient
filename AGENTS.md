# Repository Rules

- Library code uses zod/mini for schemas and native TypeScript types otherwise: no classes, no interfaces.
- The generator is configured programmatically through options objects and never reads a config file from disk.
- Repository operations run through `repository.sh` at the repository root. The CI workflows and local work source that file and call its functions instead of running the underlying commands directly.
- Commit messages use the `development:` or `maintenance:` prefixes, and `git_push` in `repository.sh` refuses anything else.
- Generated clients and other generated artifacts belong in the `temporary` folder, and their paths are never added to `.gitignore`.
- The generated file is the editing surface for the endpoint and the headers, so the generator exposes no option or command line flag for values that the user edits there.
- The generated client exposes one plain function per operation type, `query`, `mutation`, and `subscription`. The first parameter is the request map and the second is the request options.
- The generated file holds only what the server exposes. A root operation type that the schema does not define produces no function, no types, and no runtime code for it. A schema with no subscription root gets nothing about subscriptions, and a schema with no mutation root gets nothing about mutations. A schema without a query root is invalid for this library. The runtime is split into sections, and a section that needs a root type is emitted only when the schema has that root type.
- The result type of an operation is built from the request map only. It contains exactly the top-level keys the request names, typed from the selected fields, and never the other fields of the root type.
- Regenerating into an existing file keeps the configuration block above the boundary comment and replaces everything below it, so a hand-edited endpoint or header survives regeneration.
- A request map is plain data. The reserved key is `__arguments` for the arguments of the field that holds the map. Scalar and composite fields are selected by including their name as a key with a `true` value. There is one spelling of each key, spelled out in full.
- An operation resolves with the data of the operation, and a GraphQL error is thrown as an `OperationError` that carries the reported errors and the partial data.
- Lint is run with `oxlint --fix`, so the fixer applies the rules and the author does not correct them by hand. Run `npm run lint` before committing.
