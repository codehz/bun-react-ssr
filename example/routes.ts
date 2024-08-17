import { StaticRouters } from "bun-react-ssr";
import { watch } from "node:fs";

export const router = new StaticRouters(import.meta.dir);

if (Bun.env.NODE_ENV !== "production") {
  const watcher = watch("./.build/.meta.json");
  watcher.on("change", () => {
    console.log("reload");
    router.reload();
  });
}
