import { hydrate } from "bun-react-ssr/src/hydrate";
import { ExampleShell } from "./shell";

await hydrate(ExampleShell);
