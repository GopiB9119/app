# files

Text documents in private Spaces, built in their first form by [DEC-015](../../../../docs/DECISIONS.md#accepted-decisions) (provisional, made under the owner's delegation in [DEC-016](../../../../docs/DECISIONS.md#accepted-decisions)). Covers R5 (documents), R10 (ingest, parse, chunk, index) and R11 (retrieval within Space and membership boundaries).

## What Is Built

- [models.py](models.py): `space_documents` (one row per document, kept as a tombstone after deletion) and `space_document_chunks` (passages with line numbers and code point offsets, and a generated `to_tsvector('simple', content)` column with a GIN index). Migration `0024`.
- [text.py](text.py): validation and passage splitting, pure functions. Only `.txt`, `.md`, `.markdown` and `.csv`; CRLF and CR become LF and a leading byte order mark is dropped; control characters other than tab and line feed, text-direction overrides and isolates, and lone surrogates are refused; at most 524288 bytes after normalisation. Passages hold whole lines, close at a blank line after about 800 characters, never exceed 1200, and a longer line is cut at a space where possible.
- [service.py](service.py) and [api.py](api.py): four operations.

| Operation | Rule |
| --- | --- |
| `POST /v1/spaces/{space_id}/documents` | Any current member. `Idempotency-Key` required; the same key and body return the original; a changed body is `IDEMPOTENCY_CONFLICT`. Limits 200 documents and 20 MB per Space, checked under the Space lock. Request bodies up to 2.2 MB on this route only (`BoundedBody` in `app/main.py`). |
| `GET /v1/spaces/{space_id}/documents` | Newest first, at most 50 per page, cursor bound to the reader and Space for 15 minutes. |
| `GET /v1/documents/{document_id}` | The text and its details. |
| `POST /v1/documents/{document_id}/delete` | The person who added it under the same admission, or the Space owner. Removes the name, type, size, line count, digest, text and every passage at once, replaces the creation fingerprint, and writes `document.deleted` to the Space audit and outbox. A retry by the person who deleted it returns the same outcome; anyone else gets 404. |

Every read checks the current active membership of an active Space and the history boundary: a document is visible only to members whose admission number is not later than the Space's count when it was added, the same rule as chat and events. A member admitted later, a former member, or someone re-admitted after removal sees nothing from before their admission, and gets 404 rather than a hint that something exists.

The text is stored readable by the server, like tasks and events, so it can be indexed. It is never run, and the clients show it as plain text.

## Not Built

PDF, images, office files and other binary formats (they wait for a virus-scanning decision), object storage, immutable versions of one document, OCR, embeddings, sharing outside the Space, and answers that cite documents (the [agent](../agents/README.md) can use [search](../discovery/README.md) later). Retention after deletion follows the database backups (C14-D13 OPEN).

## Tests

[backend/tests/test_documents.py](../../../tests/test_documents.py), with injected-defect checks in `backend/.local/doc_defects.py` (run by `.local/doc-defects.ps1`).
