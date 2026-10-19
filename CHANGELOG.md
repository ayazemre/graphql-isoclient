# Changelog

All notable changes to this project will be documented in this file.

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
