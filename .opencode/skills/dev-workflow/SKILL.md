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
- **Sanity check:** Verify no stale `[⏳]` tasks exist from previous sessions. If any `[⏳]` task appears completed (code exists, tests pass), fix it by marking it `[x]` before continuing.
- Edit `docs/tasks/plan.md`: change `[ ]` to `[⏳]` (In Progress).
- **Verify the edit:** Re-read the plan.md line for this task to confirm `[⏳]` is present before proceeding.
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
- Run `git add` for the relevant source files AND test files (NOT docs/tasks/plan.md).
- Run `git commit` with a descriptive message summarizing the task.
- **DENY:** Never commit or stage `docs/tasks/plan.md` in this step. It MUST be handled separately in Step 6.
- **DENY:** Do NOT combine this step with Step 6 in a single bash call. They must be separate actions.

### Step 6: Persist State
- Edit `docs/tasks/plan.md`: change `[⏳]` to `[x]` (Completed) for the current task.
- **Verify the edit:** Re-read the plan.md line for this task and confirm `[x]` is present. If the edit failed, re-apply it. Do NOT skip verification.
- Run `git add docs/tasks/plan.md` and `git commit` with message describing the status update.
- If meaningful lessons were learned (gotchas, new patterns, design decisions), append to `docs/memory.md` in a separate commit.
- **DENY:** Task is NOT complete until `[x]` is committed AND verified in plan.md. Memory is optional — only write lessons worth future sessions knowing.
- **DENY:** Do NOT combine plan.md commit with source file commit. They are separate tracked events.
