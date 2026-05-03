# Teldrassil Action Plan

This document contains the detailed breakdown of all tasks required to build Teldrassil. Each phase is broken down into specific, actionable, and testable steps.

> **Important Workflow Rule:** We operate under strict TDD and adhere to the `dev-workflow` skill. Before executing any step here, ensure you have read the design docs and understand the current state.
> 
> **Current State:** Phases 1-5 mostly complete. Phase 1.4 reopened (monorepo scaffold), Phase 2 extended (integration + CLI). Phase 6 not started.

## Phase 1: Environment & Tooling
* [x] 1.1 Create `dev-workflow` skill folder and `SKILL.md` outlining the 5-step strict process (status check, design check, TDD loop, review loop, memory update).
* [x] 1.2 Create `personas` skill folder and `SKILL.md` defining Developer, Tester, Document Maintainer, and Reviewer mindsets.
* [x] 1.3 Initialize `flake.nix` with Node.js 20, pnpm, and typescript language servers. Configure `direnv`.
* [ ] 1.4 Scaffold `pnpm` workspace (monorepo: root `package.json`, `packages/core`, `packages/ui`).
* [x] 1.5 Setup testing framework (Vitest) and TypeScript configuration.

## Phase 2: The Micro-Kernel (Core Bus)
* [x] 2.1 **TDD:** Write tests for `PluginRegistry`. It must map strings to class instances and throw on duplicate registrations.
* [x] 2.2 **Build:** Implement `PluginRegistry`.
* [x] 2.3 **TDD:** Write tests for `EventDispatcher`. It must support pub/sub and wildcard event listening.
* [x] 2.4 **Build:** Implement `EventDispatcher` (as `EventBus`).
* [x] 2.5 **TDD:** Write tests for `BootstrapSequence`. It must validate that exactly four vital interfaces (`State`, `Memory`, `Vault`, `Driver`) are present, ping them, and throw `SystemExit` if missing.
* [x] 2.6 **Build:** Implement the `MicroKernel` class tying Registry, Dispatcher, and Bootstrap together.
* [ ] 2.7 **Integration:** Write end-to-end test bootstrapping MicroKernel with all four vital plugins (`EnvVaultPlugin`, `LocalMemoryPlugin`, `LocalStatePlugin`, `AnthropicDriver`) and verifying full lifecycle (bootstrap → ping → shutdown).
* [ ] 2.8 **Build:** Implement CLI entry point (`src/index.ts`) that loads kernel, registers vital plugins, runs bootstrap, and reports status.

## Phase 3: Vital Interfaces & Contracts
* [x] 3.1 **Build:** Define TypeScript `interface` for `IStateManager` (must accept <=4KB payloads and URIs).
* [x] 3.2 **Build:** Define TypeScript `interface` for `IMemoryEngine` (must return `MemoryURI` and enforce signature validation).
* [x] 3.3 **Build:** Define TypeScript `interface` for `IVault` (must support DEK generation and Secret retrieval).
* [x] 3.4 **Build:** Define TypeScript `interface` for `IModelDriver` (must handle schema translation).
* [x] 3.5 **TDD/Build:** Create simple `InMemoryMock` classes for all four vital plugins to pass the kernel bootstrap tests.

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
* [ ] 6.1 Scaffold Next.js frontend in `packages/ui`.
* [ ] 6.2 Implement Zustand/Jotai store to mirror the `State Manager`'s DAG position.
* [ ] 6.3 Build the visualization component (e.g., React Flow) to render the active DAG.
* [ ] 6.4 Build the "Human-Attach" override modal triggered by a `HUMAN_REQUIRED` kernel event.
