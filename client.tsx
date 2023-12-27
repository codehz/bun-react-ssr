import { useEffect, useState } from "react";

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
