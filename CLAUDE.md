# CLAUDE.md : Portfolio Kanban Engine

This file is the working contract between the human author (Pierre-Yves) and
Claude Code. Read it fully before any session. If a request conflicts with a
rule here, surface the conflict instead of silently resolving it. When
information is listed under "Open decisions", ask rather than assume.

> **2026-06-19 — Re-platform in progress.** The tool is the author's, built
> for the PMO team and deployed on the client's containerized platform. The
> client's tech lead governs only the **SBOM ceiling** — which open-source
> components/versions may run on that platform (Docker; **React 18 / TS /
> Vite** front, **Node / Express / TS** middle, **PostgreSQL** back). Within
> that ceiling, every internal design decision is the author's. This
> **supersedes the original minimalist build constraints** (node:http /
> SQLite / 12-dep budget / hand-written-CSS-only / no framework). The product
> opinion (§1), the hexagonal architecture and the event-sourced model (§4)
> carry over intact; the runtime edges are re-platformed.

> **2026-07-05 — Design v9 is the product reference.** The validated Claude
> Design mockup (`design/`, « Portefeuille DSI — Kanban NMO ») supersedes the
> earlier UI spec on three points, per the author's instruction (ADR 012/013):
> the card model is complete (nature, charge j.h + budget k€, plan de charge,
> ressources, commentaires, notes, champs personnalisés, création locale,
> suppression par événement `deleted`); age is carried by the text pill (no
> background darkening by default); and an **admin-only topology
> configuration panel** exists (runtime override + append-only history;
> `config/board.json` stays the versioned default model).

> **2026-07-09 — Design v11 adopted** (ADR 017/018/019, author's decisions).
> Archiving is a reversible card lifecycle (`archived`/`unarchived` events,
> Archives view + header badge). Blocking is governed by a dedicated BLOCAGE
> section with a **mandatory motif** (no Bloqué toggle in the edit form).
> **Nature is positional** — the card's nature IS its canal
> (`lanes[].natureKey`); requalification = moving lanes; no Nature select,
> no nature sidebar filter (a « Bloqués uniquement » toggle instead).
> **One click on a card opens its detail** (column-header click focuses a
> stage; collapsed cells open a one-click ticket popover). Cards can be
> dropped **onto other cards** (manual order in the `moved` event via
> `beforeId`; same-cell reorders never reset the aging clock). The card
> detail loses the DoR/DoD doc links, gains collapsible Délais (per-stage
> ages + lead/cycle from the log) and Historique (incl. block/unblock
> lines), per-profile consumed editing, and Budget before Plan de charge.
> The scroll-hint bob is an accepted exception to the no-animation rule.

## 1. What this project is

An opinionated portfolio kanban instrument: a single-page board that makes a
project portfolio's real state legible (flow, aging, blockages, WIP), deployed
into the client's on-premise containerized platform for the PMO team, with
read-only connectivity to enterprise PPM tools (Sciforma first, Planisware
later) through an adapter layer.

It is an instrument, not a platform. The product's value IS its opinion:

- Pull flow. Work is pulled forward, never pushed. All intake enters left.
- Time is visible. Every card wears its age (text pill, warn/danger colors;
  background decay kept in core as an option — off in the validated design).
- Blockages scream. Blocked cards pulse; cells show a blocked count badge.
- One screen, zero scroll. The whole portfolio is visible at once, always.
- The event log is the truth. Every movement, edit, comment and deletion is
  recorded append-only (deletion is itself an event).

These behaviors are hard-coded and non-negotiable. What IS configurable is
topology/vocabulary only: lanes, columns (order, WIP, gates), domains, types,
nature/criticality labels, custom card fields, threshold values. Defaults live
in a versioned config file; an **admin-only configuration panel** may apply a
runtime override, persisted with an append-only history (ADR 013). Behavior is
never configurable.

## 2. Constraints

### Permanent product / security constraints (never revisit)

- On-premise only. No cloud, no SaaS, no external runtime services. The app
  runs inside the client's platform.
- Zero egress from the web application at runtime. No telemetry, no analytics,
  no CDN, no external fonts, no remote assets — everything is bundled into the
  container image.
- No Monte Carlo or probabilistic forecasting features. Ever.
- No LDAP group-based permissions. Local accounts, hard-coded roles only.
- No procurement/purchasing-tool integration.

### Platform constraint (the one hard external boundary)

- Dependencies must stay **within the client's authorized SBOM** (their
  front/middle `package.json` versions). The SBOM is a **ceiling, not a
  mandate**: use the minimum needed; we need not adopt Tailwind/Radix/axios
  just because they are listed. Anything *beyond* the ceiling (a new runtime
  component on their platform) requires the tech lead's approval, a line in
  DEPENDENCIES.md, and an ADR.

