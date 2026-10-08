# Repository Rules for AI Agents

These rules apply to every agent session in this repository. Web-specific rules are in [web/AGENTS.md](web/AGENTS.md).

1. Read [docs/README.md](docs/README.md) first. The [Product Constitution](docs/PRODUCT_CONSTITUTION.md) is the highest authority, and its nine-level hierarchy decides which document wins.
2. **Implementation resumed** on 2026-10-01 ([DEC-006](docs/DECISIONS.md#accepted-decisions), replacing DEC-003). Work from [docs/TASKS.md](docs/TASKS.md); every task traces to an approved requirement, an accepted decision or a defect that breaks one.
3. The approved requirements R1–R13 in [Article 2 of the Constitution](docs/PRODUCT_CONSTITUTION.md#article-2-approved-requirements) change only through a decision the owner records in [docs/DECISIONS.md](docs/DECISIONS.md). Never change them, or build against them, silently.
4. When two sources conflict, follow [Article 5](docs/PRODUCT_CONSTITUTION.md#article-5-resolving-conflicts): detect, record in section 40 of the Product Understanding, find the newer confirmed decision, never choose silently, resolve, update the authoritative document, and only then implement.
5. Code and tests are evidence of current behaviour, not authority over confirmed requirements. Never silently remove existing behaviour, or delete, skip or weaken a test, to finish a task ([Articles 6 and 7](docs/PRODUCT_CONSTITUTION.md#article-6-code-and-tests-are-evidence)).
6. Only CONFIRMED items and accepted decisions go into plans and tasks. PROPOSED, ASSUMED and TBD items need the owner's confirmation first.
7. Local only: synthetic data, the web preview only at http://127.0.0.1:3000, and no external providers, real user data, spending or deployment.
8. After any change, follow the update rules in [docs/README.md](docs/README.md), including [CHANGELOG.md](CHANGELOG.md).
9. Working agreement ([DEC-009](docs/DECISIONS.md#accepted-decisions)): read each message for its intent. Discuss ideas, answer questions, record and analyse requirements, plan and implement implementation requests, investigate and fix reported bugs, record architecture decisions, and name uncertainty. Never turn discussion into code. Make routine engineering decisions yourself, document important ones, and keep going through ready tasks without asking. Interrupt the owner only for conflicting requirements, materially different product decisions, destructive or irreversible actions, missing credentials or access, unresolved security-sensitive decisions, a missing requirement that materially changes the work, or an external dependency that cannot safely be assumed.
10. Screens follow [DEC-013](docs/DECISIONS.md#accepted-decisions): take colours, spacing, corner radii and target sizes from the generated [design tokens](packages/design-tokens/README.md), reuse existing components, follow the screen rules in [FEATURES_AND_SCREENS section 4](docs/FEATURES_AND_SCREENS.md#4-rules-every-feature-follows), change a shared token or component only after checking every place that uses it, and check changed screens at 320 px / 320 dp and 200% text.

## Evidence-led autonomous work

The owner's working request of 2026-10-07 is to continue ready, in-scope work without asking for permission after each small fix.
Carry a milestone through investigation, implementation, verification and documentation; report meaningful findings and blockers,
not a narration of every tool call. Preserve concurrent edits and assign one writer per affected area.

- Treat [product research](docs/PRODUCT_RESEARCH_2026-10-07.md) as evidence and hypotheses, not approval of every proposed feature.
  Synthetic personas are test-design aids, never customer interviews, testimonials, votes or market demand.
- Use a concrete user job and falsifiable acceptance checks. Verify final state, retries, permission boundaries and accessibility;
  more generated code, more agents and more tokens are not success metrics.
- Keep [privacy readiness](docs/PRIVACY_READINESS.md) separate from draft policy copy. Do not invent operator details,
  legal approval, provider promises or successful live evaluations.
- The [work-cycle supervisor](scripts/work-cycle.mjs) can verify now and watch for later source changes within explicit limits.
  It does not repair code or keep this chat running. Never describe a checker as an autonomous coding team.
- Continue routine local engineering without repeated questions. Stop destructive actions, unapproved external processing,
  unresolved product/legal decisions and work with no reproducible acceptance condition; record the next actionable dependency instead.
- Before claiming a milestone complete, record fresh check results, missing prerequisites, concurrent-source caveats and
  whether a background process is actually running. Do not silently restore the missing historical governance documents.
