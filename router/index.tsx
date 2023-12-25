import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { getRouteMatcher } from "./utils/get-route-matcher";
export * from "./components/Link";
export * from "./hooks/useLink";

const globalX = globalThis as unknown as {
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __ROUTES__: Record<string, string>;
  __SERVERSIDE_PROPS__?: any;
};

const match = globalX.__ROUTES__
  ? getRouteMatcher(globalX.__ROUTES__)
  : () => null;

async function fetchServerSideProps(pathname: string) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: {
      Accept: "application/vnd.server-side-props",
      "Cache-Control": "no-cache",
    },
  });
  if (response.ok) {
    const text = await response.text();
    return eval(`(${text})`);
  }
  throw new Error("Failed to fetch");
}

export const ReloadContext = createContext(async (): Promise<void> => {});

export const RouterHost = ({
  children,
  Shell,
  onRouteUpdated,
}: {
  children: React.ReactElement;
  Shell: React.ComponentType<{ children: React.ReactElement }>;
  onRouteUpdated?: (path: string) => void;
}) => {
  const pathname = useLocationProperty(
    () => location.pathname + location.search,
    () => globalX.__INITIAL_ROUTE__
  );
  const [current, setCurrent] = useState(children);
  const version = useRef<number>(0);
  const reload = useCallback(
    async (target = location.pathname + location.search) => {
      if (typeof target !== "string") throw new Error("invalid target", target);
      const currentVersion = ++version.current;
      const [module, props] = await Promise.all([
        import(match(target.split("?")[0])!.value),
        fetchServerSideProps(target),
      ]);
      if (currentVersion === version.current) {
        if (props?.redirect) {
          navigate(props.redirect);
        } else {
          onRouteUpdated?.(target);
          setCurrent(
            <Shell {...props}>
              <module.default {...props?.props} />
            </Shell>
          );
        }
      }
    },
    []
  );
  useEffect(() => {
    if (pathname !== globalX.__INITIAL_ROUTE__) {
      reload(pathname).catch((e) => {
        console.log(e);
        location.href = pathname;
      });
    } else {
      onRouteUpdated?.(pathname);
      // @ts-ignore
      delete globalX.__INITIAL_ROUTE__;
    }
  }, [pathname]);
  return (
    <ReloadContext.Provider value={reload}>{current}</ReloadContext.Provider>
  );
};

const subscribeToLocationUpdates = (callback: () => void) => {
  for (const event of events) {
    addEventListener(event, callback);
  }
  return () => {
    for (const event of events) {
      removeEventListener(event, callback);
    }
  };
};

export function useLocationProperty<S extends Location[keyof Location]>(
  fn: () => S,
  ssrFn?: () => S
) {
  return useSyncExternalStore(subscribeToLocationUpdates, fn, ssrFn);
}

export function usePathname() {
  return useLocationProperty(
    () => location.pathname,
    () => globalX.__INITIAL_ROUTE__
  );
}

export const navigate = (to: string, { replace = false } = {}) =>
  history[replace ? eventReplaceState : eventPushState](null, "", to);

const eventPopstate = "popstate";
const eventPushState = "pushState";
const eventReplaceState = "replaceState";
const eventHashchange = "hashchange";
const events = [
  eventPopstate,
  eventPushState,
  eventReplaceState,
  eventHashchange,
];

if (typeof history !== "undefined") {
  for (const type of [eventPushState, eventReplaceState] as const) {
    const original = history[type];
    history[type] = function (
      ...args: Parameters<(typeof history)[typeof type]>
    ) {
      const result = original.apply(this, args);
      const event = new Event(type);
      unstable_batchedUpdates(() => {
        dispatchEvent(event);
      });
      return result;
    };
  }
}
