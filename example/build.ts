import { Builder } from "bun-react-ssr/src/build";

export async function doBuild() {
  const builder = new Builder({
    baseDir: import.meta.dir,
    hydrate: "./hydrate.ts",
  });
  const result = await builder.build();
  if (result.logs.length) {
    console.log(...result.logs);
  } else if (result.success) {
    console.log("built", new Date());
  }
}

if (import.meta.main) {
  doBuild();
}