The original radical-minimalism rules (1 runtime / 12 total dependency budget,
no web framework, no ORM, no UI component library, Node built-ins only) are
**retired** — their goal (a small auditable surface for sovereign deployment)
is now served by the client's SBOM governance and the container model.

## 3. Stack

- Language: **TypeScript everywhere. Strict mode.**
- **Front** (`front/`): **React 18**, functional components and hooks only,
  built with **Vite**. Routing via react-router-dom. HTTP via the existing
  `fetch` wrapper (axios is available but not required — ceiling, not
  mandate). Styling: the existing hand-written CSS is kept now and will be
  adapted to the platform's **Tailwind + Radix** (both authorized) shortly.
  React stays a thin view layer over `core/` (zero React in core).
- **Middle** (`middle/`): **Node / Express / TypeScript**. Express is chosen
  because the SBOM's `cors`/`cookie-parser` are Express middleware and pair
  with JWT-in-cookie auth; the existing node:http API *logic* (validation,
  fold, event-building) ports into Express routes unchanged. Express only
  wraps transport, validation and auth; all domain logic stays in `core/`.
- **Back**: **PostgreSQL**, accessed behind the `BoardStorage` port (§4) via
  **`pg` (node-postgres)** — the standard, reviewable client. `pg` is not in
  the reference SBOM yet, so it is the one runtime addition to clear with the
  tech lead (§12). No ORM; thin, parameterized SQL.
- Runtime: **Node `>=22.18 <24`** (the platform pin), containerized.
- Auth (sessions): **JWT** (`jsonwebtoken`) in an httpOnly cookie (§6).
  Password hashing with **`scrypt` from `node:crypto`** — a Node builtin, so
  no added dependency and within any ceiling (preferred over bcrypt/argon2,
  which are unlisted and need native builds).
- Sync: a separate process (`sync/`), never part of the web middle. Only the
  sync process ever talks to a PPM, read-only.

## 4. Architecture (carries over — the reason the re-platform is tractable)

Ports and adapters. The domain core is pure and portable; only adapters and
transports change with the platform.

```
PortfolioDataSource           (read-only PPM access — adapters/)
  listSubjects(): Subject[]
  getFinancials(subjectId): { budget, consumed, remaining } | null

BoardStorage                  (persistence — Postgres adapter behind it)
  importCards / insertCard / appendEvent / listEvents / listBaseCards / close
```

`PortfolioDataSource` adapters, in order: `fixtures` (synthetic, 150
cards — the ONLY adapter on the author's machine), `csv-import` (manual PPM
export, first real-data path, client side only), `sciforma` (REST, read-only,
least-privilege; stub until the security dossier is approved), `planisware`
(stub).

Processes / containers:

- `middle/` : Express API; serves or is fronted alongside the built front.
  Zero egress.
- `sync/` : pulls from the active adapter, writes to PostgreSQL, exits.

Data model (**PostgreSQL** tables; same shape as before, jsonb for json
fields, append-only enforced by table grants/triggers):

- `cards` : id, title, domain, lane_id, column_id, owner, criticality
  (top/major/normal), type_id, codename, nature (simple/complicated/complex),
  tags (jsonb), dependencies (jsonb), blocked, blocked_reason, blocked_since,
  effort_estimated, effort_consumed (j.h), budget_estimated, budget_consumed
  (k€), load_plan, resources (jsonb), notes, sciforma_id, custom (jsonb),
  created_at, source (fixtures/csv/sciforma/manual). lane_id/column_id/
  blocked/blocked_reason/blocked_since hold the import-time snapshot only;
  live values are derived by folding `card_events` on read, never written
  back (ADR 002). criticality/type_id/codename added by ADR 006; the full
  design-v9 card (nature, charge, budget, plan de charge, ressources, notes,
  sciforma_id, custom, source manual) by ADR 012; the design-v10 layer by
  ADR 014 — risks (jsonb), project_constraints, contention_profiles +
  contention_note, charge_by_profile (jsonb, j.h per DSI profile), alerts,
  date_rdr, budget_rdli + budget_engaged (k€). The profile/role/risk/
  constraint/severity typologies live in the board config (ADR 014), not on
  the card.
