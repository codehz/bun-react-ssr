import { build } from "bun-react-ssr/build";

export async function doBuild() {
  const result = await build({
    baseDir: import.meta.dir,
    hydrate: "./hydrate.ts",
  });
  if (result.logs.length) {
    console.log(...result.logs);
  } else if (result.success) {
    console.log("built", new Date());
  }
}

if (import.meta.main) {
  doBuild();
}
