# ADR-0002: Use npm workspaces (not pnpm or Turborepo) for the monorepo

- Status: Accepted
- Date: 2026-07-20
- Sprint: 0

## Context

Courtside is four packages (`mcp-server`, `runtime`, `client`, `eval`) plus a
docs tree. We need shared TypeScript / ESLint / Prettier configs, a single CI
job that fans out across packages, and no runtime coupling between them.
Candidates: npm workspaces, pnpm workspaces, Yarn workspaces, Turborepo, Nx.

## Decision

Use **npm workspaces**. Root `package.json` declares the workspace array; every
per-package script is invoked with `--workspaces --if-present`.

## Consequences

- Zero extra tooling — npm is already required for Node 20; no lockfile format
  disagreements; no `corepack enable` step in CI or on new dev machines.
- One `package-lock.json` at the root; deterministic installs in CI via
  `npm ci`.
- Cross-package dev is symlinked by default. If any package imports another
  (Sprint 2+), it's a `"@courtside/foo": "*"` dependency and Just Works.
- No task graph / caching layer (Turborepo, Nx). Not needed at four packages;
  can be added later as a pure superset without breaking the workspace layout.

## Alternatives considered

- **pnpm** — faster installs, strict deps, but adds a required tool for every
  contributor and Render/Vercel free-tier build images.
- **Turborepo / Nx** — task graph is nice but the packages don't yet share
  build outputs; premature.
