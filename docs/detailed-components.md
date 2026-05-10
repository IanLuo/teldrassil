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
Must support local filesystem persistence mapped to `/.teldrassil/state/<session_id>.json`. Snapshots state to disk after every event for SIGINT recovery and session continuity. On shutdown, snapshots state but does **not** clear and re-save — clearing would erase session history.

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

### 4.1 TraceEnvelope (Standard Metadata)

All trace entries conform to the `TraceEnvelope` wrapper:

| Field | Description |
|---|---|
| `traceId` | Unique trace entry ID. |
| `sessionId` | Session from the State Manager (cross-linkage). |
| `nodeId` | The step/agent node that produced this entry. |
| `type` | Entry kind (`route_decision`, `gate_finding`, `llm_io`, `recovery`, `custom`). |
| `timestamp` | ISO-8601 timestamp. |
| `payload` | Type-specific data (generic, validated by `type`). |

### 4.2 Scope
Stores `RouteDecision` metadata, `GateFinding[]` arrays, raw LLM input/output, and recovery events. Append-only store.

### 4.3 Corruption Recovery
On load, if the trace file is corrupted: rename it to `trace.corrupt.<timestamp>.json`, start a fresh trace, and append a recovery event.

### 4.4 Provider Interface
- `appendTrace(envelope: TraceEnvelope) → TraceURI` — Writes structured trace entry.
- `getTrace(uri: TraceURI) → any` — Retrieves trace for UI/debugging.
- `listBySession(sessionId) → TraceEnvelope[]` — Query entries by session (eventual).

---

## 5. Identity Vault (The Passport Office)

Manages sensitive credentials. Initialized via `.env` or KMS. Generates session DEK for Memory Engine. Intercepts and JIT-injects tokens into API headers via transport middleware.

---

## 6. Model Driver (The Hands & Voice)

Bridges the framework's execution requests to specific LLMs or local code execution.

### 6.1 Interface (`IModelDriver`)
Must implement `translate(messages)` and `generate(messages, tools, schema)`.

### 6.2 GenerateResult
| Field | Description |
|---|---|
| `content` | Text output (always present). |
| `object?` | Structured object output (present when `schema` is provided, uses AI SDK structured generation). |
| `toolCalls?` | Tool call requests from the model. |
| `usage` | Token usage metadata. |

### 6.3 Implementations
* **`UnifiedModelDriver`:** Wraps `@ai-sdk/core` (Vercel AI SDK) to natively handle Anthropic, OpenAI, and Gemini with standardized structured output and tool-calling. When `schema` is present in `GenerateOptions`, uses AI SDK structured generation and returns both `content` and `object`.
* **`HostFunctionDriver`:** Receives the standard `messages`/`schema` payload, but instead of making a network call, executes a registered local callback deterministically for zero LLM cost.

---

## 7. Orchestrator: Supervisor & WorkflowRunner

The Orchestrator defines execution flow, loops through the manifest sequence, and enforces quality routing.

### 7.1 Workflow Runner
The execution loop that iterates over the defined `sequence`. It resolves the Agent, invokes the required Driver (`generate()`), and routes the output through the Supervisor.

#### StepResult
| Field | Description |
|---|---|
| `step` | Step identifier from the manifest. |
| `agent` | Agent ID that executed the step. |
| `outputRef` | `MemoryURI` to the step's durable artifact output. |
| `traceRef` | `TraceURI` to the step's trace entry. |
| `decision` | Supervisor's routing decision. |
| `retries` | Number of retries consumed. |

#### StepExecutionInput
| Field | Description |
|---|---|
| `step` | Step identifier. |
| `agent` | Agent ID. |
| `hostContext` | App-provided structured context for this step. |
| `previousStepRefs` | `MemoryURI` references from prior steps. |

#### Host Hooks (overridable)
The host app may override these hooks in runner config:

| Hook | Signature | Purpose |
|---|---|---|
| `buildMessages` | `(step, agent, context) → Message[]` | Construct the message array sent to the driver. |
| `afterStep` | `(step, result) → void` | Side-effects after each step completes. |
| `evaluateOutput` | `(step, output) → SupervisorDecision` | Custom evaluation logic (replaces default evaluator). |
| `onDecision` | `(decision, step) → void` | React to routing decisions.

