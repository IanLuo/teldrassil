# OpenCode Agent Instructions: Teldrassil

Teldrassil is a Modular Agentic Micro-Kernel Framework — a "Reliable OS for Agents" that prevents future-lock by acting as a lightweight, protocol-agnostic message bus.

## Core Rule
Load the `dev-workflow` skill for development tasks (code, bug fixes, config). Dev tasks are tracked in `docs/tasks/plan.md`. Other skills load automatically based on their descriptions.

For harness/doc changes (skills, agents, commands, AGENTS.md, design docs): propose changes to the user first. Only commit after explicit approval. No [⏳]/[x] tracking needed.

## Architecture Boundaries
- **Kernel** = message bus only. No domain logic.
- **State Manager** = pointers only (≤4KB). No payload data.
- **Memory Engine** = payload storage. HMAC-signed URIs.
- **Vault** = JIT credential injection. No tokens in LLM context.
- **Wildcard Rule** = Supervisor enforces diversity on subjective lists.

## Tech Stack
TypeScript / Node.js + React (Next.js). Plugins loaded dynamically in-memory.
