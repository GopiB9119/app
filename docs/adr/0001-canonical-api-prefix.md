# ADR-0001 — Canonical API Prefix and Route Ownership

Status: PROPOSED — requires product owner confirmation before OpenAPI generation.

Date: 2026-09-19

## Context

The source and planning documents disagree on the public API prefix:

- [Chapter 18](../../Chapter18.md) §18.23 and the [identity contract](../CHAPTER_18_IDENTITY_CONTRACT.md) §9 use `/api/v1`.
- [Chapter 7](../../Chapter7.md) §7.9, [Chapter 3](../../Chapter3.md) §3.25 and the [API contract](../CHAPTER_07_API_REALTIME_CONTRACT.md) C7-D01 use `/v1` at the public boundary.
- [Chapter 1](../../Chapter1.md) examples use `/api/v1` inconsistently.

C1-D06, C3-D11, C7-D01 and C7-D14 require route reconciliation before dependent clients or OpenAPI artifacts are generated. C18-D06 concerns account/membership/invitation states, not API-prefix approval. Two live prefixes would double the client-generation surface and create ambiguous error/redirect semantics.

## Proposed Decision

Nothing in this section is accepted solely because it appears in an ADR. Technical ownership, affected-client review and required product/security/data-rights approval remain gates.

1. The public API boundary uses the prefix **`/v1`** (for example `POST /v1/spaces/{space_id}/members/invite`).
2. The web origin/host is configured per environment separately; no `/api` path segment is added at the platform boundary.
3. Reconcile Chapter 18's generic-resource and Chapter 3's Space operations into one reviewed route inventory owned by the [API contract](../CHAPTER_07_API_REALTIME_CONTRACT.md). Do not deploy duplicate aliases for the same operation. Exact action names and missing routes are still design deliverables; source inventory is not a complete canonical OpenAPI specification.
4. No automatic alias fleet: `/api/v1/...` is not silently redirected. Unsafely redirected writes (POST/PATCH/DELETE) are forbidden.
5. Internal service-to-service routes may use separate prefixes (for example `/internal/...`) and are never exposed publicly.

## Consequences

- After approval, OpenAPI generation (C7-D13) starts from the selected prefix only; no generated schema or client is delivered by this ADR.
- Re-express approved operations at the canonical boundary while retaining original chapter routes as source evidence. Do not rewrite source quotations merely to make every document spell the same prefix.
- Tickets must cite the owning operation and exact approved contract revision. Prefix approval does not settle authorization, state transitions, WebSocket envelopes or idempotency.

## References

C7-D01, C7-D13, C7-D14, C3-D11 and C1-D06 in the linked owning drafts. See the [identity contract](../CHAPTER_18_IDENTITY_CONTRACT.md) and [Space contract](../CHAPTER_03_SPACE_CONTRACT.md) for domain behavior.
