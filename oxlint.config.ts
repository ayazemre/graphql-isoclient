import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["dist", "node_modules", "build"],
  options: { typeAware: true, typeCheck: true },
  overrides: [
    {
      excludeFiles: ["*config*"],
      files: ["*.ts"],
      rules: {
        "import/no-default-export": "error",
      },
    },
    {
      excludeFiles: ["*svelte*", "*config*"],
      files: ["*.ts"],
      rules: {
        "unicorn/filename-case": ["error", { cases: { camelCase: true } }],
      },
    },
    {
      files: ["*.test.ts"],
      rules: {
        "typescript/no-floating-promises": "off",
      },
    },
  ],
  plugins: ["eslint", "import", "unicorn", "typescript"],
  rules: {
    "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports", prefer: "type-imports" }],
    "@typescript-eslint/no-import-type-side-effects": "error",
    "import/no-duplicates": "error",
    "import/no-named-as-default": "error",
    "max-statements": ["error", 50],
    "no-unused-vars": "error",
    "sort-keys": "error",
    "typescript/only-throw-error": "error",
  },
});
