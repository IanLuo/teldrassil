# Detailed Component Design

> This document elaborates the component-level design for each plugin, orchestrator, and protocol defined in the [Basic Design Document](design.md). All components must remain consistent with the rules and boundaries established there.

---

## 1. The Micro-Kernel (The System Bus)

The Kernel acts as the central nervous system, managing the registration, communication, and lifecycle of all plugins. It is strictly "dumb" regarding task logic, focusing entirely on message routing.

### 1.1 Plugin Registry

A lookup table mapping `Interface_Type` (e.g., `Vault`) to `Active_Provider` (e.g., `MCP_Vault_Plugin`).

### 1.2 Event Dispatcher

A Pub/Sub mechanism. When an Agent emits an event (e.g., `EXECUTION_PAUSED`), the Dispatcher notifies the **State Manager** to save and the **UI/Notification Plugin** to alert the human.

### 1.3 Bootstrap Sequence

1. Load `system_config.yaml`.
2. Validate presence of **Vital Plugins** (State Manager, Memory Engine, Identity Vault, Model Driver).
3. Initialize plugins in dependency order (Vault must precede Model Drivers).
4. Run a **Health Ping** on every `system_critical` provider to confirm liveness. Abort if any vital plugin is unresponsive.
5. On success, proceed to DAG execution.

---

## 2. State Manager (The Ledger)

The State Manager is the "Immutable Flight Recorder." It tracks the process flow but never stores heavy domain data.

### 2.1 The State Object

| Field | Description |
|---|---|
| `session_id` | Unique GUID for the project run. |
| `current_node` | The ID of the active step in the DAG. |
| `history` | A stack of `(node_id, status, worker_id, artifact_ref)` entries. |

### 2.2 Pointer Storage

When a node finishes, the State Manager stores the **URI** (e.g., `mem://v1/research_report.pdf`) provided by the Memory Engine. It never stores the raw artifact payload.

### 2.3 State Persistence

Snapshots the state to disk after every event to allow for `SIGINT` recovery or "Human-Attach" resumption.

---

## 3. Memory Engine (The Warehouse)

The Memory Engine handles the physical persistence and retrieval of "Artifacts."

### 3.1 Tiered Storage Logic

| Tier | Scope | Lifecycle |
|---|---|---|
| **Short-term** | Volatile context for the current LLM call (System Prompts). | Ephemeral; discarded after call. |
| **Mid-term (The Workspace)** | File-based or database-stored artifacts (JSON, PDF, Code). | Persisted per session. |
| **Long-term** | Vector embeddings of past project outcomes for "Experience Retrieval." | Retained across sessions. |

### 3.2 Provider Interface

Every Memory Engine implementation must implement:

- `put(key, payload) → MemoryURI` — Persists data and returns a unique, HMAC-signed URI.
- `get(signed_uri) → payload` — Validates the HMAC signature and retrieves data. Throws `Unauthorized` if the signature is missing/invalid.

### 3.3 Security Implementation

1. **Initialization:** On startup, the Memory Engine requests the session DEK (Data Encryption Key) from the Vault.
2. **Encryption:** When `put()` is called, the payload is stream-encrypted via AES-256-GCM using the DEK before writing to disk/S3.
3. **URI Signing:** The `MemoryURI` returned by `put()` must have an appended signature: `?sig=hash(key + DEK)`.
4. **Sandboxing:** All disk operations must be jailed to `/.teldrassil/memory/<session_id>/`.

### 3.4 Workspace Sync

For "Human-Attach" mode, the Memory Engine ensures the local filesystem (e.g., the git repo) matches the current Mid-term state, so the human sees a coherent workspace.

---

## 4. Identity Vault (The Passport Office)

The Vault manages sensitive credentials without exposing them to the "Worker" agents. It is initialized by reading a Master Key from the `.env` file or connecting to a Cloud KMS.

### 4.1 Key & Credential Scoping

- **Session Keys:** Generates and holds the symmetric Data Encryption Key (DEK) for the Memory Engine.
- **Tool Secrets:** Maps `Tool_ID` or `Domain` to a specific secret.

### 4.2 Key Management & Recovery (Anti-Data Loss)

To prevent catastrophic memory loss if a local `.env` file is deleted or a key is rotated, the Vault implements the following safeguards:

