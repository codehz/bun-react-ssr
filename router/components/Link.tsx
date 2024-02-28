"use client";
import type { JSXElementConstructor } from "react";
import { useLink } from "..";

export function Link<
  T extends keyof JSX.IntrinsicElements | JSXElementConstructor<any> = "a"
>({
  as: Component = "a" as never,
  href,
  ...props
}: { as?: T; href: string } & React.ComponentPropsWithoutRef<T>) {
  const handleClick = useLink(href);
  // @ts-ignore
  return <Component {...props} onClick={handleClick} />;
}
