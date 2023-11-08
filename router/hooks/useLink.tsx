import { useCallback } from "react";
import { navigate } from "..";

export function useLink(href: string) {
  return useCallback(
    (e: any) => {
      e.preventDefault?.();
      navigate(href);
    },
    [href]
  );
}
