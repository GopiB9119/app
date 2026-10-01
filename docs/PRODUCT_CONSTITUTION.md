# Product Constitution

The highest authority for this project. It holds the approved requirements, the decisions in force and the rules that govern every other document, the code and the tests. Nothing below it may override it. It changes only as Article 8 describes.

Adopted 2026-10-01 ([DEC-008](DECISIONS.md#accepted-decisions)).

## Article 1: Purpose

**CONFIRMED** The product is a global community platform with public communities and private spaces. It includes an agent system that assists authorized workflows, and knowledge retrieval over authorized documents and data. (The product owner's words, 2026-10-01. What "global" means at launch is open: Q9.)

This Constitution is level 1 of the authority hierarchy in Article 4.

## Article 2: Approved Requirements

Approved by the product owner on 2026-10-01 ([DEC-001](DECISIONS.md#accepted-decisions)). This wording is authoritative. [Section 37 of the Product Understanding](PRODUCT_UNDERSTANDING.md#37-confirmed-requirements) repeats it and tracks how far the code meets each requirement.

| ID | Requirement |
| --- | --- |
| R1 | Users can belong to many Spaces. |
| R2 | Each Space has its own membership, roles, permissions and resources. |
| R3 | Public communities and private Spaces both exist. |
| R4 | The public side has posts, comments, reactions, follows, discovery and search. |
| R5 | The private side has conversations, tasks, events and documents. |
| R6 | Family, couple, solo and custom group Spaces. |
| R7 | Agents are scoped software identities, never automatically administrators, with permissions, allowed tools, allowed resources and approval policies. |
| R8 | Agents support conversations, task help, scheduling, notifications, memory and retrieval. |
| R9 | Workflows are deterministic; AI assists and is never the source of truth. |
| R10 | Documents and authorized data can be ingested, parsed, chunked, indexed and retrieved. |
| R11 | Retrieval respects Space, membership, permission and privacy boundaries. |
| R12 | Strong privacy, security, auditability and observability. |
| R13 | Mobile and web apps with a backend, on the existing stack. |

## Article 3: Decisions in Force

The full records are in [DECISIONS.md](DECISIONS.md). If this summary and a record ever differ, correct this summary to match the record.

| Decision | In force |
| --- | --- |
| DEC-002 | Approved requirements change only through a recorded decision. A new explanation or request that conflicts with one is reported as a conflict; nothing changes silently. |
| DEC-004 | The web app runs only at http://127.0.0.1:3000. |
| DEC-005 | Network access is local only (127.0.0.1, localhost, 10.0.2.2). External providers, real user data, spending and deployment are not approved. |
| DEC-006 | Implementation is active, following [TASKS.md](TASKS.md). It replaced the pause in DEC-003. |
| DEC-007 | The care work built on 2026-10-01 is kept, and care is in scope for now. Who approves its medical, legal and privacy rules is open (Q12). |
| DEC-008 | The authority hierarchy and the rules in Articles 4 to 8. |
| DEC-009 | Working agreement: messages are read for their intent; discussion never becomes code automatically; routine engineering decisions are made without asking and ready work continues; the product owner is interrupted only for the reasons listed in the record. |
| DEC-013 | One design system: colours, the font, spacing, corner radii and touch-target sizes are defined once in the design tokens and generated into both apps. Every new or changed screen follows the screen rules, and AI sessions change a shared token or component, after checking every place that uses it, instead of patching one screen. |
| DEC-014 | Home is a personal overview, and web and Android share five main sections: Home, Spaces, Messages, Discover and Profile. |

DEC-001 approved Article 2. DEC-003 no longer applies.

## Article 4: Authority Hierarchy

| Level | Authority | Holds |
| --- | --- | --- |
| 1 | Product Constitution | Approved requirements, decisions in force and these rules |
| 2 | Domain Contract | The core entities: meaning, ownership, lifecycle, permissions and invariants |
| 3 | Data and Security Contracts | How data is modelled, classified, protected, retained and used, including by AI |
| 4 | Architecture | System structure, components and technical decisions |
| 5 | UX, API and Agent specifications | Screens and user flows, API and event contracts, agent behaviour and the detailed area specifications |
| 6 | Roadmap | The order in which work is delivered |
| 7 | Tasks | Individual pieces of work |
| 8 | Implementation | Code, migrations, configuration, generated files and the procedures to run them |
| 9 | Tests and verification evidence | Tests, their results, build status, assessments and incident records |

The [documentation map](README.md#authority-hierarchy) lists the documents at each level.

1. A lower level never overrides a higher-level invariant. When a lower document, the code or a test disagrees with a higher document, that is a conflict to resolve under Article 5, not a change.
2. An invariant is a confirmed statement: an approved requirement, an accepted decision, or a statement marked CONFIRMED. PROPOSED, ASSUMED and TBD statements bind nothing at any level. Statements marked Built are evidence (Article 6).
3. Among confirmed statements, the higher level wins, unless a newer confirmed decision changes the higher level. That decision governs, but nothing is implemented from it until it is written into the higher document (Article 5, steps 6 and 7).
4. Only confirmed requirements and accepted decisions go into plans and tasks (the product owner's instruction, 2026-10-01).
5. A decision in DECISIONS.md takes the level of the document it changes.
6. Where two documents share a level, each governs its own subject. Where they overlap and disagree, that is a conflict.
7. Outside the levels:
   - The original sources, [idea.md](../idea.md) and Chapters 1–20, are input with no authority of their own.
   - The [Product Understanding](PRODUCT_UNDERSTANDING.md) records the product owner's explanation, the proposals and open questions drawn from it, and the conflict register. Its authority is limited to the requirements it passed to Article 2.
   - [AGENTS.md](../AGENTS.md) applies this Constitution to agent sessions and cannot change it.

## Article 5: Resolving Conflicts

When two sources disagree:

1. **Detect.** Name both sources, their levels and the exact statements that disagree.
2. **Record.** Add the conflict to [section 40 of the Product Understanding](PRODUCT_UNDERSTANDING.md#40-conflicts-with-the-existing-repository), with its ID, date, sources, levels and status Open.
3. **Find the newer confirmed decision.** Check [DECISIONS.md](DECISIONS.md) and how each statement was confirmed. Only an approved requirement, an accepted decision or a statement the product owner confirmed counts. Code, tests, drafts and proposals never count as a decision.
4. **Do not choose silently.** Nothing changes because of the conflict until it is resolved, and work that depends on it stays blocked.
5. **Resolve.** When one newer confirmed decision clearly settles the question, the resolution follows it. In every other case, the product owner decides, and the decision is recorded in DECISIONS.md. An AI assistant may detect, record and propose; it applies a resolution only when a single newer confirmed decision clearly settles it, and it then tells the product owner.
6. **Update the authoritative document.** Write the outcome into the highest affected level first, then correct every lower document that repeats or depends on it. Mark the conflict Resolved, with the decision ID.
7. **Only then implement.** Tasks cite the decision; code and tests change after the documents.

Out-of-date facts are not conflicts. When a document's description of the current code or of test results is out of date, correct it from verified evidence and note the correction in the changelog. This applies only to statements that describe what exists. If the evidence shows the code departing from a confirmed statement, that is a conflict or a gap, not an out-of-date fact.

## Article 6: Code and Tests Are Evidence

1. Repository code is evidence of the current implementation, not proof of the intended architecture. A document at levels 1 to 7 does not change just because the code differs from it; the difference is a conflict or a gap, handled under Article 5.
2. Existing tests are evidence of the currently expected behaviour, not authority over a newer confirmed requirement. When a confirmed requirement changes the expected behaviour, the tests change deliberately, in the task that implements it, citing the decision.
3. Where no confirmed statement covers a behaviour, the current behaviour and its tests are the best evidence of intent, and they stay until a decision says otherwise.
4. A result counts only with its command, date, scope and source state ([evidence rules](EVALUATIONS.md#evidence-rules)).

## Article 7: Protecting Existing Behaviour

1. No task silently destroys existing behaviour.
2. Before changing behaviour, the task names that behaviour, the tests that cover it and any data it created.
3. Removing or changing user-visible behaviour needs an approved requirement or an accepted decision that calls for it. Otherwise, ask the product owner first.
4. Never delete, skip or weaken a test just to make a change pass. Change a test only when a confirmed decision changes what it checks, and say so in the task.
5. Existing data stays readable, or is migrated by a plan that loses nothing and is recorded with the task.
6. Record the change in the [changelog](../CHANGELOG.md).

## Article 8: Amendments

1. Only the product owner changes this Constitution, through a decision recorded in DECISIONS.md that gives the old and new wording (DEC-002).
2. The change is written here first, then into every lower document that repeats or depends on it, then into the changelog.
3. Requirements keep their IDs. A new requirement takes the next free number. A retired requirement stays listed as retired, with the decision that retired it.
