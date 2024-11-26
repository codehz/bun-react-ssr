import { Clock } from "../../components/Clock";

export default function User(props: any) {
  return (
    <div>
      user {JSON.stringify(props)}
      <div onClick={() => history.back()}>back</div>
      <Clock time={props.time} />
    </div>
  );
}

export function getServerSideProps(props: any) {
  console.log("some secret");
  return {
    props: {
      ...props,
      time: new Date(),
    },
  };
}
