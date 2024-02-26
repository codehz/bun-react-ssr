export const ExampleShell: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => (
  <html>
    <head>
      <title>Example</title>
    </head>
    <body>{children}</body>
  </html>
);
