# Persona-Agent Architecture

Replace the single-agent "mindset shift" model with real subagents — each persona is an OpenCode subagent with scoped permissions, a skill spec, and domain knowledge pre-loaded.

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Orchestrator Agent                  │
│              (loads dev-workflow skill)              │
│  Coordinates phases, passes context between agents   │
└────┬──────┬──────┬──────┬──────┬──────┬─────────────┘
     │      │      │      │      │      │
     ▼      ▼      ▼      ▼      ▼      ▼
  Planner Gate-  Tester  Dev   Reviewer Doc'er
           keeper
```

Each persona-agent is defined in `.opencode/agents/` as a markdown file. Each loads its own skill from `.opencode/skills/` for domain specs.

## 2. Agent Definitions

### 2.1 Planner Agent (`planner.md`)

**Mode:** `subagent`
**Permissions:** `edit: docs/tasks/plan.md`, `read: *`, `bash: deny`, `task: deny`

**System prompt:**
```
You are the Planner. Your ONLY job is to read docs/tasks/plan.md, identify the next [ ] task, 
mark it [⏳], and output a step-by-step execution plan. Do NOT write code. Do NOT run tests. 
Do NOT open design docs (that's the Gatekeeper's job).
```

**Input:** None (reads plan.md autonomously)
**Output:** Task ID + execution plan in structured format

### 2.2 Gatekeeper Agent (`gatekeeper.md`)

**Mode:** `subagent`
**Permissions:** `read: *`, `edit: deny`, `bash: deny`, `task: deny`

**System prompt:**
```
You are the Gatekeeper. Read docs/design.md and docs/detailed-components.md fresh on every 
invocation. Compare the proposed execution plan against all architectural boundaries:
- No domain logic in the Kernel
- No payload data (>4KB) in the State Manager
- No credentials in LLM context
- All vital plugin slots (State, Memory, Vault, Driver) must remain

