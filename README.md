# 🌳 Teldrassil

Modular Agentic Micro-Kernel Framework — a "Reliable OS for Agents."

Decouples infrastructure (Plugins) from execution logic (Orchestrators) and task definitions (Manifests). Built on a lightweight, protocol-agnostic message bus.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the kernel
pnpm start

# Expected output:
# 🌳 Teldrassil kernel bootstrapped successfully
#    Plugins loaded: State, Memory, Vault, Trace, Driver

# Start the UI dashboard
cd packages/ui && pnpm dev
# → http://localhost:3000
```

## Project Structure

```
teldrassil/
├── src/core/           # Micro-Kernel + Vital Plugins (29 files)
├── tests/core/         # Unit + integration tests
├── packages/ui/        # Next.js dashboard (React Flow, Zustand)
├── docs/               # Design docs, task plan, memory, steward log
├── .opencode/          # Skills, agents, slash commands (harness)
└── pnpm-workspace.yaml # Monorepo config
```

## Architecture

| Layer | Components |
|-------|-----------|
| **Micro-Kernel** | EventBus, PluginRegistry, BootstrapSequence, MicroKernel |
| **Vital Plugins** | State Manager (LocalJsonStatePlugin), Identity Vault (EnvVaultPlugin), Memory Engine (LocalMemoryPlugin), Trace Log (LocalJsonTracePlugin), Model Driver (UnifiedModelDriver) |
| **Orchestration** | ManifestParser, Supervisor (quality gate), WildcardRule (diversity) |
| **Mode** | Supervised Workflow — quality-gated execution with rework loops |

## Commands

```bash
pnpm start          # Boot kernel
pnpm test           # Run core tests
pnpm build          # TypeScript compile
cd packages/ui && pnpm dev    # UI dashboard
cd packages/ui && pnpm build  # UI production build
```

## Development

Development follows the `dev-workflow` skill (6-step loop: plan → design → TDD → review → commit → persist). Tasks are tracked in `docs/tasks/plan.md`. See `AGENTS.md` for behavioral rules.

## Integration Guide

### Kernel bootstrap

```typescript
import { MicroKernel } from 'teldrassil';
import { EnvVaultPlugin } from 'teldrassil/core/EnvVaultPlugin';
import { LocalMemoryPlugin } from 'teldrassil/core/LocalMemoryPlugin';
import { LocalJsonStatePlugin } from 'teldrassil/core/LocalJsonStatePlugin';
import { LocalJsonTracePlugin } from 'teldrassil/core/LocalJsonTracePlugin';
import { UnifiedModelDriver } from 'teldrassil/core/UnifiedModelDriver';

const kernel = new MicroKernel();

// Register all five vital plugins
kernel.register(new LocalJsonStatePlugin('./.teldrassil/state'));
kernel.register(new LocalMemoryPlugin(process.env.MASTER_KEY!));
kernel.register(new EnvVaultPlugin(process.env.MASTER_KEY!));
kernel.register(new LocalJsonTracePlugin('./.teldrassil/trace'));
kernel.register(new UnifiedModelDriver('default', vault, {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
}));

await kernel.init();
await kernel.shutdown();
```

### Model Drivers

#### UnifiedModelDriver — Multi-Provider LLM

Wraps `@ai-sdk/core`, supports Anthropic, OpenAI, and Google Gemini. Model strings use `provider:model-id` format (e.g. `"anthropic:claude-3-5-sonnet"`). Supports **structured output** — when `options.schema` is provided, `generateObject` is used, returning a typed `object` field alongside the raw text.

```typescript
const driver = new UnifiedModelDriver('my_driver', vault, {
  anthropic: 'ANTHROPIC_API_KEY',
});

// Standard text generation
const result = await driver.generate({
  model: 'anthropic:claude-3-5-sonnet',
  messages: [{ role: 'user', content: 'Hello' }],
});

// Structured (schema-based) generation
const typed = await driver.generate({
  model: 'anthropic:claude-3-5-sonnet',
  messages: [{ role: 'user', content: 'Extract name and age' }],
  schema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } } },
});
// typed.object → { name: "...", age: ... }
```

#### HostFunctionDriver — Deterministic Local Execution

Runs registered JavaScript functions locally. **Zero LLM cost**, ideal for deterministic transformations, validation, and tests. Agents reference it via `use_driver` with the function name as the `model` field.

```typescript
import { HostFunctionDriver } from 'teldrassil/core/HostFunctionDriver';

kernel.register(new HostFunctionDriver('host_executor', {
  validate_code: async ({ messages }) => {
    const code = messages[0]?.content || '';
    return JSON.stringify({ valid: !code.includes('DROP TABLE'), issues: [] });
  },
  format_output: ({ messages }) => messages.map(m => m.content).join('\n---\n'),
}));
```

### Driver-by-ID Registration

Multiple drivers coexist under different IDs. The `id` passed to a driver's constructor becomes its registered name in the PluginRegistry. Agents in a manifest reference drivers via `use_driver`.

```typescript
kernel.register(new UnifiedModelDriver('anthropic_adapter', vault, { anthropic: 'ANTHROPIC_API_KEY' }));
kernel.register(new UnifiedModelDriver('openai_adapter', vault, { openai: 'OPENAI_API_KEY' }));
kernel.register(new HostFunctionDriver('host_executor', { validate: async (i) => 'ok' }));

// Three drivers registered under distinct IDs
```

### TraceEnvelope

Every trace entry wraps payloads in a `TraceEnvelope` — a standard metadata structure:

```typescript
interface TraceEnvelope {
  traceId: string;     // Unique trace identifier
  sessionId: string;   // Session scope
  nodeId: string;      // Originating node
  type: TraceEntryType; // 'route_decision' | 'gate_finding' | 'llm_io' | 'recovery' | 'custom'
  timestamp: string;   // ISO 8601
  payload: unknown;    // Entry-specific data
}
```

### With a manifest file

```yaml
# my-workflow.yaml
project_id: "code_review_bot"
workflow: "supervised"
plugins:
  model_drivers:
    - id: "anthropic_adapter"
      type: "drivers.models.anthropic"
    - id: "host_executor"
      type: "drivers.models.host"
agents:
  - id: "coder"
    use_driver: "anthropic_adapter"
    model: "anthropic:claude-3-5-sonnet"
  - id: "validator"
    use_driver: "host_executor"
    model: "validate_code"
sequence:
  - step: "write_code"
    agent: "coder"
    max_retries: 3
  - step: "validate"
    agent: "validator"
    on_failure: "rework"
```

```typescript
import { ManifestParser } from 'teldrassil/core/ManifestParser';
import fs from 'fs';

const yaml = fs.readFileSync('my-workflow.yaml', 'utf8');
const manifest = ManifestParser.parse(yaml);
ManifestParser.validate(manifest); // Verifies every use_driver references a registered driver
```

### With Supervisor quality gates

```typescript
import { Supervisor } from 'teldrassil/core/Supervisor';

const result = Supervisor.evaluate({
  output: '```ts\nconst x = 5;\n```',
  retryCount: 0,
  maxRetries: 3,
  criteria: [
    { description: 'must contain code block', check: (out) => out.includes('```') },
    { description: 'must be at least 5 chars', check: (out) => out.length >= 5 },
  ],
});

if (result === 'REWORK') {
  // Send feedback to agent, retry
} else if (result === 'ESCALATE') {
  // Trigger Human-Attach mode
}
```

## Phase 9 (Current)

Robustness & integration readiness — production hardening across all five vital plugins, manifest-driven multi-driver execution, structured output support, and HostFunctionDriver for deterministic local code paths.
