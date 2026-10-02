# ADR-0005 — MVP Scope Resolution and Milestone Ordering

Status: PROPOSED - recommends resolution of C1-D01 through C1-D04; no owning decision is accepted by this draft.

Date: 2026-09-19

## Context

Chapter 1's decision ledger records four scope conflicts between the master blueprint and the Chapter 1 PRD:

- C1-D01: the blueprint phases couple/solo/custom Spaces later; Chapter 1 §32/34/41 includes them in the MVP.
- C1-D02: data export is "should-have" in §32.2 but required by the final MVP definition (§41 item 16).
- C1-D03: push and email are "should-have"; notification receipt is a final-MVP outcome.
- C1-D04: §39 orders public community before planning; the proposed first milestone is a family-reminder slice.

The earlier ADR sequence was `M0 skeleton -> M1 family reminder -> M2 reliability core -> M3 messaging -> M4 public community -> M5 agent MVP -> M6 production hardening`. It disagreed with the [release plan](../CHAPTER_01_RELEASE_PLAN.md) and [team plan](../TEAM_ORGANIZATION_EXECUTION_PLAN.md), and omitted a distinct remaining-planning milestone. Retain that alternative as history, not as a competing adopted roadmap. Reliability, security and data rights are obligations throughout, not an excuse to remove planning completion.

## Proposed Decision

The recommendation below aligns document planning with the existing provisional release/team sequence. Founder/product confirmation and applicable technical/security/data-rights gates remain required; C1 decision statuses are unchanged.

1. **Full MVP (C1-D01):** all four private Space types (family, couple, solo, custom), the public community, Android + core web, and account export are in the MVP scope. Couple/solo/custom are delivered by milestone, not silently dropped. Temporary-event behavior remains retained-but-later.
2. **Export (C1-D02):** a secure, re-authenticated, asynchronous account export is **required** before the full MVP is declared complete (consistent with §41).
3. **Notifications (C1-D03 remains OPEN):** the bounded M1 demonstration uses durable in-app notifications. The earlier recommendation to require push and email before public launch remains a proposal to decide, not an adopted acceptance gate or a promise to defer every channel to M6. Verification/recovery transport, consent/provider feasibility and launch channels need separate review; inbox read and domain acknowledgment do not prove push/email delivery.
4. **Ordering (C1-D04 remains PROPOSED):** retain the manual synthetic family-reminder slice as the proposed M1 learning milestone, without required Agent code, private health data or provider sends. Retain every public/private/full-MVP obligation and use the milestone recommendation below for planning pending approval.
5. Proposed order: `M0 foundations -> M1 family reminder -> M2 private communication -> M3 public community -> M4 planning completion -> M5 controlled Agent -> M6 release qualification`. Existing exit criteria are in the release plan; a `docs/milestones/` directory or executed milestone is not claimed by this ADR.

| Milestone | Proposed delivery focus | Boundary |
| --- | --- | --- |
| M0 | Scope, contract decisions, design and local foundations | Only approved prerequisites authorize dependent implementation |
| M1 | Manual synthetic family task and one-time in-app reminder on Android/core web | No required Agent code, real care data, push/email proof or full-MVP claim |
| M2 | Private Space types and reliable messaging | Review actual conversation/history/encryption choices before dependent work |
| M3 | Public community and basic discovery | Publication, reporting and moderation gates before exposure |
| M4 | Remaining planning and agreed notification channels | Scope, timing, consent, cancellation and actual delivery evidence |
| M5 | Controlled Agent and memory | Current scope, exact approval, audit and evaluations |
| M6 | Full release qualification | Every agreed MVP outcome and applicable safety/data-rights/operating gate |

## Consequences

- This reconciles the proposal's text, not its approval. C1-D01, C1-D02 and C1-D04 remain PROPOSED; C1-D03, C1-D05 and C1-D06 remain OPEN. The 48 must-have requirements are not silently dropped or claimed complete.
- The blueprint's phase-2/3 features (external messaging, voice, advanced RAG, payments) stay behind their own gates (Ch16/17/20 contracts).
- Record the accountable owner's accepted outcome, rationale and affected contract revisions before implementation commitments. Amend/supersede the applicable ADR through the review process rather than quietly relabeling tickets or treating the proposed sequence as already adopted.

## References

See the [release plan](../CHAPTER_01_RELEASE_PLAN.md), [team plan](../TEAM_ORGANIZATION_EXECUTION_PLAN.md), [delivery draft](../CHAPTER_20_DELIVERY_CONTRACT.md) and unchanged [Chapter 1 source](../Chapter1.md). The source's phase/order conflicts remain traceable; this ADR does not certify complete planning or production readiness.
