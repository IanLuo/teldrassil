# Design Document: Modular Agentic Micro-Kernel Framework 

## 1. Vision & Problem Statement
Current agentic frameworks are often monolithic, coupling the orchestration logic with specific model providers and tool implementations. This leads to "technical debt" where upgrading a model or switching a database requires a total system rewrite. 

This framework solves these issues by adopting a **Micro-Kernel Architecture** that decouples infrastructure (Plugins) from execution logic (Orchestrators) and task definitions (Project Manifests).

> For detailed component-level specifications (interfaces, data structures, pipelines), see [Detailed Component Design](detailed-components.md).

---

## 2. Core Architecture: The Micro-Kernel ("The Bus")
The kernel is a lightweight, protocol-agnostic "message bus." Its only responsibilities are **Lifecycle Management** (loading/unloading plugins) and **Event Routing** (passing messages between plugins).

### 2.1 The Plugin System: Vital vs Extension
Everything except the kernel is a plugin. Plugins fall into two categories:

**Vital (Bootstrap) Plugins** — Not removable. The kernel refuses to initialize if any vital slot is empty.

| Vital Plugin | Role | Analogy |
|---|---|---|
| **State Manager** | Orchestrator's ledger: tracks DAG position, node statuses, retry counts, and artifact URIs. Never stores payloads >4KB. | The "Heartbeat" |
| **Identity Vault** | Manages credentials — LLM API keys, tool tokens. Swappable from local env to HashiCorp Vault. | The "Passport" |
| **Memory Engine** | Worker's warehouse: stores raw content/binary/JSON artifacts. Returns a unique URI per artifact. | The "Brain" |
| **Trace Log** | Observability ledger: ephemeral routing metadata, gate findings, raw LLM I/O. | The "Flight Recorder" |
| **Model Driver** | Translates framework requests into specific LLM provider schemas (Unified) or local host functions. | The "Voice / Hands" |

**Extension (Optional) Plugins** — Can be added, removed, or swapped at will. Examples:

* **Protocol Plugins (MCP Bridge):** Implements the Model Context Protocol (MCP) for external tool integration.

### 2.2 Plugin Governance: The Immutable Core Protocol

**Definition:** Certain plugin interfaces are flagged as `system_critical`. These interfaces form the "Immutable Core" — the minimum guarantee the kernel requires to function.

**The Rule — Interface Lockdown:** Users may swap an implementation (e.g., `LocalVault` → `AzureVault`), but may never delete a vital slot. The interface contract is enforced, not the specific plugin binary.

### 2.3 Data Boundary: The Tripartite Model (Pointer, Payload, and Trace)

To keep the orchestrator lean, the storage scalable, and the observability high, the framework splits data across three structural boundaries:

| Boundary | Plugin | Scope & Rules |
|---|---|---|
| **The Pointer** | **State Manager** | **Fast & Light.** Strict <4KB payload limit. Stores execution control flow, state machine status, and pointer references (`traceId`, `memoryIds`). |
| **The Payload (Vault)** | **Memory Engine** | **High Value.** Semantic domain artifacts (generated code, finalized plans) explicitly committed by agents. Long-term searchability. |
| **The Trace (Ledger)** | **Trace Log** | **Ephemeral & Heavy.** Append-only store for massive routing feedback (`RouteDecision`), `GateFinding[]` arrays, and raw LLM input/output. Prevents Memory pollution. |

**Cross-Linkage:** Artifacts and traces must be tagged with the `node_id` and `session_id` from the State Manager to preserve auditability.

### 2.4 Memory Security: High-Performance Isolation

*   **Envelope Encryption (BYOK):** The Memory Engine uses a session DEK from the Vault for fast AES-256-GCM encryption. Destroying the DEK crypto-shreds the project memory.
*   **Zero-Lookup Auth (Signed URIs):** Memory Engine issues HMAC-signed URIs (e.g., `mem://v1/data?sig=...`). Agents can only access data if handed a valid pointer.
*   **Physical Isolation:** The Memory Engine enforces strict path prefixing (`/.teldrassil/memory/<session_id>/`) to prevent lateral traversal.

---

