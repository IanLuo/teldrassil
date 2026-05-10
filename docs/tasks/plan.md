# Teldrassil Action Plan

This document contains the detailed breakdown of all tasks required to build Teldrassil. Each phase is broken down into specific, actionable, and testable steps.

> **Important Workflow Rule:** We operate under strict TDD and adhere to the `dev-workflow` skill. Before executing any step here, ensure you have read the design docs and understand the current state.
> 
> **Current State:** Phases 1-8 complete.

## Phase 1: Environment & Tooling
* [x] 1.1 Create `dev-workflow` skill folder and `SKILL.md` outlining the 6-step strict process (status check, design check, TDD loop, review gate, commit, persist state).
* [x] 1.2 Create `personas` skill folder and `SKILL.md` defining Developer, Tester, Document Maintainer, and Reviewer mindsets.
* [x] 1.3 Initialize `flake.nix` with Node.js 20, pnpm, and typescript language servers. Configure `direnv`.
* [x] 1.4 Scaffold `pnpm` workspace (monorepo: root `package.json`, `packages/ui` with core at `src/core`).
* [x] 1.5 Setup testing framework (Vitest) and TypeScript configuration.

## Phase 2: The Micro-Kernel (Core Bus)
* [x] 2.1 **TDD:** Write tests for `PluginRegistry`. It must map strings to class instances and throw on duplicate registrations.
* [x] 2.2 **Build:** Implement `PluginRegistry`.
* [x] 2.3 **TDD:** Write tests for `EventDispatcher`. It must support pub/sub and wildcard event listening.
* [x] 2.4 **Build:** Implement `EventDispatcher` (as `EventBus`).
* [x] 2.5 **TDD:** Write tests for `BootstrapSequence`. It must validate that exactly five vital interfaces (`State`, `Memory`, `Vault`, `Driver`, `Trace`) are present, ping them, and throw `SystemExit` if missing.
* [x] 2.6 **Build:** Implement the `MicroKernel` class tying Registry, Dispatcher, and Bootstrap together.
* [x] 2.7 **Integration:** Write end-to-end test bootstrapping MicroKernel with all five vital plugins (`EnvVaultPlugin`, `LocalMemoryPlugin`, `LocalStatePlugin`, `UnifiedModelDriver`, `LocalJsonTracePlugin`) and verifying full lifecycle (bootstrap → ping → shutdown).
* [x] 2.8 **Build:** Implement CLI entry point (`src/index.ts`) that loads kernel, registers vital plugins, runs bootstrap, and reports status.

## Phase 3: Vital Interfaces & Contracts
* [x] 3.1 **Build:** Define TypeScript `interface` for `IStateManager` (must accept <=4KB payloads and URIs).
* [x] 3.2 **Build:** Define TypeScript `interface` for `IMemoryEngine` (must return `MemoryURI` and enforce signature validation).
* [x] 3.3 **Build:** Define TypeScript `interface` for `IVault` (must support DEK generation and Secret retrieval).
* [x] 3.4 **Build:** Define TypeScript `interface` for `IModelDriver` (must handle schema translation).
* [x] 3.5 **TDD/Build:** Create simple `InMemoryMock` classes for all five vital plugins to pass the kernel bootstrap tests.

## Phase 4: Orchestration & Workflow Logic
* [x] 4.1 **TDD/Build:** Create the `ManifestParser` with Zod to validate `system_config.yaml` against the Provider-Instance pattern mapping (`use_driver` -> `model`).
* [x] 4.2 **TDD:** Write tests for the `Supervisor` node. It must intercept outputs and apply a pass/fail Quality Gate based on a mock criteria list.
* [x] 4.3 **Build:** Implement `Supervisor` Quality Gate.
* [x] 4.4 **TDD:** Write tests for the `WildcardRule`. It must take an array of strings, calculate a mock diversity score, and throw a Rework error if below threshold.
* [x] 4.5 **Build:** Implement `WildcardRule` interceptor and integrate it into the Supervisor logic.

## Phase 5: The Execution Layer & Security
* [x] 5.1 **TDD/Build:** Implement `EnvVaultPlugin` that derives a Master Key from `.env` using PBKDF2 and securely generates session DEKs.
* [x] 5.2 **TDD/Build:** Implement `LocalMemoryPlugin` that uses the Vault DEK to AES-256-GCM encrypt files written to `/.teldrassil/memory/` and returns HMAC-signed URIs.
* [x] 5.3 **TDD/Build:** Implement `PostgresStatePlugin` (or SQLite for local dev) that records execution traces.
* [x] 5.4 **Build:** Implement `AnthropicDriver` integrating the official Anthropic SDK and translating framework messages to Claude schemas.

## Phase 6: Managing UI
* [x] 6.1 Scaffold Next.js frontend in `packages/ui`.
* [x] 6.2 Implement Zustand/Jotai store to mirror the `State Manager`'s workflow position.
* [x] 6.3 Build the visualization component (e.g., React Flow) to render the active workflow.
* [x] 6.4 Build the "Human-Attach" override modal triggered by a `HUMAN_REQUIRED` kernel event.

## Phase 7: Execution & App Backbone
* [x] 7.1 **Durable State:** Implement `LocalJsonStatePlugin` with disk persistence (`/.teldrassil/state`) enforcing the strict 4KB pointer-only limit.
* [x] 7.2 **Durable Memory:** Implement `LocalFileMemoryPlugin` with AES encryption and filesystem persistence (`/.teldrassil/memory`).
* [x] 7.3 **Trace Log:** Implement `LocalJsonTracePlugin` and the `ITraceLog` interface for observability, routing metadata, and LLM I/O.
* [x] 7.4 **Unified LLM Driver:** Implement `UnifiedModelDriver` implementing `generate()` via `@ai-sdk/core`, integrating Vault credentials.
* [x] 7.5 **Deterministic Driver:** Implement `HostFunctionDriver` for zero-cost, deterministic local code execution.
* [x] 7.6 **Structured Routing:** Extend `SupervisorDecision` to 5-enum and create `RouteDecision` metadata struct written to Trace Log.
* [x] 7.7 **Workflow Runner:** Implement the workflow execution loop (`WorkflowRunner`) that executes the manifest sequence.
* [x] 7.8 **Human Interaction:** Wire the `HUMAN_REQUIRED` event and protocol (HumanInputRequest/Result) to the runner.

