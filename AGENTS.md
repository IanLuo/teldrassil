# OpenCode Agent Instructions: Teldrassil

## Project Goal
Teldrassil is a Modular Agentic Micro-Kernel Framework. Its core philosophy is separating the infrastructure ("Immutable Core" plugins like State, Memory, Vault, Drivers) from execution logic (Orchestrators) and task definitions (Manifests). 

**Grand Goal:** Build a "Reliable OS for Agents" that prevents future-lock by acting as a lightweight, protocol-agnostic message bus.

## Core Workflow & Constraints

*   **TDD First:** You MUST follow Test-Driven Development. Write tests for a component's expected behavior *before* implementing the logic. Refer to `docs/test-strategy.yaml` for overarching verification matrices.
*   **Architectural Adherence:** Every implementation decision MUST respect the boundaries defined in `docs/design.md` and `docs/detailed-components.md`. Do not introduce scope creep to the Micro-Kernel (it is just a message bus).
*   **Keep Memory:** Maintain a log or active summary of important progress, gotchas, and current focus within your active session to ensure the grand goal remains the target.
*   **Tech Stack:** The target stack is **TypeScript / Node.js + React (Next.js)** for a hybrid CLI/Cloud deployment. Plugins are loaded dynamically in-memory.

## Architecture Highlights

*   **Pointer-Payload Boundary:** The `State Manager` only stores metadata and URIs (`ref`) ≤ 4KB. It NEVER stores payload data. The `Memory Engine` stores raw data and returns HMAC-signed URIs.
*   **Provider-Instance Pattern:** `system_config.yaml` or internal plugin registries define the "How" (e.g., `model_drivers`). The Agent definitions specify the "Who" by referencing the driver ID (`use_driver`) and specific model.
*   **The Wildcard Rule:** The Orchestrator (Supervisor) enforces diversity. If an agent outputs a subjective list, the Supervisor checks the diversity score. If it falls below the threshold, it forces a rework.
*   **Vault Interception & Security:** Credential injection is Just-In-Time (JIT). Tokens are never passed in the LLM context. Memory is secured via session-scoped Envelope Encryption (BYOK via `.env` Master Key), fast AES-256-GCM streaming, and signed URIs.

## Current State & Next Steps
*   *Current State:* Greenfield documentation phase. No code has been scaffolded yet. All design docs are finalized.
*   *Next Steps:* Initialize the TypeScript monorepo/project structure, setup testing frameworks (e.g., Jest/Vitest), and begin TDD on the Micro-Kernel event bus and plugin registry.
