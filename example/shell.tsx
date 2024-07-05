export const ExampleShell: React.FC<{
  children: React.ReactElement;
  meta?: Record<string, string>;
}> = ({ children, meta }) => (
  <html>
    <head>
      <title>Example</title>
    </head>
    <body>
      <div>{children}</div>
      <output>{JSON.stringify(meta)}</output>
    </body>
  </html>
);
