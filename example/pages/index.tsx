import { Link, navigate, useLink } from "bun-react-ssr/router";

export default function Index() {
  return <Link href="/test">index</Link>;
}
