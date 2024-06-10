import { router } from "./routes";
import { ExampleShell } from "./shell";

Bun.serve({
  port: "4480",
  async fetch(request, server) {
    console.log(request.url);
    const response = await router.serve(request, {
      Shell: ExampleShell,
      bootstrapModules: ["/hydrate.js"],
      noStreaming: true
    });
    if (response) return response;
    return new Response("Not found", {
      status: 404,
    });
  },
});
