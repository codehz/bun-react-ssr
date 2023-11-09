import { FileSystemRouter } from "bun";
import { NJSON } from "next-json";
import { join, relative } from "node:path";
import { Suspense } from "react";
import { renderToReadableStream } from "react-dom/server";

export class StaticRouters {
  readonly server: FileSystemRouter;
  readonly client: FileSystemRouter;
  readonly #routes_dump: string;

  constructor(
    public baseDir: string,
    public buildDir = ".build",
    public pageDir = "pages"
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
    }: {
      Shell: React.ComponentType<{ children: React.ReactElement }>;
      preloadScript?: string;
      bootstrapModules?: string[];
      context?: T;
    }
  ) {
    const { pathname, search } = new URL(request.url);
    const staticResponse = await serveFromDir({
      directory: this.buildDir,
      path: pathname,
    });
    if (staticResponse) return staticResponse;
    const serverSide = this.server.match(request);
    if (!serverSide) return;
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
        },
      });
    }
    if (result?.redirect) {
      return new Response(null, {
        status: 302,
        headers: { Location: result.redirect },
      });
    }
    const stream = await renderToReadableStream(
      <Suspense>
        <Shell {...result}>
          <module.default {...result?.props} />
        </Shell>
      </Suspense>,
      {
        signal: request.signal,
        bootstrapScriptContent: [
          preloadScript,
          `__PAGES_DIR__=${JSON.stringify(this.pageDir)}`,
          `__INITIAL_ROUTE__=${JSON.stringify(serverSide.pathname + search)}`,
          `__ROUTES__=${this.#routes_dump}`,
          `__SERVERSIDE_PROPS__=${stringified}`,
        ]
          .filter(Boolean)
          .join(";"),
        bootstrapModules,
      }
    );
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
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
      const file = Bun.file(pathWithSuffix);
      if (await file.exists()) {
        return new Response(Bun.file(pathWithSuffix));
      }
    } catch (err) {}
  }

  return null;
}
