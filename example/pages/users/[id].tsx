export default function User(props: any) {
  return (
    <div>
      user {JSON.stringify(props)}
      <div onClick={() => history.back()}>back</div>
    </div>
  );
}

export function getServerSideProps(props: any) {
  console.log("some secret");
  return {
    props,
  };
}
