import { hydrateRoot, type ErrorInfo } from "react-dom/client";
import { RouterHost } from "../router";
import { getRouteMatcher } from "../router/utils/get-route-matcher";
import { ServerSideProps, _DisplayMode } from "./types";

type _GlobalData = {
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __ROUTES__: Record<string, string>;
  __SERVERSIDE_PROPS__?: any;
  __DISPLAY_MODE__: _DisplayMode;
  __LAYOUT_NAME__: string;
};

const globalX = globalThis as unknown as _GlobalData;

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

  let JsxToDisplay: JSX.Element = (
    <Initial.default {...globalX.__SERVERSIDE_PROPS__?.props} />
  );

  switch (globalX.__DISPLAY_MODE__) {
    case "nextjs":
      JsxToDisplay = await LayoutStacker({
        pageJsx: JsxToDisplay,
        global: globalX,
        matched: matched,
      });
      break;
  }

  console.log(matched.value);

  return hydrateRoot(
    document,
    <RouterHost Shell={Shell} {...options}>
      <Shell
        route={globalX.__INITIAL_ROUTE__}
        {...globalX.__SERVERSIDE_PROPS__}
      >
        {JsxToDisplay}
      </Shell>
    </RouterHost>,
    { onRecoverableError }
  );
}

type _MatchedStruct = {
  path: string;
  value: string;
  params: {
    [paramName: string]: string | string[];
  };
};

async function LayoutStacker({
  pageJsx,
  global,
  matched,
}: {
  pageJsx: JSX.Element;
  global: _GlobalData;
  matched: _MatchedStruct;
}) {
  const layoutPath = global.__ROUTES__[global.__LAYOUT_NAME__];
  if (matched.path === "/" && typeof layoutPath !== "undefined") {
    const Layout__ = await import(layoutPath);
    return <Layout__>{pageJsx}</Layout__>;
  }
  console.log("what???");

  console.log(global.__ROUTES__, matched, global.__LAYOUT_NAME__);
  return <></>;
}
