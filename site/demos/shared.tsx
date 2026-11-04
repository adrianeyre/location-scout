import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * What every illustration on the website shares: the app's own Layer marks,
 * its Highlight levels, and the page's light or dark mode.
 */

/** One Layer as the app draws it: its colour, and its icon on a 24 × 24 grid (apps/web/src/layers/layer-styles.ts). */
export interface Layer {
  name: string;
  colour: string;
  icon: string;
}

export const LAYERS = {
  crime: {
    name: "Crime",
    colour: "#bf360c",
    icon: "M12 2 4 5v6c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5l-8-3Z",
  },
  planning: {
    name: "Planning",
    colour: "#6a1b9a",
    icon: "M12 2 2 7v2h20V7L12 2ZM4 11v7h3v-7H4Zm6.5 0v7h3v-7h-3ZM17 11v7h3v-7h-3ZM2 20v2h20v-2H2Z",
  },
  amenities: {
    name: "Amenities",
    colour: "#ad1457",
    icon: "M5 8h14l-1 14H6L5 8Zm4-1V6a3 3 0 0 1 6 0v1h-2V6a1 1 0 0 0-2 0v1H9Z",
  },
  schools: {
    name: "Schools",
    colour: "#7b3f00",
    icon: "M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6.5 9.6V16c0 1.9 2.9 4 6.5 4s6.5-2.1 6.5-4v-3.4L12 16.1l-6.5-3.5Z",
  },
  transport: {
    name: "Transport",
    colour: "#00695c",
    icon: "M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20h-3v-2H8v2H5v-2.3A2 2 0 0 1 4 16V5a2 2 0 0 1 2-2Zm0 3v5h12V6H6Zm1.5 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
  },
  greenSpace: {
    name: "Green space",
    colour: "#4d7c0f",
    icon: "M12 2 5 12h3l-4 6h7v4h2v-4h7l-4-6h3L12 2Z",
  },
  property: {
    name: "Property",
    colour: "#856404",
    icon: "M12 3 2 12h3v9h5v-6h4v6h5v-9h3L12 3Z",
  },
  land: {
    name: "Land",
    colour: "#827717",
    icon: "M14 6 10.25 11l2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6Z",
  },
  demographics: {
    name: "Demographics",
    colour: "#455a64",
    icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1 21v-1c0-3.3 3.6-6 8-6s8 2.7 8 6v1H1Zm17.5 0v-1c0-1.7-.7-3.2-1.9-4.4 3.3.3 6.4 2 6.4 4.4v1h-4.5Z",
  },
} as const satisfies Record<string, Layer>;

export type LayerId = keyof typeof LAYERS;

/** A Layer's icon, white on its colour, as the app's markers and lists draw it. */
export function LayerMark({
  layer,
  size = 18,
  className,
}: {
  layer: LayerId;
  size?: number;
  className?: string;
}) {
  const { colour, icon } = LAYERS[layer];
  return (
    <span
      className={`ls-mark${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, background: colour }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>
        <path d={icon} fill="#fff" />
      </svg>
    </span>
  );
}

export type Level = "concern" | "watch" | "good";

export const LEVEL_NAMES: Record<Level, string> = {
  concern: "Concern",
  watch: "Watch",
  good: "Good",
};

/** A Highlight level's glyph, as the app draws it: a disc, a triangle or a tick. */
export function LevelGlyph({ level }: { level: Level }) {
  if (level === "concern") {
    return (
      <svg
        className="ls-level"
        data-level={level}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="M8 4.2v4.6"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.4" r="1.1" fill="#fff" />
      </svg>
    );
  }
  if (level === "watch") {
    return (
      <svg
        className="ls-level"
        data-level={level}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path d="M8 1.2 15.2 14H.8L8 1.2Z" fill="currentColor" />
        <path
          d="M8 5.6v3.8"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.6" r="1" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg
      className="ls-level"
      data-level={level}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="m4.8 8.2 2.1 2.1 4.3-4.4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const darkQuery = "(prefers-color-scheme: dark)";

/** The page's colour scheme, which every illustration follows. */
export function useScheme(): "light" | "dark" {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(darkQuery);
      query.addEventListener("change", changed);
      return () => {
        query.removeEventListener("change", changed);
      };
    },
    () => (window.matchMedia(darkQuery).matches ? "dark" : "light"),
    () => "light",
  );
}

/**
 * The width of the slot a picture fills, so a bento tile's Stage is drawn
 * at 1:1 at its tile's real width rather than scaled (Stageshow, bento.md).
 */
export function useSlotWidth(fallback = 340) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      setWidth(Math.max(1, Math.round(node.getBoundingClientRect().width)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width] as const;
}
