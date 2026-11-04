import { useLayoutEffect, useRef } from "react";

import { Phone } from "../kit/phone";
import { Stage } from "../kit/stage";
import { Window } from "../kit/window";
import { useScheme, useSlotWidth } from "./shared";
import "./look.css";
import "./frame.css";

/*
 * Real screenshots, framed by the Stageshow kit: a browser window for the
 * desktop ones and a phone for the phone's. Unlike the illustrations these
 * are the page's content, so the screenshot's own link and image (its alt
 * text, and the link to it full size) are moved inside the frame as they
 * are, not redrawn: without JavaScript they show unframed.
 */

const BAR = 38;

/** Puts `node` inside the element it renders, once, and leaves it there. */
function Adopt({ node }: { node: HTMLElement }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    host.current?.append(node);
  }, [node]);
  return <div ref={host} className="ls-frame-content" />;
}

export function WindowFrame({
  node,
  ratio,
}: {
  node: HTMLElement;
  ratio: number;
}) {
  const theme = useScheme();
  const [slot, width] = useSlotWidth(360);
  // The window whole, with room round it for its shadow.
  const inner = width - 2 * 12;
  return (
    <div ref={slot} className="ls-picture">
      <Stage
        width={width}
        height={Math.round(inner * ratio + BAR + 2 * 12)}
        initial={{}}
        theme={theme}
        unframed
        className="ls-look ls-frame"
      >
        {() => (
          <Window
            url="localhost:5173"
            urlShape="pill"
            className="ls-frame-window"
          >
            <Adopt node={node} />
          </Window>
        )}
      </Stage>
    </div>
  );
}

export function PhoneFrame({ node }: { node: HTMLElement }) {
  const theme = useScheme();
  return (
    <div className="ls-picture ls-phone-picture">
      <Stage
        width={300}
        height={560}
        initial={{}}
        theme={theme}
        unframed
        className="ls-look ls-frame ls-frame--phone"
      >
        {() => (
          <Phone width={260} frame="pro" className="ls-frame-phone">
            <Adopt node={node} />
          </Phone>
        )}
      </Stage>
    </div>
  );
}
