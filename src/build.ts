import { Glob, fileURLToPath, pathToFileURL } from "bun";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function glob(
  path: string,
  pattern = "**/*.{ts,tsx,js,jsx}"
): AsyncIterableIterator<string> {
  const glob = new Glob(pattern);
  return glob.scan({ cwd: path, onlyFiles: true, absolute: true });
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
  for await (const path of glob(absPageDir)) {
    entrypoints.push(path);
  }
  const result = await Bun.build({
    entrypoints,
    sourcemap,
    target: "browser",
    outdir: join(baseDir, buildDir),
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
              return { contents: await Bun.file(path).text(), loader };
            }
          );
        },
      },
    ],
  });
  if (result.success) {
    for await (const path of glob(join(baseDir, buildDir))) {
      if (result.outputs.every((x) => x.path !== path)) {
        await unlink(path);
      }
    }
  }
  return result;
}
