# Teldrassil - Session Memory

This file records gotchas, workarounds, design decisions, and lessons learned during development. Updated after EVERY completed task.

---

## Conventions
- Each entry starts with `## [Task ID] - [Summary] - [Date]`
- Entries are chronological (newest at top)
- Sub-sections: `### What was done`, `### Gotchas / Lessons Learned`, `### Follow-up Tasks`

## 2.5 - BootstrapSequence TDD & Implementation - 2026-05-02

### What was done
- Created `SystemExit` error class (`src/core/SystemExit.ts`) for kernel bootstrap failures.
- Extended `Plugin` interface with optional `ping(): Promise<boolean>` for health checks.
- Wrote 7 tests for `BootstrapSequence` covering: all-four-present, missing-one, missing-multiple, ping-all, ping-failure, no-ping-implementation, all-absent.
- Implemented `BootstrapSequence` with `VITAL_PLUGINS` constant (`State`, `Memory`, `Vault`, `Driver`) that validates registration and health in order.

### Gotchas / Lessons Learned
- `toThrow('string')` checks the error message, not the error class. Use `toThrow(SystemExit)` to verify the error type.
- Had to set up `pnpm` via Homebrew's Node.js (`/opt/homebrew/bin/node`) since nix-shell was timing out.
- The `ping()` method is optional on the `Plugin` interface; BootstrapSequence checks for its presence and calls it.

### Follow-up Tasks
- 2.6: Implement `MicroKernel` class tying Registry, Dispatcher, and Bootstrap together.
