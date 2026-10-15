import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
// MapLibre's own styles before App.css's, so the theme's popups win over
// its white ones in dark mode: they are just as specific.
import "maplibre-gl/dist/maplibre-gl.css";

import { App } from "./App";
import { applyAppearance, readAppearance } from "./theme/appearance";
import { themeStylesheet } from "./theme/themes";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

// Every theme's colours, before anything is drawn in them.
const themes = document.createElement("style");
themes.id = "themes";
themes.textContent = themeStylesheet();
document.head.append(themes);
applyAppearance(readAppearance());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
