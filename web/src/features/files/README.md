# Documents

[DocumentsScreen](documents-screen.tsx) at `/app/documents` lists, adds, opens and deletes documents in a selected Space.
The address accepts `space_id`, `id`, `line` and `end`; cited lines are numbered and the requested range is marked.
The reader displays plain text, including Markdown, never HTML.

## File And Access Rules

- Only UTF-8 `.txt`, `.md`, `.markdown` and `.csv` files are accepted because no virus scanner is available. PDF, images and office files are not accepted.
- A file must be nonempty and at most 512 KB (524288 bytes). A Space allows up to 200 documents and 20 MB in total.
- Any current member may add a document. Only current members who joined before it was added can see it; joining later does not reveal earlier documents.
- The person who added a document or the Space owner can delete it, after confirming its name and Space.
- Deletion removes the name, text and everything derived from the document, retaining only the deletion record. There is no restore action.
- Documents cannot be edited. A corrected copy is a new document.

## Client And Routes

[client.ts](client.ts) checks file names, types, sizes and strict UTF-8 before sending, and validates responses and Space identity.
An uncertain add keeps the exact chosen text and retry key until an explicit Retry; this state stays in the current page only.

- `GET /api/spaces/{id}/documents`: list with `limit` and `cursor`.
- `POST /api/spaces/{id}/documents`: add a name and text.
- `GET /api/documents/{id}`: read the document and its text.
- `POST /api/documents/{id}/delete`: delete after confirmation.

Scope and limits: [DEC-015](../../../../docs/DECISIONS.md#accepted-decisions). Document citations also open from [Space search](../discovery/README.md).
