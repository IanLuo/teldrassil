---
description: Complete the current task. Runs review gate, commits changes, updates plan.md to [x], and optionally appends lessons to docs/memory.md.
---
Load the dev-workflow skill. Follow Steps 4-6:
1. **Review Gate:** Run `pnpm test`. Compare changes against the execution plan. If failed, return to TDD loop. If passed, proceed.
2. **Commit:** `git add` source + test files. `git commit` with a descriptive message.
3. **Persist:** Edit docs/tasks/plan.md — change [⏳] to [x]. If meaningful lessons were learned, append to docs/memory.md.
Do NOT write new code. This command finalizes the current task only.
