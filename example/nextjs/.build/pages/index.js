import {
__toESM,
require_jsx_dev_runtime,
require_react
} from "./../chunk-ea600d09a5e83702.js";

// /var/bun_module/bun-react-ssr/example/nextjs/pages/button.tsx
var import_react = __toESM(require_react(), 1);
var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
function Button() {
  const [state, set] = import_react.useState("not clicked yet...");
  return jsx_dev_runtime.jsxDEV("button", {
    onClick: async () => set(await ServerGetData({
      someProps: "Exemple Data sended by client"
    })),
    children: state
  }, undefined, false, undefined, this);
}
"use client";

// pages/index.tsx
var jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
async function ServerGetData(...props) {
  const response = await fetch("/ServerActionGetter", {
    headers: {
      serverActionID: "/index.tsx:ServerGetData"
    },
    method: "POST",
    body: JSON.stringify(encodeURI(JSON.stringify(props)))
  });
  if (!response.ok)
    throw new Error("error when Calling server action /index.tsx:ServerGetData");
  return response.json();
}
function Index() {
  return jsx_dev_runtime2.jsxDEV(jsx_dev_runtime2.Fragment, {
    children: jsx_dev_runtime2.jsxDEV("div", {
      children: [
        jsx_dev_runtime2.jsxDEV("p", {
          children: "API Data"
        }, undefined, false, undefined, this),
        jsx_dev_runtime2.jsxDEV(Button, {}, undefined, false, undefined, this)
      ]
    }, undefined, true, undefined, this)
  }, undefined, false, undefined, this);
}



export {Index as default, ServerGetData};