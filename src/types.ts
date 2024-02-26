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
