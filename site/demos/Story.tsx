import { MapPin, Server } from "lucide-react";

import type { Act } from "../kit/act";
import { Collapse } from "../kit/motion/Collapse";
import { Connector } from "../kit/motion/Connector";
import { States } from "../kit/motion/States";
import { Check } from "../kit/parts/Check";
import { Stage } from "../kit/stage";
import { Caret, Prompt, Window } from "../kit/window";
import { useScheme, useSlotWidth } from "./shared";
import "./look.css";
import "./story.css";

/*
 * Two system stories, each played once as it scrolls in, with no cursor:
 * what the backend does with a search ("How a search works"), and the
 * project being cloned and started (the call to action).
 */

/* ---------------- How a search works ---------------- */

const SOURCES = [
  "postcodes.io",
  "data.police.uk",
  "planning.data.gov.uk",
  "OpenStreetMap",
  "HM Land Registry",
  "PlanIt",
];

/** When each Data Source answers, after the requests go out; the last never does. */
const ANSWERS = [350, 700, 1000, 1250, 1650];

type Search = {
  asked: boolean;
  fanned: boolean;
  answered: number;
  failed: boolean;
};
const searchStart: Search = {
  asked: false,
  fanned: false,
  answered: 0,
  failed: false,
};
const searchEnd: Search = {
  asked: true,
  fanned: true,
  answered: ANSWERS.length,
  failed: true,
};

async function searchScript(a: Act<Search>) {
  await a.wait(400);
  await a.set({ asked: true });
  await a.wait(700);
  await a.set({ fanned: true });
  await a.wait(600);
  let at = 0;
  for (const [i, ms] of ANSWERS.entries()) {
    await a.wait(ms - at);
    at = ms;
    a.put({ answered: i + 1 });
  }
  // The one that takes over 8 seconds is given up on; the rest still show.
  await a.wait(1200);
  await a.set({ failed: true });
}

