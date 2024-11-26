import { FileSystemRouter, type BunFile } from "bun";
import { NJSON } from "next-json";
import { readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { ClientOnlyError } from "./client";
import { hashremap } from "./hash";
import { MetaContext, PreloadModule } from "./preload";

export class StaticRouters {
  server!: FileSystemRouter;
  client!: FileSystemRouter;
  #routes!: Map<string, string>;
  #routes_dump!: string;
  #dependencies!: Record<string, string[]>;
  #hashed!: Record<string, string>;
  #cached = new Set<string>();
  #static_cache: StaticFileCache;
  public baseDir: string;
  public buildDir = ".build";
  public pageDir = "pages";

  constructor(
    base: string,
    {
      buildDir = ".build",
      pageDir = "pages",
    }: {
      buildDir?: string;
      pageDir?: string;
    } = {}
  ) {
    this.baseDir = base;
    this.buildDir = buildDir;
    this.pageDir = pageDir;
    this.#static_cache = new StaticFileCache(join(base, buildDir));
    this.reload();
  }

  reload(excludes: RegExp[] = []) {
    const { baseDir, pageDir, buildDir } = this;
    const metafile = Bun.fileURLToPath(
      import.meta.resolve(join(baseDir, buildDir, ".meta.json"))
    );
    delete require.cache[metafile];
    if (this.#cached.size) {
      for (const cached of this.#cached) {
        delete require.cache[cached];
        for (const dep of scanCacheDependencies(cached, excludes)) {
          delete require.cache[dep];
        }
      }
      this.#cached.clear();
    }
    this.server = new FileSystemRouter({
      dir: join(baseDir, pageDir),
      style: "nextjs",
    });
    this.client = new FileSystemRouter({
      dir: join(baseDir, buildDir, pageDir),
      style: "nextjs",
    });
    const parsed = require(metafile);
    this.#hashed = parsed.hashed;
    this.#dependencies = parsed.dependencies;
    this.#routes = new Map<string, string>();
    this.#static_cache.reset();
    for (const [path, filePath] of Object.entries(this.client.routes)) {
      const target = "/" + relative(join(baseDir, buildDir), filePath);
      const converted = this.#hashed[target]
        ? hashremap(target, this.#hashed[target])
        : target;
      this.#routes.set(path, converted);
    }
    for (const [file, hash] of Object.entries(this.#hashed)) {
      this.#static_cache.remap(
        hashremap(file, hash),
        join(baseDir, buildDir, file)
      );
    }
    this.#routes_dump = NJSON.stringify(Object.fromEntries(this.#routes), {
      omitStack: true,
    });
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
    const file = this.#static_cache.match(pathname);
    if (file) {
      return new Response(file, { headers: staticHeaders });
    }
    const serverSide = this.server.match(request);
    if (!serverSide) return null;
    const clientSide = this.client.match(request);
    if (!clientSide)
      throw new TypeError(
        "No client-side script found for server-side component: " +
          serverSide.filePath
      );
    const module = await import(serverSide.filePath);
    this.#cached.add(serverSide.filePath);
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
    const hashedBootstrapModules = bootstrapModules?.map((name) => {
      const hash = this.#hashed[name];
      if (hash) return hashremap(name, hash);
      return name;
    });
    const stream = await renderToReadableStream(
      <Shell route={serverSide.pathname + search} {...staticProps} {...result}>
        <MetaContext.Provider
          value={{ hash: this.#hashed, dependencies: this.#dependencies }}
        >
          {hashedBootstrapModules?.map((name, idx) => (
            <PreloadModule key={idx} module={name} />
          ))}
          <PreloadModule
            module={this.#routes.get(serverSide.name)!.split("?")[0]}
          />
          <module.default {...result?.props} />
        </MetaContext.Provider>
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
        bootstrapModules: hashedBootstrapModules,
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

function* scanCacheDependencies(
  target: string,
  excludes: RegExp[] = []
): Generator<string> {
  try {
    const imports = new Bun.Transpiler({
      loader: target.endsWith(".tsx")
        ? "tsx"
        : target.endsWith(".ts")
        ? "ts"
        : "jsx",
    }).scanImports(readFileSync(target, "utf-8"));
    for (const imp of imports) {
      if (imp.kind === "import-statement") {
        const path = require.resolve(
          Bun.fileURLToPath(import.meta.resolve(imp.path, target))
        );
        if (
          path.includes("/node_modules/") ||
          excludes.some((x) => path.match(x))
        )
          continue;
        if (path in require.cache) {
          yield path;
          yield* scanCacheDependencies(path, excludes);
        }
      }
    }
  } catch {}
}

export class StaticFileCache {
  #cache = new Map<string, BunFile>();
  constructor(public base: string) {}
  reset() {
    this.#cache.clear();
  }
  remap(pathname: string, real: string) {
    this.#cache.set(pathname, Bun.file(real));
  }
  match(pathname: string): BunFile | undefined {
    if (this.#cache.has(pathname)) {
      return this.#cache.get(pathname)!;
    }
    const final = join(this.base, pathname);
    try {
      const stat = statSync(final);
      if (stat?.isFile()) {
        const file = Bun.file(final);
        this.#cache.set(pathname, file);
        return file;
      }
    } catch {}
  }
}

/** @deprecated */
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
