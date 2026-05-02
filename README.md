# Teldrassil: Modular Agentic Micro-Kernel Framework

Current agentic frameworks are often monolithic, coupling the orchestration logic with specific model providers and tool implementations. Teldrassil solves this "technical debt" by adopting a **Micro-Kernel Architecture** that decouples infrastructure (Plugins) from execution logic (Orchestrators) and task definitions (Project Manifests).

For a complete breakdown of the architecture, data boundaries, and protocols, please read the [Full Design Document](docs/design.md) and [Detailed Component Design](docs/detailed-components.md).

## Tech Stack

Teldrassil is built for hybrid deployment (Local CLI + Cloud Native). The core architecture leverages dynamic in-memory plugin loading to maximize performance.

- **Core & Orchestration:** TypeScript / Node.js
- **Managing UI:** React (Next.js) with Zustand/Jotai
- **Schema Validation:** Zod
- **Memory Security:** AES-256-GCM (Envelope Encryption) + HMAC Signed URIs

## System Architecture

The framework is divided into distinct layers that decouple infrastructure from execution:

### 1. User Definition
* **Project Manifest (YAML):** The stable contract where users define workflows, select plugins, and assign specific AI models to Worker Agents via the `use_driver` mapping.

### 2. The Immutable Core
The **Micro-Kernel** acts as the central event bus and lifecycle manager. It routes messages between four strictly required "Vital Plugins":
* **State Manager (The Ledger):** Tracks the execution pointer, node status, and stores small metadata/URIs (≤4KB).
* **Memory Engine (The Warehouse):** Stores large payloads and vector data, returning HMAC-signed URIs to ensure secure, zero-lookup access.
* **Identity Vault (The Passport):** Manages session keys (Envelope Encryption) and securely handles Just-In-Time (JIT) token injection.
* **Model Drivers (The Voice):** Translates generic framework requests into specific LLM provider schemas (e.g., Anthropic, OpenAI).

### 3. Extension Plugins
Optional plugins that dynamically extend the framework's capabilities.
* **MCP Bridge:** Implements the Model Context Protocol to seamlessly integrate external tools.

### 4. Orchestration & Strategies
Defines *how* the agents work together to solve a task.
* **DAG / Swarm Strategies:** Manage sequential pipelines (Supervisor pattern) or autonomous goal-oriented execution (Planner pattern).
* **The Wildcard Rule:** An orchestration intercept that evaluates lists of subjective recommendations and forces an Agent rework if the output lacks diversity (preventing AI echo chambers).

### 5. Execution Layer
* **Worker Agent:** The actual intelligence instance executing headless work, making proactive context queries to the Memory Engine, and triggering tool requests.
* **Human-Attach Mode:** Allows a human to safely override, authenticate (via OOB login), or complete tasks manually.
* **Shared Workspace:** The local Git repository or filesystem where both Headless Agents and Humans collaborate.

### Key Data Flows
* **Provider-Instance Pattern:** The Manifest maps capabilities to specific Drivers. The Drivers translate the Agent's logic into external API calls.
* **Pointer-Payload Boundary:** A Worker Agent writes raw data directly to the *Memory Engine*. It receives a `unique_uri` back, which it logs as a trace step in the *State Manager*.
* **JIT Security:** When a Worker Agent requests a tool via the *MCP Bridge*, the *Identity Vault* intercepts the request and securely injects the required token at the transport layer.
