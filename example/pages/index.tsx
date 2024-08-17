import { Link, ReloadContext, useLoadingEffect } from "bun-react-ssr/router";
import { useContext } from "react";
import { Clock } from "../components/Clock";

export default function Index({ time }: { time: Date }) {
  const reload = useContext(ReloadContext);
  useLoadingEffect(() => {
    console.log("reload!");
  });
  return (
    <div>
      <Clock time={time} />
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
