import { lazy as oldLazy, useEffect, useState } from "react";
import React from "react";

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

export class ClientOnlyError extends Error {
  constructor() {
    super("client only");
  }
}

export function lazy<T>(
  importFunc: () => Promise<{ default: React.ComponentType<T> }>
): React.ComponentType<T> {
  const LazyComponent = oldLazy(importFunc);
  return (props: any) => {
    if (typeof window === "undefined") {
      throw new ClientOnlyError();
    }
    return <LazyComponent {...props} />;
  };
}
