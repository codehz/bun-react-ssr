export function Clock({ time }: { time: Date }) {
  return <div>Server time: {time.toISOString()}</div>;
}
