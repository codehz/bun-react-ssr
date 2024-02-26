import { Builder } from "bun-react-ssr/src/build";

export const builder = new Builder({
  main: {
    baseDir: process.cwd(),
    buildDir: ".build",
    pageDir: "pages",
    hydrate: "./hydrate.ts",
  },
  display: {
    nextjs: {
      layout: "layout.tsx",
    },
  },
});

export async function doBuild() {
  const result = await builder.build();
  if (!result.success) {
    console.log(
      ...result.logs,
      "\nError while building the app...\n Look for a 'use client' missing probably where there is a hook in an exported function"
    );
  }
}

if (import.meta.main) {
  await doBuild();
}
