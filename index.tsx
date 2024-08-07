import { FileSystemRouter } from "bun";
import { NJSON } from "next-json";
import { statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { ClientOnlyError } from "./client";

export class StaticRouters {
  readonly server: FileSystemRouter;
  readonly client: FileSystemRouter;
  readonly #routes_dump: string;
  readonly #hashed: Record<string, string>;

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
    this.#hashed = require(join(baseDir, buildDir, ".meta.json")).hashed;
    this.#routes_dump = NJSON.stringify(
      Object.fromEntries(
        Object.entries(this.client.routes).map(([path, filePath]) => {
          let target = "/" + relative(join(baseDir, buildDir), filePath);
          if (this.#hashed[target]) target += `?${this.#hashed[target]}`;
          return [path, target];
        })
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
      noStreaming,
      staticHeaders,
      staticProps,
    }: {
      Shell: React.ComponentType<{ children: React.ReactElement }>;
      preloadScript?: string;
      bootstrapModules?: string[];
      context?: T;
      onError?(error: unknown, errorInfo: React.ErrorInfo): string | void;
      noStreaming?: boolean;
      staticHeaders?: HeadersInit;
      staticProps?: Record<string, unknown>;
    }
  ): Promise<Response | null> {
    const { pathname, search } = new URL(request.url);
    const staticResponse = await serveFromDir({
      directory: this.buildDir,
      path: pathname,
    });
    if (staticResponse)
      return new Response(staticResponse, { headers: staticHeaders });
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
    if (result?.redirect) {
      return new Response(null, {
        status: 302,
        headers: { Location: result.redirect },
      });
    }
    const stream = await renderToReadableStream(
      <Shell route={serverSide.pathname + search} {...staticProps} {...result}>
        <module.default {...result?.props} />
      </Shell>,
      {
        signal: request.signal,
        bootstrapScriptContent: [
          preloadScript,
          `__PAGES_DIR__=${JSON.stringify(this.pageDir)}`,
          `__INITIAL_ROUTE__=${JSON.stringify(serverSide.pathname + search)}`,
          `__ROUTES__=${this.#routes_dump}`,
          !!staticProps && `__STATIC_PROPS__=${NJSON.stringify(staticProps)}`,
          `__SERVERSIDE_PROPS__=${stringified}`,
        ]
          .filter(Boolean)
          .join(";"),
        bootstrapModules: bootstrapModules?.map((name) => {
          const hash = this.#hashed[name];
          if (hash) return `${name}?${hash}`;
          return name;
        }),
        onError,
      }
    );
    if (noStreaming) {
      return new Response(await Bun.readableStreamToBlob(stream), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response(stream, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
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
      const stat = statSync(pathWithSuffix);
      if (stat?.isFile()) {
        return Bun.file(pathWithSuffix);
      }
    } catch (err) {}
  }

  return null;
}
