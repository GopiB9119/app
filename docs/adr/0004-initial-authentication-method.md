# ADR-0004 — Initial Authentication and Contact Verification Method

Status: PROPOSED - recommends the C18-D01 direction; verification, recovery and delivery choices remain subject to their owning decisions.

Date: 2026-09-19

## Context

Authentication is not approved: C1-D05 is OPEN and the [identity contract](../CHAPTER_18_IDENTITY_CONTRACT.md) marks C18-D01 PROPOSED, not OPEN. This ADR records the same email/password-first recommendation without closing either record. Phone-targeted invitations still require intended-recipient binding; a recycled number is not the identity or sole recovery proof. Phone-only, passkey and social sign-in each need explicit rollout decisions.

## Proposed Decision

1. **Initial sign-in candidate: email + password with verified email.** Use a maintained reviewed password-hashing implementation and calibrated policy under the security/identity contracts; Argon2id is a candidate direction, not an installed or benchmarked configuration. Verification is purpose-bound, expiring and attempt-limited, with numerical limits selected before implementation.
2. **Verified phone may be linked to an existing account** and used as an invitation destination and as one enrolled recovery factor — never as the account primary key (C18-R02) and never as sole recovery proof (C18-D04).
3. **Phone-only sign-in, passkeys, and social/OIDC sign-in are deferred**, each requiring its own rollout decision. OAuth/OIDC, when added, must validate issuer/audience/signature and use a provider-subject mapping; email-only linking is forbidden (Chapter 18 workflow rules).
4. Sessions follow C18 workflow rules: server-revocable checked session handles, not long-lived self-contained JWTs; web uses Secure HttpOnly cookies; Android uses Keystore-backed storage.
5. Recovery requires an enrolled route plus risk/step-up checks (C18-D04 remains OPEN for policy values).
6. Verification/recovery and external invitations require the owning identity/delivery decisions, including C18-D12, provider/legal review and explicit live-test authorization. An initial challenge may need to reach a claimed unverified destination through a narrow approved bootstrap path; it cannot become a reminder/marketing consent bypass. Until approved, synthetic verification is explicitly simulated, not proof of real delivery or intended-recipient identity.

## Consequences

- M1 design can use a labeled verification simulator after the relevant interface/security decisions; no implementation or live-provider evidence is supplied by this ADR.
- The phone-first invitation UX is preserved because invitations target a linked verified phone (with the C18-D03 organizer-confirmation gate for unbound destinations).
- Any future sign-in method must re-evaluate recovery, session revocation and enumeration behavior.

## References

See the [identity contract](../CHAPTER_18_IDENTITY_CONTRACT.md), [security/privacy contract](../CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [delivery review draft](../CHAPTER_20_DELIVERY_CONTRACT.md) and [release plan](../CHAPTER_01_RELEASE_PLAN.md). Current decision statuses remain in those owning records.
