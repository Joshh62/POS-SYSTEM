import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./registerSW";
import { FeatureProvider } from "./context/FeatureContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FeatureProvider>
      <App />
    </FeatureProvider>
  </React.StrictMode>
);

// Register PWA service worker
registerServiceWorker();