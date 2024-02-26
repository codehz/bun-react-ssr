import {
ServerGetData
} from "./index.js";
import {
__toESM,
require_jsx_dev_runtime,
require_react
} from "./../chunk-ea600d09a5e83702.js";

// pages/button.tsx
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
export {
  Button
};
