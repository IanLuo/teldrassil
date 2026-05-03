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
#    Plugins loaded: State, Memory, Vault, Driver

# Start the UI dashboard
cd packages/ui && pnpm dev
# → http://localhost:3000
```

## Project Structure

```
teldrassil/
├── src/core/           # Micro-Kernel + Vital Plugins (20 files)
├── tests/core/         # 136 unit + integration tests
├── packages/ui/        # Next.js dashboard (React Flow, Zustand)
├── docs/               # Design docs, task plan, memory, steward log
├── .opencode/          # Skills, agents, slash commands (harness)
└── pnpm-workspace.yaml # Monorepo config
```

## Architecture

| Layer | Components |
|-------|-----------|
| **Micro-Kernel** | EventBus, PluginRegistry, BootstrapSequence, MicroKernel |
| **Vital Plugins** | State (LocalStatePlugin), Memory (LocalMemoryPlugin), Vault (EnvVaultPlugin), Driver (AnthropicDriver) |
| **Orchestration** | ManifestParser, Supervisor (quality gate), WildcardRule (diversity) |
| **Mode** | Supervised Workflow — quality-gated execution with rework loops |

## Commands

```bash
pnpm start          # Boot kernel
pnpm test           # Run 136 core tests
pnpm build          # TypeScript compile
cd packages/ui && pnpm dev    # UI dashboard
cd packages/ui && pnpm build  # UI production build
```

## Development

Development follows the `dev-workflow` skill (6-step loop: plan → design → TDD → review → commit → persist). Tasks are tracked in `docs/tasks/plan.md`. See `AGENTS.md` for behavioral rules.

## Integration Guide

### As a library

```typescript
import { MicroKernel } from 'teldrassil';
import { EnvVaultPlugin } from 'teldrassil/core/EnvVaultPlugin';
import { LocalMemoryPlugin } from 'teldrassil/core/LocalMemoryPlugin';
import { LocalStatePlugin } from 'teldrassil/core/LocalStatePlugin';
import { AnthropicDriver } from 'teldrassil/core/AnthropicDriver';

const kernel = new MicroKernel();

// Register vital plugins
kernel.register(new LocalStatePlugin());
kernel.register(new LocalMemoryPlugin(process.env.MASTER_KEY!));
kernel.register(new EnvVaultPlugin(process.env.MASTER_KEY!));
kernel.register(new AnthropicDriver('claude-sonnet-4'));

// Bootstrap and run
await kernel.init();

// Query state
const state = kernel.getRegistry().getPlugin('State') as LocalStatePlugin;
state.append({ node_id: 'step_1', status: 'completed', worker_id: 'agent_a', artifact_ref: null });

// Shutdown
await kernel.shutdown();
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
agents:
  - id: "coder"
    use_driver: "anthropic_adapter"
    model: "claude-sonnet-4"
sequence:
  - step: "write_code"
    agent: "coder"
    max_retries: 3
```

```typescript
import { ManifestParser } from 'teldrassil/core/ManifestParser';
import fs from 'fs';

const yaml = fs.readFileSync('my-workflow.yaml', 'utf8');
const manifest = ManifestParser.parse(yaml);
ManifestParser.validate(manifest); // throws SystemExit if invalid

// Use manifest to configure agents and workflow
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
