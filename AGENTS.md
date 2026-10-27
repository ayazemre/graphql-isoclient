# Repository Rules

- Library code uses zod/mini for schemas and native TypeScript types otherwise: no classes, no interfaces.
- The generator is configured programmatically through options objects and never reads a config file from disk.
- Repository operations run through `repository.sh` at the repository root. The CI workflows and local work source that file and call its functions instead of running the underlying commands directly.
- Commit messages use the `development:` or `maintenance:` prefixes, and `git_push` in `repository.sh` refuses anything else.
- Generated clients and other generated artifacts belong in the `temporary` folder, and their paths are never added to `.gitignore`.
- The generated client holds no endpoint and no headers. The generator takes no endpoint option and emits no client configuration object.
- The generated client exposes one plain function per operation type, `query`, `mutation`, and `subscription`. The first parameter is the request map and the second is the request options, a plain object `{ endpoint, headers? }` that the caller passes on every call.
- The generated file holds only what the server exposes. A root operation type that the schema does not define produces no function, no types, and no runtime code for it. A schema with no subscription root gets nothing about subscriptions, and a schema with no mutation root gets nothing about mutations. A schema without a query root is invalid for this library. The runtime is split into sections, and a section that needs a root type is emitted only when the schema has that root type.
- The result type of an operation is built from the request map only. It contains exactly the top-level keys the request names, typed from the selected fields, and never the other fields of the root type.
- A request map is plain data. The reserved key is `__arguments` for the arguments of the field that holds the map. Scalar and composite fields are selected by including their name as a key with a `true` value. There is one spelling of each key, spelled out in full.
- An operation resolves with the data of the operation, and a GraphQL error is thrown as an `OperationError` that carries the reported errors and the partial data.
- Lint is run with `oxlint --fix`, so the fixer applies the rules and the author does not correct them by hand. Run `npm run lint` before committing.
- A substantial functionality change must bump the package version, add a matching `CHANGELOG.md` entry, and keep `README.md` consistent before pushing. `check_changelog_version` must pass and the integrity checks must be green.
