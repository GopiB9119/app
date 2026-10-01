# Search Your Spaces

[SearchScreen](search-screen.tsx) at `/app/search` searches one Space or all the person's Spaces.
The address accepts `q` and optional `space_id`; the app header has a Search link.
The form shows loading, retry and empty-result states, with Documents, Tasks and Events result groups.

## Search Rules

- Only documents, tasks and events the person can open now are searched. A result never grants access to its source.
- Every query word must match, either a whole word or the beginning of a word.
- At most 20 results per kind are shown. When more match, the screen asks for more words to narrow the results.
- Messages, care records, reminders and agent memory are not searched.
- Each result names its Space and links to the source. Document links include `space_id`, `id`, `line` and `end` to open and mark the cited lines.
- Excerpts use plain text and escaped React text inside `<mark>` elements, never document HTML. Combining signs stay with their letters during highlighting.

## Client And Route

[client.ts](client.ts) normalizes query spacing, checks the 200-character limit, validates result shapes and rejects results from another Space when filtering.
`GET /api/search` accepts `q` and optional `space_id`, each at most once; other query parameters are refused.
The screen shows task status and due date, and event status and local time with its timezone.
This private search is separate from the public page and post search in the community feature.

Scope and limits: [DEC-015](../../../../docs/DECISIONS.md#accepted-decisions). Supported document files, storage limits, history access and deletion are described in [Documents](../files/README.md).
