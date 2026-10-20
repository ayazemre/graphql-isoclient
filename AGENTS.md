# Repository Rules

- Library code uses native TypeScript types only: no zod, no classes, no interfaces.
- The generator is configured programmatically through options objects and never reads a config file from disk.
- Repository operations run through `repository.sh` at the repository root. The CI workflows and local work source that file and call its functions instead of running the underlying commands directly.
- Commit messages use the `development:` or `maintenance:` prefixes, and `git_push` in `repository.sh` refuses anything else.
- Generated clients and other generated artifacts belong in the `temporary` folder, and their paths are never added to `.gitignore`.
- The generated file is the editing surface for the endpoint and the headers, so the generator exposes no option or command line flag for values that the user edits there.
- The generated client exposes one plain function per operation type, `query`, `mutation`, and `subscription`. The first parameter is the request map and the second is the request options.
- A request map is plain data. The reserved keys are `__arguments` for the arguments of the field that holds the map, and `__scalar` for every scalar field of the type. There is one spelling of each key, spelled out in full.
- An operation resolves with the data of the operation, and a GraphQL error is thrown as an `OperationError` that carries the reported errors and the partial data.
- Lint is run with `oxlint --fix`, so the fixer applies the rules and the author does not correct them by hand. Run `npm run lint` before committing.
