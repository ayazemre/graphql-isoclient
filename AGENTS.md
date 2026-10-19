# Repository Rules

- Library code uses native TypeScript types only: no zod, no classes, no interfaces.
- The generator is configured programmatically through options objects and never reads a config file from disk.
- Repository operations run through `repository.sh` at the repository root. The CI workflows and local work source that file and call its functions instead of running the underlying commands directly.
- Commit messages use the `development:` or `maintenance:` prefixes, and `git_push` in `repository.sh` refuses anything else.
- Generated clients and other generated artifacts belong in the `temporary` folder, and their paths are never added to `.gitignore`.
- The generated file is the editing surface for the endpoint and the headers, so the generator exposes no option or command line flag for values that the user edits there.
