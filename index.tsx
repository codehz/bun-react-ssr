import { FileSystemRouter, type MatchedRoute } from "bun";
import { NJSON } from "next-json";
import { statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { ClientOnlyError } from "./src/client";
import type { _DisplayMode, _SsrMode } from "./src/types";

declare global {
  var pages: Array<{
    page: Promise<Blob>;
    path: string;
  }>;
}
globalThis.pages ??= [];

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
      layoutName: string;
    } = {
      displayMode: "none",
      layoutName: "layout.tsx",
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
        `__DISPLAY_MODE__=${JSON.stringify(this.options.displayMode)}`,
        `__LAYOUT_NAME__=${JSON.stringify(
          this.options.layoutName.split(".")[0]
        )}`,
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
    switch (this.options.displayMode) {
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
      const pathToFile = `${this.baseDir}/${this.pageDir}/${path}${this.options.layoutName}`;
      if (!(await Bun.file(pathToFile).exists())) continue;
      const defaultExport = (await import(pathToFile)).default;
      if (!defaultExport)
        throw new Error(
          `no default export in ${relative(process.cwd(), route.filePath)}`
        );
      defaultExport && layoutsJsxList.push(defaultExport);
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
