import {
  FileSystemRouter,
  type MatchedRoute,
  Glob,
  readableStreamToText,
} from "bun";
import { NJSON } from "next-json";
import { statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { ClientOnlyError } from "./src/client";
import type { _DisplayMode, _SsrMode } from "./src/types";
import { normalize } from "path";
declare global {
  var pages: Array<{
    page: Promise<Blob>;
    path: string;
  }>;
  var serverActions: Array<{
    path: string;
    actions: Array<Function>;
  }>;
}
globalThis.pages ??= [];
globalThis.serverActions ??= [];

export class StaticRouters {
  readonly server: FileSystemRouter;
  readonly client: FileSystemRouter;
  readonly #routes_dump: string;

  constructor(
    public baseDir: string,
    public buildDir = ".build",
    public pageDir = "pages",
    public options: {
      displayMode: _DisplayMode;
      ssrMode: _SsrMode;
    } = {
      displayMode: {
        none: "none",
      },
      ssrMode: "none",
    }
  ) {
    this.server = new FileSystemRouter({
      dir: join(baseDir, pageDir),
      style: "nextjs",
    });
    this.client = new FileSystemRouter({
      dir: join(baseDir, buildDir, pageDir),
      style: "nextjs",
    });
    this.#routes_dump = NJSON.stringify(
      Object.fromEntries(
        Object.entries(this.client.routes).map(([path, filePath]) => [
          path,
          "/" + relative(join(baseDir, buildDir), filePath),
        ])
      ),
      { omitStack: true }
    );
  }

  async serve<T = void>(
    request: Request,
    {
      Shell,
      preloadScript,
      bootstrapModules,
      context,
      onError = (error, errorInfo) => {
        if (error instanceof ClientOnlyError) return;
        console.error(error, errorInfo);
      },
    }: {
      Shell: React.ComponentType<{ children: React.ReactElement }>;
      preloadScript?: string;
      bootstrapModules?: string[];
      context?: T;
      onError?(error: unknown, errorInfo: React.ErrorInfo): string | void;
    }
  ): Promise<Response | null> {
    const { pathname, search } = new URL(request.url);
    const serverAction = await this.serverActionGetter(request);
    if (serverAction) return serverAction;

    const staticResponse = await serveFromDir({
      directory: this.buildDir,
      path: pathname,
    });
    if (staticResponse) return new Response(staticResponse);
    const serverSide = this.server.match(request);
    if (!serverSide) return null;
    const clientSide = this.client.match(request);
    if (!clientSide)
      throw new TypeError(
        "No client-side script found for server-side component: " +
          serverSide.filePath
      );

    const module = await import(serverSide.filePath);
    const result = await module.getServerSideProps?.({
      params: serverSide.params,
      req: request,
      query: serverSide.query,
      context,
    });
    const stringified = NJSON.stringify(result, { omitStack: true });
    if (request.headers.get("Accept") === "application/vnd.server-side-props") {
      return new Response(stringified, {
        headers: {
          "Content-Type": "application/vnd.server-side-props",
          "Cache-Control": "no-store",
        },
      });
    }

    const renderOptionData = {
      signal: request.signal,
      bootstrapScriptContent: [
        preloadScript,
        `__PAGES_DIR__=${JSON.stringify(this.pageDir)}`,
        `__INITIAL_ROUTE__=${JSON.stringify(serverSide.pathname + search)}`,
        `__ROUTES__=${this.#routes_dump}`,
        `__SERVERSIDE_PROPS__=${stringified}`,
        `__DISPLAY_MODE__=${JSON.stringify(
          Object.keys(this.options.displayMode)[0]
        )}`,
        this.options.displayMode?.nextjs
          ? `__LAYOUT_NAME__=${JSON.stringify(
              this.options?.displayMode?.nextjs?.layout.split(".").at(0)
            )}`
          : "",
      ]
        .filter(Boolean)
        .join(";"),
      bootstrapModules,
      onError,
    };

    if (this.options.ssrMode === "nextjs") {
      const page = globalThis.pages.find(
        (p) => p.path === serverSide.pathname
      )?.page;
      if (page) {
        return new Response((await page).stream(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
    }

    if (result?.redirect) {
      return new Response(null, {
        status: 302,
        headers: { Location: result.redirect },
      });
    }

    let jsxToServe: JSX.Element = <module.default {...result?.props} />;
    switch (Object.keys(this.options.displayMode)[0] as keyof _DisplayMode) {
      case "nextjs":
        jsxToServe = await this.stackLayouts(serverSide, jsxToServe);
        break;
    }
    const FinalJSX = (
      <Shell route={serverSide.pathname + search} {...result}>
        {jsxToServe}
      </Shell>
    );
    const stream = await renderToReadableStream(FinalJSX, renderOptionData);
    const _stream = stream.tee();

    switch (this.options.ssrMode) {
      case "nextjs":
        if (globalThis.pages.find((p) => p.path === serverSide.pathname)) break;
        globalThis.pages.push({
          page: Bun.readableStreamToBlob(_stream[1]),
          path: serverSide.pathname,
        });
        break;
    }

    return new Response(_stream[0], {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  private async serverActionGetter(request: Request): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    if (pathname !== "/ServerActionGetter") return null;
    const reqData = this.extractServerActionHeader(request);
    if (!reqData) return null;
    const props = await this.extractPostData(request);
    const module = globalThis.serverActions.find(
      (s) => s.path === reqData.path.slice(1)
    );
    if (!module) return null;
    const call = module.actions.find((f) => f.name === reqData.call);
    if (!call) return null;
    const result = JSON.stringify(await call(...props));
    return new Response(result);
  }
  private extractServerActionHeader(request: Request) {
    const serverActionData = request.headers.get("serveractionid")?.split(":");
    if (!serverActionData) return null;
    return {
      path: serverActionData[0],
      call: serverActionData[1],
    };
  }
  private async extractPostData(request: Request) {
    return JSON.parse(decodeURI(await request.json()));
  }

  updateRoute(path: string) {
    const index = globalThis.pages.findIndex((p) => p.path === path);
    if (index == -1) return;
    globalThis.pages.splice(index, 1);
  }

  /**
   * Next.js like module stacking
   */
  async stackLayouts(route: MatchedRoute, pageElement: JSX.Element) {
    const layouts = route.pathname.split("/").slice(1);
    type _layout = ({ children }: { children: JSX.Element }) => JSX.Element;
    type _layoutPromise = ({
      children,
    }: {
      children: JSX.Element;
    }) => Promise<JSX.Element>;

    let layoutsJsxList: Array<_layout | _layoutPromise> = [];
    let index = 0;
    for await (const i of layouts) {
      const path = layouts.slice(0, index).join("/");
      const pathToFile = `${this.baseDir}/${this.pageDir}/${path}${
        this.options.displayMode.nextjs?.layout as string
      }`;
      if (!(await Bun.file(pathToFile).exists())) continue;
      const defaultExport = (await import(pathToFile)).default;
      if (!defaultExport)
        throw new Error(
          `no default export in ${relative(process.cwd(), route.filePath)}`
        );
      if (defaultExport) layoutsJsxList.push(defaultExport);
      index += 1;
    }
    layoutsJsxList.push(() => pageElement);
    layoutsJsxList = layoutsJsxList.reverse();
    let currentJsx: JSX.Element = <></>;
    for await (const Layout of layoutsJsxList) {
      currentJsx = await Layout({ children: currentJsx });
    }
    return currentJsx;
  }

  async InitServerActions() {
    globalThis.serverActions = [];
    const glob = new Glob("**/*.{ts,tsx,js,jsx}");
    const files = Array.from(
      glob.scanSync({
        cwd: this.pageDir,
        onlyFiles: true,
      })
    );

    for await (const f of files) {
      const filePath = normalize(`${this.pageDir}/${f}`);
      const file = await Bun.file(filePath).text();
      if (isUseClient(file)) continue;
      const _module = await import(normalize(`${process.cwd()}/${filePath}`));
      const ServerActions = Object.keys(_module).filter((f) =>
        f.startsWith("Server")
      );
      globalThis.serverActions.push({
        path: f,
        actions: ServerActions.map((name) => _module[name]),
      });
    }
    return this;
  }
}

export function isUseClient(fileData: string) {
  const line = fileData
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .at(0);
  if (!line) return false;
  if (line.startsWith("'use client'") || line.startsWith('"use client"'))
    return true;
  return false;
}

export async function serveFromDir(config: {
  directory: string;
  path: string;
  suffixes?: string[];
}) {
  const basePath = join(config.directory, config.path);
  const suffixes = config.suffixes ?? ["", ".html", "index.html"];

  for (const suffix of suffixes) {
    try {
      const pathWithSuffix = join(basePath, suffix);
      const stat = statSync(pathWithSuffix);
      if (stat?.isFile()) {
        return Bun.file(pathWithSuffix);
      }
    } catch (err) {}
  }

  return null;
}
