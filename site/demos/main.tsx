import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

import {
  ExplainPicture,
  HighlightsPicture,
  LandPicture,
  LayersPicture,
  ModesPicture,
  ScoresPicture,
  ThemesPicture,
} from "./Features";
import { HeroDemo } from "./HeroDemo";
import { PipelinePicture, TerminalPicture } from "./Story";

/*
 * Draws the website's product illustrations into the page's
 * `[data-demo="name"]` slots. The page reads whole without them: each slot's
 * own content (a screenshot, or nothing) is what shows with JavaScript off,
 * and is replaced here. They are pictures, so they are hidden from
 * assistive technology; the copy beside each says what it shows.
 */

const DEMOS: Partial<Record<string, ComponentType<{ repo?: string }>>> = {
  hero: HeroDemo,
  scores: ScoresPicture,
  highlights: HighlightsPicture,
  layers: LayersPicture,
  modes: ModesPicture,
  themes: ThemesPicture,
  explain: ExplainPicture,
  land: LandPicture,
  pipeline: PipelinePicture,
  terminal: TerminalPicture,
};

for (const slot of document.querySelectorAll<HTMLElement>("[data-demo]")) {
  const Demo = DEMOS[slot.dataset.demo ?? ""];
  if (!Demo) continue;
  slot.replaceChildren();
  slot.setAttribute("aria-hidden", "true");
  slot.dataset.demoReady = "";
  createRoot(slot).render(
    <StrictMode>
      <Demo {...(slot.dataset.repo ? { repo: slot.dataset.repo } : {})} />
    </StrictMode>,
  );
}
