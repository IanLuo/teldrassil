---
name: dev-workflow
description: Enforces a strict 6-step development loop for Teldrassil: plan, design alignment, TDD, review gate (pass/fail), commit, and persist. Use when starting any new feature or task.
---

# dev-workflow

## CRITICAL: 6-Step Development Loop

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

### Step 4: Review Gate (PASS or FAIL)
- Run `pnpm test` — all tests MUST pass.
- Read the original task description and execution plan from Step 1. Compare ALL changes against what was planned.
- Verify EVERY requirement is met:
  - Are all test cases from the plan implemented?
  - Are edge cases covered?
  - Are security concerns addressed (no credential leaks, no plaintext secrets)?
  - Are there any side effects or unintended mutations?
- Check for extraneous changes: nothing beyond the task scope was introduced.
- **PASSED** → Proceed to Step 5 (Commit).
- **FAILED** → Return to Step 3 and fix the gaps. Do NOT skip review. Output what specifically failed and what needs to change.

### Step 5: Commit Changes
- Run `git add` for the relevant files (source + tests, not docs/tasks/plan.md yet).
- Run `git commit` with a descriptive message summarizing the task.
- **DENY:** Never commit docs/tasks/plan.md in this step — it gets updated in Step 6.

### Step 6: Persist State
- Edit `docs/tasks/plan.md`: change `[⏳]` to `[x]` (Completed).
- If meaningful lessons were learned (gotchas, new patterns, design decisions), append to `docs/memory.md`:
  ```
  ## [Topic] - [Date]
  - One-line lesson
  ```
- **Skip memory.md** if the task was routine with nothing new to record.
- **DENY:** Task is NOT complete until `plan.md` is updated.
