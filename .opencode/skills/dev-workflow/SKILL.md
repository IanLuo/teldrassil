---
name: dev-workflow
description: Enforces a strict 5-step development loop for Teldrassil: status check, design alignment, TDD execution, code review, and memory update. Use when starting any new feature or task.
---

# dev-workflow

## CRITICAL: 5-Step Development Loop

You MUST follow these steps IN ORDER for EVERY task. Each step has a required output. Skip NONE.

### Step 1: Initialize & Plan
- Read `docs/tasks/plan.md` and identify the next `[ ]` task.
- Read `docs/memory.md` for relevant past lessons.
- Edit `docs/tasks/plan.md`: change `[ ]` to `[⏳]` (In Progress).
- Output a step-by-step execution plan BEFORE writing any code or running commands:
  ```
  ## Execution Plan for [Task ID]
  1. [Concrete action]
  2. [Concrete action]
  ...
  ```
- **DENY:** Do NOT write code or run commands before the execution plan is output.

### Step 2: Design Alignment
- Read `docs/design.md` and `docs/detailed-components.md` for relevant sections.
- Verify no Micro-Kernel boundary violations:
  - No domain logic in the Kernel
  - No payload data in the State Manager
  - No credentials in LLM context
- If ambiguous, ASK the user before proceeding.

### Step 3: TDD Loop (Tester -> Developer -> Tester)
- **[Tester]** Write the test file FIRST. Define inputs, outputs, edge cases.
- **[Tester]** Run test: confirm it FAILS (Red).
- **[Developer]** Write minimum code to make the test pass.
- **[Tester]** Run test: confirm it PASSES (Green).
- **DENY:** NEVER write implementation before a failing test exists.

### Step 4: Self-Review
- Re-read the task description. Verify ALL requirements are met.
- Check: edge cases, security (credential logging, plaintext secrets), side effects, error handling.
- Confirm no extraneous requirements were invented.
- Output a brief review summary.

### Step 5: Persist State
- Edit `docs/tasks/plan.md`: change `[⏳]` to `[x]` (Completed).
- If meaningful lessons were learned (gotchas, new patterns, design decisions), append to `docs/memory.md`:
  ```
  ## [Topic] - [Date]
  - One-line lesson
  ```
- **Skip memory.md** if the task was routine with nothing new to record. plan.md `[x]` is sufficient for task completion tracking.
- **DENY:** Task is NOT complete until `plan.md` is updated. Memory is optional — only write lessons worth future sessions knowing.
