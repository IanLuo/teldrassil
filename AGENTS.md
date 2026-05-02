# OpenCode Agent Instructions: Teldrassil

## Project Goal
Teldrassil is a Modular Agentic Micro-Kernel Framework. Its core philosophy is separating the infrastructure ("Immutable Core" plugins like State, Memory, Vault, Drivers) from execution logic (Orchestrators) and task definitions (Manifests).

**Grand Goal:** Build a "Reliable OS for Agents" that prevents future-lock by acting as a lightweight, protocol-agnostic message bus.

## CRITICAL: Mandatory Workflow

You MUST follow these steps for EVERY task. Failure to comply means the task is NOT complete.

### Before ANY code changes
1. Load the `dev-workflow` skill via the `skill` tool.
2. Read `docs/tasks/plan.md` — identify the next `[ ]` task.
3. Edit `docs/tasks/plan.md` — change that task from `[ ]` to `[⏳]`.
4. Output a step-by-step execution plan (3-10 bullets) BEFORE writing code:
   ```
   ## Execution Plan for [Task ID]
   1. [Step]
   2. [Step]
   ...
   ```

### During implementation
5. **TDD First:** Write failing tests, then write implementation code. Never write implementation without tests first.
6. **Design Check:** Verify against `docs/design.md` and `docs/detailed-components.md`. No domain logic in the Kernel, no payload data in the State Manager.

### After ALL code changes
7. Edit `docs/tasks/plan.md` — change task from `[⏳]` to `[x]`.
8. Append a new entry to `docs/memory.md`:
   ```
   ## [Task ID] - [Summary] - [Date]
   
   ### What was done
   - Brief description
   
   ### Gotchas / Lessons Learned
   - Issues and resolutions
   
   ### Follow-up Tasks
   - New tasks (also add to plan.md)
   ```

### Verification (after each task)
9. Run `pnpm test` — must pass.

## Architecture Highlights

- **Pointer-Payload Boundary:** State Manager only stores metadata and URIs (`ref`) <= 4KB. NEVER stores payload data. Memory Engine stores raw data and returns HMAC-signed URIs.
- **Provider-Instance Pattern:** `system_config.yaml` defines the "How" (model_drivers). Agent definitions specify the "Who" via `use_driver` and `model`.
- **The Wildcard Rule:** Supervisor enforces diversity on subjective list outputs; triggers rework if below threshold.
- **Vault Interception:** Credential injection is JIT. Tokens never in LLM context. Memory secured via session-scoped Envelope Encryption.

## Tech Stack
TypeScript / Node.js + React (Next.js) for hybrid CLI/Cloud deployment. Plugins loaded dynamically in-memory.

## Current State
- Phase 1 (Environment & Tooling): Complete
- Phase 2 (Micro-Kernel): EventBus + PluginRegistry complete (tasks 2.1-2.4). BootstrapSequence + MicroKernel pending (2.5-2.6).
- Phase 3-6: Not started.
