import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

import { glob } from "tinyglobby";

export default defineConfig({
  external: (id) => {
    if (id.startsWith(".") || id.startsWith("/")) return false;
    if (id === "#src" || id.startsWith("#src/")) return false;
    return true;
  },
  input: await glob("src/**/*.ts"),
  plugins: [...dts()],
  output: {
    cleanDir: true,
    dir: "dist",
    preserveModules: true,
    preserveModulesRoot: "src",
    sourcemap: true,
  },
  platform: "node",

  resolve: {
    extensions: [".ts"],
  },
});