- `card_events` : append-only. seq (bigint sequence, ordering), id
  (evt-<seq>), ts, actor, card_id, type (created/moved/blocked/unblocked/
  edited/commented/archived/unarchived/deleted/imported), from_column,
  to_column, payload (jsonb). Never updated, never deleted. Comments are a
  projection of `commented` events; deletion is a `deleted` event (the fold
  excludes the card, the log keeps everything — ADR 012); archiving is a
  reversible `archived`/`unarchived` pair (the fold keeps the card flagged,
  the board excludes it — ADR 017); manual order rides in the `moved`
  payload (`beforeId` — same-cell reorders never reset the aging clock and
  never count as stage entries, ADR 019).
- `users`: id, login, scrypt_hash, role (viewer/editor/admin), created_at,
  disabled.

`card_events` is both the audit trail and the single source for all flow
metrics. Do not create a separate metrics store. Metrics are queries on
events. The event-sourced model (append-only log + fold-on-read) is retained —
it is the product's core (§1) and maps to a plain Postgres append-only table;
to the platform the middle is a standard Express+Postgres service doing
INSERT/SELECT. Courtesy heads-up to the tech lead: the schema is append-only
(no UPDATE/DELETE), in case their DB tooling assumes mutable rows.

Config (`config/board.json`, versioned in git — the NMO default model):
lanes (name, nature subtitle, `natureKey` — the nature the canal confers to
its cards, ADR 018 — detail), columns (name, `wip`, `gate` DoR/DoD, note),
domains and types (name, short, color), nature/criticality labels, custom
field definitions, `age` thresholds (fresh/recent/aging/stale), and
`andonThresholdDays`. `wip: null` shows the bare count and enforces nothing;
a set WIP shows count/limit, warns at ≥ 80 %, reddens beyond 100 % (warns,
never hard-blocks). An admin-panel override is persisted server-side with an
append-only history; « Réinitialiser le modèle » returns to board.json
(ADR 013). Diacritics in display names come from the config as-is.

## 5. UI specification (carries over)

Aesthetic: industrial control panel. Dense, sober, professional. No
decoration, no gradients-for-style, no animation except the blocked pulse
and the scroll-hint bob (accepted v11 exception). (Implemented in
hand-written CSS now; adapted to Tailwind/Radix later.)

- Grid: lanes as horizontal swimlanes (canaux), columns as vertical stages;
  gate badges (DoR/DoD) on their columns.
- Aging (design v9): age is worn as a text pill (3j/2s/4m; warn ≥ recent,
  danger ≥ aging thresholds). No background darkening by default.
- Blocked: pulsing red dot + blocked card wash, reason on the card in focus
  and in the detail; per-cell blocked count badge.
- Radiator bars (~16px) are THE default view; **one click on a card opens
  its detail** (v11); clicking a column header focuses that stage (2.6fr,
  expanded cards). Lanes collapse to summary rows (the last expanded lane
  refuses); columns collapse to 30px strips (Pause starts collapsed);
  collapsed cells open a one-click ticket popover. Over-WIP cells wear a
  red wash; overflowing cells a scroll-hint arrow.
- Hard acceptance criterion: at 1920x1080 with 150 cards, the full board is
  visible with zero scrolling; never any horizontal scroll.
- Sidebar: search (title + codename), codes-projet toggle, « Bloqués
  uniquement » toggle, filters by type / criticality / domain with
  tout·rien; live shown/total counts. Filters dim, never remove (spatial
  truth). No nature filter (v11): nature is the canal.
- All UI strings in French, exactly as written in config.
- Card movement: drag and drop plus keyboard fallback. Every move POSTs an
  intent; the middle writes the event with server-assigned actor/ts.
  Dropping a card ON another card inserts it just before it (ADR 019).
- Card detail: charge j.h + budget k€ bars (budget before plan de charge),
  per-profile consumed editing, ressources, commentaires (event-backed),
  BLOCAGE section (mandatory motif, « Lever »), Délais + Historique
  (collapsible, event-backed, incl. block/unblock lines), full edit
  (no Nature select, no Bloqué toggle), archive (« Archiver »), delete
  (as `deleted` event).
