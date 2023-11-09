import { Suspense } from "react";
import { hydrateRoot } from "react-dom/client";
import { RouterHost } from "./router";
import { getRouteMatcher } from "./router/utils/get-route-matcher";
import { ServerSideProps } from "./types";

const globalX = globalThis as unknown as {
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __ROUTES__: Record<string, string>;
  __SERVERSIDE_PROPS__?: any;
};

const match = getRouteMatcher(globalX.__ROUTES__);

export async function hydrate(
  Shell: React.ComponentType<{ children: React.ReactElement } & ServerSideProps>
) {
  const matched = match(globalX.__INITIAL_ROUTE__.split("?")[0])!;
  const Initial = await import(matched.value);
  return hydrateRoot(
    document,
    <RouterHost Shell={Shell}>
      <Shell {...globalX.__SERVERSIDE_PROPS__}>
        <Initial.default {...globalX.__SERVERSIDE_PROPS__?.props} />
      </Shell>
    </RouterHost>
  );
}
