import { watchBuild } from "bun-react-ssr/src/watch";
import { doBuild } from "./build";

watchBuild(doBuild, ["./hydrate.ts", "./pages"]);
