import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles.css";
import App, { SCROLL_VERSION } from "./App";

// Everything the inline layout overrides is an inline style, so the switch is a
// body class the stylesheet hangs off. Set before the first paint.
if (SCROLL_VERSION) document.body.classList.add("scroll-version");

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
