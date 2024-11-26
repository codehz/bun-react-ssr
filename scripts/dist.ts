import dts from "bun-plugin-dts";
import { spawnSync } from "node:child_process";
import { cp, readFile, rm } from "node:fs/promises";

async function glob(pattern: string) {
  const result: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({ onlyFiles: true })) {
    result.push(path);
  }
  return result;
}

await rm("dist", { recursive: true });

await Bun.build({
  target: "bun",
  outdir: "dist",
  minify: false,
  splitting: true,
  sourcemap: "external",
  external: ["react", "react-dom"],
  entrypoints: [...(await glob("*.ts"))],
  plugins: [dts()],
});

for (const file of [
  ...(await glob("*.tsx")),
  ...(await glob("router/**/*.{ts,tsx}")),
  "LICENSE",
  "README.md",
]) {
  await cp(file, `dist/${file}`);
}

const contents = JSON.parse(await readFile("package.json", "utf-8"));
delete contents["private"];
contents.version = spawnSync("git", ["describe", "--tags"], {
  encoding: "utf-8",
})
  .stdout.trim()
  .replace(/-[[:digit:]]\+-g/, "+")
  .replace(/^v/, "");
delete contents.devDependencies["bun-plugin-dts"];
await Bun.write("dist/package.json", JSON.stringify(contents, null, 2));
process.exit(0);
