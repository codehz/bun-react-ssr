import { Glob, Transpiler, fileURLToPath, pathToFileURL } from "bun";
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
          build.onLoad(
            {
              filter: new RegExp(
                "^" + escapeRegExp(absPageDir) + "/.*" + "\\.ts[x]$"
              ),
            },
            async ({ path, loader }) => {
              const search = new URLSearchParams();
              search.append("client", "1");
              search.append("loader", loader);
              return {
                contents:
                  "export { default } from " +
                  JSON.stringify("./" + basename(path) + "?client"),
                loader: "ts",
              };
            }
          );
          build.onResolve(
            { filter: /\.ts[x]\?client$/ },
            async ({ importer, path }) => {
              const url = pathToFileURL(importer);
              return {
                path: fileURLToPath(new URL(path, url)),
                namespace: "client",
              };
            }
          );
          build.onLoad(
            { namespace: "client", filter: /\.ts[x]$/ },
            async ({ path, loader }) => {
              const contents = await Bun.file(path).text();
              return {
                contents: contents.replaceAll(
                  /\/\/\s*@server-side[^\n\S]*\n[^\n]+\n/g,
                  ""
                ),
                loader,
              };
            }
          );
        },
      },
    ],
  });
  if (result.success) {
    const transpiler = new Transpiler({ loader: "js" });
    const hashed: Record<string, string> = {};
    const dependencies: Record<string, string[]> = {};
    for (const output of result.outputs) {
      const path = relative(outdir, output.path);
      if (output.kind === "entry-point" && output.hash) {
        hashed[`/${path}`] = output.hash;
      }
      if (output.kind === "entry-point" || output.kind === "chunk") {
        const imports = transpiler.scanImports(await output.text());
        dependencies[`/${path}`] = imports
          .filter((x) => x.kind === "import-statement")
          .map((x) => "/" + join(path, "..", x.path));
      }
    }
    Bun.write(
      join(outdir, ".meta.json"),
      JSON.stringify({ version: 2, hashed, dependencies })
    );
  }
  return result;
}
