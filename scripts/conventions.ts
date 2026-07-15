// Pure, side-effect-free heuristics behind check-conventions.ts (CLAUDE.md
// §8): the file-length and function-length caps, and the brace-matching
// scanner that finds over-long functions. Kept importable (no fs walk, no
// process.exit) so the parser itself is unit-tested (conventions.test.ts) —
// a regex regression here would otherwise pass every file silently and the
// green output would look normal.

export const MAX_FILE_LINES = 300;
export const MAX_FUNCTION_LINES = 40;

// Named function declarations, plus ANY line ending with "=> {": const
// arrows, object-literal methods and anonymous callbacks (test bodies) are
// all measured. Arrows with multi-line parameter lists are measured from the
// "=> {" line (a slight undercount — acceptable for a heuristic).
export const FUNCTION_START = /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+|=>\s*\{\s*$/;

/** One over-long function: its 1-based start line and length in lines. */
export interface Finding {
  line: number;
  length: number;
}

/**
 * Finds every function longer than MAX_FUNCTION_LINES in one file's lines.
 * Input: the file already split into lines. Output: one Finding per function
 * whose brace-delimited body exceeds the cap (empty when all within it), in
 * source order. Failure: none — a heuristic brace count that never throws;
 * unbalanced braces simply yield no finding for that start.
 */
export function functionLengths(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!FUNCTION_START.test(lines[i] ?? "")) continue;
    let depth = 0;
    let started = false;
    for (let j = i; j < lines.length; j++) {
      for (const char of lines[j] ?? "") {
        if (char === "{") {
          depth++;
          started = true;
        } else if (char === "}") depth--;
      }
      if (started && depth <= 0) {
        const length = j - i + 1;
        if (length > MAX_FUNCTION_LINES) findings.push({ line: i + 1, length });
        break;
      }
    }
  }
  return findings;
}