### 7.2 Supervisor Routing (5-Enum)
Evaluates output and returns a `SupervisorDecision`:
* `PROCEED`: Quality passed, advance to next step.
* `REWORK`: Quality failed, automatic retry is allowed (feedback sent back to worker).
* `ESCALATE`: Retry budget exhausted (`retryCount >= maxRetries`, where `maxRetries` = extra attempts after first try). Route to human or app policy.
* `BLOCK`: Cannot proceed even with retry — required input/context is missing. Requires intervention.
* `COMPLETE`: Workflow execution finished.

Retry enforcement: the runner checks `retryCount >= maxRetries` **before** invoking the next worker execution. `maxRetries: 0` means exactly one attempt with no retries.

### 7.3 Binary Gate Delegation
The framework explicitly **rejects** building a heavy, severity-based Quality Gate Framework. The Supervisor is strictly binary (`PROCEED` / `REWORK`). Any complex severity checks or rich array validations (`GateFinding[]`) are delegated to the user-provided Evaluator agent, which logs its rich findings to the **Trace Log** and distills the decision back to binary for the Supervisor.

#### End-to-End Example: Worker → Evaluator → Binary Gate → RouteDecision

Given a manifest step with an evaluator:

```yaml
# Manifest excerpt
sequence:
  - step: draft_plan
    agent: senior_coder
    evaluator: manager_gpt4o
    max_retries: 3
```

**1. Worker produces output.** The `senior_coder` agent generates a plan document, captured as a raw output string by the WorkflowRunner.

**2. Evaluator assesses quality.** The WorkflowRunner sends the worker output to the `manager_gpt4o` evaluator. The evaluator writes structured `GateFinding[]` entries to the Trace Log via `createTraceEnvelope`, then returns **only** a binary decision string:

```typescript
// Evaluator writes findings to Trace (one envelope per finding)
traceLog.appendTrace(createTraceEnvelope('gate_finding', 'draft_plan', sessionId, {
  severity: 'HIGH',
  criterion: 'covers_security_requirements',
  passed: false,
  detail: 'Plan omits rate-limiting for the /login endpoint (PRD §3.2).',
}));

traceLog.appendTrace(createTraceEnvelope('gate_finding', 'draft_plan', sessionId, {
  severity: 'MEDIUM',
  criterion: 'includes_error_handling',
  passed: true,
  detail: 'Error handling is well-specified.',
}));

// Evaluator returns only binary decision — no findings in response
// → "decision: REWORK"
```

The evaluator's system prompt (via `buildEvaluatorMessages`) instructs:

```
You are evaluator "manager_gpt4o". Evaluate the output of step "draft_plan".
Respond with exactly one of: "decision: PROCEED" if it meets requirements,
"decision: REWORK" if it needs changes, or "decision: BLOCK" if human
intervention is needed.
```

**3. Supervisor parses only the binary token.** `parseEvaluatorDecision()` extracts `"REWORK"` from the evaluator's response. The Supervisor **never inspects** the `GateFinding[]` payloads — those live exclusively in the Trace Log for post-hoc debugging and dashboards.

**4. WorkflowRunner records the `RouteDecision`** to Trace:

```typescript
await recordRouteDecision(traceLog, {
  from: 'draft_plan',
  to: 'draft_plan',           // REWORK → loop back to same step
  decision: 'REWORK',
  reason: 'Quality check failed (retry 1)',
  timestamp: new Date().toISOString(),
  metadata: { retryCount: 0, maxRetries: 3 },
}, sessionId, 'draft_plan');
```

**5. WorkflowRunner acts on the binary decision.** `REWORK` → retry the worker (up to `maxRetries`). `PROCEED` → advance to the next manifest step. `BLOCK` → pause for human input. The Supervisor remains a simple binary gate — no severity tiers, rubrics, or weighted scoring. All evaluation richness is delegated to the Trace Log.

---

## 8. MCP Bridge (The Extender)

Turns external capabilities into framework-native tools. Acts as MCP Host, mapping Memory URIs to MCP resources and requesting JIT credentials from the Vault for authenticated servers.

---

## 9. Unified Interaction Protocol

### 9.1 Human Attach Protocol
Emits `HUMAN_REQUIRED` event. Workflow Runner pauses. A `HumanInputRequest` (prompt, contextRefs, choices, `traceRef`) is persisted to the State Manager (<4KB pointer-only), with full request context stored in the Trace Log. On kernel restart, the runner detects a pending request by `requestId` and resumes waiting. When human submits `HumanInputResult`, Workflow Runner resumes at the specified node.