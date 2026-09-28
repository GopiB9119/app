# ADR-0002 — One Success/Error Response Envelope

Status: PROPOSED — requires product owner confirmation before OpenAPI generation.

Date: 2026-09-19

## Context

Three independently evolving envelope definitions exist in the sources:

- [Chapter 7](../../Chapter7.md) §7.7: `data` + `request_id`, collection `pagination`, or typed `error` (no `error: null` on success).
- [Chapter 9](../../Chapter9.md) §9.11: `data` + `meta` + `error: null` wrapper.
- [Chapter 1](../../Chapter1.md) and [idea.md](../../idea.md) §9: nested `error` object with `code`, `message`, `request_id`.

The [API contract](../CHAPTER_07_API_REALTIME_CONTRACT.md) C7-D02 and the [web contract](../CHAPTER_09_WEB_CONTRACT.md) C9-D05 both require a single source of truth. Clients must match stable machine-readable codes, never human-readable messages.

## Proposed Decision

This recommends an HTTP envelope; it neither approves a wire schema nor creates generated packages. Keep source examples distinguishable from the eventual reviewed contract.

1. Adopt the Chapter 7 §7.7 envelope as the single canonical format:
   - Illustrative success: `{ "data": [], "request_id": "request-example", "pagination": { "next_cursor": null, "has_more": false } }`; omit pagination for non-collection responses.
   - Illustrative error: `{ "error": { "code": "ACCESS_DENIED", "message": "Access denied.", "details": {} }, "request_id": "request-example" }`.
   - No `error: null` field on success responses; no `meta` wrapper.
2. `204 No Content`, raw object-transfer responses and provider protocols remain explicit exceptions.
3. Error code vocabulary is the Chapter 7 §7.8 catalog (`AUTHENTICATION_REQUIRED`, `ACCESS_DENIED`, `IDEMPOTENCY_CONFLICT`, ...), extended only through the Chapter 7 contract.
4. `packages/openapi/` is a proposed schema location, not an existing generated deliverable. Select the versioned schema/runtime validation and Kotlin/TypeScript generation toolchain under C7-D13 before implementation. Generated types do not replace validation of untrusted responses or reviewed adapters for raw/provider exceptions.
5. WebSocket event envelopes, stream identities and replay are governed separately by C7-D08 and C7-D09. [ADR-0003](0003-canonical-state-machines.md) addresses state families, not event-envelope approval; no separate `A-0003` record is claimed.

## Consequences

- The proposed implementation direction avoids a competing `meta`/`error: null` wrapper, while the original source remains unchanged as evidence. Approval is still required before freezing generated clients.
- Future backend/client contract checks must verify normal responses, safe error projection, 204/raw/provider exceptions and compatibility. No CI or runtime validation exists merely because this ADR describes it.

## References

C7-D02, C7-D06, C9-D05, CHAPTER_07 §7–§8.
