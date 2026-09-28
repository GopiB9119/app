# ADR-0003 — Canonical State Machines and Enumerations

Status: PROPOSED — requires product owner confirmation before schema or client generation.

Date: 2026-09-19

## Context

At least eight chapters define overlapping lifecycle enums that are not mutually consistent, and every planning contract defers reconciliation to "before code generation":

- Membership states: Chapter 3 §3.6.2 (`INVITED/PENDING/ACTIVE/MUTED/SUSPENDED/LEFT/REMOVED/EXPIRED`) versus Chapter 6 `space_members.membership_status` defaults.
- Invitation states: Chapter 3 §3.9.2 (`CREATED/SENT/OPENED/ACCEPTED/...`) versus Chapter 18's invitation lifecycle.
- Message states: Chapter 4 §4.4 client states versus server states versus Chapter 7 §7.18 delivery states.
- Schedule/occurrence/acknowledgment states: Chapter 13 source enums "overlap and need a canonical state transition specification" (contract §15).
- Agent run, step, tool and approval states: Chapters 5, 6, 7, 12 (C12-D02).
- Moderation content states: Chapters 2 §2.14.2 and 15.
- Event lifecycle states: Chapter 1 §24.3 versus Chapter 17 dimensions.
- Space lifecycle: Chapter 3 §3.3 versus Chapter 6 defaults.

The ambiguous `MUTED` example (does it block posting?) is explicitly called out in C3-D02. Choosing a default silently would violate the corpus rule that "no example default may bypass verification."

## Proposed Decision

The proposed registry and generated artifacts below have not been delivered by this ADR. Review the state families needed for the released slice first; unexposed later domains keep explicit before-use gates.

1. Propose a versioned state registry at `docs/CANONICAL_STATES.md`, with an accountable domain owner for each family. It becomes an implementation reference only after applicable review/approval; a proposed path cannot supersede owning chapter requirements by itself.
2. Propose reviewed machine-readable definitions and consumer checks at `packages/states/` for Python, TypeScript and Kotlin. Select tooling and prove generation/validation before claiming these artifacts or CI exist; avoid independently drifting copies.
3. Standing rules for reconciliation:
   - Membership, invitation, delivery telemetry, notification mute and moderation restriction remain **separate state families** (C3-D02, C18-D06).
   - Separate personal notification mute from posting restrictions and membership; do not make muting notifications implicitly deny sending or remove a participant.
   - Message persistence state is separate from delivery/read state (C7-D03, Ch4 §4.4).
   - Each family defines initial/terminal/exception states, actor and target authority, expected version, transition preconditions, current time/expiry, durable effects, audit, retry/replay and cancellation/recovery behavior.
4. Generate or validate compatible database/API/client definitions from the selected registry where appropriate. Generation can detect some drift; it cannot prove transaction ordering, authorization, provider outcomes or concurrency safety. Those need real tests.
5. State changes follow the owning domain's reviewed contract/migration/version process; amend an ADR when its architectural choice changes. Neither a casual enum edit nor a documentation amendment alone is release evidence.

## Consequences

- M0/M1 gates require actual reviewed definitions for the selected identity, invitation, membership, task, schedule, occurrence, notification and acknowledgment slice before dependent code. Later Agent, provider, ballot and encryption states are reviewed before their features activate, not silently assumed complete during M0.
- Chapters keep their examples as source evidence; implementations must not copy them directly.

## References

Use the [data](../CHAPTER_06_DATA_CONTRACT.md) C6-D05, [Space](../CHAPTER_03_SPACE_CONTRACT.md) C3-D02, [identity](../CHAPTER_18_IDENTITY_CONTRACT.md) C18-D06, [Agent](../CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) C12-D02 and [scheduling](../CHAPTER_13_SCHEDULING_CONTRACT.md) contracts. C7-D14 concerns missing operations, not approval of this state registry.
