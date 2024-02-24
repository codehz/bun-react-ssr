import { useState } from "react";

export default function Index({ time }: { time: Date }) {
  const [state, set] = useState(true);

  return (
    <button onClick={() => set(!state)}>{state ? "click me!" : "Wow!!"}</button>
  );
}

export function getServerSideProps() {
  return {
    props: {
      time: new Date(),
    },
  };
}
