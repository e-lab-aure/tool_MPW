/**
 * Point d'entree React de Master Pod Warden.
 * Monte l'application en mode StrictMode pour detecter les effets de bord en developpement.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("[MPW] Element racine #root introuvable dans le DOM.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
