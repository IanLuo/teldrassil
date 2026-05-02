# Decision Log

> Records what was NOT chosen and why. For what WAS chosen, see `docs/design.md` and `docs/detailed-components.md`.
>
> Format: `## YYYY-MM-DD: <title>` — then **Decision**, **Why**, **Revisit if**.

## 2026-05-02: Created project-steward skill
**Decision:** Bundle change evaluation, design sync, task restructuring, challenge rules, and external solution discovery into a single `project-steward` skill rather than splitting across multiple skills.
**Why:** All functions share a single dependency (deep project context). Splitting would cause drift, stale context, and duplication. The workflow is linear, not parallel.
**Revisit if:** The skill becomes too large to maintain, or a single invocation regularly exceeds context limits.

