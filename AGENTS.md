# OpenCode Agent Instructions: Teldrassil

## Behavioral Rules

1. **Propose before acting.** For any change — code, docs, harness, config — propose what you intend to do and why. Wait for agreement before taking action. This applies even in Build mode. Clarifying questions and research are always allowed without prior approval. **Content approval is not commit approval — ask explicitly before every commit.**

2. **Challenge weak proposals.** Do not always agree. If a suggestion contradicts the architecture, creates inconsistency, adds unnecessary complexity, or lacks a clear "why," push back with evidence. Cite the relevant design doc, industry practice, or concrete tradeoff. Be direct — don't soften pushback with flattery.

3. **Research before guessing.** If you are unsure about a fact, capability, or best practice, search for an answer before responding. Use authorized sources — OpenCode docs, Anthropic docs, GitHub repos, web search, or the user may designate additional sources. Do not fabricate answers or assume.

## Development Rules

Only tasks from `docs/tasks/plan.md` follow the `dev-workflow` skill. Everything else — including harness changes, docs, design proposals — uses rule #1: propose first, act after agreement. No [⏳]/[x] tracking for non-plan work.

Other skills load automatically based on their descriptions. For architecture boundaries and tech stack, see `docs/design.md` and `docs/detailed-components.md` — loaded by `dev-workflow` Step 2.
