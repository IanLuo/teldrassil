# Teldrassil - Steward Decision Log

Records what was NOT chosen and why. Design docs record what WAS chosen. Purpose: prevent re-litigation and detect stale assumptions.

---

## Conventions
- Format: `## YYYY-MM-DD: <title>`
- Include: **Decision**, **Why**, **Revisit if**
- When a decision is superseded, mark `**Superseded by:** <date>`

## 2026-05-04: Pivot to Tripartite Data Boundary (Trace Log)
**Decision:** Adopt a tripartite data boundary (State Pointer, Memory Vault, Trace Ledger) rather than forcing routing feedback into the Memory Engine.
**Why:** Conflating "large data" with "valuable data" pollutes the Memory Engine. Memory must be reserved for high-value semantic domain artifacts. The State Manager must remain <4KB. The new `ITraceLog` absorbs heavy, ephemeral routing metadata, gate findings, and raw LLM traces.
**Revisit if:** Trace logs become too large to store locally, requiring an external telemetry sink.

## 2026-05-04: Reject Time-Travel Checkpoints
**Decision:** Reject Suggestion 5 (Checkpoint Manager) and time-travel state reversion. Enforce linear rework loops only.
**Why:** To prevent "hallucinations" caused by orphaned artifacts in the Memory Engine and to avoid the massive complexity of implementing artifact garbage collection and timeline isolation. Rework is handled by the Supervisor's `REWORK` loop or appending new forward-moving steps.
**Revisit if:** The planner app demonstrates a hard requirement for multi-node rollbacks that cannot be solved by passing older pointers forward.

## 2026-05-04: Reject Native Rich Quality Gates (Keep Binary)
**Decision:** Keep the core Supervisor quality gate binary (`PROCEED` / `REWORK`). Reject building a heavy severity-based Quality Gate Framework into the Orchestrator.
**Why:** The Provider-Instance pattern already delegates evaluation to user-defined agents/functions. The planner app should implement its rich, severity-based logic inside its own Evaluator agent (or HostFunction), which logs the findings to the Trace Log and reduces the decision to a simple binary go/no-go for Teldrassil.
**Revisit if:** The binary constraint fundamentally breaks routing for complex workflows.

## 2026-05-04: UnifiedModelDriver over Bespoke Adapters
**Decision:** Deprecate `AnthropicDriver` and `OpenAIDriver` in favor of a single `UnifiedModelDriver` using `@ai-sdk/core`.
**Why:** Building and maintaining bespoke adapters for every LLM provider is massive technical debt. The AI SDK standardizes structured outputs and tool-calling across providers, allowing the Micro-Kernel to remain agnostic while supporting all major models.
**Revisit if:** `@ai-sdk/core` becomes unmaintained or introduces architectural constraints incompatible with the Kernel.

## 2026-05-04: HostFunctionDriver for Local Code Execution
**Decision:** Use `HostFunctionDriver` to execute local deterministic callbacks instead of extending the manifest with arbitrary `uses: host.code` orchestrator hacks.
**Why:** Maintains the purity of the Provider-Instance abstraction. Local functions are treated as just another "Agent" by the Kernel and Orchestrator. Guarantees cheap, deterministic execution without breaking the framework's architecture.
**Revisit if:** Host functions require complex stream interactions that break the `IModelDriver` request/response interface.

## 2026-05-03: Deferred Phase 6 pending integration validation and monorepo fix
**Decision:** Phase 6 (Managing UI) is deferred. Task 1.4 reopened (monorepo scaffold never completed). New tasks 2.7 (integration test) and 2.8 (CLI entry point) added before Phase 6.
**Why:** The core framework has 16 components with 127 unit tests but no integration tests, no CLI entry point, and no monorepo workspace. Phase 6 requires packages/ui which doesn't exist. Adding UI on top of untested plumbing violates the build order.
**Revisit if:** Tasks 2.7 and 2.8 are complete, confirming the kernel boots with all vital plugins.

## 2026-05-03: Rename DAG Mode → Supervised Workflow Mode
**Decision:** Rename design.md §3.1 from "DAG Mode" to "Supervised Workflow Mode."
**Why:** DAG implies no cycles, but the Supervisor Pattern includes rework loops (Worker → fail → back to Worker). "Supervised Workflow" accurately describes the quality-gated execution with retry feedback.
**Revisit if:** We add a genuinely acyclic execution mode that excludes rework.

## 2026-05-02: Created project-steward skill
**Decision:** Bundle change evaluation, design sync, task restructuring, challenge rules, and external solution discovery into a single `project-steward` skill rather than splitting across multiple skills.
**Why:** All functions share a single dependency (deep project context). Splitting would cause drift, stale context, and duplication. The workflow is linear, not parallel.
**Revisit if:** The skill becomes too large to maintain, or a single invocation regularly exceeds context limits.