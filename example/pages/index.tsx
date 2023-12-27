import { Link, ReloadContext, useLoadingEffect } from "bun-react-ssr/router";
import { useContext } from "react";

export default function Index({ time }: { time: Date }) {
  const reload = useContext(ReloadContext);
  useLoadingEffect(() => {
    console.log("reload!");
  });
  return (
    <div>
      <div>time {time.toISOString()}</div>
      <Link href="/test?test">index</Link>
      <div onClick={() => reload()}>reload</div>
    </div>
  );
}

export function getServerSideProps() {
  return {
    props: {
      time: new Date(),
    },
  };
}
