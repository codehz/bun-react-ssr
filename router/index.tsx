import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
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

const VersionContext = createContext(0);

/**
 * a hook that returns a version number that is incremented on each route change or reload
 * @returns the current version (incremented on each route change or reload)
 */
export const useLoadingVersion = () => useContext(VersionContext);

/**
 * a hook that runs an effect when the version changes, which is incremented on each route change or reload
 * @param effect the effect to run
 * @param deps the dependencies
 */
export const useLoadingEffect = (
  effect: React.EffectCallback,
  deps: React.DependencyList = []
) => {
  useEffect(effect, [useContext(VersionContext), ...deps]);
};

/**
 * a context that can be used to reload the current page
 */
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
  const [version, setVersion] = useState(0);
  const versionRef = useRef<number>(version);
  const reload = useCallback(
    async (target = location.pathname + location.search) => {
      if (typeof target !== "string") throw new Error("invalid target", target);
      const currentVersion = ++versionRef.current;
      const [module, props] = await Promise.all([
        import(match(target.split("?")[0])!.value),
        fetchServerSideProps(target),
      ]);
      if (currentVersion === versionRef.current) {
        if (props?.redirect) {
          navigate(props.redirect);
        } else {
          startTransition(() => {
            onRouteUpdated?.(target);
            setVersion(currentVersion);
            setCurrent(
              <Shell {...props}>
                <module.default {...props?.props} />
              </Shell>
            );
          });
        }
      }
    },
    []
  );
  useEffect(() => {
    if (pathname === globalX.__INITIAL_ROUTE__) {
      onRouteUpdated?.(pathname);
      // @ts-ignore
      delete globalX.__INITIAL_ROUTE__;
    } else {
      reload(pathname).catch((e) => {
        console.log(e);
        location.href = pathname;
      });
    }
  }, [pathname]);
  return (
    <ReloadContext.Provider value={reload}>
      <VersionContext.Provider value={version}>
        {current}
      </VersionContext.Provider>
    </ReloadContext.Provider>
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

/**
 * a hook that returns the current pathname
 * @returns the current pathname
 */
export function usePathname() {
  return useLocationProperty(
    () => location.pathname,
    () => globalX.__INITIAL_ROUTE__
  );
}

/**
 * a function that navigates/replaces to a path
 * @param to the path to navigate to
 * @param param1 the options, which can include `replace`
 */
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
