import { router } from "./routes";
import { ExampleShell } from "./shell";

Bun.serve({
  port: "4480",
  async fetch(request, server) {
    console.log(request.url);
    const response = await router.serve(request, {
      Shell: ExampleShell,
      bootstrapModules: ["/hydrate.js"],
      noStreaming: true,
      staticHeaders: {
        "x-powered-by": "bun",
        "cache-control": "max-age=14400, immutable",
      },
      staticProps: {
        meta: require("./.build/.meta.json").hashed,
      },
    });
    if (response) return response;
    return new Response("Not found", {
      status: 404,
    });
  },
});
