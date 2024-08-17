import { watchBuild } from "bun-react-ssr/watch";
import { doBuild } from "./build";

watchBuild(doBuild, ["./hydrate.ts", "./pages", "./components"]);
