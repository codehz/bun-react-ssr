export default function MainLayout({ children }: { children: JSX.Element }) {
  return (
    <>
      <h1>Heading layout!</h1>
      {children}
      <h1>Footer layout</h1>
    </>
  );
}
