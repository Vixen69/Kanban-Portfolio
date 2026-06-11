# CLAUDE.md : Portfolio Kanban Engine

This file is the working contract between the human author and Claude Code.
Read it fully before any session. If a request conflicts with a rule here,
surface the conflict instead of silently resolving it. When information is
listed under "Open decisions", ask rather than assume.

## 1. What this project is

An opinionated portfolio kanban instrument: a single-page board that makes a
project portfolio's real state legible (flow, aging, blockages, WIP), designed
for sovereign on-premise deployment in high-constraint environments, with
read-only connectivity to enterprise PPM tools (Sciforma first, Planisware
later) through an adapter layer.

It is an instrument, not a platform. The product's value IS its opinion:

- Pull flow. Work is pulled forward, never pushed.
- Time is visible. Cards darken progressively as they age in a column.
- Blockages scream. Blocked cards pulse; long blockages get an escalation marker.
- One screen, zero scroll. The whole portfolio is visible at once, always.
- The event log is the truth. Every movement is recorded append-only.

These behaviors are hard-coded and non-negotiable. What IS configurable is
topology only: lane names, column names, their count and order, domain list,
threshold values. Topology lives in a versioned config file. There is no
settings UI.

## 2. Hard constraints (permanent, never revisit)

- No cloud. No SaaS. No external runtime services of any kind.
- Zero egress from the web application. It never makes an outbound connection.
- No telemetry, no analytics, no CDN, no external fonts, no remote assets.
- No Monte Carlo or probabilistic forecasting features. Ever.
- No LDAP group-based permissions. Local accounts, hard-coded roles only.
- No procurement/purchasing-tool integration.
- Runtime dependency budget: 1 maximum. Direct dependency budget (including
  devDependencies): 12 maximum. Any addition requires a justified line in
  DEPENDENCIES.md and an ADR.
- No UI component library. All CSS is hand-written.
- No ORM, no Express/Fastify/Koa, no state-management library.

## 3. Stack

- Language: TypeScript everywhere. Strict mode.
- Frontend: React, functional components and hooks only, built with Vite.
  React is a thin view layer: all domain logic lives in plain TS modules under
  `core/` with zero React imports, so the view layer is replaceable.
- Backend: Node.js LTS, built-ins only (`node:http`, `node:crypto`,
  `node:fs`, `node:path`, global `fetch`). No web framework.
- Storage: SQLite. Prefer `node:sqlite` if stable on the target Node LTS;
  otherwise `better-sqlite3` as the single permitted runtime dependency.
- Password hashing (Sprint 4): `scrypt` from `node:crypto`. No native
  hashing dependency.
- Sync: a separate CLI process (`sync/`), never part of the web server.
  Only the sync process ever talks to a PPM, read-only.

## 4. Architecture

Ports and adapters. One port:

```
PortfolioDataSource
  listSubjects(): Subject[]
  getFinancials(subjectId): { budget, consumed, remaining } | null
```

Adapters, in order of implementation:

1. `fixtures` : synthetic dataset (~80-120 realistic cards). Used for all
   development, demos and tests. The ONLY adapter ever used on the author's
   personal machine.
2. `csv-import` : manual file import of a PPM export. First real-data path.
   Runs only on the client-side machine.
3. `sciforma` : REST, read-only, least-privilege service account, credentials
   from a permission-restricted file outside the repo, never in code or env
   committed anywhere. Stub until the security dossier is approved.
4. `planisware` : interface-compatible stub. Implementation later.

Processes:

- `server/` : serves the API and the built static frontend. Zero egress.
- `sync/` : pulls from the active adapter, writes to SQLite, exits. Cron or
  manual trigger.

Data model (SQLite):

- `cards` : id, title, domain, lane_id, column_id, owner, tags (json),
  dependencies (json), blocked (0/1), blocked_reason, blocked_since,
  budget, consumed, remaining, created_at, source (fixtures/csv/sciforma).
