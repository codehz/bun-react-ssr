import { Link } from "bun-react-ssr/router";

export default function Test() {
  return (
    <div>
      <Link as="button" href="/">
        test
      </Link>
      <Link href="/users/1">user 1</Link>
    </div>
  );
}
