import { Glob, Transpiler, fileURLToPath, pathToFileURL } from "bun";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BunFile, BunPlugin, Import, OnLoadArgs, OnLoadResult } from "bun";
import { normalize } from "path";
import { isValidElement } from "react";
import reactElementToJSXString from "react-element-to-jsx-string";
import { URLpaths } from "./types";
import { isUseClient } from "..";
export * from "./deprecated_build";

globalThis.pages ??= [];
globalThis.serverActions ??= [];

type _Builderoptions = {
  main: _Mainoptions;
  bypass?: _bypassOptions;
  display?: {
    nextjs: {
      layout: string;
    };
  };
};

type _Mainoptions = {
  baseDir: string;
  buildDir?: string;
  pageDir?: string;
  hydrate: string;
  sourcemap?: "external" | "none" | "inline";
  minify?: boolean;
  define?: Record<string, string>;
  plugins?: import("bun").BunPlugin[];
};

type _bypassOptions = {
  useServer: {
    pageName: string[];
    functionName: string[];
  };
};

type _requiredBuildoptions = {
  outdir: string;
  entrypoints: string[];
};
type _otherOptions = {
  external: string[];
};
export class Builder {
  private options: _Mainoptions;
  private bypassoptions: _bypassOptions;
  constructor(options: _Builderoptions) {
    this.options = {
      minify: Bun.env.NODE_ENV === "production",
      pageDir: "pages",
      buildDir: ".build",
      ...options.main,
    };
    this.bypassoptions = {
      useServer: {
        pageName: [
          ...(options.display?.nextjs ? [options.display.nextjs.layout] : []),
          ...(options.bypass?.useServer.pageName ?? []),
        ],
        functionName: [
          "getServerSideProps",
          ...(options.bypass?.useServer.functionName ?? []),
        ],
      },
      ...options.bypass,
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
    } else return result;

    return result;
  }
  async buildPath(path: string) {
    const index = globalThis.pages.findIndex((p) => p.path === path);
    if (index == -1) return;
    globalThis.pages.splice(index, 1);
    await this.build();
  }
  private async clearDuplicateExports(file: BunFile) {
    let fileContent = await file.text();
    let exports = fileContent.matchAll(/export\s*\{([\s\S]*?)\}\s*;/g);
    let _export: { exportStr: string; exportValues: string[] }[] = [];
    for await (const i of exports) {
      _export.push({
        exportStr: i[0],
        exportValues: i[1]
          .replaceAll("\n", "")
          .split(",")
          .map((v) => v.trim()),
      });
    }
    if (_export.length <= 1) return;
    const filteredExports = [...new Set(..._export.map((e) => e.exportValues))];

    for await (const e of _export) {
      fileContent = fileContent.replaceAll(e.exportStr, "");
    }
    const transpiler = new Transpiler({
      loader: "jsx",
    });
    fileContent += `export {${filteredExports.join(", ")}};`;
    await transpiler.transform(fileContent);
    await Bun.write(file, fileContent);
  }
  /** Deprecated */
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
  private ServerActionPluginExt(
    func: Function,
    ModulePath: string,
    isDefault: boolean
  ): string | null {
    if (!func.name.startsWith("Server")) return null;
    const path = ModulePath.split(this.options.pageDir as string).at(1);
    if (!path) return null;

    return `export ${isDefault ? "default " : ""}async function ${
      func.name
    }${this.ServerActionClient(normalize(path), func.name)}`;
  }
  private ServerActionClient(ModulePath: string, funcName: string) {
    return async function (...props: Array<any>) {
      const response = await fetch("<!URLPATH!>", {
        headers: {
          serverActionID: "<!ModulePath!>:<!FuncName!>",
        },
        method: "POST",
        body: JSON.stringify(encodeURI(JSON.stringify(props))),
      });
      if (!response.ok)
        throw new Error(
          "error when Calling server action <!ModulePath!>:<!FuncName!>"
        );
      return response.json();
    }
      .toString()
      .replace("async function", "")
      .replaceAll("<!FuncName!>", funcName)
      .replaceAll("<!ModulePath!>", ModulePath)
      .replaceAll("<!URLPATH!>", URLpaths.serverAction);
  }
  private NextJsPlugin() {
    const self = this;
    return {
      name: "NextJsPlugin",
      target: "browser",
      setup(build) {
        build.onLoad(
          {
            filter: /\.tsx$/,
            namespace: "file",
          },
          async (props) => {
            const pageBasePath = props.path
              .split(self.options.pageDir as string)
              .at(1);

            const relativePath = normalize(
              "/" + (pageBasePath?.split("/").slice(0, -1).join("/") || "")
            );

            if (
              globalThis.pages.find((e) => e.path === relativePath) &&
              pageBasePath
            ) {
              const { baseDir, buildDir, pageDir } = self.options;

              return {
                contents: await Bun.file(
                  normalize(
                    [baseDir, buildDir, pageDir, relativePath].join("/") +
                      `${props.path.split("/").at(-1)?.split(".")[0]}.js`
                  )
                ).text(),
                loader: "js",
              };
            }

            ///////////////////////////////////////////////////////////////////
            const content = await Bun.file(props.path).text();
            let _return = {} as OnLoadResult;
            let compilerType = props.loader;
            const makeReturn = (content: string) => {
              _return = {
                contents: content,
                loader: compilerType,
              };
              return _return;
            };

            const transpiler = new Transpiler({
              loader: "tsx",
              trimUnusedImports: true,
              target: "browser",
            });
            const { imports, exports } = transpiler.scan(content);
            const makeImport = async (namespace?: string) =>
              await self.importerV1({
                imported: imports,
                props: props,
                namespace,
              });
            const makeServerExport = async () =>
              await self.ServerExporter({
                exports: exports,
                _module: await import(props.path),
                props: props,
              });

            if (
              props.path.includes(self.options.pageDir as string) &&
              self.bypassoptions.useServer.pageName.includes(
                props.path.split("/").at(-1) || ""
              )
            )
              return makeReturn(content);

            const _isUseClient = isUseClient(content);
            const _isInPageDir = props.path.includes(
              self.options.pageDir as string
            );

            const makeFullServerFeature = async (namespace?: string) =>
              makeReturn(
                [await makeServerExport(), await makeImport(namespace)].join(
                  "\n"
                )
              );
            const makeClientFeature = () => {
              return makeReturn(content);
            };

            //console.log({ _isInPageDir, _isUseClient, path: props.path });
            if (_isInPageDir && !_isUseClient) {
              //console.log("onload: in pages (server)", props.path);
              return await makeFullServerFeature();
            } else if (_isInPageDir && _isUseClient) {
              //console.log("onload: in pages (client)", props.path);
              return makeReturn(content);
            } else if (!_isInPageDir && !isUseClient) {
              //console.log("onload: external (server)", props.path);
              return makeReturn(content);
            } else if (!_isInPageDir && _isUseClient) {
              //console.log("onload: external (client)", props.path);
              return makeClientFeature();
            }
          }
        );
        build.onResolve(
          {
            filter: /\.tsx$/,
          },
          async ({ path }) => {
            let realPath: undefined | string;
            try {
              realPath = import.meta.resolveSync(
                path.split(".").at(0) as string
              );
            } catch {}

            return {
              path: realPath ?? path,
            };
          }
        );
        build.onResolve(
          {
            filter: /\.ts[x]\?importer$/,
          },
          async (args) => {
            const url = pathToFileURL(args.importer);
            const path = fileURLToPath(new URL(args.path, url));
            let _path: string | undefined = path;
            let external = false;
            if (!(await Bun.file(path).exists())) {
              external = true;
            } else if (path.includes(self.options.pageDir as string))
              _path = path;
            return {
              path: _path ?? args.path,
              external: external,
              namespace: "importer",
            };
          }
        );
        build.onLoad(
          {
            namespace: "importer",
            filter: /\.ts[x]$/,
          },
          async ({ path, loader }) => {
            let file = Bun.file(path);
            if (!(await file.exists())) {
              const realPath = import.meta.resolveSync(
                path.split(self.options.pageDir as string)[1].slice(1)
              );

              file = Bun.file(realPath);
            }
            const fileContent = await file.text();
            return {
              contents: fileContent,
              loader: path.endsWith("tsx") ? "tsx" : "ts",
            };
          }
        );
      },
    } as BunPlugin;
  }
  private async ServerExporter({
    exports,
    _module,
    props,
  }: {
    exports: string[];
    _module: { [key: string]: Function };
    props: OnLoadArgs;
  }) {
    let _content = "";
    const transpiler = new Transpiler({
      loader: "jsx",
      target: "browser",
    });

    for await (const i of exports) {
      if (this.bypassoptions.useServer.functionName.includes(i)) continue;
      const exportName = i === "default" ? _module[i].name : i;

      const reactInjection = `var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);\n`;

      const functionStr = (_module[i].toString() as string).trim();
      //console.log(functionStr);
      const noParamsFunctionStr = `function ${exportName}()`;
      const serverActionString = this.ServerActionPluginExt(
        _module[i],
        props.path,
        _module[i].name === _module?.default?.name
      );
      if (serverActionString) {
        _content += serverActionString + "\n";
        continue;
      }

      if (!functionStr.startsWith(noParamsFunctionStr)) {
        const newContent = `"use injection";\n${reactInjection}\nexport${
          _module[i].name === _module?.default?.name ? " default " : " "
        }${_module[i]
          .toString()
          .replaceAll("jsxDEV", "jsx_dev_runtime.jsxDEV")}`;
        _content += newContent;
        continue;
      }
      const element = (await _module[i]()) as JSX.Element;
      if (!isValidElement(element)) continue;
      const jsxString = reactElementToJSXString(element);
      _content += `export ${i === "default" ? "default " : ""}function ${
        i === "default" ? _module[i].name : i
      }(){ return ${jsxString};}\n`;
      break;
    }
    return _content;
  }
  private async makeClientExport() {}
  private async importerV1({
    imported,
    props,
    namespace,
  }: {
    imported: Import[];
    props: OnLoadArgs;
    namespace?: string;
  }) {
    const transpiler = new Transpiler({
      loader: "tsx",
      trimUnusedImports: true,
      target: "browser",
    });

    const bypassImports = ["bun", "fs", "crypto"];
    let _content = "";
    if (namespace) namespace = "?" + namespace;
    for await (const i of imported) {
      if (bypassImports.includes(i.path)) continue;
      let _modulePath: string = "";
      try {
        _modulePath = import.meta.resolveSync(
          normalize(`${props.path.split("/").slice(0, -1).join("/")}/${i.path}`)
        );
      } catch {
        _modulePath = import.meta.resolveSync(i.path);
      }
      const _module = transpiler.scan(await Bun.file(_modulePath).text());
      const _default = import.meta.require(_modulePath);

      const defaultName =
        typeof _default?.default?.name === "undefined"
          ? ""
          : _default.default.name;

      let bypassNameSpace: undefined | string;
      let _path = i.path;
      try {
        const path = import.meta.resolveSync(
          normalize(
            [props.path.split("/").slice(0, -1).join("/"), i.path].join("/")
          )
        );
      } catch {
        bypassNameSpace = "";
      }
      const newContent = `import { ${
        defaultName === "" ? "" : `default as ${defaultName},`
      } ${_module.exports
        .filter((e) => e !== "default")
        .join(", ")} } from "${_path}.tsx${
        typeof bypassNameSpace !== "undefined"
          ? bypassNameSpace
          : namespace ?? "?importer"
      }";\n`;
      _content += newContent;
    }
    return _content;
  }
  private async CreateBuild(
    options: Partial<_Mainoptions> &
      _requiredBuildoptions &
      Partial<_otherOptions>
  ) {
    const { plugins, define } = this.options;
    const build = await Bun.build({
      ...options,
      publicPath: "./",
      plugins: [
        ...(plugins ?? []),
        ...(options.plugins ?? []),
        this.NextJsPlugin(),
      ],
      target: "browser",
      define: {
        "process.env.NODE_ENV": JSON.stringify(
          Bun.env.NODE_ENV || "development"
        ),
        ...define,
      },
      splitting: true,
    });
    if (!build.success) return build;
    await this.makePostProcessing();
    return build;
  }
  private async makePostProcessing() {
    const builtFile = this.glob(
      normalize(`${this.options.baseDir}/${this.options.buildDir}`)
    );
    let buildFileArray = [];
    for await (const i of builtFile) {
      buildFileArray.push(i);
    }
    const { runtimePath, esmPath } = await this.findUseInjectionModulePath(
      buildFileArray
    );
    for await (const i of buildFileArray) {
      const file = Bun.file(i);
      await this.makeUseInjection({
        file: file,
        runtimePath: runtimePath,
        toESMPath: esmPath,
      });
      await this.clearDuplicateExports(file);
    }
  }
  private async findUseInjectionModulePath(files: Array<string>) {
    const paths = {
      runtimePath: "",
      esmPath: "",
    };
    for await (const i of files) {
      const _path = i.split(this.options.baseDir as string)[1];
      if (!_path.includes("chunk-")) continue;
      const _module = await import(i);
      if (typeof _module.__toESM !== "undefined") paths.esmPath = _path;
      if (typeof _module.require_jsx_dev_runtime !== "undefined")
        paths.runtimePath = _path;
    }

    return paths;
  }
  private async getExternalsFromPackageJson() {
    const packageJson = JSON.parse(await Bun.file("./package.json").text());

    const sections = ["dependencies", "devDependencies", "peerDependencies"],
      externals = new Set();

    for (const section of sections)
      if (packageJson[section])
        Object.keys(packageJson[section]).forEach((_) => externals.add(_));

    return Array.from(externals) as string[];
  }
  private async makeUseInjection({
    file,
    runtimePath,
    toESMPath,
  }: {
    file: BunFile;
    runtimePath: string;
    toESMPath: string;
  }) {
    const content = await file.text();

    if (!content.split("\n").find((l) => l.startsWith('"use injection";')))
      return;
    const newContent = `import { require_jsx_dev_runtime } from "${normalize(
      ["/", runtimePath.split(this.options.buildDir as string)[1]].join("/")
    )}";\nimport { __toESM } from "${normalize(
      ["/", toESMPath.split(this.options.buildDir as string)[1]].join("/")
    )}"
     ${content}`.replaceAll('"use injection";', '"bunext injected!";');

    await Bun.write(file, newContent);
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
