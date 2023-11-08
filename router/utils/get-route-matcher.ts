export function getRouteMatcher<T>(routes: Record<string, T>) {
  const processed = Object.entries(routes).map(([path, value]) => ({
    path,
    matcher: getRouteMatcherFunc(getRouteRegex(path)),
    value,
  }));
  return (incoming: string) => {
    for (const { path, matcher, value } of processed) {
      const params = matcher(incoming);
      if (params) {
        return { path, value, params };
      }
    }
    return null;
  };
}

interface Group {
  pos: number;
  repeat: boolean;
  optional: boolean;
}

// this isn't importing the escape-string-regex module
// to reduce bytes
function escapeRegex(str: string) {
  return str.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
}

function parseParameter(param: string) {
  const optional = param.startsWith("[") && param.endsWith("]");
  if (optional) {
    param = param.slice(1, -1);
  }
  const repeat = param.startsWith("...");
  if (repeat) {
    param = param.slice(3);
  }
  return { key: param, repeat, optional };
}

function getParametrizedRoute(route: string) {
  const segments = (route.replace(/\/$/, "") || "/").slice(1).split("/");

  const groups: { [groupName: string]: Group } = {};
  let groupIndex = 1;
  const parameterizedRoute = segments
    .map((segment) => {
      if (segment.startsWith("[") && segment.endsWith("]")) {
        const { key, optional, repeat } = parseParameter(segment.slice(1, -1));
        groups[key] = { pos: groupIndex++, repeat, optional };
        return repeat ? (optional ? "(?:/(.+?))?" : "/(.+?)") : "/([^/]+?)";
      } else {
        return `/${escapeRegex(segment)}`;
      }
    })
    .join("");

  // dead code eliminate for browser since it's only needed
  // while generating routes-manifest
  if (typeof window === "undefined") {
    let routeKeyCharCode = 97;
    let routeKeyCharLength = 1;

    // builds a minimal routeKey using only a-z and minimal number of characters
    const getSafeRouteKey = () => {
      let routeKey = "";

      for (let i = 0; i < routeKeyCharLength; i++) {
        routeKey += String.fromCharCode(routeKeyCharCode);
        routeKeyCharCode++;

        if (routeKeyCharCode > 122) {
          routeKeyCharLength++;
          routeKeyCharCode = 97;
        }
      }
      return routeKey;
    };

    const routeKeys: { [named: string]: string } = {};

    let namedParameterizedRoute = segments
      .map((segment) => {
        if (segment.startsWith("[") && segment.endsWith("]")) {
          const { key, optional, repeat } = parseParameter(
            segment.slice(1, -1)
          );
          // replace any non-word characters since they can break
          // the named regex
          let cleanedKey = key.replace(/\W/g, "");
          let invalidKey = false;

          // check if the key is still invalid and fallback to using a known
          // safe key
          if (cleanedKey.length === 0 || cleanedKey.length > 30) {
            invalidKey = true;
          }
          if (!isNaN(parseInt(cleanedKey.substr(0, 1)))) {
            invalidKey = true;
          }

          if (invalidKey) {
            cleanedKey = getSafeRouteKey();
          }

          routeKeys[cleanedKey] = key;
          return repeat
            ? optional
              ? `(?:/(?<${cleanedKey}>.+?))?`
              : `/(?<${cleanedKey}>.+?)`
            : `/(?<${cleanedKey}>[^/]+?)`;
        } else {
          return `/${escapeRegex(segment)}`;
        }
      })
      .join("");

    return {
      parameterizedRoute,
      namedParameterizedRoute,
      groups,
      routeKeys,
    };
  }

  return {
    parameterizedRoute,
    groups,
  };
}

interface RouteRegex {
  groups: { [groupName: string]: Group };
  namedRegex?: string;
  re: RegExp;
  routeKeys?: { [named: string]: string };
}

function getRouteRegex(normalizedRoute: string): RouteRegex {
  const result = getParametrizedRoute(normalizedRoute);
  if ("routeKeys" in result) {
    return {
      re: new RegExp(`^${result.parameterizedRoute}(?:/)?$`),
      groups: result.groups,
      routeKeys: result.routeKeys,
      namedRegex: `^${result.namedParameterizedRoute}(?:/)?$`,
    };
  }

  return {
    re: new RegExp(`^${result.parameterizedRoute}(?:/)?$`),
    groups: result.groups,
  };
}

function getRouteMatcherFunc(routeRegex: ReturnType<typeof getRouteRegex>) {
  const { re, groups } = routeRegex;
  return (pathname: string | null | undefined) => {
    const routeMatch = re.exec(pathname!);
    if (!routeMatch) {
      return false;
    }

    const decode = (param: string) => {
      try {
        return decodeURIComponent(param);
      } catch (_) {
        throw new Error("failed to decode param");
      }
    };
    const params: { [paramName: string]: string | string[] } = {};

    Object.keys(groups).forEach((slugName: string) => {
      const g = groups[slugName];
      const m = routeMatch[g.pos];
      if (m !== undefined) {
        params[slugName] = ~m.indexOf("/")
          ? m.split("/").map((entry) => decode(entry))
          : g.repeat
          ? [decode(m)]
          : decode(m);
      }
    });
    return params;
  };
}
