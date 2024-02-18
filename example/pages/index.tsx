import { useState } from "react";

export default function Index({ time }: { time: Date }) {
  const [state, set] = useState("allo");

  return <div>{state}</div>;
}

export function getServerSideProps() {
  return {
    props: {
      time: new Date(),
    },
  };
}
