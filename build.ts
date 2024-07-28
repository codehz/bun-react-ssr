import { Glob, fileURLToPath, pathToFileURL, type JavaScriptLoader } from "bun";
import { basename, join, relative } from "node:path";

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export async function build({
  baseDir,
  buildDir = ".build",
  pageDir = "pages",
  hydrate,
  sourcemap,
  minify = Bun.env.NODE_ENV === "production",
  define,
  plugins,
}: {
  baseDir: string;
  buildDir?: string;
  pageDir?: string;
  hydrate: string;
  sourcemap?: "external" | "none" | "inline";
  minify?: boolean;
  define?: Record<string, string>;
  plugins?: import("bun").BunPlugin[];
}) {
  const entrypoints = [join(baseDir, hydrate)];
  const absPageDir = join(baseDir, pageDir);
  const entrypointGlob = new Glob("**/*.{ts,tsx,js,jsx}");
  for await (const path of entrypointGlob.scan({
    cwd: absPageDir,
    onlyFiles: true,
    absolute: true,
  })) {
    entrypoints.push(path);
  }
  const outdir = join(baseDir, buildDir);
  const result = await Bun.build({
    entrypoints,
    sourcemap,
    target: "browser",
    outdir,
    splitting: true,
    minify,
    define: {
      "process.env.NODE_ENV": JSON.stringify(Bun.env.NODE_ENV || "development"),
      ...define,
    },
    plugins: [
      ...(plugins ?? []),
      {
        name: "bun-react-ssr",
        target: "browser",
        setup(build) {
          // workaround for https://github.com/oven-sh/bun/issues/12892
          const trimmer = new Bun.Transpiler({
            deadCodeElimination: true,
            treeShaking: true,
            exports: { eliminate: ["getServerSideProps"] },
            trimUnusedImports: true,
          });
          build.onLoad(
            {
              filter: new RegExp(
                "^" + escapeRegExp(absPageDir) + "/.*" + "\\.ts[x]$"
              ),
            },
            async ({ path, loader }) => {
              const contents = await Bun.file(path).text();
              const tsloader = new Bun.Transpiler({
                loader: loader as JavaScriptLoader,
                autoImportJSX: true,
              });
              if (
                !tsloader.scan(contents).exports.includes("getServerSideProps")
              ) {
                return { contents, loader };
              }
              const js = await tsloader.transform(
                await Bun.file(path).text(),
                loader as JavaScriptLoader
              );
              return {
                contents: await trimmer.transform(js, "js"),
                loader: "js",
              };
            }
          );
        },
      },
    ],
  });
  if (result.success) {
    const hashed: Record<string, string> = {};
    for (const output of result.outputs) {
      if (output.kind === "entry-point" && output.hash) {
        const path = relative(outdir, output.path);
        hashed[`/${path}`] = output.hash;
      }
    }
    Bun.write(
      join(outdir, ".meta.json"),
      JSON.stringify({ version: 1, hashed })
    );
  }
  return result;
}
