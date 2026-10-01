# community

Built for local synthetic use: public pages, posts, comments, likes, saves, follows, Home feeds, discovery search, reports and blocks (29 operations). Public page and post reads work signed out; everything else needs a session.

- Pages: a unique lowercase handle and one owner; at most 5 pages per account. Owner edits need `If-Match`.
- Posts: drafts are private to the owner. Publishing is explicit and version-checked, and deleting leaves a tombstone. Up to 50 drafts and 2,000 posts per page.
- Comments: one reply level. The author can delete a comment and the page owner can remove it. 20 comments a minute per account.
- Feeds and search: Following, Latest and Saved, with 15-minute cursors bound to the account. Page search covers name, handle and description. Post search (`q` on `GET /v1/discover/posts`) matches the words literally in a published post's title and text, newest first, with cursors bound to the words.
- Safety: reports with fixed reasons (30 a day per account); blocks of pages and of comment authors (up to 500). Public responses never include account IDs.

Private Spaces, chats, tasks and reminders never appear in these lists. Whether a public community is a kind of Space is still open ([D1](../../../../docs/DECISIONS.md#open-decisions)). Evidence: [public community checkpoint](../../../../docs/BUILD_STATUS.md#public-community-checkpoint).

Source chapters: 1, 2, 15.

Feature inventory: pages, page-onboarding, page-roles, page-membership, following, posts-drafts, publication-review, media-posts, comments-replies, reactions, shares, saved-posts, topics-hashtags, page-analytics, scheduled-publication.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
