export interface ServerSideProps {
  props?: any;
  redirect?: string;
}

export type _DisplayMode = {
  nextjs?: {
    layout: string;
  };
  none?: "none";
};
export type _SsrMode = "nextjs" | "none";

export const URLpaths = {
  serverAction: "/ServerActionGetter" as const,
};

export type _GlobalData = {
  __PAGES_DIR__: string;
  __INITIAL_ROUTE__: string;
  __ROUTES__: Record<string, string>;
  __SERVERSIDE_PROPS__?: any;
  __DISPLAY_MODE__: keyof _DisplayMode;
  __LAYOUT_NAME__: string;
};