## 3. Orchestration & Workflow Logic
The framework supports multiple "Strategy" plugins to dictate how agents interact.

### 3.1 Supervised Workflow Mode
Predictable, sequential workflows with quality-gated rework loops. 
* **Workflow Runner:** The execution engine that loops through the manifest sequence, invokes drivers per agent, and handles retries.
 * **The Supervisor Pattern:** Sits between nodes. Evaluates worker output and returns a binary Quality Gate decision: **PROCEED** or **REWORK**. (Rich severity findings are logged to the Trace Log by the Evaluator).
 * **Host Hooks:** The WorkflowRunner exposes optional hooks (`buildMessages`, `afterStep`, `evaluateOutput`, `onDecision`) that the host app may override for step-level customization without forking the runner.

### 3.2 Autonomous Swarm Mode
Goal-oriented execution. A "Planner" agent dynamically "hires" worker agents from the registry to accomplish a task without a predefined path.

### 3.3 Diversity & Exploration: The Wildcard Rule (Anti-Tunneling)
Prevents "Preference Narrowing". If a worker outputs a subjective list, the Supervisor triggers a rework if the Diversity Score < Threshold.

---

## 4. Unified Execution Protocol
To ensure future-proof stability, the framework unifies AI and Human interaction into a single protocol.

### 4.1 Headless vs. Human-Attach
* **Headless:** The system triggers an autonomous engine to perform work.
 * **Human-Attach:** The system pauses the DAG, persists a `HumanInputRequest` to the State Manager (<4KB, with a `traceRef` to full-context Trace Log entry), and notifies a human. On kernel restart, the runner detects a pending request and resumes waiting — human-attach survives process crashes.
* **The Bridge:** Both actors work in a Shared Workspace. When the human finishes, the DAG resumes.

### 4.2 Proactive Memory
Agents do not receive the entire project context in a prompt. They proactively query via Memory Retrieval Tools.

---

## 5. Security & Credential Management
Credentials are never stored in the LLM's context window or the project manifest.

### 5.1 Just-in-Time (JIT) Injection
The **Vault Service** intercepts tool calls at the transport layer, injecting the correct API key/OAuth token before the request hits the wire.

---

## 6. Project Manifest & Consumer Interface

### 6.1 Provider-Instance Pattern (Mixing LLMs and Local Code)

The manifest follows a **separation of concerns** between capabilities and assignments. Teldrassil treats generic LLMs and local deterministic functions exactly the same at the Orchestration layer.

```yaml
project_id: "research_and_code_v1"
workflow: "supervised"

plugins:
  state_manager: "local_state_v1"
  vault: "env_vault_provider"
  memory: "local_memory_v1"
  trace: "local_trace_v1"
  model_drivers:
    - id: "unified_llm"
      type: "drivers.models.unified"   # Uses @ai-sdk/core to wrap Anthropic, OpenAI, etc.
    - id: "host_executor"
      type: "drivers.models.host_function" # Deterministic local code execution

agents:
  - id: "senior_coder"
    use_driver: "unified_llm"
    model: "anthropic:claude-3-5-sonnet"
    status: "auto"
    tools: ["mcp://github/repo_manager", "local_bash"]
  - id: "planner_normalizer"
    use_driver: "host_executor"          # Runs host function instead of LLM
    action_id: "requirementNormalizer"

sequence:
  - step: "draft_plan"
    agent: "senior_coder"
    evaluator: "manager_gpt4o"
    on_failure: "rework"
  - step: "normalize_requirements"
    agent: "planner_normalizer"          # Guarantees deterministic execution
```

### 6.2 Kernel Compatibility Check (Startup Validation)
At startup, the kernel maps all agents to their `use_driver` in the plugins registry. Missing drivers trigger a `SystemExit`.

### 6.3 Benefits of this Pattern
- **Seamless Upgrades:** Use `unified_llm` to effortlessly switch LLM providers via `@ai-sdk/core` without rewriting adapters.
- **Deterministic Guarantees:** Route to `host_executor` when a step requires 100% reliable, zero-cost programmatic evaluation.
- **Lean Core:** The Orchestrator remains a dumb message bus; all complexity resides in the Driver and Evaluator plugins.