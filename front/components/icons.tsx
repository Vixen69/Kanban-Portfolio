// One small set of line icons drawn in code (no icon library — the SBOM
// stays as it is): the text glyphs ≡ ‹ › ▸ ▾ ✕ ★ rendered differently from
// one font to the next and blurred on the projector. 24-unit grid, 2-unit
// round strokes, sized by the surrounding text (1em), coloured by it.

import type { CSSProperties } from "react";

/** The icons of the interface. */
export type IconName =
  | "menu" | "x" | "plus" | "search" | "star" | "gear"
  | "chevron-left" | "chevron-right" | "chevron-down" | "chevron-up";

// An 8-tooth gear around a hub, the hole cut by the even-odd rule.
function gearPath(): string {
  const teeth = 8;
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const base = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [fraction, radius] of [[0, 8], [0.18, 10.5], [0.5, 10.5], [0.68, 8]] as const) {
      const angle = base + fraction * step;
      points.push(`${(12 + radius * Math.cos(angle)).toFixed(2)},${(12 + radius * Math.sin(angle)).toFixed(2)}`);
    }
  }
  return `M${points.join("L")}Z M15.2,12 A3.2,3.2 0 1 0 8.8,12 A3.2,3.2 0 1 0 15.2,12 Z`;
}

const STROKES: Partial<Record<IconName, string>> = {
  "menu": "M4 7h16M4 12h16M4 17h16",
  "x": "M6.5 6.5l11 11M17.5 6.5l-11 11",
  "plus": "M12 5v14M5 12h14",
  "search": "M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12M15 15l5 5",
  "chevron-left": "M14.5 6l-6 6 6 6",
  "chevron-right": "M9.5 6l6 6-6 6",
  "chevron-down": "M6 9.5l6 6 6-6",
  "chevron-up": "M6 14.5l6-6 6 6",
};

const FILLS: Partial<Record<IconName, string>> = {
  "star": "M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z",
  "gear": gearPath(),
};

/**
 * One icon, inline SVG, 1em square by default, in the current text colour.
 * Inputs: the icon name, an optional size (CSS length) and class.
 * Output: the SVG (aria-hidden — the button or label around it names it).
 * Failure modes: none.
 */
export function Icon({ name, size, className }: { name: IconName; size?: string; className?: string }) {
  const style: CSSProperties | undefined = size === undefined ? undefined : { width: size, height: size };
  const fill = FILLS[name];
  return (
    <svg className={"icon" + (className === undefined ? "" : " " + className)} style={style} width="1em" height="1em"
      viewBox="0 0 24 24" aria-hidden="true">
      {fill !== undefined
        ? <path d={fill} fill="currentColor" fillRule="evenodd" />
        : <path d={STROKES[name]} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