Output: PASS (plan is boundary-compliant) or FAIL with specific violations cited.
```

**Input:** Execution plan from Planner
**Output:** PASS/FAIL + violations (if any)

### 2.3 Tester Agent (`tester.md`)

**Mode:** `subagent`
**Permissions:** `edit: tests/**`, `bash: pnpm test *`, `read: src/** docs/**`, `task: deny`

**System prompt:**
```
You are the Tester. Your ONLY job is to write failing tests for the given task. 
Load the test-strategy.yaml for quality bar references. Write test files in tests/.
Run pnpm test to confirm they FAIL (Red). Do NOT write implementation code.
```

**Skill:** `test-strategy` (loads `docs/test-strategy.yaml`)
**Input:** Task description + execution plan
**Output:** Test file paths + confirmation that tests fail

### 2.4 Developer Agent (`developer.md`)

**Mode:** `subagent`
**Permissions:** `edit: src/**`, `bash: pnpm test *`, `read: *`, `task: deny`

**System prompt:**
```
You are the Developer. Implement the minimum code needed to make the existing tests pass. 
Read the test files first to understand the expected behavior. Stick to the design docs 
(already vetted by Gatekeeper). Do NOT add features beyond what tests require.
```

**Input:** Test file paths + failing test output
**Output:** Source file paths + confirmation that tests pass (Green)

### 2.5 Reviewer Agent (`reviewer.md`)

**Mode:** `subagent`
**Permissions:** `read: *`, `edit: deny`, `bash: pnpm test *`, `task: deny`

**System prompt:**
```
You are the Reviewer. Compare the git diff against the original execution plan. 
Check for: edge cases, security issues (credential leaks, plaintext secrets), 
side effects, extraneous changes beyond task scope. Run pnpm test to verify all pass.
Output: PASS (code meets plan + tests pass) or FAIL with specific gaps listed.
```

**Input:** Execution plan + git diff range
**Output:** PASS/FAIL + review notes

### 2.6 Documenter Agent (`documenter.md`)

**Mode:** `subagent`
**Permissions:** `edit: docs/*.md docs/tasks/*.md`, `bash: deny`, `task: deny`, `read: *`

**System prompt:**
```
You are the Document Maintainer. Edit docs/tasks/plan.md to mark the completed task [x].
If meaningful lessons were learned, append to docs/memory.md. 
Verify the edit by re-reading the line after writing. Do NOT write code or run tests.
```

**Input:** Task ID + optional lessons learned
**Output:** Confirmation that plan.md updated + memory.md updated (if applicable)

## 3. Orchestrator Flow

The orchestrator (main agent) loads `dev-workflow` skill and executes phases sequentially:

```
Phase 1: PLAN
  task(planner) → execution plan

Phase 2: GATE
  task(gatekeeper, execution plan) → PASS/FAIL
  if FAIL → halt, surface violations to user

Phase 3a: TEST (RED)
  task(tester, task description + plan) → test files + "tests fail" confirmation

Phase 3b: IMPLEMENT (GREEN)
  task(developer, test files) → source files + "tests pass" confirmation

Phase 4: REVIEW
  task(reviewer, plan + git diff) → PASS/FAIL + notes
  if FAIL → return to Phase 3b with specific gaps

Phase 5: COMMIT
  orchestrator directly: git add src/ tests/ && git commit

Phase 6: PERSIST
  task(documenter, task ID + lessons) → plan.md [x] verified
  orchestrator directly: git add docs/tasks/plan.md && git commit
```

## 4. Skill Definitions

Each persona-agent gets a skill file that loads domain specs:

| Agent | Skill file | Loads |
|-------|-----------|-------|
| Tester | `.opencode/skills/tester/SKILL.md` | `docs/test-strategy.yaml` |
| Gatekeeper | `.opencode/skills/gatekeeper/SKILL.md` | `docs/design.md` + `docs/detailed-components.md` |
| Developer | (uses main agent context) | Already loaded design docs |
| Reviewer | `.opencode/skills/reviewer/SKILL.md` | `docs/test-strategy.yaml` + design docs |
| Documenter | `.opencode/skills/documenter/SKILL.md` | plan.md conventions + memory.md format |

## 5. Permission Model

| Agent | read | edit | bash | task |
|-------|------|------|------|------|
| Planner | `*` | `docs/tasks/plan.md` | deny | deny |
| Gatekeeper | `*` | deny | deny | deny |
| Tester | `src/** docs/**` | `tests/**` | `pnpm test *` | deny |
| Developer | `*` | `src/**` | `pnpm test *` | deny |
| Reviewer | `*` | deny | `pnpm test *` | deny |
| Documenter | `*` | `docs/**` | deny | deny |

Benefits:
- **Tester can't accidentally edit source** → no implementation in test phase
- **Developer can't edit tests** → no cheating by softening tests
- **Documenter can't touch code** → plan.md edits stay atomic
- **Reviewer is read-only** → unbiased review

## 6. Context Handoff Protocol

Between phases, the orchestrator passes context as structured inputs:

```
Phase output → next phase input

Planner → Gatekeeper:  { task_id, task_description, plan: string[] }
Gatekeeper → Tester:   { task_id, task_description, plan: string[], gate: PASS }
Tester → Developer:    { task_id, test_files: string[], failures: string }
Developer → Reviewer:  { task_id, plan: string[], git_diff_range: string }
Reviewer → Documenter: { task_id, lessons_learned?: string[] }
```

## 7. Migration Path

1. **Phase 1**: Create `planner` + `documenter` subagents (lowest risk, pure doc work)
2. **Phase 2**: Add `tester` + `gatekeeper` (read-only gate + scoped test edits)
3. **Phase 3**: Add `reviewer` agent (read-only review with diff analysis)
4. **Phase 4**: Update `dev-workflow` skill to orchestrate subagents instead of sequential personas

## 8. Tradeoffs

| Pro | Con |
|-----|-----|
| True permission isolation | Subagent startup overhead (~1-2s each) |
| Smaller context per agent (no bloat) | Context handoff overhead (pruning between phases) |
| Each persona loads only its own domain specs | Orchestrator must hold the thread |
| Phases independently testable | More files to maintain (~6 agents + 6 skills) |
| Clear audit trail per phase | Serial execution (phases can't run in parallel) |
