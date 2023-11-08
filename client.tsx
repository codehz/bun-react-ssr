import { useEffect, useState } from "react";

export function NoSSR({ children }: { children: React.ReactElement }) {
  const [state, setState] = useState<React.ReactElement | null>(null);
  useEffect(() => setState(children), [children]);
  return <>{state}</>;
}
