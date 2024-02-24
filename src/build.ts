import { Glob, Transpiler, fileURLToPath, pathToFileURL } from "bun";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BunPlugin } from "bun";
import { normalize } from "path";
import { isValidElement } from "react";
import reactElementToJSXString from "react-element-to-jsx-string";
export * from "./deprecated_build";

type _Builderoptions = {
  baseDir: string;
  buildDir?: string;
  pageDir?: string;
  hydrate: string;
  sourcemap?: "external" | "none" | "inline";
  minify?: boolean;
  define?: Record<string, string>;
  plugins?: import("bun").BunPlugin[];
};
type _requiredBuildoptions = {
  outdir: string;
  entrypoints: string[];
};
type _otherOptions = {
  external: string[];
};
export class Builder {
  private options: _Builderoptions;
  constructor(options: _Builderoptions) {
    this.options = {
      minify: Bun.env.NODE_ENV === "production",
      pageDir: "pages",
      buildDir: ".build",
      ...options,
    };
  }
  async build() {
    const { baseDir, hydrate, pageDir, sourcemap, buildDir, minify, plugins } =
      this.options;
    const entrypoints = [join(baseDir, hydrate)];
    const absPageDir = join(baseDir, pageDir as string);
    for await (const path of this.glob(absPageDir)) {
      entrypoints.push(path);
    }
    const result = await this.CreateBuild({
      entrypoints,
      sourcemap,
      outdir: join(baseDir, buildDir as string),
      minify,
      plugins: [...(plugins ?? [])],
    });
    if (result.success) {
      for await (const path of this.glob(join(baseDir, buildDir as string))) {
        if (result.outputs.every((x) => x.path !== path)) {
          await unlink(path);
        }
      }
    }
    return result;
  }
  buildPath(path: string) {
    const index = globalThis.pages.findIndex((p) => p.path === path);
    if (index == -1) return;
    globalThis.pages.splice(index, 1);
    return this.build();
  }
  private BunReactSsrPlugin(absPageDir: string) {
    const self = this;
    return {
      name: "bun-react-ssr",
      target: "browser",
      setup(build) {
        build.onLoad(
          {
            filter: new RegExp(
              "^" + self.escapeRegExp(absPageDir) + "/.*" + "\\.ts[x]$"
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
    } as BunPlugin;
  }
  private UseServerPlugin(pageDir: string) {
    const self = this;
    return {
      name: "use-server-and-revalidate",
      target: "browser",
      setup(build) {
        build.onLoad(
          {
            filter: /\.tsx$/,
          },
          async (props) => {
            const relativePath = normalize(
              "/" +
                props.path
                  .split(self.options.pageDir as string)[1]
                  .split("/")
                  .slice(0, -1)
                  .join("/")
            );
            if (globalThis.pages.find((e) => e.path === relativePath)) {
              const { baseDir, buildDir, pageDir } = self.options;
              return {
                contents: await Bun.file(
                  normalize(
                    [baseDir, buildDir, pageDir, relativePath].join("/") +
                      `${props.path.split("/").at(-1)?.split(".")[0]}.js`
                  )
                ).text(),
                loader: "jsx",
              };
            }
            const content = await Bun.file(props.path).text();
            let _content = "";
            let compilerType: "tsx" | "jsx" | "ts" | "js" = "tsx";
            const lines = content.split("\n");
            for await (const line of lines) {
              const l = line.trim();
              if (l.length == 0) continue;
              else if (
                l.startsWith("'use client'") ||
                l.startsWith('"use client"') ||
                !props.path.startsWith(
                  normalize(`${process.cwd()}/${pageDir}`)
                ) ||
                props.path.endsWith("layout.tsx")
              ) {
                _content = content;
                break;
              }
              const _module = await import(props.path);
              const transpiler = new Transpiler({
                loader: "tsx",
                trimUnusedImports: true,
                target: "browser",
              });
              const { imports, exports } = transpiler.scan(content);
              const bypassImports = ["bun", "fs", "crypto"];
              for await (const i of imports) {
                if (bypassImports.includes(i.path)) continue;
                const _modulePath = normalize(
                  `${props.path.split("/").slice(0, -1).join("/")}/${i.path}`
                );
                const _module = transpiler.scan(
                  await Bun.file(import.meta.resolveSync(_modulePath)).text()
                );
                const _default = import.meta.require(_modulePath);
                const defaultName =
                  typeof _default?.default?.name === "undefined"
                    ? ""
                    : _default.default.name;
                _content += `import ${defaultName} {${_module.exports
                  .filter((e) => e !== "default")
                  .join(", ")}} from "${i.path}.tsx?importer";\n`;
              }

              for await (const i of exports) {
                const functionStr = (_module[i].toString() as string).trim();
                const noParamsFunctionStr = `function ${
                  i === "default" ? _module[i].name : i
                }()`;
                if (!functionStr.startsWith(noParamsFunctionStr)) {
                  _content += `export ${_module[i].toString()}`;
                  continue;
                }
                const element = (await _module[i]()) as JSX.Element;
                if (!isValidElement(element)) continue;
                const jsxString = reactElementToJSXString(element);
                _content += `export ${
                  i === "default" ? "default " : ""
                }function ${
                  i === "default" ? _module[i].name : i
                }(){ return ${jsxString};}\n`;

                compilerType = "jsx";
                break;
              }
              break;
            }
            return {
              contents: _content,
              loader: compilerType,
            };
          }
        );
        build.onResolve(
          {
            filter: /\.ts[x]\?importer$/,
          },
          async (args) => {
            const url = pathToFileURL(args.importer);
            return {
              namespace: "importer",
              path: fileURLToPath(new URL(args.path, url)),
            };
          }
        );
        build.onLoad(
          {
            namespace: "importer",
            filter: /\.ts[x]$/,
          },
          async ({ path, loader }) => {
            return {
              contents: await Bun.file(path).text(),
              loader,
            };
          }
        );
      },
    } as BunPlugin;
  }
  private CreateBuild(
    options: Partial<_Builderoptions> &
      _requiredBuildoptions &
      Partial<_otherOptions>
  ) {
    const { baseDir, plugins, pageDir, define } = this.options;
    const absPageDir = join(baseDir, pageDir as string);
    return Bun.build({
      publicPath: "./",
      plugins: [
        ...(plugins ?? []),
        this.UseServerPlugin(pageDir as string),
        this.BunReactSsrPlugin(absPageDir),
      ],
      target: "browser",
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          Bun.env.NODE_ENV || "development"
        ),
        ...define,
      },
      splitting: true,
      ...options,
    });
  }
  private glob(
    path: string,
    pattern = "**/*.{ts,tsx,js,jsx}"
  ): AsyncIterableIterator<string> {
    const glob = new Glob(pattern);
    return glob.scan({ cwd: path, onlyFiles: true, absolute: true });
  }
  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
  }
}
