# discovery

Search inside your Spaces (private scoped search), built by [DEC-015](../../../../docs/DECISIONS.md#accepted-decisions), which answers Q8 provisionally. Public page and post search and the public feeds live in the [community module](../community/README.md).

## What Is Built

`GET /v1/search?q=…&space_id=…` ([api.py](api.py), [service.py](service.py)) searches, for the signed-in person, the documents, tasks and events they can open now, in all of their Spaces or the one named by `space_id` (404 when it is not one of their current Spaces).

- **Authorization inside each query.** Every query joins the person's current active membership of an active Space and the item's own rule: documents and events use the admission boundary (`admissions_before >= admission_sequence`), tasks need a task grant for the current admission. Ranking, excerpts and the `more_*` flags only ever see rows that passed those joins, so a result is never something the person could not open.
- **Matching.** PostgreSQL full-text search with the `simple` configuration, so no language-specific stemming: every word is required and matches word beginnings. The person's text goes only to `plainto_tsquery`; the prefix form is built from its quoted lexemes, so typed operators (`& | ! :*`) are plain text. Words are split the same way the documents were indexed, which keeps Telugu and Hindi words whole. A query with no letters or digits is `SEARCH_WORDS_REQUIRED`.
- **Results.** At most 20 of each kind, best matches first (`ts_rank_cd`), then newest. Documents return passages with their line numbers (at most 3 per document; a match on the name counts more); tasks and events return title, status, dates and a short excerpt. Each result names its Space.
- **Not searched:** messages (stored encrypted; Q11), care records, reminders and agent memory.

## Not Built

Relevance tuning, typo tolerance, saved or suggested searches, embeddings (Q17) and the other discovery features in the [catalog](../../../../packages/feature-catalog/features.json): topics, local, trending, ranking and personalization of public content.

## Tests

[backend/tests/test_documents.py](../../../tests/test_documents.py) (search cases).