export function PipelinePicture() {
  const theme = useScheme();
  const [slot, width] = useSlotWidth(900);
  const wide = width >= 720;
  return (
    <div ref={slot} className="ls-picture">
      <Stage<Search>
        width={width}
        height={wide ? 300 : 440}
        initial={searchStart}
        poster={searchEnd}
        play="once"
        script={searchScript}
        theme={theme}
        className="ls-look ls-story ls-pipeline"
      >
        {(s, rect) => {
          const api = rect("api");
          return (
            <>
              <div
                className="ls-node ls-node--location"
                data-target="location"
                data-layout={wide ? "wide" : "compact"}
              >
                <MapPin size={16} strokeWidth={2.2} />
                <span className="ls-node-title">NG17 1AA</span>
                <span className="ls-node-meta">0.5 mile</span>
              </div>
              <div
                className="ls-node ls-node--api"
                data-target="api"
                data-layout={wide ? "wide" : "compact"}
                data-on={s.asked || undefined}
              >
                <Server size={16} strokeWidth={2.2} />
                <span className="ls-node-title">Your backend</span>
                <span className="ls-node-meta ls-mono">localhost:8787</span>
              </div>
              <div
                className="ls-sources"
                data-layout={wide ? "wide" : "compact"}
              >
                {SOURCES.map((source, i) => {
                  const last = i === SOURCES.length - 1;
                  const done = i < s.answered;
                  return (
                    <div
                      key={source}
                      className="ls-source"
                      data-target={`source-${String(i)}`}
                      data-shown={s.fanned || undefined}
                    >
                      <span className="ls-source-name">{source}</span>
                      {/* The one given up on crossfades its tick into the
                          badge in one cell, so nothing pops; the rest keep
                          only their tick. */}
                      {last ? (
                        <States
                          value={s.failed ? "unavailable" : "check"}
                          align="end"
                          states={{
                            check: (
                              <Check
                                on={done}
                                pending={s.fanned && !done}
                                size={16}
                              />
                            ),
                            unavailable: (
                              <span className="ls-source-down">
                                Unavailable
                              </span>
                            ),
                          }}
                        />
                      ) : (
                        <Check
                          on={done}
                          pending={s.fanned && !done}
                          size={16}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {wide && (
                <>
                  <Connector
                    from={{
                      x: rect("location").x + rect("location").width,
                      y: rect("location").y + rect("location").height / 2,
                    }}
                    to={{ x: api.x, y: api.y + api.height / 2 }}
                    route="straight"
                    show={s.asked}
                    arrow
                  />
                  {SOURCES.map((source, i) => {
                    const row = rect(`source-${String(i)}`);
                    return (
                      <Connector
                        key={source}
                        className="ls-fan"
                        from={{
                          x: api.x + api.width,
                          y: api.y + api.height / 2,
                        }}
                        to={{ x: row.x, y: row.y + row.height / 2 }}
                        route="curve"
                        show={s.fanned}
                        dots="none"
                      />
                    );
                  })}
                </>
              )}
            </>
          );
        }}
      </Stage>
    </div>
  );
}

/* ---------------- Get Location Scout ---------------- */

type Term = {
  clone: string;
  cloned: boolean;
  install: string;
  installed: boolean;
  dev: string;
  running: boolean;
};

const termStart: Term = {
  clone: "",
  cloned: false,
  install: "",
  installed: false,
  dev: "",
  running: false,
};

const commandsFor = (repo: string) => ({
  clone: `git clone ${repo}.git`,
  install: "pnpm install",
  dev: "pnpm dev",
});

const termScript = (repo: string) => async (a: Act<Term>) => {
  const commands = commandsFor(repo);
  await a.wait(500);
  await a.type("clone", commands.clone, { interval: 22 });
  await a.wait(350);
  await a.set({ cloned: true });
  await a.wait(700);
  await a.type("install", commands.install, { interval: 45 });
  await a.wait(350);
  await a.set({ installed: true });
  await a.wait(700);
  await a.type("dev", commands.dev, { interval: 55 });
  await a.wait(450);
  await a.set({ running: true });
};

export function TerminalPicture({
  repo = "https://github.com/adrianeyre/location-scout",
}: {
  repo?: string;
}) {
  const theme = useScheme();
  const [slot, width] = useSlotWidth(520);
  const commands = commandsFor(repo);
  const name = repo.split("/").at(-1) ?? "location-scout";
  const end: Term = {
    clone: commands.clone,
    cloned: true,
    install: commands.install,
    installed: true,
    dev: commands.dev,
    running: true,
  };
  /** The command being typed: the caret holds solid while it grows. */
  const typing = (typed: string, full: string) =>
    typed.length > 0 && typed !== full;
  /**
   * A command as typed so far, at its full width from the first key: the
   * rest is drawn invisibly, so the line's box never changes size.
   */
  const typed = (so: string, full: string, caret: boolean) => (
    <>
      {so}
      {/* The caret keeps its slot when typing ends, so nothing shifts. */}
      <span className="ls-caret-slot" data-off={caret ? undefined : ""}>
        <Caret still={typing(so, full)} />
      </span>
      <span className="ls-untyped">{full.slice(so.length)}</span>
    </>
  );
  return (
    <div ref={slot} className="ls-picture">
      <Stage<Term>
        width={width}
        height={260}
        initial={termStart}
        poster={end}
        play="once"
        script={termScript(repo)}
        theme={theme}
        className="ls-look ls-story ls-terminal"
      >
        {(s) => (
          <Window
            chrome="terminal"
            title={`${name} — zsh`}
            className="ls-terminal-window"
            body={{
              className: `ls-terminal-body${width < 480 ? " ls-terminal-body--wrap" : ""}`,
            }}
          >
            {/* What the terminal already held, so it reads as one in use;
                new lines arrive at the foot and carry the rest up. */}
            <Prompt path="~">cd ~/code</Prompt>
            <Prompt path="~/code">
              {typed(s.clone, commands.clone, !s.cloned)}
            </Prompt>
            <Collapse open={s.cloned} from="below">
              <div className="dim">
                Cloning into &apos;{name}&apos;... done.
              </div>
            </Collapse>
            <Collapse open={s.cloned} from="below">
              <Prompt path={`~/code/${name}`}>
                {typed(s.install, commands.install, s.cloned && !s.installed)}
              </Prompt>
            </Collapse>
            <Collapse open={s.installed} from="below">
              <div className="dim">Done in 41.2s using pnpm v12.16.1</div>
            </Collapse>
            <Collapse open={s.installed} from="below">
              <Prompt path={`~/code/${name}`}>
                {typed(s.dev, commands.dev, s.installed && !s.running)}
              </Prompt>
            </Collapse>
            <Collapse open={s.running} from="below">
              <div>
                <span className="dim">apps/web dev:</span>{" "}
                <span className="ok">➜</span> Local:{" "}
                <span className="ls-term-link">http://localhost:5173/</span>
              </div>
              <div>
                <span className="dim">apps/api dev:</span> Location Scout API
                listening on http://localhost:8787
              </div>
            </Collapse>
          </Window>
        )}
      </Stage>
    </div>
  );
}
