// Minimal request/error logging. Discipline (CLAUDE.md §6): logs carry ids
// and coarse facts only — never card titles, financial values, or request
// bodies. One line per event.

function stamp(): string {
  return new Date().toISOString();
}

/**
 * Logs one served request: timestamp, method, path, status.
 * Inputs: HTTP method, request pathname (no query string), response status.
 * Output: one stdout line. Failure: none.
 */
export function logRequest(method: string, path: string, status: number): void {
  console.log(`${stamp()} ${method} ${path} ${status}`);
}

/**
 * Logs a server-side failure with a context label and the error message only.
 * Inputs: a context string (method + path, ids allowed), the thrown value.
 * Output: one stderr line; never serializes payloads or card data.
 * Failure: none.
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${stamp()} ERROR ${context}: ${message}`);
}
