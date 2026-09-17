import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyApiBaseOverride } from "./applyApiBaseOverride";
import "../../shared.css";

applyApiBaseOverride(location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
