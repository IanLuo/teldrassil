# Teldrassil - Steward Decision Log

Records what was NOT chosen and why. Design docs record what WAS chosen. Purpose: prevent re-litigation and detect stale assumptions.

---

## Conventions
- Format: `## YYYY-MM-DD: <title>`
- Include: **Decision**, **Why**, **Revisit if**
- When a decision is superseded, mark `**Superseded by:** <date>`

## 2026-05-03: Rename DAG Mode → Supervised Workflow Mode
**Decision:** Rename design.md §3.1 from "DAG Mode" to "Supervised Workflow Mode."
**Why:** DAG implies no cycles, but the Supervisor Pattern includes rework loops (Worker → fail → back to Worker). "Supervised Workflow" accurately describes the quality-gated execution with retry feedback.
**Revisit if:** We add a genuinely acyclic execution mode that excludes rework.

## 2026-05-02: Created project-steward skill
**Decision:** Bundle change evaluation, design sync, task restructuring, challenge rules, and external solution discovery into a single `project-steward` skill rather than splitting across multiple skills.
**Why:** All functions share a single dependency (deep project context). Splitting would cause drift, stale context, and duplication. The workflow is linear, not parallel.
**Revisit if:** The skill becomes too large to maintain, or a single invocation regularly exceeds context limits.
