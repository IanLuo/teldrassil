# Design Document: Modular Agentic Micro-Kernel Framework 

## 1. Vision & Problem Statement
Current agentic frameworks are often monolithic, coupling the orchestration logic with specific model providers and tool implementations. This leads to "technical debt" where upgrading a model or switching a database requires a total system rewrite. 

This framework solves these issues by adopting a **Micro-Kernel Architecture** that decouples infrastructure (Plugins) from execution logic (Orchestrators) and task definitions (Project Manifests).

---

## 2. Core Architecture: The Micro-Kernel ("The Bus")
The kernel is a lightweight, protocol-agnostic "message bus." Its only responsibilities are **Lifecycle Management** (loading/unloading plugins) and **Event Routing** (passing messages between plugins).

### 2.1 The Plugin System: Vital vs Extension
Everything except the kernel is a plugin. Plugins fall into two categories:

**Vital (Bootstrap) Plugins** — Not removable. The kernel refuses to initialize if any vital slot is empty.

| Vital Plugin | Role | Analogy |
|---|---|---|
| **State Manager** | Orchestrator's ledger: tracks DAG position, node statuses, retry counts, and artifact URIs (pointers). Never stores payloads >4KB. | The "Heartbeat" |
| **Identity Vault** | Manages credentials — LLM API keys, tool tokens. Swappable from local env to HashiCorp Vault. | The "Passport" |
| **Memory Engine** | Worker's warehouse: stores raw content/binary/JSON artifacts (short-term context, mid-term outputs, long-term vectors). Returns a unique URI per artifact. | The "Brain" |
| **Model Driver** | Translates framework requests into specific LLM provider schemas (OpenAI, Anthropic, Gemini, Ollama). | The "Voice" |

**Extension (Optional) Plugins** — Can be added, removed, or swapped at will. Examples:

* **Protocol Plugins (MCP Bridge):** Implements the Model Context Protocol (MCP) for external tool integration.

### 2.2 Plugin Governance: The Immutable Core Protocol

**Definition:** Certain plugin interfaces are flagged as `system_critical`. These interfaces form the "Immutable Core" — the minimum guarantee the kernel requires to function.

**The Rule — Interface Lockdown:** Users may swap an implementation (e.g., `LocalVault` → `AzureVault`), but may never delete a vital slot. The interface contract is enforced, not the specific plugin binary.

```
# ALLOWED: Hot-swap one vault for another at runtime
kernel.swap("Identity_Vault", AzureVault)

# FORBIDDEN: Leave the system without any vault
kernel.detach("Identity_Vault")  # raises SystemExit
```

**Bootstrap Validation:** During the kernel's initialisation phase, it runs a provider check on all `system_critical` slots:

```
if not kernel.has_provider_for("Identity_Vault"):
    raise SystemExit("Vital plugin missing: Identity_Vault")
if not kernel.has_provider_for("State_Manager"):
    raise SystemExit("Vital plugin missing: State_Manager")
if not kernel.has_provider_for("Memory_Engine"):
    raise SystemExit("Vital plugin missing: Memory_Engine")
if not kernel.has_provider_for("Model_Driver"):
    raise SystemExit("Vital plugin missing: Model_Driver")
```

**Health Ping:** After bootstrap, before executing the first DAG node, the kernel pings every `system_critical` provider to confirm it is responsive. If any vital plugin fails its health check, the kernel aborts the run rather than proceeding in a degraded state.

**Protection Against Zombie Agents:** An agent launched without a functioning Vault would start executing, only to fail when it hits its first tool call (a "zombie"). By guaranteeing that all vital slots are filled and healthy at startup, the kernel eliminates runtime cascading failures from missing infrastructure.

**Design Philosophy:** The user can still innovate by writing a new Memory Plugin. The framework remains stable because it is guaranteed that *some form* of Memory is always available. This moves the system from a "collection of scripts" to a **Reliable OS for Agents**.

### 2.3 Data Boundary: Pointer-Payload Decoupling

To keep the orchestrator lean and the storage scalable, **State Manager** and **Memory Engine** are separated into distinct roles — the Pointer and the Payload.