- `card_events` : append-only. id, ts, actor, card_id, type
  (created/moved/blocked/unblocked/edited/imported), from_column, to_column,
  payload (json). Never updated, never deleted.
- `users` (Sprint 4): id, login, scrypt_hash, role (viewer/editor/admin),
  created_at, disabled.

The `card_events` table serves two masters at once: it is the audit trail
required for security review AND the single source for all flow metrics
(cycle time, throughput, time-in-column, aging). Do not create a separate
metrics store. Metrics are queries on events.

Config (`config/board.json`, versioned in git):

```json
{
  "lanes": [
    { "id": "projets", "name": "Projets" },
    { "id": "petits", "name": "Petits Projets" },
    { "id": "complexes", "name": "Projets Complexes" }
  ],
  "columns": [
    { "id": "demandes", "name": "Demandes", "wipLimit": null },
    { "id": "qualification", "name": "Qualification / RDO", "wipLimit": null },
    { "id": "etudes", "name": "Etudes", "wipLimit": null },
    { "id": "prets", "name": "Prets", "wipLimit": null },
    { "id": "actifs", "name": "Actifs", "wipLimit": null },
    { "id": "done", "name": "Done", "wipLimit": null },
    { "id": "exploitation", "name": "En Exploitation", "wipLimit": null }
  ],
  "domains": ["Ingenierie", "Soutien", "Industrie", "Corporate", "ERP",
              "PLM", "Infra", "Archi & Dev", "Cyber"],
  "agingStepsDays": [7, 21, 45, 90],
  "andonThresholdDays": 5
}
```

Rules: `wipLimit: null` renders as "non defini" and enforces nothing; WIP
values are calibrated later from real flow data, the tool must be fully
usable without them. A WIP limit, once set, displays count/limit and turns
the column header red when exceeded; it warns, it does not hard-block.
Diacritics in display names come from the config file as-is.

## 5. UI specification

Visual reference: the existing mockup (provided separately as image/code).
Aesthetic: industrial control panel. Dense, sober, professional. No
decoration, no gradients-for-style, no animation except the blocked pulse.

- Grid: lanes as horizontal swimlanes, columns as vertical stages.
- Aging: card background darkens through the `agingStepsDays` steps based on
  time in current column (derived from events). CSS custom properties.
- Blocked: red pulsing border (CSS animation), reason on hover/focus card.
  Blocked longer than `andonThresholdDays`: add a static escalation marker.
- Three view modes, keyboard-switchable:
  - normal: full cards (title, domain, owner, tags, age).
  - radiator: cards compressed to thin bars (color = state), whole portfolio
    of 100+ items visible on one screen.
  - focus: one lane-column cell expanded, rest dimmed.
- Swimlane collapse: any lane collapses to a single summary row.
- Hard acceptance criterion: at 1920x1080 with 100+ cards, the full board is
  visible with zero scrolling in radiator mode, and normal mode never
  produces horizontal scroll.
