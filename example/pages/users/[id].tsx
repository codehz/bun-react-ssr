export default function User() {
  return <div>user</div>;
}

export function getServerSideProps(props: any) {
  console.log("some secret");
  return {
    props,
  };
}
