import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { RouterHost } from "./router";
import { getRouteMatcher } from "./router/utils/get-route-matcher";
import type { ServerSideProps } from "./types";

const globalX = globalThis as unknown as {
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __ROUTES__: Record<string, string>;
  __STATIC_PROPS__?: Record<string, unknown>;
  __SERVERSIDE_PROPS__?: any;
};

const match = getRouteMatcher(globalX.__ROUTES__);

export async function hydrate(
  Shell: React.ComponentType<
    { children: React.ReactElement } & ServerSideProps
  >,
  {
    onRecoverableError = () => void 8,
    ...options
  }: Omit<
    React.ComponentPropsWithoutRef<typeof RouterHost>,
    "Shell" | "children"
  > & {
    onRecoverableError?: (error: unknown, errorInfo: ErrorInfo) => void;
  } = {}
) {
  const matched = match(globalX.__INITIAL_ROUTE__.split("?")[0])!;
  const Initial = await import(matched.value);
  return hydrateRoot(
    document,
    <RouterHost
      Shell={Shell}
      staticProps={globalX.__STATIC_PROPS__}
      {...options}
    >
      <Shell
        route={globalX.__INITIAL_ROUTE__}
        {...globalX.__STATIC_PROPS__}
        {...globalX.__SERVERSIDE_PROPS__}
      >
        <Initial.default {...globalX.__SERVERSIDE_PROPS__?.props} />
      </Shell>
    </RouterHost>,
    { onRecoverableError }
  );
}
