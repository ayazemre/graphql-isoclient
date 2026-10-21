# Changelog

All notable changes to this project will be documented in this file.

## [0.3.1] - 2026-10-21

### Changed

- The generated file holds only the operations the schema has. A schema with no subscription root type gets no subscription function, no subscription transport, and no subscription types. A schema with no mutation root type gets no mutation function and no mutation types.
- The `OperationTypeName` type lists only the operation types the schema has.

### Fixed

- The generated file no longer trips the `no-unused-vars` lint rule when the schema has no subscription root type.
- The generated runtime data lists its keys in sorted order, so the generated file passes the `sort-keys` lint rule.
- The unused GraphQL introspection types `__TypeKind` and `__DirectiveLocation` are no longer emitted.
- A nullable custom scalar is typed as `unknown` instead of `unknown | null`, which is the same type.

## [0.3.0] - 2026-10-20

### Changed

- The generated client exposes one plain function per operation type, `query`, `mutation`, and `subscription`. The first parameter is the request map and the second is the request options.
- A request map is plain data that nests to any depth. Each field carries its own arguments in `__arguments` and its own selection, and the argument names and types are checked against the schema at every level.
- An operation resolves with the data of the operation. A GraphQL error is thrown as an `OperationError` that carries the reported errors and the partial data the server sent with them.
- The chain builder, the `as` alias method, and the `data` and `errors` result object are removed.

### Added

- The `__scalar` marker on any request map selects every scalar field of that type.

## [0.2.1] - 2026-10-19

### Changed

- The package manifest is written in the form npm normalizes it to, so publishing no longer rewrites the binary entry.
- Repository operations moved to `repository.sh` at the repository root, and the CI workflows call its functions.
- The project is licensed under Apache-2.0, and the license text is included in the repository and in the published package.
- The publish job now runs on every push to `main` and the version decides whether a publish happens, so a version that is already on the registry is skipped without an error.

## [0.2.0] - 2026-10-19

### Added

- Chainable operation builder with a method per root field, argument values, typed selection maps, and root level aliases.
- Generated type surface with argument types, selection map types, response types, result types, and operation builder types.
- Command line interface with `generate` and `help` commands.
- Package exports, type declarations, and the `graphql-isoclient` binary.
- End to end tests that type check the generated client under strict TypeScript and run it against a live server.

### Changed

- The generated file is chain only, the map form is no longer emitted.
- The runtime no longer depends on the `graphql` package, the schema is read through a local model.
- The published package carries the runtime sources in its source maps, so an installed copy can generate clients.
- The generator splices whole import statements, so wrapped imports no longer leak into generated files.

## [0.0.1] - 2026-10-18

### Added

- Project initialization.
