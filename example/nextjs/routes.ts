import { StaticRouters } from "bun-react-ssr";

export const router = new StaticRouters(process.cwd(), ".build", "pages", {
  displayMode: {
    nextjs: {
      layout: "layout.tsx",
    },
  },
  ssrMode: "nextjs",
});

await router.InitServerActions();
