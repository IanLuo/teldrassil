# Teldrassil - Lessons Learned

This file captures gotchas, design decisions, and reusable patterns. Only write to it when something meaningful is discovered — it is NOT a task completion log. Task status lives in `docs/tasks/plan.md`.

This file is loaded into every session via `opencode.json` instructions, so keep it lean and high-signal.

---

## Conventions
- Each entry: `## [Topic] - [Date]`
- Only include: gotchas, design decisions, patterns, or pitfalls
- Delete stale entries once the lesson is internalized or the codebase changes
- Max 50 lines total — prune aggressively

## Vitest gotchas - 2026-05-02
- `toThrow('string')` checks error message, not error class. Use `toThrow(SystemExit)` for type checks.
- `toHaveBeenCalledBefore` is not available in Vitest. Use mock-driven call-order tracking instead.

## MicroKernel patterns - 2026-05-02
- `swap()` normalizes plugin name to vital slot name (e.g., `AzureVault` → `Vault`) so BootstrapSequence can find it.
- `swap()` only accepts vital slot names — extension plugins use `detach()` + `register()`.
- `ping()` is optional on the Plugin interface; BootstrapSequence checks for its presence.
