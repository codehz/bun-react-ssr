import { lazy as oldLazy, useEffect, useState } from "react";

/** @deprecated use lazy with suspense */
export function NoSSR({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [state, setState] = useState<React.ReactNode>(fallback);
  useEffect(() => setState(children), [children]);
  return <>{state}</>;
}

export function lazy<T>(
  importFunc: () => Promise<{ default: React.ComponentType<T> }>
): React.ComponentType<T> {
  const LazyComponent = oldLazy(importFunc);
  return (props: any) => {
    if (typeof window === "undefined") {
      throw new Error("client only");
    }
    return <LazyComponent {...props} />;
  };
}
