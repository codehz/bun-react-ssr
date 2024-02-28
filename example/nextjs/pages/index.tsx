import { Button } from "./button";

export default function Index() {
  console.log("Fetching Data from API...");
  Bun.sleepSync(1000); // Fetching some data from api or database
  return (
    <>
      <div>
        <p>API Data</p>
        <Button />
      </div>
    </>
  );
}
// when the prefix "Server" and is async, it turns as a
// Server Action = will run serverSide and return data to the client
export async function ServerGetData({ someProps }: { someProps: string }) {
  console.log("Server Action!");
  const apiCall = (someData: string) => {
    Bun.sleepSync(2500);
    return `look in your server console (${someData})`;
  };
  return apiCall(someProps);
}
