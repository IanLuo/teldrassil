---
name: skill-expert
description: Expert on OpenCode's harness system (skills, agents, commands, rules, permissions). Use when creating, modifying, or debugging skill files, agent configs, slash commands, AGENTS.md, opencode.json, or the dev-workflow itself.
---

# skill-expert

## Domain Knowledge

When working on harness files, the agent must follow these specifications:

### Skills (SKILL.md)

Skills live in `.opencode/skills/<name>/SKILL.md`. Each must start with YAML frontmatter:

```
---
name: <kebab-case, must match directory name>
description: <1-1024 chars, include usage triggers>
---
```

**Discovery order** (OpenCode v1.14+):
1. `.opencode/skills/<name>/SKILL.md` (primary project path)
2. `.claude/skills/<name>/SKILL.md` (Claude Code compat)
3. `.agents/skills/<name>/SKILL.md` (legacy agent compat)
4. `~/.config/opencode/skills/*/SKILL.md` (global)
5. `~/.claude/skills/*/SKILL.md` (global Claude Code compat)
6. `~/.agents/skills/*/SKILL.md` (global legacy compat)

**Name validation:** `^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase, hyphens, no leading/trailing dash, no double dash.

**License:** Optional frontmatter field. MIT is common for open-source skills.

**Metadata:** Optional `metadata:` map for custom key-value pairs.

### Agents (markdown)

Agents live in `.opencode/agents/<name>.md`. YAML frontmatter:

```
---
description: <required — when to use this agent>
mode: subagent | primary | all
model: <optional — provider/model-id>
temperature: <optional — 0.0 to 1.0>
steps: <optional — max agentic iterations>
hidden: <optional — true hides from @ menu>
permission:
  edit: allow | ask | deny
  bash: allow | ask | deny  # or glob: "git *": allow
  task: allow | ask | deny
  read: allow | ask | deny
---
```

Permissions can use glob patterns: `"tests/**": allow`, `"*.env": deny`.

### Commands (slash commands)

Commands live in `.opencode/commands/<name>.md`. YAML frontmatter:

```
---
description: <required>
agent: <optional — agent to use>
model: <optional — provider/model>
subtask: <optional — force subagent invocation>
---
<template — uses $ARGUMENTS, $1, $2, !`shell`, @file references>
```

### Rules (AGENTS.md)

Project AGENTS.md is loaded into every session's system prompt. Keep it lean — 20 lines max. Heavy specs go in skills (loaded on demand). Format is free-form markdown.

### Configuration (opencode.json)

Project-level config. Key fields:
- `instructions: ["file.md"]` — injects files into every session (use sparingly — context cost)
- `agent: { name: { ... } }` — custom agent definitions
- `command: { name: { ... } }` — slash command definitions
- `permission: { ... }` — global permission defaults

## When to Load This Skill

Load `skill-expert` when the task involves ANY of these files:
- `.opencode/skills/**`
- `.opencode/agents/**`
- `.opencode/commands/**`
- `AGENTS.md`
- `opencode.json`
- The dev-workflow or personas skills themselves
- Workflow/harness debugging or improvement

## Key Constraints

- Skills must have YAML frontmatter with `name` + `description` to be discovered
- Skills are loaded at **session start** — changes require restart
- Agents in `.opencode/agents/` are discovered at session start
- `plugin.json` sidecar files are NOT used by OpenCode — everything goes in SKILL.md frontmatter
- The `instructions` field in opencode.json adds files to EVERY session's context — use sparingly for heavy files
- Subagents start with fresh context — don't use them for serial workflow phases