- Archives (header icon + count badge): searchable list, « Désarchiver »,
  open-the-fiche (ADR 017).
- QuickAdd (« + Sujet », touche N): always enters the first column; the
  canal confers the nature.
- Admin panel (⚙): topology/vocabulary only (ADR 013), incl. per-lane
  natureKey. Metrics view (☷): flow metrics computed from cards + events
  (core/metrics), reorders excluded.

## 6. Security posture (shapes every choice)

- Reviewable by a human security officer: the dependency surface is the
  client's authorized SBOM; the container build is reproducible.
- Generate an SBOM (e.g. CycloneDX) as part of the image build where feasible.
- Secrets: never in code, never in the repo, never in logs. Sync and DB
  credentials in env/secret files outside the repo, referenced by path
  (dotenv per the SBOM).
- Sessions: **JWT in an httpOnly + SameSite=Strict cookie** (Secure behind
  TLS; an explicit `INSECURE_COOKIES` switch drops Secure for a plain-HTTP
  locked-down LAN). cookie-parser is in the SBOM. The token stays out of
  JS/XSS reach (chosen over a Bearer header + the front's react-secure-
  storage). Token lifetime/refresh set at RP3.
- No self-registration. Admin creates accounts via a CLI (no settings UI).
- Logs contain no card titles or financial values, only ids.
- Network/VM access control is part of the posture; app-level auth is
  additive. Tamper-evident audit-log hashing was **declined** — handled by
  infrastructure access control.
- Carried-over server hardening to re-implement in Express: CSP
  (`default-src 'self'`, plus `style-src 'unsafe-inline'` while inline styles
  remain), security headers set explicitly (no helmet unless authorized),
  request body cap, request timeouts, same-origin only (CORS configured
  to deny cross-origin, even though `cors` is available).

## 7. Development & delivery workflow

Code is authored on the author's machine with Claude Code, then delivered as
container images into the client's platform.

- Fixtures only, ever, on the author's machine. No real client data here.
- Local dev runs the stack with Docker Compose (front + middle + a dev
  PostgreSQL). The pipeline runs lint (the client's ESLint), typecheck
  (`tsc`), tests (`node:test`), and the container build.
- Delivery is by container image into the client's platform/registry (⚠ exact
  channel/registry to settle with the tech lead, §12). This replaces the
  former offline-vendoring / per-file sha256 crossing ritual.
- Nothing in the codebase may assume public-internet access at runtime.

## 8. Code conventions (enforced)

- Files: 300 lines maximum. Functions: 40 lines maximum.
- Lint: adopt the client's **ESLint** configuration (their front SBOM ships
  ESLint + typescript-eslint + react-hooks rules) — it is the house style and
  caps complexity.
- Identifiers and code comments in English; documentation (README, ADRs,
  SECURITY.md, DEPENDENCIES.md, user guide) in French.
- Every exported function carries a doc comment: purpose, inputs, outputs,
  failure modes. Prefer the boring obvious version.
- ADRs in `docs/adr/NNN-title.md`, one page each, French: context, decision,
  consequences. Every architectural choice gets one (the re-platform itself
  gets an ADR at RP0).
- Tests: `node:test` for `core/` and `middle/` (dependency-free, native);
  core logic coverage is the priority. The front has no test runner in the
  SBOM, so the UI gets manual/preview verification for now; **Vitest** (built
  on Vite, already in the stack) is the natural addition if automated UI tests
  are wanted later — cleared with the tech lead first.
- Module Definition of Done: code + tests + doc comments + ADR if
  architectural + green pipeline. Nothing merges without all five.

## 9. Repository layout (target after re-platform)

```
core/        shared domain logic, plain TS — no React, no Node APIs, no framework
adapters/    fixtures / csv-import / sciforma / planisware (PortfolioDataSource)
middle/      Express + TS API; Postgres adapter behind BoardStorage; JWT auth
front/       React 18 + Vite + TS; thin view over core/
sync/        CLI/job: active adapter -> PostgreSQL, exits
config/      board.json (+ example configs)
fixtures/    synthetic dataset
docker/      Dockerfiles (front, middle) + compose (with dev PostgreSQL)
docs/adr/    decision records (French)
SECURITY.md  (French)
DEPENDENCIES.md (French)
README.md    (French)
```