## Phase 8: Architecture Rectification
* [x] 8.1 **Refactor:** Purge `AnthropicDriver`. Delete `AnthropicDriver.ts` and its tests, and update `src/index.ts` and integration tests to use `UnifiedModelDriver` exclusively.
* [x] 8.2 **Refactor:** Dynamic Plugin Naming. Update drivers (`UnifiedModelDriver`, `HostFunctionDriver`, `InMemoryModelDriver`) to accept an `id` in their constructor instead of hardcoding `name = 'Driver'`, allowing multiple drivers to coexist in the `PluginRegistry`.
* [x] 8.3 **Refactor:** Fix Kernel Bootstrap. Update `BootstrapSequence.ts` to drop the hardcoded check for the exact name `'Driver'` and instead verify that required drivers are present.
* [x] 8.4 **Refactor:** Fix Workflow Runner. Update `WorkflowRunner.ts` to fetch the driver using `agent.use_driver` instead of the hardcoded `'Driver'` slot.
* [x] 8.5 **Feature:** Wire Wildcard Rule. Update `Supervisor.evaluate()` to invoke `WildcardRule.evaluate()` for diversity scoring when applicable.
* [x] 8.6 **Feature:** Wire Evaluator Agents. Update `WorkflowRunner.ts` to invoke the agent defined in the `evaluator` field (if present) for binary PROCEED/REWORK decisions, logging findings to the `TraceLog`.
* [x] 8.7 **Refactor:** Zod Manifest Validation. Replace the hand-rolled YAML parser in `ManifestParser.ts` with strict schema validation using `zod` and `js-yaml`.
* [x] 8.8 **Docs:** Fix `IMemoryEngine` JSDoc (remove `@throws Unauthorized` since it returns `null`) and clean up `IVault` (remove or document the dead `injectCredential` method).

## Phase 9: Customer Feedback — Robustness & Integration Readiness
* [x] 9.1 **Fix:** `LocalJsonStatePlugin.shutdown()` — snapshot without clearing state, then clear only in-memory fields. Add test for append→shutdown→new instance→history preserved.
* [👁] 9.2 **Fix:** Retry limit semantics. Enforce `retryCount >= maxRetries` in Supervisor/WorkflowRunner **before** worker execution. `maxRetries` = extra attempts after first try. Add tests for `maxRetries: 0`, `1`, and `3`.
* [ ] 9.3 **Fix:** Replace evaluator substring parsing (`evalOutput.includes('REWORK')`) with structured output contract. Require `decision: PROCEED | REWORK | BLOCK` in evaluator response. Default to `REWORK` on malformed output. Log full evaluator output to Trace.
* [ ] 9.4 **Feature:** Extend `StepResult` with `outputRef` (MemoryURI), `traceRef`, `decision`, `retries`. Allow `SequenceStep` to declare input refs or dependency refs.
* [ ] 9.5 **Feature:** Add host-overridable hooks to WorkflowRunner: `buildMessages(step, agent, context)`, `afterStep(step, result)`, `evaluateOutput(step, output)`, `onDecision(decision, step)`. Runner provides sensible defaults for all four.
* [ ] 9.6 **Feature:** Add `TraceEnvelope` standard metadata wrapper (`traceId`, `sessionId`, `nodeId`, `type`, `timestamp`, `payload`) to all trace entries. Keep `payload` generic.
* [ ] 9.7 **Fix:** Trace corruption recovery. On corrupted trace file, rename to `trace.corrupt.<timestamp>.json`, start fresh trace, append recovery event.
* [ ] 9.8 **Feature:** Add structured output support to `UnifiedModelDriver.generate()`. When `schema` is present in `GenerateOptions`, use AI SDK structured generation. Return `GenerateResult` with both `content` and `object?`.
* [ ] 9.9 **Feature:** Strengthen driver identification. Add `kind`/`capabilities` to plugin base interface. Validate manifest `plugins.model_drivers[].id` against registered driver plugins. Fall back to existing heuristics for backward compatibility.
* [ ] 9.10 **Fix:** Normalize Memory URI keys to opaque safe IDs. Return `mem://v1/${safeKey}?sig=...` instead of exposing raw key in URI. Document URI path as opaque.
* [ ] 9.11 **Clarify:** BLOCK vs ESCALATE semantics in WorkflowRunner. ESCALATE (retry budget exhausted) routes through policy, not always throwing. BLOCK (missing input/context) requires intervention.
* [ ] 9.12 **Feature:** Make Human Attach resumable. Persist `HumanInputRequest` to State Manager (<4KB pointer-only, referable by `traceRef` to full Trace Log context). On startup, runner detects pending request and resumes waiting.
* [ ] 9.13 **Docs:** Update README to reflect Phase 7/8 reality — `UnifiedModelDriver` over `AnthropicDriver`, 5 vital plugins including Trace, `HostFunctionDriver` integration example, driver-by-ID registration.
* [ ] 9.14 **Docs:** Add Binary Supervisor example to docs — Evaluator writes `GateFinding[]` to Trace, returns binary decision, Supervisor consumes only decision, WorkflowRunner records `RouteDecision` to Trace.
