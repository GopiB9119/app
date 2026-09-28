# Chapter 19: Messaging, Delivery and Encryption Contract

Status: DRAFT FOR PRODUCT, MESSAGING, CRYPTOGRAPHY AND SECURITY REVIEW. This is a design and verification plan, not an implemented messaging service, selected cryptographic protocol, audited E2E implementation or tested cross-device recovery system.

Document role: working Chapter 19 review reference, not an approved canonical specification. The [reconciliation index](CONTRACT_RECONCILIATION.md) maps the retained [alternate messaging proposal](CHAPTER_19_CONVERSATIONS_ENCRYPTION_CONTRACT.md) without deleting it or equating its local C19 identifiers with these. All policy statuses and implementation gates remain unchanged.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md), [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [file/document](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md), [discovery](CHAPTER_15_DISCOVERY_RANKING_CONTRACT.md), [trust operations](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) and [event planning](CHAPTER_17_EVENT_COLLABORATION_CONTRACT.md) drafts. It develops C17-T12 into conversation authority, durable messaging, device/key boundaries and scoped synchronization.

- [Chapter 19](../Chapter19.md) is the source owner. [Chapter 20](../Chapter20.md) remains the notification/provider detail owner. Conversation participation, parent Space/event membership, device enrollment, cryptographic membership, Agent delegation and notification consent are distinct authorities.
- Source Chapter 19 contains thirty-four numbered sections and ends at [19.34.4 Encryption Failure](../Chapter19.md#L2047) with 'Do not send plaintext as fallback'. There is no completed final architecture/acceptance list after it. Added workflows, tests and release gates are proposed refinements, not recovered source text.
- Server-readable encrypted storage is not true E2E. Endpoint-only keys prevent ordinary backend plaintext processing; server-side search, scanning, moderation and Agent features must respect that constraint instead of silently decrypting or downgrading a conversation.
- M1 remains the synthetic ordinary family task and one-time in-app reminder. A later messaging or E2E demonstration is a separate slice, not an added M1 prerequisite or evidence that the complete MVP exists. Selecting a first messaging mode does not approve every conversation's encryption default or the product's security claims.
- Preserve all original sources and earlier drafts. Continued planning does not authorize application code, packages, real chats/keys/contacts, device enrollment, model/provider calls, network/security changes, provisioning, spending or deployment.
- All messaging, database, cryptographic protocol/library, device, browser, transport, notification and security tests are NOT RUN. Document checks and finite synthetic state checks cannot prove cryptographic security, delivery reliability, privacy or production readiness.

## 2. Exact Source Topics and Principles

All thirty-four numbered topic titles and anchors are retained, including the first topic's different heading depth.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C19-S01 | Purpose and Scope | [19.1](../Chapter19.md#L3) |
| C19-S02 | Communication Domain Principles | [19.2](../Chapter19.md#L65) |
| C19-S03 | Communication Model | [19.3](../Chapter19.md#L93) |
| C19-S04 | Conversation Lifecycle | [19.4](../Chapter19.md#L157) |
| C19-S05 | Conversation Membership | [19.5](../Chapter19.md#L258) |
| C19-S06 | Message Model | [19.6](../Chapter19.md#L343) |
| C19-S07 | Message Sending Flow | [19.7](../Chapter19.md#L408) |
| C19-S08 | Idempotency and Duplicate Prevention | [19.8](../Chapter19.md#L446) |
| C19-S09 | Message Ordering | [19.9](../Chapter19.md#L486) |
| C19-S10 | Delivery and Read States | [19.10](../Chapter19.md#L534) |
| C19-S11 | Offline-First Messaging | [19.11](../Chapter19.md#L610) |
| C19-S12 | Realtime Transport | [19.12](../Chapter19.md#L667) |
| C19-S13 | Realtime Event Envelope | [19.13](../Chapter19.md#L739) |
| C19-S14 | Presence Architecture | [19.14](../Chapter19.md#L785) |
| C19-S15 | Typing Indicators | [19.15](../Chapter19.md#L853) |
| C19-S16 | End-to-End Encryption Architecture | [19.16](../Chapter19.md#L894) |
| C19-S17 | E2E Encryption Modes | [19.17](../Chapter19.md#L916) |
| C19-S18 | Encryption Key Architecture | [19.18](../Chapter19.md#L1000) |
| C19-S19 | Message Metadata and Privacy | [19.19](../Chapter19.md#L1062) |
| C19-S20 | Attachments and Media | [19.20](../Chapter19.md#L1106) |
| C19-S21 | Message Editing and Deletion | [19.21](../Chapter19.md#L1170) |
| C19-S22 | Reactions, Replies, Threads, and Mentions | [19.22](../Chapter19.md#L1202) |
| C19-S23 | Agent Messaging Architecture | [19.23](../Chapter19.md#L1270) |
| C19-S24 | Moderation and Reporting | [19.24](../Chapter19.md#L1356) |
| C19-S25 | Search Architecture | [19.25](../Chapter19.md#L1415) |
| C19-S26 | Notification Architecture | [19.26](../Chapter19.md#L1453) |
| C19-S27 | APIs | [19.27](../Chapter19.md#L1508) |
| C19-S28 | Database Model | [19.28](../Chapter19.md#L1604) |
| C19-S29 | Android Screens | [19.29](../Chapter19.md#L1666) |
| C19-S30 | Web/Desktop Screens | [19.30](../Chapter19.md#L1749) |
| C19-S31 | Performance and Scaling | [19.31](../Chapter19.md#L1793) |
| C19-S32 | Security Architecture | [19.32](../Chapter19.md#L1866) |
| C19-S33 | Observability | [19.33](../Chapter19.md#L1936) |
| C19-S34 | Failure Handling | [19.34](../Chapter19.md#L2003) |

All twelve numbered communication principles in section 19.2 are preserved verbatim.

| ID | Source principle |
| --- | --- |
| C19-R01 | Messages belong to a conversation. |
| C19-R02 | Conversations belong to a communication scope. |
| C19-R03 | Every participant has an explicit membership or authorization relationship. |
| C19-R04 | Message ordering is scoped to a conversation. |
| C19-R05 | Delivery state is separate from read state. |
| C19-R06 | Presence is ephemeral and must not be treated as permanent data. |
| C19-R07 | Attachments are separate objects with independent authorization. |
| C19-R08 | Agents receive only explicitly authorized context. |
| C19-R09 | End-to-end encryption and server-side agent processing require a deliberate cryptographic design. |
| C19-R10 | Message sending must be idempotent. |
| C19-R11 | Realtime delivery must be recoverable through synchronization. |
| C19-R12 | Deleted or edited messages must have defined behavior for caches, search indexes, notifications, and exports. |

## 3. Exact Conversation and Authority Inventory

The source conversation type and visibility inventories are preserved. They mix scope, audience and lifecycle concepts; canonical policy must keep those dimensions distinct.

| Source list | Values in source order |
| --- | --- |
| Conversation types, 19.3.1 | direct, group, family, couple, custom, event, page_discussion, announcement, agent, agent_human, agent_group, system |
| Conversation visibility, 19.3.2 | private, members_only, public, restricted, temporary, archived |

All eight state/meaning pairs in section 19.4.1 are retained. Source code formatting on state names is omitted in the table. The separate lifecycle sketch also includes CREATED, which is not in this table; resolve that mismatch before generating a state machine. Personal mute, conversation lock, membership expiry and ordinary archive are not equivalent security states.

| ID | Source state | Source meaning |
| --- | --- | --- |
| C19-L01 | draft | Not yet visible to participants |
| C19-L02 | active | Messages may be sent |
| C19-L03 | muted | Notification behavior changed |
| C19-L04 | restricted | Posting limited to selected roles |
| C19-L05 | locked | No new messages allowed |
| C19-L06 | archived | Historical conversation |
| C19-L07 | deleted | Conversation removed according to policy |
| C19-L08 | temporary | Automatically expires |

All nine participant-role names and fifteen permission strings from section 19.5 are retained. A public viewer, Agent or system actor is not implicitly a privileged human participant.

| ID | Source participant role |
| --- | --- |
| C19-G01 | owner |
| C19-G02 | admin |
| C19-G03 | moderator |
| C19-G04 | organizer |
| C19-G05 | member |
| C19-G06 | guest |
| C19-G07 | viewer |
| C19-G08 | agent |
| C19-G09 | system |

| ID | Source permission |
| --- | --- |
| C19-U01 | conversation.view |
| C19-U02 | conversation.send |
| C19-U03 | conversation.reply |
| C19-U04 | conversation.edit_own |
| C19-U05 | conversation.delete_own |
| C19-U06 | conversation.delete_any |
| C19-U07 | conversation.add_member |
| C19-U08 | conversation.remove_member |
| C19-U09 | conversation.change_roles |
| C19-U10 | conversation.pin_message |
| C19-U11 | conversation.manage_settings |
| C19-U12 | conversation.attach_files |
| C19-U13 | conversation.start_agent_run |
| C19-U14 | conversation.manage_agent |
| C19-U15 | conversation.view_audit |

Permissions require current account/restriction, conversation and parent membership/history, target-sensitive role rules, block policy, message classification and Agent delegation. Device enrollment and possession of decryption keys are separate checks; an authorized database row alone does not prove either. A user who leaves and rejoins cannot receive old history merely because a prior participant ID still exists.

Additional source inventories retain their exact values and order. Message outcome, local transfer state, cryptographic usability, recipient read state and expiry are separate dimensions rather than a universally increasing single enum.

| Source list | Values in source order |
| --- | --- |
| Message types, 19.6.2 | text, image, video, audio, file, location, poll, event_reference, task_reference, budget_reference, system, agent_status, approval_request, approval_result, call_event, membership_event, announcement |
| Message states, 19.10.1 | pending, accepted, sent, delivered, read, failed, deleted, expired |
| Local message states, 19.11.1 | local_draft, queued, sending, accepted, delivered, read, retrying, failed |
| WebSocket connection states, 19.12.2 | CONNECTING, AUTHENTICATING, CONNECTED, SUBSCRIBED, RECONNECTING, REAUTHENTICATING, CLOSED, FAILED |
| Presence states, 19.14.1 | online, away, busy, do_not_disturb, offline, invisible |
| Agent progress labels, 19.15 | thinking, retrieving, waiting_for_approval, executing_tool, composing, completed |
| Deletion types, 19.21.2 | delete_for_me, delete_for_everyone, moderator_remove, retention_expired, temporary_message_expired |
| Agent participant types, 19.23.1 | personal_agent, family_agent, couple_agent, community_agent, event_agent, moderation_agent, notification_agent, system_agent |
| Agent output types, 19.23.4 | informational_reply, draft_message, task_proposal, event_proposal, reminder_proposal, approval_request, tool_result, escalation_notice, error_notice |

All twenty-five core table names from section 19.28 are retained. `presence_states` and `typing_states` conflict with interpreting the earlier ephemeral-only text as durable heartbeat tables; proposed resolution keeps live presence/typing in bounded expiring storage and persists only separately approved preferences, not every heartbeat. Table names are conceptual, not applied DDL.

| ID | Source table |
| --- | --- |
| C19-N01 | conversations |
| C19-N02 | conversation_participants |
| C19-N03 | conversation_roles |
| C19-N04 | conversation_settings |
| C19-N05 | messages |
| C19-N06 | message_versions |
| C19-N07 | message_delivery |
| C19-N08 | message_reactions |
| C19-N09 | message_mentions |
| C19-N10 | message_attachments |
| C19-N11 | message_reports |
| C19-N12 | conversation_events |
| C19-N13 | message_outbox |
| C19-N14 | message_retention_policies |
| C19-N15 | devices |
| C19-N16 | device_keys |
| C19-N17 | conversation_keys |
| C19-N18 | key_distribution_events |
| C19-N19 | presence_states |
| C19-N20 | typing_states |
| C19-N21 | agent_participants |
| C19-N22 | agent_message_links |
| C19-N23 | agent_run_messages |
| C19-N24 | notification_preferences |
| C19-N25 | notification_deliveries |

The seven recommended index expressions in section 19.28.1 are retained. Required uniqueness, composite same-parent foreign keys, actor identity and current authorization need additional design; an ordinary index is not a constraint or permission check.

| ID | Source index expression |
| --- | --- |
| C19-I01 | messages(conversation_id, conversation_sequence) |
| C19-I02 | messages(conversation_id, created_at) |
| C19-I03 | messages(sender_account_id, created_at) |
| C19-I04 | conversation_participants(account_id, status) |
| C19-I05 | message_delivery(message_id, participant_id) |
| C19-I06 | message_reactions(message_id) |
| C19-I07 | message_mentions(account_id, created_at) |

## 4. Exact Encryption Mode and Key Inventory

The three section 19.17 mode headings are preserved verbatim.

| ID | Source encryption mode |
| --- | --- |
| C19-M01 | Standard Server-Readable Mode |
| C19-M02 | True E2E Mode |
| C19-M03 | E2E with Agent Participation |

Server-readable mode encrypts transport/storage but permits authorized backend plaintext. True E2E confines decryption keys to approved endpoints and therefore does not provide ordinary server-side plaintext search, scanning or universal recovery. The Agent-participation label needs an explicit endpoint/disclosure design and honest claims about who can read content.

All three Agent participation alternatives from section 19.17.3 are retained as separate design/label columns, replacing the source typographic dash. They are alternatives requiring review, not capabilities to enable simultaneously by default.

| ID | Source design | Source label |
| --- | --- | --- |
| C19-F01 | Design A | Agent as an Authorized Conversation Device |
| C19-F02 | Design B | User-Approved Message Forwarding |
| C19-F03 | Design C | Local Agent Processing |

The seven conceptual key-type labels in section 19.18.1 are retained. Actual protocol key hierarchy/storage is defined by the selected reviewed implementation; these are not seven mandatory raw-key database columns or instructions to invent cryptography.

| ID | Source key type |
| --- | --- |
| C19-B01 | account identity key |
| C19-B02 | device key |
| C19-B03 | conversation key |
| C19-B04 | message encryption key |
| C19-B05 | attachment key |
| C19-B06 | agent device key |
| C19-B07 | backup key |

The source encryption-key metadata example contains `encrypted_private_key`. It does not authorize storing usable endpoint private keys on the ordinary backend. Storage location, wrapping/recovery material and who can decrypt it determine the actual boundary; an encrypted field alone does not establish E2E or user-controlled recovery.

### API and Event Inventories

The twenty-nine method/path pairs in section 19.27 are preserved with whitespace normalized to one separator. The source omits `/v1`; reconcile with Chapter 7's proposed canonical prefix rather than deploy a duplicate unversioned API. Encryption routes describe authorized orchestration/metadata, not a server right to generate or disclose every participant's private keys.

| ID | Source operation |
| --- | --- |
| C19-P01 | `POST /conversations` |
| C19-P02 | `GET /conversations` |
| C19-P03 | `GET /conversations/{id}` |
| C19-P04 | `PATCH /conversations/{id}` |
| C19-P05 | `DELETE /conversations/{id}` |
| C19-P06 | `POST /conversations/{id}/archive` |
| C19-P07 | `POST /conversations/{id}/lock` |
| C19-P08 | `POST /conversations/{id}/unlock` |
| C19-P09 | `GET /conversations/{id}/participants` |
| C19-P10 | `POST /conversations/{id}/participants` |
| C19-P11 | `DELETE /conversations/{id}/participants/{account_id}` |
| C19-P12 | `PATCH /conversations/{id}/participants/{account_id}` |
| C19-P13 | `POST /conversations/{id}/leave` |
| C19-P14 | `GET /conversations/{id}/messages` |
| C19-P15 | `POST /conversations/{id}/messages` |
| C19-P16 | `GET /messages/{id}` |
| C19-P17 | `PATCH /messages/{id}` |
| C19-P18 | `DELETE /messages/{id}` |
| C19-P19 | `POST /messages/{id}/reactions` |
| C19-P20 | `DELETE /messages/{id}/reactions/{reaction}` |
| C19-P21 | `POST /messages/{id}/report` |
| C19-P22 | `POST /conversations/{id}/read` |
| C19-P23 | `POST /conversations/{id}/delivered` |
| C19-P24 | `GET /conversations/{id}/unread-count` |
| C19-P25 | `POST /devices/{id}/keys` |
| C19-P26 | `GET /conversations/{id}/encryption-metadata` |
| C19-P27 | `POST /conversations/{id}/key-rotation` |
| C19-P28 | `POST /conversations/{id}/devices` |
| C19-P29 | `DELETE /conversations/{id}/devices/{device_id}` |

All twenty event categories and eight example envelope field names from section 19.13 are preserved. Message sequence is not a sufficient unique position for edits, receipts, membership and ephemeral events; the canonical Chapter 7 event schema remains the reconciliation owner.

| ID | Source event category |
| --- | --- |
| C19-E01 | message.created |
| C19-E02 | message.updated |
| C19-E03 | message.deleted |
| C19-E04 | message.reaction_added |
| C19-E05 | message.reaction_removed |
| C19-E06 | message.delivery_updated |
| C19-E07 | message.read_updated |
| C19-E08 | conversation.created |
| C19-E09 | conversation.updated |
| C19-E10 | conversation.member_added |
| C19-E11 | conversation.member_removed |
| C19-E12 | conversation.locked |
| C19-E13 | typing.started |
| C19-E14 | typing.stopped |
| C19-E15 | presence.updated |
| C19-E16 | agent.run_started |
| C19-E17 | agent.run_updated |
| C19-E18 | agent.run_completed |
| C19-E19 | approval.requested |
| C19-E20 | approval.completed |

| ID | Source envelope field |
| --- | --- |
| C19-A01 | event_id |
| C19-A02 | event_type |
| C19-A03 | event_version |
| C19-A04 | conversation_id |
| C19-A05 | conversation_sequence |
| C19-A06 | occurred_at |
| C19-A07 | correlation_id |
| C19-A08 | payload |

The three WebSocket command examples in section 19.27.6 have the following exact type values. Section 19.12 additionally uses `connection.resume` and `sync.required` for recovery. The source `typing.start` command versus `typing.started` event is an intentional command/event distinction to preserve, not an interchangeable alias.

| ID | Source WebSocket command type |
| --- | --- |
| C19-O01 | subscribe |
| C19-O02 | typing.start |
| C19-O03 | read.update |

### Client and Security Inventories

The eleven Android conversation labels and nineteen chat-component labels in section 19.29 are retained with their categories.

| ID | Source category | Source Android surface |
| --- | --- | --- |
| C19-C01 | Conversation Screens | Conversation list |
| C19-C02 | Conversation Screens | Direct chat |
| C19-C03 | Conversation Screens | Group chat |
| C19-C04 | Conversation Screens | Family chat |
| C19-C05 | Conversation Screens | Couple chat |
| C19-C06 | Conversation Screens | Event chat |
| C19-C07 | Conversation Screens | Public discussion |
| C19-C08 | Conversation Screens | Agent chat |
| C19-C09 | Conversation Screens | Announcement feed |
| C19-C10 | Conversation Screens | Archived conversations |
| C19-C11 | Conversation Screens | Muted conversations |
| C19-C12 | Chat Components | Message list |
| C19-C13 | Chat Components | Message composer |
| C19-C14 | Chat Components | Reply preview |
| C19-C15 | Chat Components | Attachment picker |
| C19-C16 | Chat Components | Upload progress |
| C19-C17 | Chat Components | Voice recording interface |
| C19-C18 | Chat Components | Emoji/reaction picker |
| C19-C19 | Chat Components | Mention selector |
| C19-C20 | Chat Components | Thread view |
| C19-C21 | Chat Components | Read receipt indicator |
| C19-C22 | Chat Components | Delivery status |
| C19-C23 | Chat Components | Typing indicator |
| C19-C24 | Chat Components | Agent status indicator |
| C19-C25 | Chat Components | Approval card |
| C19-C26 | Chat Components | Task/event preview card |
| C19-C27 | Chat Components | Message search |
| C19-C28 | Chat Components | Conversation settings |
| C19-C29 | Chat Components | Member list |
| C19-C30 | Chat Components | Encryption information |

The eight local-data names from section 19.29.3 and eight literal web routes from section 19.30 are preserved. Room does not itself encrypt stored content, and browser offline persistence remains a separate privacy/product decision under Chapter 9.

| ID | Source Android local record |
| --- | --- |
| C19-J01 | LocalConversation |
| C19-J02 | LocalParticipant |
| C19-J03 | LocalMessage |
| C19-J04 | LocalAttachment |
| C19-J05 | LocalReaction |
| C19-J06 | LocalOutboxMessage |
| C19-J07 | LocalSyncCursor |
| C19-J08 | LocalReadState |

| ID | Source web route |
| --- | --- |
| C19-H01 | `/messages` |
| C19-H02 | `/messages/{conversation_id}` |
| C19-H03 | `/messages/{conversation_id}/search` |
| C19-H04 | `/messages/{conversation_id}/members` |
| C19-H05 | `/messages/{conversation_id}/settings` |
| C19-H06 | `/messages/{conversation_id}/encryption` |
| C19-H07 | `/messages/{conversation_id}/files` |
| C19-H08 | `/messages/{conversation_id}/threads` |

The source desktop areas are `Conversation Sidebar`, `Main Chat Area`, `Context Panel`. Preserve their workflow intent while reconciling the source route examples with Chapter 9's workspace shell and actual framework parameter syntax; a separate route/bottom sheet replaces the context panel on mobile widths.

All fifteen threat labels and seventeen required-control labels from section 19.32 are preserved. Threats are design risks, not observed vulnerabilities in a running product.

| ID | Source threat |
| --- | --- |
| C19-X01 | Unauthorized message reading |
| C19-X02 | Conversation enumeration |
| C19-X03 | Session theft |
| C19-X04 | Replay attacks |
| C19-X05 | Duplicate message injection |
| C19-X06 | WebSocket hijacking |
| C19-X07 | Malicious attachments |
| C19-X08 | Metadata leakage |
| C19-X09 | Group membership abuse |
| C19-X10 | Agent context leakage |
| C19-X11 | Push notification exposure |
| C19-X12 | Encryption key theft |
| C19-X13 | Malicious client modification |
| C19-X14 | Message deletion abuse |
| C19-X15 | Spam and flooding |

| ID | Source required control |
| --- | --- |
| C19-Q01 | Server-side authorization |
| C19-Q02 | Secure session validation |
| C19-Q03 | WebSocket authentication |
| C19-Q04 | Conversation membership checks |
| C19-Q05 | Message size limits |
| C19-Q06 | Rate limiting |
| C19-Q07 | Idempotency |
| C19-Q08 | Attachment scanning |
| C19-Q09 | Encryption key rotation |
| C19-Q10 | Secure device registration |
| C19-Q11 | Audit logs for administrative actions |
| C19-Q12 | Sensitive notification redaction |
| C19-Q13 | Abuse detection |
| C19-Q14 | Block and report enforcement |
| C19-Q15 | Agent scope validation |
| C19-Q16 | Replay protection |
| C19-Q17 | Secure event sequence handling |

Attachment scanning must be interpreted with actual plaintext availability. An ordinary server scanner cannot inspect an opaque true-E2E payload; that source requirement needs a disclosed mode-specific safety design, not a fabricated clean verdict or automatic plaintext upload.

## 5. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C19-D01 | Conversation authority and history | Explicit typed conversation/parent/participant/device context, current admission epochs and history grants; visibility and group membership alone do not confer all message/key access. | PROPOSED |
| C19-D02 | Durable message acceptance | One scoped logical send identity and canonical message/sequence/receipt, committed with required outbox/audit before acknowledgment; fanout failure does not undo persisted truth. | PROPOSED |
| C19-D03 | Transport contract | Carry Chapter 7's REST-first durable writes and WebSocket updates/replay; source WS write commands need reconciliation before optional enablement through the same service and idempotency contract. | PROPOSED |
| C19-D04 | Receipt facts | Separate persisted, recipient-device received, decrypted/usable, user-read and business acknowledgment facts; aggregate only according to a reviewed explicit policy without filling gaps blindly. | PROPOSED |
| C19-D05 | Cryptographic protocol and implementation | Select maintained independently reviewed protocol/libraries for direct/group/multi-device Android/web, compatible versions, licensing, threat model and test vectors. No custom cipher, ratchet or key-exchange implementation. | OPEN |
| C19-D06 | Mode defaults and transitions | Decide modes per conversation type, default/user choice, verification UX and permitted migrations. No silent plaintext fallback, downgrade or claim that server-readable storage is E2E. | OPEN |
| C19-D07 | Device and cryptographic membership | Bind authorized device enrollment/verification and roster/epoch changes to current conversation membership; removal/revocation blocks new disclosure and requires the selected protocol's forward key change. | PROPOSED |
| C19-D08 | History, backup and account recovery | Choose cross-device history, lost-device/key handling, recovery custody, retention and explicit limits. Account recovery must not silently reconstruct keys the service never possessed. | OPEN |
| C19-D09 | Agent access to encrypted content | Select no access or a reviewed explicit endpoint/selected-forwarding/local design with informed current consent, bounded context and provider/retention policy. A bot role is not a decryption grant. | OPEN |
| C19-D10 | Editing, deletion and reporting | Authorize exact message revisions and source relationships, separate local hide/global tombstone/retention, and use case-scoped reporting with honest limits on already delivered plaintext. | PROPOSED |
| C19-D11 | Attachments and search | Reuse immutable file lineage and current scope; server-readable processing and opaque encrypted attachments/local search follow different capability paths, not an automatic scan bypass. | PROPOSED |
| C19-D12 | Presence, receipts and push privacy | Set per-user/conversation audience/defaults/retention, group aggregation, multi-device expiry and notification previews; online/typing/read telemetry is optional, sensitive and not reliable availability proof. | OPEN |
| C19-D13 | Offline and client reconciliation | Account/environment/session isolation, stable pending identity, atomic data-plus-cursor/outbox and compatible cryptographic-state persistence; reconnect does not replay under stale authority. | PROPOSED |
| C19-D14 | Operating and verification limits | Select rates/message/history/device/group/ciphertext bounds, protocol/state upgrade policy, retention, SLOs, recovery and actual security/durability evidence before enabling the scope. | OPEN |

These eight proposals and six open choices remain unapproved. Feature pressure, an owner request, an Agent role or a retry cannot override required authorization, turn missing keys into plaintext access or establish cryptographic guarantees without real implementation evidence.

## 6. Durable Ownership, Identity and Ordering

### Separate Canonical Records

| Record group | Source tables | Required refinement |
| --- | --- | --- |
| Conversation and participation | C19-N01, C19-N02, C19-N03, C19-N04 | Typed parent/scope, lifecycle/mute separation, actual human/Agent/system principal, admission epochs/history and current role/restriction policy. |
| Message and revision | C19-N05, C19-N06 | Immutable accepted identity/content revision, canonical sender/acting attribution, original message sequence, controlled edit/tombstone and mode-specific body representation. |
| Receipts and interactions | C19-N07, C19-N08, C19-N09 | Actor/device/participant binding, receipt coverage/privacy, same-conversation message relationships and stable idempotent reaction/mention effects. |
| Attachments and reports | C19-N10, C19-N11 | Immutable authorized file/version/key reference and separately consented case-scoped submitted evidence. Neither grants access to unrelated content. |
| Durable events/work and retention | C19-N12, C19-N13, C19-N14 | Committed ordered projection, stable logical work/consumer receipts, tombstones and source/history-aware retention/deletion. |
| Devices/crypto membership | C19-N15, C19-N16, C19-N17, C19-N18 | Authenticated device records, protocol-defined public/encrypted artifacts, epoch/configuration and delivery custody. Private key location is a reviewed trust decision. |
| Ephemeral status | C19-N19, C19-N20 | Short-lived per-device/status leases and privacy preferences; no durable global heartbeat history by default. |
| Agent linkage | C19-N21, C19-N22, C19-N23 | Explicit Agent/delegation/run/effect attribution and minimal authorized context; bot membership is not universal plaintext access. |
| Notification projections | C19-N24, C19-N25 | Reuse Chapter 20's canonical preference/delivery history, current device bindings, redaction and consent rather than duplicate provider logic. |

Distinguish logical message identity, content version, conversation message sequence, event-stream position, participant admission epoch, cryptographic membership/ratchet epoch and transport attempt. The same accepted message can cause later edit/read/deletion events; one message sequence cannot uniquely order all of them. Chapter 7 owns versioned event envelopes and opaque scope-bound resume cursors. Use exact integer-string sequence/revision wire types where required, never rely on JavaScript double precision or a client timestamp.

The source uniqueness tuple `conversation_id + sender_account_id + client_message_id` needs a non-null canonical sender identity covering human, Agent and system messages. Nullable account IDs can defeat SQL uniqueness; page/organization acting attribution is not a replacement for the actual actor/delegation. Reuse the reviewed actor mapping from Chapter 6. If both HTTP idempotency key and client message ID exist, bind them to one validated logical intent/receipt rather than create two unrelated deduplication paths.

Replies, thread roots, reactions, mentions, attachments and edits must bind their actual conversation/message/source using composite constraints where appropriate. Existence of a referenced row, ciphertext blob, key ID or opaque message ID does not establish current access. A reply cannot reveal a hidden historical quote or link an unrelated conversation by guessing IDs.

### Messaging Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C19-K01 | Current conversation and parent authority governs every path. | Actor/device/participant/epoch/history/role/block/restriction and actual source on HTTP, WS, workers, receipts, search, files, export and tools. |
| C19-K02 | Accepted logical messages are durable and idempotent. | Stable non-null sender/intent identity, immutable receipt and atomic message/sequence/outbox plus required audit; no duplicate notification/Agent effects. |
| C19-K03 | Ordering and sync positions have precise meanings. | Commit-safe per-conversation message order, separate durable event position, exact values, authorized history and snapshot/replay barrier. |
| C19-K04 | Client state and pending work commit coherently. | Stable local/canonical mapping, data-plus-cursor/outbox and protocol state handling across crash/retry/account switch, without destructive pending-data migration. |
| C19-K05 | Receipt facts are scoped, bounded and honest. | Current recipient device/participant and actual received/read coverage; no maximum-sequence shortcut over unknown gaps or provider-push-as-read claim. |
| C19-K06 | Ephemeral metadata and notifications respect privacy. | Expiring multi-device presence/typing leases, current audience/opt-out and minimal push; absence is unknown, not proof of human availability. |
| C19-K07 | Encryption mode is explicit and cannot silently downgrade. | Verified compatible mode/protocol and no plaintext fallback on missing keys, unsupported versions, scan/search demand or Agent failure. |
| C19-K08 | Crypto uses reviewed implementations with protected state. | Maintained protocol/library, authenticated context, CSPRNG/nonce/state behavior and tested crash/concurrency/upgrade rules; no custom cryptography. |
| C19-K09 | Device and cryptographic membership changes are authenticated. | Verified enrollment/identity/roster update, current domain epoch and protocol rekey/recipient validation at the defined boundary. |
| C19-K10 | History and recovery disclose their real key limits. | Explicit old/new-device history grant, key custody/backup/identity reset and honest forward-secrecy/compromise/deletion claims. |
| C19-K11 | Mutations preserve exact source/version authority. | Controlled edits, per-user hides, global tombstones, same-conversation interactions and current projection/retention, not impossible recall. |
| C19-K12 | Media and search follow the actual plaintext boundary. | Immutable file versions/current ACL; mode-aware scanning/local indexing and no private plaintext derivatives on a ciphertext-only backend. |
| C19-K13 | Agent access is an explicit scoped disclosure. | Named endpoint or selected forwarding/local processing with current consent/provider policy; no hidden full-history key access or reasoning traces. |
| C19-K14 | Reporting and retained evidence are purpose-limited. | Selected submission, safe file handling, case authority and privacy lineage; a report does not unlock unrelated messages or E2E keys. |
| C19-K15 | APIs and clients show domain truth and current security context. | Canonical schemas, actual sender/mode/device warnings, pending/conflict/decryption states, authorized replay and accessible controls. |
| C19-K16 | Operations and recovery preserve authority and cryptographic state. | Bounded load/retention, private audit/metrics, current revocations/tombstones and safe key-state recovery before new effects. |

## 7. Conversation Membership and Message Acceptance

### C19-W01 Create or Change a Conversation's Authorized Audience

Create a typed conversation only under current owning account/Space/page/event authority and selected supported mode. Public viewing can be intentionally anonymous where allowed, but posting/reply/attachment/mention/Agent actions have explicit rules. Direct conversation uniqueness, duplicate creation and block policy must be specified without exposing hidden relationships. Source family/couple/event labels do not authorize every resource or expand the parent Space's human capacity/history rules.

Separate personal mute/notification preference from shared lock/restriction, archive and expiry. Define target-aware owner/admin/moderator transfer and membership commands; an admin cannot self-escalate into another subject's files, keys or private memory. Adding an Agent/system participant requires a real non-human principal and delegation, not a null actor or a human disguised to bypass roster rules. Source CREATED versus table ACTIVE and TEMPORARY visibility/lifecycle overlap remain schema decisions, not implicit defaults.

Record each admission/leave/rejoin interval and the history policy that applies to that participant and device. Parent membership is necessary where policy says so, but does not automatically join every conversation. Reads, list previews, counts, quotes, pins, threads, attachments, search and event replay must respect the actual conversation history boundary. An old invitation or participant row cannot reactivate a removed membership or disclose pre-rejoin history automatically.

Serialize membership/role/restriction changes with the relevant send/admission decision boundary. Current removal or expiry blocks new disallowed sends and fanout/download/read access even if caches/cleanup lag; a client socket subscription is not permanent authority. Crypto membership and key changes must align with that boundary under C19-W06: domain removal alone does not erase a previously received key or plaintext. Do not make the product promise depend only on an asynchronous 'rotate later' worker.

### C19-W02 Commit One Canonical Send Before Fanout

Validate current session/device, sender and acting attribution/delegation, conversation/parent/history policy, send permission, block/restriction, mode/epoch and bounded typed payload/attachments/reply references. Never let a client choose another sender, forge a system/approval result, change encryption mode or claim an attachment is clean. Opaque E2E ciphertext can be checked for envelope/size/protocol metadata and authority; the server cannot pretend to validate its plaintext meaning.

Bind the logical send identity to canonical validated immutable intent and its permitted protected digest/representation. A retry of the same accepted intent yields the currently authorized receipt; same key with materially different ciphertext/envelope/content intent conflicts. Do not use a plaintext hash as a public E2E dedup key, since low-entropy messages can be guessed. Non-null actor constraints cover Agent/system senders, and the local client message ID remains stable across HTTP/network/worker attempts.

Within a short transaction, arbitrate idempotency, assign commit-safe per-conversation order, persist message/current revision and required audit/outbox/work intent, then acknowledge accepted state. A counter reserved outside commit ordering is insufficient: a later sequence must not be exposed as a sync barrier while a lower allocated sequence can commit afterward unseen. Use a reviewed serialized conversation allocator/commit protocol or an equivalent log with tested ordering; harmless documented gaps are different from late invisible commits. No platform-global total order is required.

After durable acceptance, fan out through authorized recipient/device projections and schedule notifications/Agent processing with stable effect IDs. Lost broker publish or server crash is recovered from durable work/reconciliation, not only an outbox 'published' flag. Consumer duplicates do not create another logical message, notification or Agent reply. Do not roll back a committed message because WS fanout failed; it remains visible through currently authorized history APIs.

An acceptance timeout is unknown to the client, not proof of rejection. Reconcile via original logical ID/receipt before minting another ID, retransmitting with different encryption or presenting a message as unsent. Receipt expiry/deletion policy must define what can be safely deduplicated or reconciled without disclosing content to a revoked sender. A protocol-authorized re-encryption or recipient-envelope update needs an explicit controlled supersession contract after resolving the old attempt, not blind changed-payload reuse.

## 8. Offline Synchronization, Receipts and Ephemeral State

### C19-W03 Persist Local Intent and Recover an Authorized Stream

Isolate account/environment/session generation, conversation admission context and key/device state in local repositories. Android Room renders stable local message identity and persists pending intent/outbox atomically; the source 'replace temporary ID' must not lose attachment/reply links or duplicate a bubble when REST and WS arrive in either order. Merge with server-confirmed client-ID/canonical-ID mapping and version, not text/timestamp guesses or blind database replacement.

For E2E, the selected library's ratchet/counter/nonce update, sealed outbound bytes and local outbox/receipt state must have a crash-safe coordinated persistence strategy. Do not regenerate ciphertext with reused key/nonce state, resend under a new logical ID after uncertainty, or roll back crypto state from a backup as though no message was sent. Concurrent tabs/processes/devices require the library's supported ownership/serialization model, not shared mutable cryptographic sessions. The actual protocol integration must be tested; this document does not supply a ratchet implementation.

Reconnect through authenticated WS with scoped subscriptions, bounded backoff/jitter and backpressure. Browser Origin/CSRF/ticket/session handling follows Chapter 7; no long-lived bearer in URLs. Resume from the appropriate authorized durable event cursor, not the numeric `conversation_sequence` of the last visible message or a global `last_event_sequence` example blindly trusted across accounts. Membership/role/expiry/retention changes may invalidate or narrow replay; unauthorized IDs cannot obtain a global resync manifest.

If history expired, obtain a consistent authorized snapshot/event barrier and paginate bounded history before advancing the selected sync state. Apply rows/versions/tombstones and cursor atomically; a crash after cursor advance but before data cannot be allowed to skip events. Event-stream sequence is separate from original message order, so edits, membership changes and read-state updates do not disappear behind a 'last message' counter. Do not infer all missing integers are messages the participant may see.

Separate received sealed content from successfully decrypted/renderable content. Durable ciphertext and transport progress can be recorded without falsely marking readable/read; keep an explicit pending-decryption/missing-key repair path tied to the exact message/version/epoch. If schema/authentication validation is not safe to preserve, do not silently advance over a required unprocessed event. Tombstones/expiry remain effective during key recovery, and bounded bad-message handling must not become plaintext fallback or an infinite retry loop.

Web memory-only caches cannot persist a resume cursor without the matching data; optional encrypted/offline IndexedDB and sensitive draft retention need the Chapter 9 policy. Logout/key loss/removed membership must produce explicit pending or blocked states and stop stale attempts, while an authorized recoverable outage does not silently erase queued text. WorkManager/browser reconnect is not an exact always-running service, and force-stop/uninstall or lost device keys have honest recovery limits. No destructive migration is acceptable for irreplaceable pending or cryptographic state.

### C19-W04 Record Receipt Coverage Without Inventing Human Actions

Define accepted as the canonical persisted send, sent as a declared transport stage, received as a specific authorized device's stored message/ciphertext acknowledgment, decrypted/usable as a distinct client state where needed, read as the participant's permitted reported read action and business acknowledgment as a separate domain action. Push acceptance, a live socket or a server delivery attempt proves none of human reading, medicine adherence, event attendance or task completion.

Authenticate receipts to the actual recipient account/device/participant and admission scope; reject another recipient, invalid/future sequence, wrong conversation, stale device or denied historical range. Client reports are not physical proof and can be dishonest; protect integrity of who reported what without overstating the fact. Receipts are idempotent/monotonic within the relevant versioned coverage definition, while disabled sharing, device removal and participant rejoin must not expose old private activity.

Do not set a scalar high-water mark to the maximum observed sequence when lower eligible messages are unresolved. A compact cursor can mean all eligible messages through a confirmed bounded history position only with explicit coverage/gap/tombstone semantics. Alternatively retain per-message/device acknowledgments or intervals as required. A delivered-through marker cannot jump over an unknown missing eligible message just because sequence 105 arrived before 104. User 'mark read through here' can have a different explicit intent from proof that every body was rendered.

Define per-account aggregation across devices (for example any eligible device versus a specific set) and group disclosure policy before presenting one/two check marks or 'everyone read'. The source per-participant table/scalars alone do not describe device enrollment/removal, historical participants or filtered messages. Limit large-group receipt fanout/storage without treating a sampled count or omitted row as universal delivery. Unread counts use current eligible history, not naive `last_sequence - last_read_sequence` across hidden/deleted/system entries or a newly admitted member's unavailable past.

### C19-W05 Expire Presence, Typing and Notification Hints Safely

Maintain bounded per-device authenticated presence leases with server-validated times/TTL and a reviewed account/conversation projection. One disconnected device must not mark another active device offline; conversely an old heartbeat cannot revive a revoked session. Redis loss or TTL expiry yields unknown/unavailable under policy, not evidence a person deliberately went offline. Preserve invisible/do-not-disturb/user privacy settings without broadcasting hidden status to blocked or unauthorized people. Do not persist every heartbeat or use it as a private recommendation/attendance source.

Typing indicators are transient rate-limited events with short expiry, current participant validation and no durable history backlog. Lost typing-stop is handled by expiry, not a permanently typing user. Reconnect does not replay stale ephemeral activity as fresh. Agent thinking/retrieving/waiting/tool/composing status is separate attributed run state, not a human typing event or hidden reasoning trace. A task/model failure never proves the person is unavailable or permits escalation beyond the approved policy.

Generate permitted notifications through Chapter 20 after durable message acceptance with logical effect identity, current membership/block/mute/quiet-hour/priority/category/device binding and consent checks. E2E/sensitive payloads omit plaintext body/previews and revealing file/title details before reaching push infrastructure, including SDK background auto-display. IDs and timing are metadata too; minimize them according to the chosen threat model. Optional local decrypted previews require current device/user policy and do not make remote plaintext push permissible.

Push is a bounded wake-up hint, not the message source of truth, guaranteed wake-up or read receipt. A new/invalid/reassigned token is reconciled against current account/device context. Failed push must not roll back accepted messages or trigger unapproved email/SMS/voice fallback. Deep links and notification actions reauthorize; an old notification cannot reopen a removed conversation or disclose a deleted source. No human emergency/adherence/availability inference follows from presence, read receipts or missed notifications.

## 9. Cryptographic Membership, Keys and Recovery

### C19-W06 Select a Reviewed Protocol and Enroll Authorized Endpoints

Select a maintained reviewed protocol/library with real Android/browser, direct/group, multi-device, offline and storage support. A suitable Signal-family or MLS implementation may be evaluated where its actual capabilities, license, upgrade policy and security assumptions fit; these are candidates, not selected dependencies or permission to build a custom hybrid. Do not design a cipher, ratchet, key exchange, group-key broadcast or backup format from the source's conceptual key list. Record the threat model, protocol/implementation versions and independent review/test-vector requirements before claiming E2E properties.

Treat confidentiality, sender authentication, device identity verification, forward secrecy, post-compromise recovery, metadata protection and message deniability/non-repudiation as distinct properties. Encryption or rotating one group key does not automatically provide all of them. Authenticated endpoint compromise, screenshots/exports and malicious recipient redistribution remain outside any claim that the server stores only ciphertext. Browser code and updates are trusted endpoint software: WebCrypto/non-extractable keys do not prevent malicious same-origin code from using a key or reading rendered plaintext. Review XSS, supply-chain, update integrity and local device/storage threats explicitly.

Generate and protect keys with the selected library and platform-supported secure facilities. Verify actual hardware-backed/Keystore/WebCrypto behavior instead of promising every device has a secure enclave. API key registration uploads only the approved public/protocol artifacts or explicitly defined user-wrapped recovery material, never an ordinary backend-readable endpoint private key. Secret private material must not enter logs, URLs, analytics, crash dumps, support forms, model context or clipboard-based onboarding by default. Plaintext caches and backups need separate protection; a Keystore entry does not encrypt Room automatically.

Enroll a device under both current account/session authority and the approved cryptographic identity/continuity process. Account login alone must not silently add an attacker-controlled decryption endpoint to every existing conversation. Verify existing-device approval, reviewed recovery or explicit first-contact trust/verification as applicable. Device lists, contact-key changes and key-directory consistency need the selected verification/transparency mechanism and clear UI; an HTTPS response from the delivery server alone cannot prevent that server from substituting recipient keys. New identity or changed fingerprint requires the defined warning/consent path rather than invisible acceptance.

Bind protocol-protected messages and control updates to the intended conversation, sender/device, cryptographic membership/version and message/control identity using the library's authenticated context. Reject invalid/tampered/replayed/wrong-context inputs before exposing plaintext or committing an unsafe state transition. A server-assigned sequence is generally not available before client encryption; do not pretend it was sender-authenticated in the original payload. Service ordering/receipt metadata is a separate trust assertion and needs its own validation contract.

Maintain an authenticated cryptographic roster/epoch consistent with current domain participation and devices. Addition, removal, compromise, Agent revocation and incompatible version change use the selected protocol's verified control messages and key evolution, not simply changing a database key-version number. Define the serialization point between membership update and send acceptance; stale-roster sends after that point are rejected/held until an authorized protocol update, not encrypted again for a removed device. If required rekey/verification cannot finish, block new affected encrypted sends rather than downgrade or keep using a known-compromised epoch.

Removal stops newly disallowed server fetch/fanout and future key distribution at that boundary, but cannot erase old keys/plaintext already held by the removed endpoint. Rejoining is a new admission/history decision, not automatic access to intervening epochs. Offline devices catch up through the protocol's bounded authenticated membership-update/history mechanisms; dropping an offline device from the recipient set or granting all historic keys needs an explicit reviewed rule. Device removal is not merely push-token deletion, and a group administrator does not gain the other endpoints' private keys by performing it.

Ratchet/counter/nonce and outbound ciphertext state must survive crash/concurrent use according to the library's supported persistence contract. Authenticate a received input before committing the applicable state change; duplicate delivery must not consume a key or advance a session twice. Do not reuse old state after uncertain persistence. If the crypto store and application outbox cannot commit atomically, use a reviewed staged/receipt reconciliation integration with tested recovery or keep the session blocked; do not invent an unsafe rollback shortcut.

When a queued send's recipient/epoch becomes stale, first reconcile whether its old immutable intent was accepted. A confirmed old rejection/controlled supersession may permit a newly sealed attempt linked to the same business intent under the approved API/protocol rules; an unknown prior acceptance cannot be replaced blindly with a new message ID or different payload under an old idempotency key. Old attempts must be unable to commit after the replacement boundary. These rules require real cross-client/server failure tests, not a prompt to 'encrypt again'.

### C19-W07 Add Devices, Recover Keys and Change Modes Honestly

Specify whether a new device receives only future messages, selected history or a reviewed encrypted history transfer/backup. Current conversation/history permission and cryptographic key availability must both permit the transfer. An all-history key can defeat a product promise of post-join-only access even when normal history APIs filter rows; choose protocol/key-distribution semantics compatible with the actual promise. Backup/history access can weaken forward-secrecy or post-compromise claims and must be part of the threat/retention model.

Separate account authentication recovery from cryptographic identity/key recovery. If no authorized device or user-controlled recovery material remains, some old messages may be unrecoverable. Do not reset to a backend escrow key that was never disclosed, recover a missing private key from a password hash, or claim a restored account implies readable old ciphertext. A new identity/device after loss follows the verified enrollment/contact-change process. The user must see what can and cannot be recovered before a destructive reset or device replacement.

If encrypted backups are approved, define exact contents, key custody, high-entropy recovery material/password-KDF policy through reviewed implementations, versioning, key-loss behavior, revocation, expiry and provider access. Restore of a stale crypto-state snapshot must not reuse nonces, resurrect a revoked identity or rewind a live ratchet. Reconcile current device/membership state and protocol-specific recovery before any new send. Recovery secrets stay outside Agent context and ordinary support/debug artifacts; operators cannot create a universal decryption capability as a convenience.

Changing conversation mode is an explicit material security action with current authorized participants/decision policy, clear endpoint/plaintext disclosure, new version and required key migration or a new conversation where necessary. An owner changing a setting cannot silently weaken other participants' expectations. New devices with unsupported protocol versions receive a safe upgrade/blocked state, not a weaker negotiated mode. Re-encrypting formerly server-readable messages cannot retroactively remove their prior plaintext exposure, logs, models or downloaded copies.

Do not merge server-readable plaintext and true-E2E history under one unqualified security badge. Retain per-version/source mode and clearly indicate older content or explicit forwarded copies. The source's `body_preview` field is not permission to upload a plaintext preview of E2E content. Failure to encrypt/decrypt/verify is an actionable retry/verify/recover/unsupported state; the source's no-plaintext-fallback rule applies to message body, attachment keys, captions, previews and repair paths alike.

## 10. Message Changes, Attachments and Search

### C19-W08 Edit, Delete and Relate Messages Without Leaking History

Bind edits to the exact message/conversation, original authenticated actor or permitted system-content workflow, current edit window/restrictions and expected revision. Users cannot impersonate another sender through a patch; administrators use attributable moderation/tombstone actions instead of rewriting another person's words. Preserve controlled version/history and edited marker under the reviewed retention policy. For E2E, edits/control messages require protocol-authenticated actor/context/revision and client validation, not trusting an unsigned server preview as the original author.

Distinguish delete-for-me, delete-for-everyone, moderator removal, retention expiry and temporary-message expiry. A local hide changes only that user's view unless the explicit contract says otherwise. A global tombstone removes new eligible retrieval and propagates through current authorized replay, search, attachment links, quotes/previews, notifications, caches, Agent context and exports; required restricted evidence may have a separate lawful purpose. Old ciphertext/plaintext on another endpoint or already exported data cannot be guaranteed erased. Never label a successful server tombstone as universal recall.

Keep tombstone/version evidence through the supported replay/backup window so a late message update, client resend, reindex or restored snapshot cannot revive deleted content. A deleted-before-accept send request needs a distinct cancel/reconcile protocol for its local intent; pretending it was remotely deleted before knowing whether it committed can lose or duplicate a message. Expiry is enforced by current time/policy at serving boundaries even if a cleanup worker is down, with honest offline-device and modified-client limits.

Reactions are idempotent scoped participant/type operations; undo uses a stable explicit command instead of a toggle that flips again on retry. Replies and thread roots have same-conversation/source-version/history constraints. A quote from pre-admission, deleted or restricted content must not expose its sender/preview/title merely because the new reply is visible. Narrower thread visibility requires compatible recipient/key boundaries; shared group keys do not cryptographically hide a supposedly private subthread from other key holders. Use a separately authorized conversation/cohort or another reviewed design where needed, not a UI-only restriction.

Mentions validate current eligible recipients, rate limits and preferences without revealing hidden members or sending external contact by default. In E2E, any server-visible mention/routing hint is minimized, validated and not assumed proof of the encrypted text's meaning. References to tasks/events/polls/budgets/approval cards reauthorize the actual object; a valid chat message is not permission to access its finance data or approve an action. Administrative audit and user-visible timeline remain different projections.

### C19-W09 Share Immutable Media and Search Within the Chosen Mode

Authorize the current sender, conversation/recipient audience and original file/version before issuing bounded upload capabilities or linking attachments. Follow Chapter 14's verified immutable object-generation commitment so an unexpired PUT cannot replace scanned or already referenced bytes. Message acceptance and upload/scan/link status are explicit: either require a ready permitted attachment before sending, or use a reviewed safe pending placeholder. Missing/failed uploads cannot secretly expose unscanned bytes or silently drop the message's promised attachment.

For server-readable media, use actual size/signature checks, quarantine/malware policy, parser isolation, safe thumbnails and metadata stripping before ordinary access. For true E2E media, the server sees ciphertext: its checksum/size check proves only the stored ciphertext properties, not plaintext type, malware absence or redaction. Use a disclosed reviewed endpoint-processing/safety path or leave the incompatible attachment capability blocked until policy is selected. Client claims or a scanner run on ciphertext are not a clean plaintext verdict, and no safety worker silently decrypts/uploads the original to satisfy a check.

Encrypt attachment content, key wrapping, filename/caption and thumbnails as required by the selected protocol/mode; distribute attachment keys only to the actual authorized recipients. Reusing an object across audiences must not accidentally reuse a broadly available decryption capability. Current file/attachment download authorization, expiring capability exposure windows and endpoint-retained key limits all apply. Previews, voice recordings, temp files and EXIF/location metadata are part of the privacy boundary. Use safe decoders/renderers on receiving devices and review notification-extension/background processes that share cryptographic state.

Server-readable search uses current conversation/history/source/retention/Agent filters before titles/snippets/candidates/rerankers/model context. Public discovery never indexes private message text or interaction features. E2E search may use only locally available authorized decrypted history by default under the chosen policy; local index/cache protection, deletion/reindex and new-device coverage are explicit. 'No results on this device' is not proof that no inaccessible historical message exists.

Specialized encrypted search indexes are a separate reviewed cryptographic capability with query/access-pattern/metadata leakage and retention implications; listing the option is not an implementation or proof of server-blind full-text search. Optional external query embeddings/reranking expose query/content and require separate approved disclosure, never a hidden consequence of the E2E badge. Search history and decrypted local caches must not be restored across accounts or retained after the approved withdrawal/deletion boundary.

## 11. Agent Disclosure, Reporting and Retention

### C19-W10 Admit an Attributed Agent Only With Permitted Context

An Agent participant has its own authenticated identity, visible type/acting scope/delegation, narrow tool/context/memory permissions, current owner/subject grants and runtime budgets. Human/page/Agent attribution cannot be swapped by a message payload. Informational replies, drafts, proposals, pending approvals, verified tool results and errors are structured distinct facts; a text sentence saying 'approved' or 'completed' does not execute a domain action or prove success. Agent-to-Agent messages cannot enlarge scopes or trigger unbounded response loops.

In server-readable mode, context is still minimal and authorized by actual conversation history/resources/purpose, not every family message, attachment or memory. Filter before context assembly and before provider disclosure, and treat untrusted message/file/tool text as data rather than a tool instruction. Model/provider training/retention/region, health/financial restrictions and exact approval rules from Chapters 11/12 remain in force. A blocked final tool call cannot undo plaintext leaked during context retrieval.

For true E2E, no Agent access is the behavior until an approved disclosure design and current grants actually exist. Design A can make a specifically named Agent endpoint a cryptographic recipient; specify who consents, which history/future messages it receives, endpoint/key custody and what downstream model services see. The source simultaneously describes such participation and warns against claiming true E2E when a server/Agent backend can read all messages. Do not hide that trust change: label the actual disclosed Agent-readable boundary and never advertise human-endpoints-only privacy or backend-blindness for plaintext available to that Agent backend.

Design B forwards only explicitly selected locally decrypted messages and permitted context to the declared Agent recipient. Preview exactly what is disclosed, including quotes/attachments and third-party data; one user's ownership of an Agent does not establish authority to share every participant's history. The forwarded copy has its own scope, retention, deletion and provider processing, and revoking original access cannot recall a copy already disclosed. Do not silently expand selection to the whole conversation when the model needs context.

Design C keeps Agent processing on the user's trusted device only if the actual model/tools/telemetry stay local under the approved design. A remote inference, embedding, crash log or tool call is another disclosure, not 'local' because the UI runs on the phone. Hardware/performance/model capability and storage safety remain verification gates. No local/remote product routing choice overrides the user's separate development-model restriction.

Revoking an Agent/device/delegation stops new allowed fetch/key distribution/tool execution at current boundaries, cancels appropriate runs and uses the selected crypto rekey process. It does not erase plaintext/keys the Agent previously received or automatically cancel independently approved reminders. Resume revalidates current grant/epoch/history and exact action approval. Private Agent output, reasoning, memory and approval details are not broadcast to every conversation subscriber; public status is a minimal authorized projection with no hidden reasoning trace.

### C19-W11 Report Selected Evidence and Enforce Retention Safely

Server-readable moderation uses current policy and case-scoped reviewer authority, not blanket operator conversation browsing. For E2E, reports require the supported explicit selected-content submission model, metadata/account abuse controls or disclosed endpoint safety behavior. Neither a report ID nor a moderator role supplies decryption keys to other messages. Viewers understand which plaintext/attachments/context they submit and to whom before that separate disclosure occurs.

Bind the report to its source conversation/message/version where verifiable, acquisition actor/time and actual evidence provenance. User-submitted plaintext/screenshots may be altered or incomplete; authenticated context can help where the chosen protocol supports it, but do not promise universal portable authorship proof or non-repudiation from a deniable messaging scheme. Snapshot review separates claims, verified facts, translations/OCR, classifier output and confidential notes. Malicious submitted media is handled by the protected Chapter 14/16 evidence path.

Block, mute, membership removal and platform enforcement have distinct target scopes. Content-based server moderation cannot inspect opaque plaintext, but authorized server-side routing/account restrictions and current access gates remain available with clear limits. In a true-E2E group, selected report disclosure does not authorize a server model to classify the entire encrypted history. User-facing notices/appeal evidence are minimized and do not expose reporters or unrelated participants.

Retention/deletion covers message revisions, ciphertext, metadata, receipt/read history, key-distribution artifacts, attachment copies, decrypted caches/search, notifications, Agent derivatives, reported copies and backups under their actual custody/purpose. Remove ordinary eligibility before asynchronous purge; a lawful retained report is a separate restricted record, not a way to keep the original searchable. Define tombstone/dedup replay windows and key/backup expiry so cleanup cannot cause duplicate sends or undeclared recovery loss.

Account deletion, legal holds and privacy requests need reviewed jurisdiction/custody policy, not silent server access to recover unknown E2E plaintext. Deleting a key reference does not prove cryptographic erasure while device copies, wrapped backups or plaintext exports remain. Restore into isolation with current membership/device revocations, deletion/expiry, mode and protocol-state reconciliation before serving history or permitting new encryption/sends. No restored cache, key bundle or old Agent grant may revive a previously removed disclosure path.

## 12. Canonical Interfaces, Clients and Operations

### Source Operation and Permission Mapping

All twenty-nine source operations map once below. Use Chapter 7's prefix/envelope/precondition/idempotency and transport rules after explicit reconciliation of this source's examples.

| Operation group | Source APIs | Owning contract |
| --- | --- | --- |
| Conversation lifecycle/settings | C19-P01, C19-P02, C19-P03, C19-P04, C19-P05, C19-P06, C19-P07, C19-P08 | C19-W01, C19-W11: actual parent/role/mode, controlled states and current deletion/retention. |
| Participant management | C19-P09, C19-P10, C19-P11, C19-P12, C19-P13 | C19-W01, C19-W06: target-aware admission/history and required cryptographic roster change. |
| Message acceptance/history | C19-P14, C19-P15, C19-P16 | C19-W02, C19-W03: stable logical send/current authorized history and commit-safe sequence. |
| Message changes/interactions | C19-P17, C19-P18, C19-P19, C19-P20 | C19-W08: exact actor/message revision, scoped tombstone and idempotent reaction state. |
| Selected report | C19-P21 | C19-W11: current permitted evidence submission, case custody and no unrelated plaintext. |
| Read/delivery/unread | C19-P22, C19-P23, C19-P24 | C19-W04: actual device/participant coverage/privacy and truthful count semantics. |
| Device/crypto orchestration | C19-P25, C19-P26, C19-P27, C19-P28, C19-P29 | C19-W06, C19-W07: verified public artifacts, current enrollment/epoch, no generic private-key disclosure. |

| Permission group | Source permissions | Boundary |
| --- | --- | --- |
| Viewing | C19-U01 | Current actual source/parent/history and device/mode access, not an unrestricted history query. |
| Sending/replying/attachments | C19-U02, C19-U03, C19-U12 | Valid sender, reply/file audience and mode, bounded immutable intent and current restrictions. |
| Content changes/pinning | C19-U04, C19-U05, C19-U06, C19-U10 | Current own/admin action policy, exact message/context and no hidden quote or author impersonation. |
| Admission/roles | C19-U07, C19-U08, C19-U09 | Target-aware grantor/recipient/history and required protocol device/epoch updates. |
| Settings | C19-U11 | Separate personal preferences from shared security/lifecycle changes and exact required consent. |
| Agent | C19-U13, C19-U14 | Permitted runtime/tool scope plus actual explicit cryptographic/plaintext disclosure policy. |
| Audit | C19-U15 | Case/action/purpose-scoped administrative evidence, not all E2E content or secrets. |

The source WS examples map once as C19-O01 for current authorized subscriptions, C19-O02 for scoped expiring typing, and C19-O03 for a receipt mutation that, if enabled over WS, invokes the same durable authorized domain path as REST. These are not evidence of a WS message-send implementation. Recovery `connection.resume`/`sync.required` examples require scope/generation/cursor validation and a consistent snapshot barrier; don't leak a hidden conversation list in a resync response.

Missing contracts include device verification/recovery/backup, authenticated group-control/key updates, per-device receipt facts, idempotency lookup/supersession, safe history snapshots/tombstones, attachment upload/download, search/report status, mode changes, thread policy and Agent disclosure/consent. Define these against the chosen protocol and existing domains, not arbitrary JSON patches. Error details cannot echo ciphertext keys, raw bodies, private filenames, peer identity metadata or restricted history. Current authorization still precedes replay of a prior mutation receipt.

Preserve exact source envelope intent while resolving `event_type`/`event_version`, numeric sequence examples and missing durable stream position with Chapter 7. Schema version, message order, event cursor and crypto version are not aliases. Protected endpoints use typed scopes, bounded payload/decompression/history sizes, safe Origin/CSRF/session handling and backpressure; merely possessing an opaque conversation/device ID is not permission. Clients do not select authoritative actor, approved key state or raw database statuses.

### Event and Client Projections

All twenty source events map once below. Every durable replay rechecks current recipient authority; ephemeral events have a separate TTL path and need not consume the durable message log.

| Event group | Source events | Projection meaning |
| --- | --- | --- |
| Accepted message | C19-E01 | Committed canonical message reference/version/sequence or permitted sealed payload, not read/decrypted proof. |
| Content/interactions | C19-E02, C19-E03, C19-E04, C19-E05 | Current authenticated revision/tombstone/reaction with original-message order and independent event position. |
| Receipt updates | C19-E06, C19-E07 | Authorized participant/device coverage and sharing policy, never raw global read history. |
| Conversation/membership | C19-E08, C19-E09, C19-E10, C19-E11, C19-E12 | Current source/role/restriction projection and necessary protocol-update reference without private-key material. |
| Ephemeral activity | C19-E13, C19-E14, C19-E15 | Privacy-filtered TTL activity, not persistent evidence of human availability. |
| Agent progress | C19-E16, C19-E17, C19-E18 | Minimal allowed run status, no hidden reasoning/private context or false completed business effect. |
| Approval state | C19-E19, C19-E20 | Exact permitted action/version outcome; viewing the event does not confer approver or tool authority. |

All thirty Android labels and eight web routes map once to the following flows. The source three-column desktop layout becomes navigable smaller views on mobile, not compressed overlapping panels.

| Client flow | Source Android surfaces | Source web routes | Required behavior |
| --- | --- | --- | --- |
| Conversation navigation | C19-C01, C19-C10, C19-C11 | C19-H01 | Current list/previews/counts, archive/mute distinctions and account-isolated state. |
| Scoped message timeline/composer | C19-C02, C19-C03, C19-C04, C19-C05, C19-C06, C19-C07, C19-C08, C19-C09, C19-C12, C19-C13, C19-C14 | C19-H02 | Stable local/canonical order, visible actor/mode, pending/conflict/unavailable history and authorized reply previews. |
| Attachments and recording | C19-C15, C19-C16, C19-C17 | C19-H07 | User gesture/permission, safe local staging, explicit upload/scan/encryption states and no surprise recording/disclosure. |
| Reactions, mentions and threads | C19-C18, C19-C19, C19-C20 | C19-H08 | Same-context authority, idempotent controls and compatible narrower-audience/key policy. |
| Receipts and activity | C19-C21, C19-C22, C19-C23 | Within authorized conversation view | Distinct acceptance/receipt/read/typing and privacy/unknown states without fabricated progress. |
| Agent and structured actions | C19-C24, C19-C25, C19-C26 | Within authorized conversation view | Attribution, exact review and object-specific scope; a chat card is not permission or proof of execution. |
| Search | C19-C27 | C19-H03 | Server-readable scoped versus local E2E coverage, safe highlights and no false all-history claim. |
| Settings | C19-C28 | C19-H05 | Personal preference versus shared mode/retention/security control, with current authorization and explicit effects. |
| Participants | C19-C29 | C19-H04 | Permitted roster/history/grant management and device/Agent membership distinctions. |
| Encryption information | C19-C30 | C19-H06 | Actual mode/endpoints/verification state, key/device-change warnings and honest recovery limits. |

Keep sending/accepted/device-received/pending-decryption/read/failed/deleted states actionable without leaking another participant's hidden activity. Show encryption verification or unsupported-key errors independently of network status. An approval, irreversible deletion, mode downgrade, device enrollment or selected forwarding needs the exact authorized action review, not a generic retry button. No silently preselected disclosure of private history to a new device or Agent.

Use the earlier platform conventions: stable message-list/composer/attachment geometry, labeled familiar icon controls, keyboard and screen-reader/TalkBack navigation, large text/RTL/mixed scripts, visible focus and non-color status. Restore scroll/focus after reconciliation without duplicate bubbles or moving the conversation unexpectedly. Provide non-drag media/thread navigation; long filenames, ciphertext errors and consent text must fit. Disable routine sensitive session replay/logging and follow explicit local cache/screenshot/backup policies without promising impossible capture prevention.

### C19-W12 Scale, Observe and Recover the Actual System

Use a domain-owned message service with separately executable API, WS, outbox/fanout/notification, attachment, search and Agent workloads where useful. A source component list is not proof of high availability or a need for mandatory microservices. PostgreSQL owns accepted state/work; Redis presence/cache/streams need documented loss/reclaim/retention behavior and cannot become sole message truth. Bound connections/subscriptions, messages/bytes/ciphertext/envelope complexity, history pages, devices, membership updates, skipped-key/storage limits and provider/model costs.

Large groups require measured receipt/fanout/history strategies, throttled/sampled permitted typing, member pagination, notification/mention budgets and explicit announcement policy. Do not remove current authorization to meet a latency target. Protect essential messaging/manual/safety functions from expensive parsing/reindex/model work, and make degraded availability visible. Server-readable fallback cannot be used when E2E processing or keys are unavailable. Optional future WebRTC voice/video is a separate signaling/media encryption/permission design, not implied by `call_event` or a recording component.

Measure acceptance versus fanout/receipt latency, duplicate logical sends/effects, pending local work, history/replay completeness, expiry/tombstone lag, device/epoch/rotation failures, protocol/key recovery errors and report/abuse outcomes with exact definitions. Source tracing IDs can be personal metadata; pseudonymous IDs/hashes are not automatically anonymous. Use bounded safe correlation and required admin audit, never plaintext E2E bodies, keys, raw ciphertext dumps, private titles, file names, hidden memberships or fine-grained presence in ordinary logs/metrics/session replay.

Test queue loss after commit, multi-worker claims, WS disconnect/drain, concurrent sends, stale membership, lost receipt, partial local transaction, poisoned payloads, bad crypto authentication, exhausted resources, key-directory changes and compatible upgrades using isolated synthetic accounts/devices. Protocol conformance/test vectors, interoperability, negative/tamper tests and qualified independent review are required before cryptographic claims. A mocked ciphertext string, static sequence check or an encrypted field in SQL does not prove any encryption property.

Recovery must restore coherent database/object/event/receipt state and current account/membership/device/Agent revocations before access. Cryptographic endpoint restoration additionally follows the selected library's anti-rollback/nonce/epoch and recovery protocol, not an ordinary database rewind. Keep live outbound effects off during restore and reconcile external post-snapshot outcomes; old backup credentials/cursors cannot replay withdrawn sends or resurrect deleted history. Unknown state remains blocked/reviewed with clear user messaging. No runtime, device, browser, cryptographic or provider checks have been executed in this drafting task.

## 13. Proposed Verification and Synthetic Controls

The source ends before a final acceptance list. These thirty-two evidence families are proposed engineering requirements, not source quotations or executed tests. All messaging/database/crypto/client/provider/security checks are NOT RUN. A passing document fixture cannot satisfy protocol conformance, interoperation, independent security review or real failure/concurrency evidence.

| ID | Verification family and required evidence | Traceability |
| --- | --- | --- |
| C19-V01 | Conversation authority and history: actual parent/participant/device/admission epoch, all roles, target-sensitive grants, public reads versus posting, enumeration and leave/rejoin deny unauthorized messages, counts, quotes and files. | C19-S01, C19-S03, C19-S05; C19-R02, C19-R03; C19-Q01, C19-Q02, C19-Q04, C19-Q14; C19-X01, C19-X02, C19-X09; C19-K01, C19-K09; C19-W01 |
| C19-V02 | Lifecycle/policy races: personal mute versus lock/archive/expiry/delete/restriction, owner changes and concurrent membership/send/fanout checks cannot reactivate old grants or bypass parent/Space capacity/history policy. | C19-S03, C19-S04, C19-S05; C19-Q01, C19-Q04; C19-X09; C19-K01, C19-K02, C19-K09, C19-K11; C19-W01, C19-W02 |
| C19-V03 | Canonical message records: all structured types, non-null human/Agent/system actor, page attribution, same-conversation reply/thread/attachment references and bounded schema/size reject spoofed sender/approval/system messages. | C19-S06, C19-S28; C19-R01; C19-Q01, C19-Q05, C19-Q15; C19-X05, C19-X13; C19-K01, C19-K02, C19-K11, C19-K13; C19-W02 |
| C19-V04 | Logical-send idempotency: duplicate transport/HTTP keys, actor-null/collision cases, lost response, changed intent/ciphertext, expired receipt and revoked-sender retry preserve one canonical message and permitted receipts without new notifications/Agent effects. | C19-S07, C19-S08; C19-R10; C19-Q07, C19-Q16; C19-X04, C19-X05; C19-K01, C19-K02, C19-K04; C19-W02, C19-W03 |
| C19-V05 | Commit-safe order and distinct cursors: concurrent allocation/commit, rollback gaps, edits/read/membership events, exact values beyond 2^53, stable history pagination and snapshot barriers do not skip a late lower committed message. | C19-S09, C19-S13, C19-S28; C19-R04, C19-R11; C19-Q17; C19-X04, C19-X05; C19-K02, C19-K03, C19-K04; C19-W02, C19-W03 |
| C19-V06 | Durable acceptance and fanout: faults before/after message/sequence/audit/outbox commit, lost broker publish, duplicate consumers and interrupted fanout keep accepted history available and recover one logical downstream effect. | C19-S07, C19-S12, C19-S34; C19-R10, C19-R11; C19-Q07; C19-X05; C19-K02, C19-K03, C19-K16; C19-W02, C19-W12 |
| C19-V07 | Authenticated WS and replay: browser Origin/tickets/session binding, subscription/dispatch/replay reauthorization, bounded buffers, expired cursors, wrong-scope resync and reconnect/backoff do not hijack sockets or expose hidden conversations. | C19-S12, C19-S13, C19-S34; C19-R11; C19-Q02, C19-Q03, C19-Q04, C19-Q06, C19-Q17; C19-X02, C19-X03, C19-X06, C19-X15; C19-K01, C19-K03, C19-K04, C19-K16; C19-W03 |
| C19-V08 | Real local transaction/reconciliation: REST-before-WS/WS-before-REST, crash between data/cursor/outbox updates, attachment/reply mapping, offline revoke/lock/expiry and account switch preserve stable pending identity without destructive migrations or lost messages. | C19-S11, C19-S29, C19-S30; C19-R11; C19-Q07, C19-Q17; C19-X01, C19-X05; C19-K01, C19-K03, C19-K04, C19-K15; C19-W03 |
| C19-V09 | Receipt fact and coverage: accepted/sent/stored-ciphertext/decrypted/read/business acknowledgment, wrong/future device claims, missing lower eligible messages and explicit mark-read semantics prevent cursor jumps or read/adherence inference. | C19-S10; C19-R05; C19-Q01, C19-Q04, C19-Q17; C19-X08, C19-X13; C19-K01, C19-K03, C19-K05; C19-W04 |
| C19-V10 | Multi-device/group receipt privacy: any/all-device aggregation, removed/new devices, history gaps, disabled sharing, rejoin and unread counts use the chosen eligibility coverage without exposing hidden members/activity or treating omitted rows as read. | C19-S10, C19-S19, C19-S31; C19-R05; C19-Q04, C19-Q17; C19-X08, C19-X09; C19-K01, C19-K05, C19-K06; C19-W04 |
| C19-V11 | Ephemeral presence/typing: multiple leases, old/revoked heartbeats, lost stop, Redis loss, invisible/contact/block/privacy settings and Agent status cannot become persistent surveillance or proof of human availability. | C19-S14, C19-S15, C19-S28; C19-R06; C19-Q06, C19-Q14; C19-X08, C19-X15; C19-K01, C19-K06; C19-W05 |
| C19-V12 | Notification boundary: current recipient/device/token, mute/quiet hours/consent, SDK background display, sensitive/E2E preview redaction, delayed deep links and unknown provider delivery never leak plaintext or invent message/read success. | C19-S19, C19-S26; C19-R05; C19-Q12, C19-Q14; C19-X08, C19-X11; C19-K01, C19-K05, C19-K06, C19-K07; C19-W05 |
| C19-V13 | Selected protocol conformance and threat claims: actual maintained libraries/versions, official independent vectors, direct/group multi-device interoperation, tamper/wrong-context/replay/unsupported-version cases and review validate each claimed crypto property separately. | C19-S16, C19-S17, C19-S18, C19-S32; C19-R09; C19-Q09, C19-Q10, C19-Q16; C19-X04, C19-X12, C19-X13; C19-K07, C19-K08, C19-K09; C19-W06 |
| C19-V14 | Device enrollment and identity continuity: account takeover, first-contact trust, existing-device/recovery approval, directory substitution/equivocation, key/fingerprint change and unapproved new endpoints cannot silently obtain conversation keys. | C19-S05, C19-S18, C19-S27; C19-Q02, C19-Q10; C19-X01, C19-X03, C19-X09, C19-X12; C19-K01, C19-K08, C19-K09, C19-K10; C19-W06, C19-W07 |
| C19-V15 | Roster/rekey/remove races: stale epoch sends, removed device/participant/Agent, offline member catch-up and failed rekey align domain and cryptographic boundaries without plaintext fallback or claims to erase already held keys. | C19-S05, C19-S18, C19-S23; C19-Q04, C19-Q09, C19-Q10, C19-Q15; C19-X09, C19-X10, C19-X12; C19-K01, C19-K07, C19-K09, C19-K10, C19-K13; C19-W01, C19-W06, C19-W10 |
| C19-V16 | Crypto-state durability: actual library/store integration, concurrent tabs/processes, crash before/after nonce/ratchet/outbox persistence, duplicate/tampered receives, skipped-key bounds and uncertain old send reconciliation cannot reuse state or duplicate a logical send. | C19-S08, C19-S11, C19-S18, C19-S34; C19-R10; C19-Q07, C19-Q09, C19-Q16; C19-X04, C19-X05, C19-X12; C19-K02, C19-K04, C19-K08, C19-K09, C19-K16; C19-W02, C19-W03, C19-W06 |
| C19-V17 | History-key consistency: new device/admission/rejoin, explicit selected/all-history transfer and removed endpoints honor the advertised history policy cryptographically as well as through APIs, with acknowledged retained-key limits. | C19-S05, C19-S18; C19-R03; C19-Q04, C19-Q09; C19-X01, C19-X09; C19-K01, C19-K09, C19-K10; C19-W01, C19-W07 |
| C19-V18 | Backup and recovery: real lost-key/last-device paths, wrapped backup custody/KDF policy, restored stale ratchet/nonce state, identity reset, provider/operator access and recovery-secret exposure do not imply impossible account-to-key recovery. | C19-S18, C19-S34; C19-Q02, C19-Q09, C19-Q10; C19-X03, C19-X12; C19-K07, C19-K08, C19-K10, C19-K16; C19-W07, C19-W12 |
| C19-V19 | Mode and downgrade controls: server-readable versus true-E2E capabilities, mixed historical mode, exact participant consent, unsupported clients/algorithms and encryption failure never silently send plaintext or claim retroactive E2E. | C19-S16, C19-S17, C19-S34; C19-R09; C19-M01, C19-M02; C19-Q09, C19-Q10; C19-X01, C19-X10, C19-X11; C19-K07, C19-K08, C19-K10, C19-K15; C19-W06, C19-W07 |
| C19-V20 | Endpoint implementation safety: actual Keystore/hardware/WebCrypto/local-cache behavior, XSS/supply-chain/update/extension paths, backups/logs/crash dumps and device compromise are tested against the declared trust model, not assumed safe by encryption API names. | C19-S18, C19-S29, C19-S30, C19-S32; C19-Q02, C19-Q10; C19-X03, C19-X12, C19-X13; C19-K04, C19-K07, C19-K08, C19-K10, C19-K16; C19-W03, C19-W06, C19-W07 |
| C19-V21 | Message changes and related content: edit-author/version/window, authenticated E2E control, local hide/global deletion, pin/reaction/reply/thread/mention scope and revoked historical quotes retain correct identity and cannot guarantee impossible recall. | C19-S21, C19-S22; C19-R01, C19-R12; C19-Q01, C19-Q04, C19-Q14, C19-Q16; C19-X01, C19-X04, C19-X14; C19-K01, C19-K03, C19-K11; C19-W08 |
| C19-V22 | Mode-aware attachments: immutable upload generation, ACL/current downloads, pending scan, encrypted payload/thumbnail/key/filename boundaries, unsafe parser/EXIF/local temp paths and unsupported scans do not fake clean results or upload plaintext unexpectedly. | C19-S20; C19-R07; C19-Q05, C19-Q08, C19-Q12; C19-X07, C19-X08, C19-X11; C19-K01, C19-K07, C19-K08, C19-K12; C19-W09 |
| C19-V23 | Search coverage and leakage: current source/history filters, server-readable versus local E2E indexes, missing local history, query/provider disclosures and hypothetical encrypted-index access-pattern limits cannot become a hidden plaintext backdoor. | C19-S19, C19-S25; C19-R08, C19-R12; C19-Q01, C19-Q04, C19-Q15; C19-X01, C19-X08, C19-X10; C19-K01, C19-K07, C19-K12, C19-K13; C19-W09 |
| C19-V24 | Agent modes and truthful attribution: all three source disclosure designs, no-access default absent grants, selected versus whole history, endpoint/downstream providers, local versus remote processing and scope/approval/revoke/child loops preserve actual content boundaries. | C19-S17, C19-S23; C19-R08, C19-R09; C19-M03, C19-F01, C19-F02, C19-F03; C19-Q15; C19-X01, C19-X10; C19-K01, C19-K07, C19-K09, C19-K13; C19-W10 |
| C19-V25 | Reporting and moderation evidence: selected E2E plaintext disclosure, altered/incomplete screenshots, case-scoped reviewer/model input, confidential attribution and metadata-based restrictions do not unlock unrelated history or imply portable authorship proof. | C19-S24; C19-Q01, C19-Q11, C19-Q13, C19-Q14; C19-X01, C19-X07, C19-X08, C19-X14; C19-K01, C19-K12, C19-K14; C19-W11 |
| C19-V26 | Retention/audit/restore lineage: revisions/tombstones/ciphertext/keys/attachments/search/Agent/report/backups, dedup-window expiry and current grants/deletion/holds after restore cannot resurrect sources or incorrectly claim cryptographic erasure. | C19-S21, C19-S24, C19-S28, C19-S34; C19-R12; C19-Q07, C19-Q09, C19-Q11; C19-X01, C19-X12, C19-X14; C19-K01, C19-K02, C19-K10, C19-K11, C19-K14, C19-K16; C19-W08, C19-W11, C19-W12 |
| C19-V27 | Canonical interface compatibility: twenty-nine source operations, prefix/envelope/eight fields, three WS commands and recovery examples, exact sequence types, actor/idempotency/version/current receipt checks and protocol-specific missing routes. | C19-S12, C19-S13, C19-S27; C19-R04, C19-R10, C19-R11; C19-Q01, C19-Q03, C19-Q07, C19-Q17; C19-X02, C19-X04, C19-X06; C19-K01, C19-K02, C19-K03, C19-K15; C19-W02, C19-W03, C19-W04 |
| C19-V28 | Client/accessibility parity: thirty Android surfaces, eight local records/eight web routes, account/role/key changes, exact mode/device warnings, source/approval navigation and large text/RTL/keyboard/assistive/pending-decryption states behave honestly. | C19-S29, C19-S30; C19-R05, C19-R08, C19-R09; C19-Q02, C19-Q12; C19-X08, C19-X10, C19-X11; C19-K04, C19-K05, C19-K07, C19-K10, C19-K13, C19-K15; C19-W03, C19-W04, C19-W07, C19-W10 |
| C19-V29 | Large-group and abuse capacity: bounded connection/subscription/ciphertext/history/device/receipt/mention work, slow consumers, token/device abuse and WS drain protect required authorization and normal service under measured load. | C19-S10, C19-S12, C19-S31, C19-S32; C19-Q05, C19-Q06, C19-Q13; C19-X06, C19-X15; C19-K01, C19-K03, C19-K05, C19-K06, C19-K16; C19-W04, C19-W05, C19-W12 |
| C19-V30 | Private observability: acceptance versus delivery/read definitions, minimal correlation/admin audit, canaries for bodies/keys/titles/metadata and coarse presence/receipt cohorts keep debugging/analytics from becoming a plaintext or activity leak. | C19-S19, C19-S33; C19-R05, C19-R06; C19-Q11, C19-Q12; C19-X08, C19-X10, C19-X11, C19-X12; C19-K05, C19-K06, C19-K13, C19-K14, C19-K16; C19-W05, C19-W11, C19-W12 |
| C19-V31 | Failure and recovery drills: database/queue/socket/push/model/key-directory outage, accepted-but-unfanned messages, poisoned payloads, protocol/store upgrades and isolated restore preserve durable truth and fail closed on missing crypto authority. | C19-S07, C19-S11, C19-S18, C19-S31, C19-S34; C19-R09, C19-R10, C19-R11; C19-Q07, C19-Q09, C19-Q16, C19-Q17; C19-X04, C19-X05, C19-X12, C19-X15; C19-K02, C19-K04, C19-K07, C19-K08, C19-K09, C19-K10, C19-K16; C19-W02, C19-W03, C19-W06, C19-W07, C19-W12 |
| C19-V32 | Separate synthetic messaging journey: scoped admission, one accepted retryable send, offline/replay/receipt gap, exact edit/delete, removed member and lost-fanout controls on Android/core web; E2E adds separately selected real protocol/device/conformance evidence before any encrypted-product claim. | C19-S01, C19-S02; C19-R01, C19-R02, C19-R03, C19-R04, C19-R05, C19-R07, C19-R08, C19-R09, C19-R10, C19-R11, C19-R12; C19-K01, C19-K02, C19-K03, C19-K04, C19-K05, C19-K07, C19-K08, C19-K09, C19-K10, C19-K11, C19-K12, C19-K13, C19-K14, C19-K15, C19-K16; C19-W01, C19-W02, C19-W03, C19-W04, C19-W05, C19-W06, C19-W07, C19-W08, C19-W09, C19-W10, C19-W11, C19-W12 |

### Synthetic Identity, Coverage and Membership Fixture

This JSON is documentation with synthetic IDs and assumed flags, not a message server or cryptographic test vector. Payload markers are ordinary labels, not ciphertext, digests, keys or authenticated evidence. Five finite groups check identity/order, receipt coverage, coherent local snapshots, mode/roster gating and presence expiry. Exact sequences deliberately exceed JavaScript's safe integer range.

```json
{
	"fixture_kind": "synthetic_messaging_contract_controls",
	"runtime_executed": false,
	"message_identity": {
		"conversation_id": "synthetic-conversation-1",
		"sender_actor_id": "synthetic-agent-1",
		"client_message_id": "synthetic-send-1",
		"accepted_message_id": "synthetic-message-1",
		"accepted_intent_marker": "fixture-envelope-a",
		"repeated_intent_markers": ["fixture-envelope-a", "fixture-envelope-a"],
		"expected_logical_message_count": 1,
		"expected_logical_notification_intents": 1,
		"changed_intent_control": "fixture-envelope-b",
		"expected_changed_intent_conflict": true,
		"current_sender_authorized_after_revocation": false,
		"expected_receipt_body_disclosed_after_revocation": false,
		"events": [
			{ "event_id": "synthetic-event-create", "type": "message.created", "stream_sequence": "9007199254741011", "message_id": "synthetic-message-1", "message_sequence": "9007199254740993", "message_version": 1 },
			{ "event_id": "synthetic-event-edit", "type": "message.updated", "stream_sequence": "9007199254741012", "message_id": "synthetic-message-1", "message_sequence": "9007199254740993", "message_version": 2 }
		],
		"expected_message_rows_after_events": 1,
		"expected_current_message_version": 2,
		"integer_precision_control": ["9007199254740992", "9007199254740993"],
		"expected_exact_control_values_distinct": true
	},
	"receipt_coverage": {
		"previous_received_through": "100",
		"eligible_sequences": ["101", "102", "103"],
		"received_sequences_before_gap_fill": ["101", "103"],
		"expected_received_through_before_gap_fill": "101",
		"gap_fill_sequence": "102",
		"expected_received_through_after_gap_fill": "103",
		"decrypted_sequences": ["101"],
		"expected_decrypted_through": "101",
		"expected_user_read_inferred": false
	},
	"local_atomicity": {
		"before": { "event_cursor": "10", "message_version": 1 },
		"after_commit": { "event_cursor": "11", "message_version": 2 },
		"invalid_cursor_only_control": { "event_cursor": "11", "message_version": 1 },
		"expected_cursor_only_control_rejected": true
	},
	"mode_and_membership": {
		"mode": "true_e2e",
		"current_epoch": 12,
		"active_recipient_devices": ["device-a", "device-b"],
		"revoked_recipient_devices": ["device-removed"],
		"other_authority_checks_assumed_pass": true,
		"cases": [
			{ "id": "stale-roster", "epoch": 11, "recipients": ["device-a"], "crypto_ready_assumed": true, "expected_send_allowed": false },
			{ "id": "removed-recipient", "epoch": 12, "recipients": ["device-removed"], "crypto_ready_assumed": true, "expected_send_allowed": false },
			{ "id": "missing-key", "epoch": 12, "recipients": ["device-a"], "crypto_ready_assumed": false, "expected_send_allowed": false },
			{ "id": "current-control", "epoch": 12, "recipients": ["device-a", "device-b"], "crypto_ready_assumed": true, "expected_send_allowed": true }
		],
		"expected_plaintext_fallback": false
	},
	"presence": {
		"at": "2026-09-19T12:00:31Z",
		"leases": [
			{ "device_id": "device-a", "expires_at": "2026-09-19T12:00:30Z", "revoked": false },
			{ "device_id": "device-b", "expires_at": "2026-09-19T12:00:45Z", "revoked": false },
			{ "device_id": "device-removed", "expires_at": "2026-09-19T12:05:00Z", "revoked": true }
		],
		"expected_active_devices": ["device-b"],
		"share_presence": false,
		"expected_shared_projection": "not_disclosed",
		"after_all_current_leases_expire_at": "2026-09-19T12:00:46Z",
		"expected_later_availability": "unknown"
	},
	"cryptographic_operations_executed": 0,
	"provider_calls_executed": 0
}
```

A document check may compare these assumed identities/markers, parse exact integer strings, demonstrate unsafe double precision, calculate a contiguous frontier for this explicitly complete eligible range, reject the inconsistent cursor/version pair, apply the given roster/key-ready flags and expire the stated presence leases. The real filtered-history protocol need not use contiguous integers; no missing globally allocated message is inferred authorized by this example. These checks do not run a ratchet, authenticate a device, inspect real ciphertext, test Room/PostgreSQL transactions or prove a receipt. Actual C19-V04 through C19-V11 and C19-V13 through C19-V20 require independent runtime evidence.

## 14. Developer Handoff and Delivery Sequence

These twelve packages describe responsibility, not twelve required microservices, deployed clients or executed Agents. Early server-readable messaging and a later separately approved E2E path have distinct evidence gates; a simple ciphertext placeholder or TLS-only demo cannot be presented as E2E readiness.

| ID | Owner | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C19-T01 | Product, messaging, privacy and cryptography leads | Relevant identity/Space/data/API/client/file/Agent/safety decisions | Resolve C19-D01 through C19-D14, launch mode/history/receipt/privacy promises, threat model and actual release thresholds. Keep unknown E2E/Agent/provider capabilities unavailable rather than silently degrade them. |
| C19-T02 | Domain/crypto architecture and data leads | C19-T01 | Define canonical actors, message/event/epoch identities, current authority and atomic audit/outbox/receipt/local-state interfaces; select reviewed protocol/library candidates and compatibility plan before cryptographic implementation. C19-V01 through C19-V05, C19-V13. |
| C19-T03 | Backend message/authorization engineer | C19-T02 | Implement scoped membership/history, immutable logical acceptance, commit-safe order, durable fanout/reconciliation and authoritative snapshots; C19-V01 through C19-V07. No sequence allocation race or null-actor dedup bypass. |
| C19-T04 | Cryptographic protocol/device engineer | C19-T02, C19-T03; separately approved protocol/mode | Integrate maintained endpoint libraries and protected state, authenticated enrollment/roster/rekey, negative/conformance/interoperability checks and disclosure of recovery/history limits; C19-V13 through C19-V20. No custom protocol or key escrow shortcut. |
| C19-T05 | Android/web synchronization engineer | C19-T03; C19-T04 for E2E paths | Implement stable outbox/canonical merge, atomic local data/cursors and the selected crypto persistence ownership/recovery contract; C19-V05, C19-V07, C19-V08, C19-V16. Browser persistence remains an approved separate choice. |
| C19-T06 | Receipt/presence/notification engineer | C19-T03, C19-T05; released device/provider rules | Implement actual receipt coverage/aggregation, TTL metadata and redacted consent-aware wake-up hints; C19-V09 through C19-V12. A push acknowledgment is not user delivery/read proof. |
| C19-T07 | Message mutation/media/search engineer | C19-T03, C19-T05; C19-T04 for E2E capabilities | Implement exact revisions/tombstones/interactions, immutable mode-aware attachments and scoped or local search; C19-V21 through C19-V23. No fabricated scan result for opaque ciphertext. |
| C19-T08 | Agent privacy, recovery and evidence engineers | C19-T03, C19-T04, C19-T05, C19-T07 for released scope | Implement approved key/history recovery and Agent endpoint/selected-forward/local disclosure plus reporting/retention lineage; C19-V17 through C19-V19, C19-V24 through C19-V26. No automatic decryption from role membership. |
| C19-T09 | API, design, Android and web engineers | C19-T03, C19-T05, C19-T06, C19-T07, C19-T08 for released scope | Reconcile canonical APIs/envelopes and missing verification/recovery operations, then deliver accessible truthful timeline/mode/device/approval states; C19-V27, C19-V28. Exact security warnings must survive all layouts. |
| C19-T10 | Platform/security/operations engineer | C19-T03, C19-T05, C19-T06, C19-T07; C19-T04, C19-T08 for encrypted scope | Operate bounded queues/connections/group fanout, private audit/metrics, compatible upgrades and isolated authority/crypto-state recovery; C19-V26, C19-V29 through C19-V31. Foundational durable contracts precede dependent effects. |
| C19-T11 | Independent QA, protocol, privacy and security reviewers | C19-T02 through C19-T10 for released scope | Execute applicable C19-V01 through C19-V32 with actual component/protocol/library/device/provider/simulator versions, official vectors, concurrency/fault artifacts and qualified review. Document fixtures are not cryptographic evidence. |
| C19-T12 | Notification, consent, integration and product leads | C19-T01, C19-T03, C19-T06, C19-T09; C19-T11 for implemented evidence | Chapter 20 handoff for durable in-app history, push/email/SMS/WhatsApp/voice adapters, channel/recipient/quiet-hour policy and delivery/escalation receipts. Design may proceed now; no external channel or model call is enabled here. |

When authorized, first establish current authority, durable acceptance/order and scoped local/replay behavior. Verify receipt and privacy semantics independently from transport. Add the selected real E2E library/device/roster/recovery path only after its separate mode and security gates; integrate media/search/Agent features only where their plaintext boundaries are actually supported. Required audit and idempotency are foundation work, not a later cleanup after live sends.

## 15. Demonstration, Remaining Risks and Next Chapter

### Separate Synthetic Messaging Exercise

This is a future authorized exercise, not an implemented app or a cryptographic demonstration already performed. Use synthetic accounts/devices/messages in isolation. An initial explicitly server-readable workflow may prove only its own behavior; an E2E claim requires the separately selected real implementation and independent evidence below.

1. Establish a scoped conversation with intended participants and a denied account, explicit history and mode. Verify that parent membership/public viewing does not grant every write or private-history path.
2. Send an ordinary synthetic message with stable client identity, lose the acceptance response and retry. Confirm one canonical message/sequence plus one logical notification/Agent-processing intent and no receipt disclosure after revocation.
3. Exercise simultaneous sends with a delayed transaction, then an edit of an older message. Demonstrate commit-safe message order and independent durable event positions without skipping a late lower commit or treating the edit as a new message.
4. Queue while offline and reconcile REST/WS in both arrival orders. Crash at local data/cursor/outbox boundaries and show stable identity, retained pending work and accurate blocked/session/attachment states.
5. Deliver out of order to two devices and fill a missing eligible message. Show actual stored/decrypted/read distinctions, reviewed any/all-device aggregation, current receipt privacy and unread semantics.
6. Expire one presence lease while another remains active, revoke a device and hide presence. Confirm no stale typing/presence replay or inference of human availability, and no sensitive body in provider payloads.
7. For separately enabled E2E, run actual protocol vectors/interoperation/tamper tests, verify device identity changes, remove a member/device and race stale-epoch sends. Inspect only safe synthetic evidence proving the ordinary backend lacks usable plaintext keys; missing keys must block rather than fall back.
8. Test the selected new-device/history/backup/lost-key path and explicit mode or Agent disclosure. Document who can decrypt, which prior content is exposed and what remains unrecoverable, without supplying private keys to support or a model.
9. Edit/delete a message, revoke a source attachment and submit only selected report evidence. Verify quotes/search/cache/Agent/report/retention behavior under current authority and disclose the limit on already received bytes.
10. Reconnect, switch accounts, drain a server and restore an isolated snapshot using current revocations/tombstones and protocol recovery rules. Check accessible Android/core-web state and actual effect/receipt artifacts, not merely a screenshot or encrypted-looking database field.

Record exact builds/configuration/protocol/library versions, actor/device/epoch/message/effect IDs, expected versus observed state, fault boundaries and failures/skips. Keep even synthetic keys/plaintext out of routine logs and shared reports unless deliberately necessary for a controlled test artifact. A narrow pass is not proof of full MVP, every platform/group size, all crypto properties, perfect anonymity, universal deletion or production reliability.

### Open Decisions and Limits

- Eight PROPOSED and six OPEN decisions remain unapproved. Conversation state overlaps, non-null sender identity, receipt coverage, versioned API/envelope differences, WebSocket mutations and missing device/recovery operations need canonical definitions.
- True E2E requires actual endpoint-controlled keys and reviewed protocol integration. No schema field, encryption badge, CSPRNG mention, toy ciphertext or document fixture establishes sender authentication, forward secrecy, post-compromise security, verification or safe recovery.
- Source Agent participation and blanket backend-blindness language must be reconciled with the actual named endpoints and downstream providers. A disclosed Agent that receives plaintext changes the trust boundary; forwarding/local processing can also disclose content through tools or telemetry.
- Device/participant removal, backup/history sharing and key recovery cannot erase old plaintext or invent lost keys. Anti-rollback/outbox/nonce/ratchet behavior needs real crash and concurrency tests, and web-delivered code remains part of the endpoint trust model.
- Server scanning/search/moderation cannot inspect opaque E2E plaintext without an explicit additional disclosure. Metadata, receipts, notifications, attachments and reports remain privacy surfaces even when message bodies are encrypted.
- Critical observed unauthorized disclosure, plaintext downgrade, duplicate acceptance/effect, history skip, stale key enrollment or unsafe recovery blocks the affected release. Unrun tests and undocumented custody/retention choices are not passes; risk acceptance cannot replace mandatory permission or qualified cryptographic review.

Next is [Chapter 20](../Chapter20.md): notifications, in-app history, push delivery, external communication adapters, consent/preferences, escalation and delivery reconciliation. Carry the [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md), [trust operations](CHAPTER_16_TRUST_SAFETY_OPERATIONS_CONTRACT.md) and [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) boundaries. Continue design/developer handoff without authorizing provider messages, key collection, implementation or policy changes.