- Sidebar (Sprint 2): filters by domain, owner, blocked, age; counts.
- All UI strings in French, exactly as written in config (the board's
  vocabulary is the client's, including English loan-words like "Done").
- Card movement: drag and drop (native HTML5) plus keyboard fallback. Every
  move writes an event with actor and timestamp.

## 6. Security posture (shapes every choice)

- The built app must be reviewable by a human security officer: small SBOM,
  reproducible offline build, readable output.
- Generate an SBOM (CycloneDX) as part of the build.
- `package-lock.json` committed; installs are `npm ci` only; dependency
  tarballs vendored under `vendor/` for offline install.
- Secrets: never in code, never in the repo, never in logs. Sync credentials
  in a chmod-600 file referenced by path.
- Sessions (Sprint 4): httpOnly, SameSite=Strict, Secure cookies. No JWT.
- No self-registration. Admin creates accounts.
- Logs contain no card titles or financial values, only ids.

## 7. Two-machine workflow (development reality)

Code is authored on the author's personal machine with Claude Code, then
reproduced on a client-side machine where it is rebuilt and run. Therefore:

- Fixtures only, ever, on the personal machine. No real client data here.
- Everything must build and verify offline: `verify.sh` runs, in order,
  offline install from `vendor/`, lint, typecheck, tests, build, SBOM. It
  must pass identically on both machines. Pin Node via `.nvmrc` + `engines`.
- Minimize crossing cost: develop and iterate a module to stability here,
  cross it once. Keep modules small and self-contained. After any crossing,
  per-file sha256 comparison is the integrity ritual.
- Nothing in the codebase may assume internet access at runtime or at
  install time.

## 8. Code conventions (enforced)

- Files: 300 lines maximum. Functions: 40 lines maximum. Cyclomatic
  complexity capped by lint config.
- Identifiers in English. Comments in English (pending the client team's
  house style, which overrides this default once known).
- Documentation files (README, ADRs, SECURITY.md, user guide) in French.
- Every exported function carries a doc comment: purpose, inputs, outputs,
  failure modes. No clever one-liners; prefer the boring obvious version.
- ADRs in `docs/adr/NNN-title.md`, one page each, in French: context,
  decision, consequences. Every architectural choice gets one.
- Tests: `node:test` for core and server (no test framework dependency),
  table-driven where natural. Core logic coverage is the priority; UI gets
  smoke tests.
- Module Definition of Done: code + tests + doc comments + ADR if
  architectural + `verify.sh` green. Nothing merges without all five.

## 9. Repository layout

```
core/        domain logic, plain TS, no React, no Node APIs
adapters/    fixtures / csv-import / sciforma / planisware
server/      node:http API + static serving
sync/        CLI sync process
ui/          React app (thin view over core/)
config/      board.json (+ example configs)
fixtures/    synthetic dataset
docs/adr/    decision records (French)
vendor/      vendored dependency tarballs
verify.sh
DEPENDENCIES.md
SECURITY.md  (French)
README.md    (French)
```

## 10. Sprint plan

- Sprint 1 (NOW): core board. Config loading, fixtures adapter, board
  rendering (normal + radiator + focus + collapse), aging, blocked pulse,
  drag and drop writing events to an in-memory event store, one-screen
  acceptance test. No backend yet: the UI runs against fixtures through the
  same port interface the server will later implement.
- Sprint 2: sidebar, filters, counts, keyboard navigation.
- Sprint 3: server + SQLite + events persisted; UI switches to API.
- Sprint 4: auth (local accounts, scrypt, roles), audit hardening.
- Sprint 5: csv-import adapter, then sciforma adapter (read-only) behind a
  flag; sync CLI.
- Sprint 6: flow metrics view (cycle time, throughput, time-in-column,
  aging distribution), computed exclusively from `card_events`.

## 11. Working agreement for Claude Code

- Plan first. For any task, propose the file-level plan and wait for
  approval before writing code.
- One module per session. Small diffs. The human reads every line.
- Never add a dependency. If something seems to need one, stop and say so.
- Never weaken a rule in this file to satisfy a request; flag the conflict.
- When touching `core/`, write or update tests in the same session.
- If a question's answer lives under "Open decisions", ask, do not invent.

## 12. Open decisions (do not assume)

- Sanctioned channel for source entering the client environment (internal
  Git, file-import gateway, or keyboard-only). If keyboard-only with no
  internal package mirror, the fallback is vanilla ES modules + JSDoc types
  with zero toolchain; `core/` must stay portable to that mode.
- Internal npm mirror availability on the client side.
- Exact Node LTS version on the target VM (decides node:sqlite vs
  better-sqlite3).
- Client dev team's house style (comment language, lint config: theirs
  replaces ours on adoption).
- Data sensitivity classification of portfolio data (may constrain hosting
  and logging further).
- Aging step values and andon threshold are defaults; confirm with users.
- Sciforma field mapping for financials (budget, consumed, remaining).
