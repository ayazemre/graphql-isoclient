import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import { glob } from "tinyglobby";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runtimeSectionFileNames } from "./src/lib/runtimeSections.ts";

const copyRuntimeSectionSources = {
  name: "copy-runtime-section-sources",
  async writeBundle() {
    const targetDirectoryPath = join(process.cwd(), "dist", "lib");

    await mkdir(targetDirectoryPath, { recursive: true });

    await Promise.all(
      runtimeSectionFileNames.map(async (sectionFileName) => {
        const sectionSource = await readFile(join(process.cwd(), "src", "lib", sectionFileName), "utf8");

        await writeFile(join(targetDirectoryPath, sectionFileName), sectionSource, "utf8");
      }),
    );
  },
};

export default defineConfig({
  external: (id) => {
    if (id.startsWith(".") || id.startsWith("/")) return false;
    if (id === "#src" || id.startsWith("#src/")) return false;
    return true;
  },
  input: await glob("src/**/*.ts"),
  output: {
    cleanDir: true,
    dir: "dist",
    preserveModules: true,
    preserveModulesRoot: "src",
    sourcemap: true,
  },
  platform: "node",
  plugins: [...dts(), copyRuntimeSectionSources],
  resolve: {
    extensions: [".ts"],
  },
});
