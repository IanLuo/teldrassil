# Teldrassil - Steward Decision Log

Records what was NOT chosen and why. Design docs record what WAS chosen. Purpose: prevent re-litigation and detect stale assumptions.

---

## Conventions
- Format: `## YYYY-MM-DD: <title>`
- Include: **Decision**, **Why**, **Revisit if**
- When a decision is superseded, mark `**Superseded by:** <date>`

## 2026-05-02: Created project-steward skill
**Decision:** Bundle change evaluation, design sync, task restructuring, challenge rules, and external solution discovery into a single `project-steward` skill rather than splitting across multiple skills.
**Why:** All functions share a single dependency (deep project context). Splitting would cause drift, stale context, and duplication. The workflow is linear, not parallel.
**Revisit if:** The skill becomes too large to maintain, or a single invocation regularly exceeds context limits.
