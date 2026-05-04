# Contributing to JarvisQ

Thanks for considering a contribution. This project follows a small set of
conventions to keep mobile and desktop in lock-step and the core
platform-free.

## Before you open a PR

1. Read [AGENTS.md](AGENTS.md) — it's the architectural contract (hexagonal
   ports, English-only code, additive refactors, no platform leaks into
   `src/core/`).
2. Run the checks locally:
   ```bash
   npm run typecheck
   npm test
   ```
3. If your change touches Android UI, validate on a real device using the
   release-APK workflow described in AGENTS.md (the `grep -c -a` bundle
   check is the authoritative "did my JS ship?" test).

## Branching and commits

- Branch from `main`. Use a descriptive branch name (`feat/…`, `fix/…`).
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`,
  `test:`. Subject ≤ 70 chars. Body explains **why**, not what.
- One logical change per PR. Two unrelated fixes → two PRs.

## Pull request expectations

- Filled-in PR description (see the template). Link any related issue.
- CI green: typecheck + unit tests pass on Node 20.
- For new ports/adapters: provide both the port (under `src/core/ports/`)
  and at least one adapter (`src/platform/<target>/`).
- For new model URLs: pin the commit SHA in
  `src/core/config/HttpModelSources.ts`.
- For new `AppSettings` fields: update `src/domain/types.ts` and
  `SettingsStore` defaults, plus the Settings screen.

## Code style

- TypeScript strict mode is on (`strict`, `noImplicitAny`, `strictNullChecks`,
  `noUnusedLocals`, `noUnusedParameters`). The CI typecheck enforces it.
- Two-space indent. No default exports except for React components.
- English identifiers and comments only. User-facing UI copy is the only
  exception.
- Don't add comments that restate what the code does. Comments belong on
  hidden invariants, workarounds for specific bugs, and non-obvious "why"s.

## Testing

The project uses [Vitest](https://vitest.dev/) for unit tests. Tests live
next to the code they cover under `__tests__/` directories. Pure modules
(no SDK, no platform deps) are easiest to cover — start there.

```bash
npm test            # one-shot
npm run test:watch  # re-run on save
```

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. Use
GitHub's private vulnerability reporting flow described in
[SECURITY.md](SECURITY.md).

## Code of conduct

Participation in this project is governed by the
[Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
