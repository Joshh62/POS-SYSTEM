import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./registerSW";
import { FeatureProvider } from "./context/FeatureContext";
import { ThemeProvider } from "./context/ThemeContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <FeatureProvider>
        <App />
      </FeatureProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Register PWA service worker
registerServiceWorker();