// The transport-mapped request error, shared by the intent builders
// (api.ts, decisions.ts) — kept in its own module so the builders never
// import api.ts back.

/** Thrown when a request body fails validation; the transport maps it to 400. */
export class BadRequest extends Error {}