`core/` is shared as a dependency-free **npm workspace** consumed by both
`front/` and `middle/` (npm workspaces is built in — no new tooling); each
Dockerfile builds its workspace with `core/` in the build context. Current
`ui/` and `server/` map to `front/` and `middle/`; the move and the
node:http→Express / sqlite→Postgres swaps are the re-platform work.

## 10. Plan

Done on the original minimalist stack (Sprints 1-3): core domain modules +
fixtures; board UI (normal/radiator/focus/collapse, aging, blocked pulse,
filters, keyboard nav, metrics pulled forward); node:http server + SQLite/
JSONL storage behind the `BoardStorage` port + UI on the API. This validated
the product, the ports and the event model; `core/` and the API logic carry
over unchanged.

Re-platform phases:

- **RP0**: record the re-platform ADR; stand up the npm-workspace monorepo +
  Docker skeleton (front + middle + dev PostgreSQL); confirm `core/` ports
  unchanged into the new structure.
- **RP1**: middle on Express + a PostgreSQL adapter (`pg`) behind
  `BoardStorage` (reuse `foldEvents`, validation, event-building); `/api/config`
  + board API.
- **RP2**: front on React 18 + Vite; port the components over the unchanged
  `core/` (hand-written CSS first, Tailwind/Radix adaptation after).
- **RP3**: auth via JWT-in-cookie (login, roles viewer/editor/admin, actor
  attribution replacing "anonymous"); account CLI; audit hardening.
- **RP4**: csv-import then sciforma adapters (read-only, flagged); sync job.
- **RP5**: flow metrics view, computed exclusively from `card_events`.
- **RP6**: Dockerization + CI within the client's platform; SBOM alignment.

## 11. Working agreement for Claude Code

- Plan first. For any task, propose the file-level plan and wait for approval
  before writing code.
- Small, reviewable diffs. The author is technical but does not read code
  line-by-line: explain changes in plain language with their risk, prove them
  by running tests and the app, and rely on adversarial review agents for
  line-level scrutiny. Decisions and direction are the author's; building and
  verifying are Claude's.
- Never add a dependency outside the client's authorized SBOM. If something
  seems to need one, stop and say so (it requires the tech lead's approval).
- Never weaken a constraint in this file to satisfy a request; flag the
  conflict.
- When touching `core/`, write or update tests in the same session.
- Log every architecture change in `docs/ARCHITECTURE.md` — a dated,
  plain-language running record kept in sync with the author's Claude (web)
  project — in addition to the formal ADR.
- If a question's answer lives under "Open decisions", ask, do not invent.

## 12. Open decisions

**Governance:** the tool is the author's, built for the PMO team, deployed on
the client's platform. The tech lead governs only the SBOM ceiling (what may
run on the platform). Every internal design decision is the author's.

**Decided (author, 2026-06-19):**

- SBOM is a ceiling — use the minimum within the authorized versions.
- Middle on **Express** (SBOM's cors/cookie-parser are Express middleware);
  the existing node:http API logic ports into it.
- Storage: **PostgreSQL** via **`pg`**; the **event-sourced** append-only
  model is retained.
- Auth: **JWT in an httpOnly+SameSite=Strict cookie**; **scrypt**
  (node:crypto) for passwords; admin-creates-accounts via CLI; roles
  viewer/editor/admin.
- UI: keep hand-written CSS now, adapt to Tailwind/Radix later.
- Tests: `node:test` for core/middle; UI by preview; Vitest later if wanted.
- `core/` shared via an **npm workspace** across `front/` and `middle/`.
- Runtime Node `>=22.18 <24`, containerized; lint = the client's ESLint.

**Cleared with the tech lead:**

- **`pg`** (node-postgres) **authorized (2026-07-07)** and installed — PostgreSQL
  is the delivery back end, behind the `BoardStorage` port
  (`middle/storage/postgres.ts`, ADR 016); JSONL stays as a selectable file
  fallback. The `BoardStorage` port went async (pg has no sync API).

**Still to clear with the tech lead:**

- The exact delivery channel / image registry into the platform.

**Still open (product):**

- Aging step values and andon threshold are defaults; confirm with the PMO users.
- Sciforma field mapping for financials (budget, consumed, remaining).
