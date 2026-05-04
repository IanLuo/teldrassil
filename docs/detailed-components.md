# Detailed Component Design

> This document elaborates the component-level design for each plugin, orchestrator, and protocol defined in the [Basic Design Document](design.md). All components must remain consistent with the rules and boundaries established there.

---

## 1. The Micro-Kernel (The System Bus)

The Kernel acts as the central nervous system, managing the registration, communication, and lifecycle of all plugins. It is strictly "dumb" regarding task logic, focusing entirely on message routing.

### 1.1 Plugin Registry & 1.2 Event Dispatcher
Registry maps `Interface_Type` to `Active_Provider`. Dispatcher handles pub/sub events.

### 1.3 Bootstrap Sequence
1. Load `system_config.yaml`.
2. Validate presence of **Vital Plugins** (State Manager, Memory Engine, Trace Log, Identity Vault, Model Driver).
3. Initialize plugins in dependency order (Vault must precede Model Drivers).
4. Run **Health Ping**. Abort if vital plugins are unresponsive.

---

## 2. State Manager (The Ledger)

The State Manager tracks the process flow but never stores heavy domain data.

### 2.1 The State Object
| Field | Description |
|---|---|
| `session_id` | Unique GUID for the project run. |
| `current_node` | The ID of the active step in the DAG. |
| `history` | Stack of `(node_id, status, worker_id, trace_ref)` entries. |

### 2.2 Pointer Storage
Stores only `< 4KB` pointers (e.g., `trace_ref: "trace-987"` or `memory_ref: "mem://v1/123"`). Never stores raw payloads.

### 2.3 State Persistence
Must support local filesystem persistence mapped to `/.teldrassil/state/<session_id>.json`. Snapshots state to disk after every event for SIGINT recovery and session continuity.

---

## 3. Memory Engine (The Vault)

Handles physical persistence and retrieval of valuable semantic domain Artifacts.

### 3.1 Persistence & Isolation
Must persist files locally to `/.teldrassil/memory/<session_id>/`. Enforces directory traversal protection and isolates memory per session.

### 3.2 Provider Interface
- `put(key, payload) → MemoryURI` — Encrypts via AES-256-GCM and returns HMAC-signed URI.
- `get(signed_uri) → payload` — Validates HMAC, decrypts, returns payload.

---

## 4. Trace Log (Observability)

The ephemeral ledger designed to absorb heavy, high-volume data (preventing Memory Engine pollution).

### 4.1 Scope
Stores `RouteDecision` metadata, `GateFinding[]` arrays, and raw LLM input/output. Append-only store.

### 4.2 Provider Interface
- `appendTrace(payload: any) → TraceURI` — Writes heavy JSON payload.
- `getTrace(uri: TraceURI) → any` — Retrieves trace for UI/debugging.

---

## 5. Identity Vault (The Passport Office)

Manages sensitive credentials. Initialized via `.env` or KMS. Generates session DEK for Memory Engine. Intercepts and JIT-injects tokens into API headers via transport middleware.

---

## 6. Model Driver (The Hands & Voice)

Bridges the framework's execution requests to specific LLMs or local code execution.

### 6.1 Interface (`IModelDriver`)
Must implement `translate(messages)` and `generate(messages, tools, schema)`.

### 6.2 Implementations
* **`UnifiedModelDriver`:** Wraps `@ai-sdk/core` (Vercel AI SDK) to natively handle Anthropic, OpenAI, and Gemini with standardized structured output and tool-calling.
* **`HostFunctionDriver`:** Receives the standard `messages`/`schema` payload, but instead of making a network call, executes a registered local callback deterministically for zero LLM cost.

---

## 7. Orchestrator: Supervisor & WorkflowRunner

The Orchestrator defines execution flow, loops through the manifest sequence, and enforces quality routing.

### 7.1 Workflow Runner
The execution loop that iterates over the defined `sequence`. It resolves the Agent, invokes the required Driver (`generate()`), and routes the output through the Supervisor.

### 7.2 Supervisor Routing (5-Enum)
Evaluates output and returns a `SupervisorDecision`:
* `PROCEED`: Quality passed.
* `REWORK`: Quality failed (feedback sent back to worker).
* `ESCALATE`: Retry limit reached.
* `BLOCK`: Stuck, requires Human-Attach.
* `COMPLETE`: Workflow execution finished.

### 7.3 Binary Gate Delegation
The framework explicitly **rejects** building a heavy, severity-based Quality Gate Framework. The Supervisor is strictly binary (`PROCEED` / `REWORK`). Any complex severity checks or rich array validations (`GateFinding[]`) are delegated to the user-provided Evaluator agent, which logs its rich findings to the **Trace Log** and distills the decision back to binary for the Supervisor.

---

## 8. MCP Bridge (The Extender)

Turns external capabilities into framework-native tools. Acts as MCP Host, mapping Memory URIs to MCP resources and requesting JIT credentials from the Vault for authenticated servers.

---

## 9. Unified Interaction Protocol

### 9.1 Human Attach Protocol
Emits `HUMAN_REQUIRED` event. Workflow Runner pauses. UI presents a `HumanInputRequest` (prompt, contextRefs, choices). When human submits `HumanInputResult`, Workflow Runner resumes at the specified node.