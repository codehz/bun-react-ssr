import {
__toESM,
require_jsx_dev_runtime
} from "./../../chunk-ea600d09a5e83702.js";

// pages/users/[id].tsx
var jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
function getServerSideProps(props) {
  console.log("some secret");
  return {
    props
  };
}
"use client";
function User(props) {
  return jsx_dev_runtime.jsxDEV("div", {
    children: [
      "user ",
      JSON.stringify(props),
      jsx_dev_runtime.jsxDEV("div", {
        onClick: () => history.back(),
        children: "back"
      }, undefined, false, undefined, this)
    ]
  }, undefined, true, undefined, this);
}
export {
  getServerSideProps,
  User as default
};
