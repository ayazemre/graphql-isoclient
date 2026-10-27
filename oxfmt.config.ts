import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 150,
  sortImports: {
    groups: ["value-external", "value-builtin", "value-internal", "type-import", ["value-parent", "value-sibling", "value-index"], "unknown"],
  },
  sortPackageJson: true,
  trailingComma: "all",
});
