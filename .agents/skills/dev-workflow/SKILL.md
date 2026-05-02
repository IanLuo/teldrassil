# Skill: dev-workflow

## Description
Enforces a strict, 5-step development loop for the Teldrassil project: Status check, Design alignment, TDD execution, Code Review, and Memory update. Use this when starting any new feature or task to ensure architectural consistency and test coverage.

## The 5-Step Workflow

When developing in this repository, you **must** follow these steps in order for every task, actively switching your mindset to the appropriate **Persona** (defined in the `personas` skill) for each step:

1. **Get Task, Plan, & Update Status (Initialization) -> Adopt `Document Maintainer` Persona:**
   - Read the current task list (`docs/tasks/plan.md`).
   - Identify the next available task.
   - *Crucial:* Edit `docs/tasks/plan.md` to change the task status from `[ ]` to `[⏳]` (In Progress) before starting work.
   - *Crucial:* Explicitly write out a step-by-step execution plan for the specific task before running any commands.
   - Do not start writing code blindly.

2. **Check Design (Alignment) -> Adopt `Developer` Persona:**
   - Read `docs/design.md` and `docs/detailed-components.md`.
   - Verify that the requested task does not violate the Micro-Kernel boundaries (e.g., adding domain logic to the Kernel, or payload data to the State Manager).
   - Ensure you completely understand the requirements before proceeding. Ask the user if anything is ambiguous.

3. **TDD Loop (Implementation) -> Alternate `Tester` and `Developer` Personas:**
   - **[Tester] Test First:** Write the test file (e.g., `feature.test.ts`). Define the expected inputs, outputs, and edge cases.
   - **[Tester] Run Test:** Ensure the test fails.
   - **[Developer] Write Code:** Implement the minimum required code in the target file to make the test pass.
   - **[Tester] Run Test:** Ensure the test passes. Refactor if necessary.

4. **Review (Validation) -> Adopt `Reviewer` Persona:**
   - Perform a self-review.
   - Consider edge cases, security implications (e.g., credentials logging), and error handling.
   - *Never invent requirements.* Ensure the original task was met.

5. **Update Tasks & Memory (Persistence) -> Adopt `Document Maintainer` Persona:**
   - Edit `docs/tasks/plan.md` to change the task status from `[⏳]` to `[x]` (Completed).
   - If a new sub-task was discovered, add it to the plan.
   - Document any gotchas, workarounds, or lessons learned during the implementation.