1. **Key Derivation:** If using a local `.env` string, the Vault uses PBKDF2 or Argon2 to derive a cryptographically strong Master Key, rather than using the string directly.
2. **Key Escrow (Double Encryption):** When a session DEK is generated, the Vault encrypts it twice: once with the primary runtime Master Key, and once with an optional offline Recovery Key. If the primary key is lost, the DEK can be recovered and re-encrypted.
3. **KMS Delegation:** In cloud deployments, the Vault delegates DEK encryption to a KMS (AWS, GCP, HashiCorp). The Master Key never touches the Node.js memory space.

### 4.2 Injection Pipeline

1. Agent calls a tool.
2. The **Orchestrator** intercepts the call, identifies the `Auth_Type` (OAuth/Key), and requests the associated secret from the Vault.
3. Vault provides a short-lived token or key.
4. **Transport Middleware** attaches the key to the header of the API/CLI call.
5. Result is returned to the Agent; the token is purged from context.

### 4.3 MFA Escalation

If a tool returns a `401 Unauthorized` with an MFA challenge, the Vault triggers a `REAUTH_REQUIRED` event to the Kernel. The Kernel routes this to Human-Attach mode for OOB login.

---

## 5. Model Driver (The Translator)

The Driver bridges the gap between the framework's generic "Think" request and a specific LLM's API.

### 5.1 Schema Translation

Converts a unified message list into vendor-specific formats (e.g., Anthropic's `tools` vs. OpenAI's `functions`).

### 5.2 Driver Configuration

Loaded via `system_config.yaml`. Example:
- `anthropic_v1`: Handles token counting, retries, and formatting for Claude models.
- `openai_v1`: Handles the OpenAI chat completions schema.

### 5.3 Agent Mapping

As defined by the Provider-Instance Pattern, the Agent manifest specifies:
- `use_driver: "anthropic_v1"` — references a registered driver ID.
- `model: "claude-3-5-sonnet"` — specific model routed through that driver.

---

## 6. Orchestrator: Supervisor (The Conductor)

The Supervisor is a Logic Plugin that manages "Flow" and enforces the **Wildcard Rule**.

### 6.1 The Evaluation Loop

1. **Intercept:** Captures worker output.
2. **Validate:** Compares output against `criteria` defined in the manifest. This is a **binary quality gate** — pass or fail.
3. **Wildcard Check:** If the task is a subjective list (e.g., "Suggest N options"), the Supervisor calculates a **Diversity Score**. If `Diversity Score < Threshold`, it forces a **Rework** — independent of whether the quality gate passed.

### 6.2 Decision Matrix

Two independent gates, evaluated sequentially:

**Quality Gate** (driven by manifest `criteria`):
| Condition | Action |
|---|---|
| Output passes criteria | Proceed to Diversity Check. |
| Output fails criteria | Signal Worker for `rework` with feedback. |

**Diversity Gate** (driven by Wildcard Rule, Section 3.3 of basic design):
| Condition | Action |
|---|---|
| Task is not a subjective list | Skip; proceed to next node. |
| Diversity Score ≥ Threshold | Signal State Manager to move to `next_node`. |
| Diversity Score < Threshold | Signal Worker for `rework` with wildcard instruction. |

**Escalation Gate** (shared):
| Condition | Action |
|---|---|
| `Retry_Count > Limit` (for either gate) | Signal Kernel for `HUMAN_ATTACH`. |

---

## 7. MCP Bridge (The Extender)

The MCP Bridge turns external capabilities into framework-native tools.

### 7.1 Host Implementation

The Bridge acts as the **MCP Host**, managing connections to one or more MCP Servers.

### 7.2 Resource Mapping

Maps internal **Memory Engine** URIs to MCP Resources so external tools can "read" project artifacts through the MCP protocol.

### 7.3 Vault Integration

When an MCP Server requires authentication, the Bridge delegates to the **Identity Vault** for credential retrieval. The Vault injects the token via the standard JIT injection pipeline (Section 4.2), rather than the Bridge requesting secrets directly.

---

## 8. Unified Interaction Protocol (Headless & Attach)

This protocol manages how the framework talks to systems like **Claude Code**.

### 8.1 Headless Execution

1. The **Orchestrator** writes a `task_brief` to the **Memory Engine** (as a `CLAUDE.md` file in the Shared Workspace).
2. The **Orchestrator** triggers the autonomous CLI engine to execute the task.
3. The **Post-Tool Hook** in the CLI signals the State Manager on completion.

### 8.2 Human Attach

1. The Kernel pauses the process and emits a `HUMAN_REQUIRED` event (delegated from the Orchestrator).
2. The human enters the terminal with the preserved session state.
3. The framework monitors the **Memory Engine** (filesystem) for changes.
4. Upon the `/done` signal, control returns to the **Supervisor** for evaluation.
