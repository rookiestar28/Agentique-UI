import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element is missing");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
