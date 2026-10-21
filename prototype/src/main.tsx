import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

// The conversation is the default experience; the screen-based baseline stays
// available for comparison at ?experience=classic (and its review mode). Each
// loads only its own code.
const params = new URLSearchParams(window.location.search);
const classic =
  params.get("experience") === "classic" || params.get("review") === "1";
const Experience = classic ? lazy(() => import("./App")) : lazy(() => import("./chat/ChatApp"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Experience />
    </Suspense>
  </React.StrictMode>,
);
