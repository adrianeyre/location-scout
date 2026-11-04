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
import { PhoneFrame, WindowFrame } from "./Frame";
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

/*
 * Frames each `[data-frame]` slot's screenshot in the kit's window or phone.
 * The screenshot's link and image move inside the frame unchanged, so they
 * keep their alt text and open full size as before; this is content, so it
 * stays in the accessibility tree.
 */
for (const slot of document.querySelectorAll<HTMLElement>("[data-frame]")) {
  const shot = slot.firstElementChild;
  const image = shot?.querySelector("img");
  if (!(shot instanceof HTMLElement) || !image) continue;
  const ratio = image.height / image.width;
  slot.replaceChildren();
  slot.dataset.frameReady = "";
  createRoot(slot).render(
    <StrictMode>
      {slot.dataset.frame === "phone" ? (
        <PhoneFrame node={shot} />
      ) : (
        <WindowFrame node={shot} ratio={ratio} />
      )}
    </StrictMode>,
  );
}
