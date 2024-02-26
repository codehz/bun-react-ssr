import {
__toESM,
require_jsx_dev_runtime
} from "./../chunk-ea600d09a5e83702.js";

// pages/layout.tsx
var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
function MainLayout({ children }) {
  return jsx_dev_runtime.jsxDEV(jsx_dev_runtime.Fragment, {
    children: [
      jsx_dev_runtime.jsxDEV("h1", {
        children: "Heading layout!"
      }, undefined, false, undefined, this),
      children,
      jsx_dev_runtime.jsxDEV("h1", {
        children: "Footer layout"
      }, undefined, false, undefined, this)
    ]
  }, undefined, true, undefined, this);
}
export {
  MainLayout as default
};