| Responsibility | State Manager (Pointer) | Memory Engine (Payload) |
|---|---|---|
| **Stores** | Metadata, node statuses, `ref` URIs, error snippets (max 4KB). | Raw content: text, JSON, binaries, vectors. |
| **Provides** | Execution trace — "What just happened?" | Resource access — "Here is the actual data." |
| **Usage** | Frequently synced for orchestration decisions and UI updates. | Fetched on demand when an agent or supervisor needs the full content. |
| **Mutability** | Append-only chronological record (Node 1 → Node 2 → ...). | Artifacts can be evolved, refined, or replaced independently of DAG position. |

**Architecture Rule:** The State Manager is a **Log-Only** component. It must never store domain artifacts exceeding 4KB. The Memory Engine is a **Resource-Provider**; it must return a `unique_uri` for every artifact saved.

**Cross-Linkage:** Artifacts stored in the Memory Engine must be tagged with the `node_id` and `session_id` from the State Manager to preserve auditability (e.g., "Which agent created this file?").

#### Data Flow Walkthrough

| Action | State Manager Role | Memory Engine Role |
|---|---|---|
| Worker Finishes | Logs `Step: "Search"`, `Status: "Done"`. | Receives raw search results string. |
| Artifact Creation | Stores `{ "type": "artifact", "ref": "mem://search_results_v1" }`. | Persists the string and returns the URI. |
| Supervisor Check | Reads the status and reference URI. | Provides the full content when requested. |
| Human Attach | Loads last valid URI — tells the human *where* to look. | Pulls source code/files from workspace so the human sees the *payload*. |

---

## 3. Orchestration & Workflow Logic
The framework supports multiple "Strategy" plugins to dictate how agents interact.

### 3.1 Directed Acyclic Graph (DAG) Mode
Predictable, sequential workflows. Each node represents a specific agent task. 
* **The Supervisor Pattern:** Even in a DAG, a "Manager Agent" sits between nodes. It evaluates the output of a worker and decides whether to **Proceed** to the next node or **Rework** the current step with feedback.

### 3.2 Autonomous Swarm Mode
Goal-oriented execution. A "Planner" agent dynamically "hires" worker agents from the registry to accomplish a task without a predefined path.

### 3.3 Diversity & Exploration: The Wildcard Rule (Anti-Tunneling)

**Role:** Prevents "Preference Narrowing" in autonomous systems — the AI filter bubble where the system only suggests what it thinks the user already likes.

**Definition:** The **Wildcard Rule** is a diversity mandate enforced by the Orchestrator (Supervisor or Planner). Whenever a worker agent outputs a subjective list of N recommendations (e.g., "Suggest 3 research directions", "Suggest 5 UI themes"), the system must ensure at least one option sits outside the user's known preference profile.

**Mechanism:**
1. The **Supervisor** plugin intercepts any list-based output from a worker agent.
2. It computes a **Diversity Score** across the items against the user preference profile.
3. If `Diversity Score < Threshold`: the Supervisor triggers a **Rework** loop with the instruction: *"Add one divergent/non-standard option to this list."*

**Example:** If the user profile indicates a preference for "Minimalist Design," the Wildcard Rule forces the agent to include one "Brutalist" or "Expressive" option — ensuring the human is exposed to alternatives they wouldn't have seen otherwise.

**Testability:** An implementer can write a unit test verifying that the Supervisor rejects lists with no diversity and that the rework loop successfully injects a wildcard option.

---

## 4. Unified Execution Protocol
To ensure future-proof stability, the framework unifies AI and Human interaction into a single protocol.

### 4.1 Headless vs. Human-Attach
* **Headless:** The system triggers an autonomous engine (e.g., **Claude Code**) to perform technical work (coding, terminal operations) via CLI.
* **Human-Attach:** The system pauses the DAG, preserves the current terminal/session state, and notifies a human to take over. 
* **The Bridge:** Both actors work in a **Shared Workspace** (Git/Filesystem). When the human finishes (via a `/done` signal), the framework resumes the DAG and runs an automated **Evaluator** to verify the work.

### 4.2 Proactive Memory
Agents (like Claude Code) do not receive the entire project context in a prompt. Instead:
1.  The framework provides **Memory Retrieval Tools**.
2.  The agent proactively queries for what it needs (e.g., `get_artifact("api_spec")`).
3.  The agent updates the global state mid-task via `update_state()`.

---

## 5. Security & Credential Management
Credentials are never stored in the LLM's context window or the project manifest.

