# community

Built for local synthetic use: public pages, posts, comments, likes, saves, follows, Home feeds, discovery search, reports and blocks, plus page rules and pinned posts (32 operations). Public page and post reads work signed out; everything else needs a session.

- Pages: a unique lowercase handle and one owner; at most 5 pages per account. Owner edits need `If-Match` and may be up to 64 KiB. Rules: up to 2,000 characters on several lines, public, saved with the reviewed version like the other fields (T83, [DEC-025](../../../../docs/DECISIONS.md#accepted-decisions), provisional).
- Posts: drafts are private to the owner. Publishing is explicit and version-checked, and deleting leaves a tombstone. Up to 50 drafts and 2,000 posts per page.
- Pinned posts: the owner pins up to 3 published posts (`POST /v1/posts/{post_id}/pin`, `.../unpin`); `GET /v1/pages/{page_ref}/pinned-posts` lists them, latest pin first, signed out too. Pinning changes neither the post nor its version tag, the date-ordered list still holds every published post, and a deleted post is unpinned. A hidden post cannot be pinned, leaves the public pinned list and still counts toward the 3 until the owner unpins it. Pins on one page are counted under a lock on the page.
- Comments: one reply level. The author can delete a comment and the page owner can remove it. 20 comments a minute per account.
- Feeds and search: Following, Latest and Saved, with 15-minute cursors bound to the account. Page search covers name, handle and description. Post search (`q` on `GET /v1/discover/posts`) matches the words literally in a published post's title and text, newest first, with cursors bound to the words.
- Safety: reports with fixed reasons (30 a day per account); blocks of pages and of comment authors (up to 500). Public responses never include account IDs.

Private Spaces, chats, tasks and reminders never appear in these lists. Whether a public community is a kind of Space is still open ([D1](../../../../docs/DECISIONS.md#open-decisions)). Evidence: [public community checkpoint](../../../../docs/BUILD_STATUS.md#public-community-checkpoint).

Source chapters: 1, 2, 15.

Feature inventory: pages, page-onboarding, page-roles, page-membership, following, posts-drafts, publication-review, media-posts, comments-replies, reactions, shares, saved-posts, topics-hashtags, page-analytics, scheduled-publication.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
