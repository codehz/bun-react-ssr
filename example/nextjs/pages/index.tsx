import { Button } from "./button";

export default function Index() {
  console.log(
    "this is rendered server side and can be revalidate in a future release"
  );
  Bun.sleepSync(1000); // Fetching some data from api or database
  const apiKey =
    "Wont be displayed to the client if you dont use any dynamic data as props";
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
  const apiCall = (someData: string) => {
    Bun.sleepSync(2500);
    return `look in your server console (${someData})`;
  };
  console.log("Server Action!");
  return apiCall(someProps);
}