### 5.1 Just-in-Time (JIT) Injection
The **Vault Service** intercepts tool calls at the transport layer.
1.  **Agent** requests a tool (e.g., `Slack_Post`).
2.  **Orchestrator** identifies the `Auth_Type` (OAuth/Key).
3.  **Vault** injects the token into the request header.
4.  **Result** is returned to the Agent; the token is purged.

### 5.2 Human-in-the-Loop Re-authentication
If a tool requires a login or MFA, the framework triggers an escalation event. The human logs in via a secure OOB (Out-of-Band) window, and the Vault captures the session for the agent to continue.

---

## 6. Project Manifest & Consumer Interface
Users interact with the framework through a **Manifest File**. This file is a stable contract; the underlying plugins can be upgraded without changing this file.

### 6.1 Provider-Instance Pattern (Driver-to-Model Mapping)

The manifest follows a **separation of concerns** between capabilities and assignments:

- **Plugins section (Capabilities):** Defines *how* the system communicates — the drivers, schemas, and protocols the kernel is "fluent" in.
- **Agents section (Assignments):** Defines *who* does the work — a specific model name that maps back to an active driver via `use_driver`.

This avoids the conflict where an agent tries to use a model whose driver was never loaded.

```yaml
project_id: "research_and_code_v1"
workflow: "DAG"

plugins:
  # Vital plugins (system_critical — removal causes SystemExit)
  state_manager: "postgres_dag_store_v1"
  vault: "mcp_vault_provider"
  memory: "vector_storage_v2"
  # Model Drivers: register the communication schemas the system is fluent in
  model_drivers:
    - id: "anthropic_adapter"
      type: "drivers.models.anthropic"
    - id: "openai_adapter"
      type: "drivers.models.openai"
  # Extension plugins (optional — swappable/removable at will)
  mcp_bridge: "mcp_server_aggregator"

agents:
  - id: "senior_coder"
    use_driver: "anthropic_adapter"   # Must exist in plugins.model_drivers
    model: "claude-3-5-sonnet"        # Specific model routed through that driver
    status: "auto"                    # Can be toggled to 'manual' for human-attach
    tools: ["mcp://github/repo_manager", "local_bash"]
  - id: "researcher"
    use_driver: "openai_adapter"
    model: "gpt-4o"
    status: "auto"

sequence:
  - step: "code_fix"
    agent: "senior_coder"
    evaluator: "manager_gpt4o"
    on_failure: "rework"
    max_retries: 2
```

### 6.2 Kernel Compatibility Check (Startup Validation)

To prevent "Missing Driver" errors at runtime, the kernel resolves driver-to-model mappings at startup:

1. **Scan:** The kernel iterates over every agent in the manifest.
2. **Match:** For each agent, it checks that `use_driver` references an `id` registered in `plugins.model_drivers`. If no match is found, the kernel raises `SystemExit("Missing driver for agent: {agent_id}")` before execution begins.
3. **Route:** At runtime, when an agent needs to speak, the kernel routes the request payload to the driver plugin identified by `use_driver`.
4. **Transform:** The driver plugin reads the `model` field (e.g., `"claude-3-5-sonnet"`) and formats the final API call to the provider's specific endpoint.

### 6.3 Benefits of this Pattern

- **Seamless Upgrades:** If a provider releases a v2 API, only the `plugins.model_drivers` entry changes. Agent definitions stay untouched.
- **Multi-Model Harmony:** One agent can use Anthropic, another OpenAI, another a local Llama — all simultaneously, as long as the corresponding driver plugins are loaded.
- **Lean Core:** If a project only uses Anthropic, the `openai_adapter` is simply omitted from the plugins list, keeping the runtime footprint minimal.

---

## 7. Key Problems Resolved
1.  **Preference Narrowing:** Resolved by the **Wildcard Rule (Section 3.3)**, which mandates the Orchestrator inject diverse, non-profile-matching options into subjective tasks to prevent AI "echo chambers."
2. **Context Bloat:** Resolved by **Proactive Memory (Section 4.2)**, which keeps prompts lean and costs low by requiring agents to query for context rather than receiving it upfront.
3. **Fragility:** Resolved by the **Supervisor/Evaluator pattern (Section 3.1)**, which ensures high-quality handoffs and self-correction within workflows.
4. **Future-Lock:** Resolved by the **Micro-Kernel/Plugin design (Section 2)**, which allows for the seamless addition of 2027-era protocols (like new MCP versions) by simply dropping in a new driver.
