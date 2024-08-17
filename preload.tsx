import { createContext, use } from "react";
import { preloadModule, type PreloadModuleOptions } from "react-dom";

// @ignore
export const MetaContext = createContext<{
  hash: Record<string, string>;
  dependencies: Record<string, string[]>;
}>({ hash: {}, dependencies: {} });

function* walkDependencies(
  target: string,
  dependencies: Record<string, string[]>
): Generator<string> {
  if (dependencies[target]) {
    for (const dep of dependencies[target]) {
      yield dep;
      yield* walkDependencies(dep, dependencies);
    }
  }
}

function generateHashedName(name: string, hash: Record<string, string>) {
  return hash[name] ? `${name}?${hash[name]}` : name;
}

export function PreloadModule({
  module,
  ...options
}: { module: string } & Partial<PreloadModuleOptions>) {
  if (typeof window === "undefined") {
    try {
      const meta = use(MetaContext);
      preloadModule(generateHashedName(module, meta.hash), {
        as: "script",
        ...options,
      });
      for (const dep of walkDependencies(module, meta.dependencies)) {
        preloadModule(dep, { as: "script", ...options });
      }
    } catch {}
  }
  return null;
}
