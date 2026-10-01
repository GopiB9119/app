# AI Policy

Rules for any use of AI models in the product: the agent, retrieval (RAG), summaries, drafting, and any future classification or ranking. Labels follow the [Product Understanding](PRODUCT_UNDERSTANDING.md#labels). Detailed design is in the [agent runtime contract](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md), the [file and retrieval contract](CHAPTER_14_FILE_DOCUMENT_RAG_CONTRACT.md) and the [security and privacy contract](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md).

This policy is part of level 3 of the [authority hierarchy](PRODUCT_CONSTITUTION.md#article-4-authority-hierarchy), so the agent specifications at level 5 must follow it.

No AI model is connected to the product today.

## Approved Rules

- **CONFIRMED** AI assists workflows and is never the source of truth. Timing, state changes, retries, acknowledgements and business rules stay deterministic (R9).
- **CONFIRMED** An agent is a software identity working within an explicit scope, with its own permissions, allowed tools, allowed resources and approval policies. It is never automatically an administrator (R7).
- **CONFIRMED** Retrieval respects Space, membership, permission and privacy boundaries (R11).
- **CONFIRMED** No external model provider, real user data or spending is approved. Development uses synthetic data only ([DEC-005](DECISIONS.md#accepted-decisions)).

## Proposed Rules

These come from the drafts and apply only once the product owner confirms them.

- **PROPOSED** Permissions are checked before retrieval and again before any model sees data. A model call never decides a permission (Chapter 12 contract, C12-D07).
- **PROPOSED** A model receives only the minimum authorized data it needs (Chapter 12 contract).
- **PROPOSED** Everything a model reads (posts, messages, files, tool results) is untrusted data. It cannot grant permissions, choose tools or change instructions (Chapter 11 contract C11-K06; Chapter 12 contract C12-K03; Chapter 14 contract C14-K13).
- **PROPOSED** Model output is only a proposal. Code validates it, and risky or shared actions need a person's approval of the exact action (Chapter 12 contract).
- **PROPOSED** Answers built from documents cite the exact authorized source they used (Chapter 14 contract, C14-D12).
- **PROPOSED** No medical decisions: no diagnosis, prescribing or dosage changes (Chapters 1, 11 and 13).
- **PROPOSED** First-release agent limits: no external messages or calls, no health-record access, no permission changes, no member removal and no financial actions ([Chapter 1](../Chapter1.md) section 33.3; open decision D4).
- **PROPOSED** Every manual feature keeps working without AI (agent safety gate in the [release plan](CHAPTER_01_RELEASE_PLAN.md#13-quality-and-launch-gates)).
- **PROPOSED** Evaluation before release: test sets for normal, unclear, prompt-injection, privacy, approval, crash and retrieval cases. A critical safety failure blocks the release, and any change to prompts, models, tools or retrieval is evaluated again (Chapter 12 contract, section 13). Results are recorded in [EVALUATIONS.md](EVALUATIONS.md).

## Undecided

- **TBD** Which model and embedding providers, in which regions, with what data retention and what budget (Q17).
- **TBD** Whether user data may ever be used to train or tune models. No document decides this.
- **TBD** Whether AI-written content is labelled as such for users.
- **TBD** What the agent may do in the first release (D4), and which data may be indexed (Q8).

## AI Assistants Working on This Repository

Coding agents follow [AGENTS.md](../AGENTS.md): read the [documentation map](README.md) first, never change approved requirements silently, report conflicts instead of resolving them, and use local synthetic data only.
