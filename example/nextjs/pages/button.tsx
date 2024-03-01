"use client";

import { useState } from "react";
import { ServerGetData } from ".";

// when clicked this button make a server action call to retrive data
export function Button() {
  const [state, set] = useState("not clicked yet...");
  return (
    <button
      onClick={async () =>
        set(
          await ServerGetData({
            someProps: "Exemple Data sended by client",
          })
        )
      }
    >
      {state}
    </button>
  );
}
