# community

Built, under **Discover** in the main navigation ([DEC-014](../../../../docs/DECISIONS.md#accepted-decisions)): the Feed (`/app/home`, with Following, Latest and Saved), Pages and posts (`/app/discover`, searching pages or posts) and your pages and drafts (`/app/pages`); your blocked list (`/app/safety`), under Profile; and public page and post views that work signed out (`/pages/<handle>`, `/posts/<id>`). The web proxy forwards public reads without a session when you are signed out. Report and block are available on pages, posts and comments.

A page shows its rules and up to 3 pinned posts above its date-ordered posts (T83, [DEC-025](../../../../docs/DECISIONS.md#accepted-decisions), provisional). A pinned post shows once, in the Pinned section, marked Pinned. The owner writes the rules in Edit page and pins or unpins a published post with Pin to top or Unpin. The proxy accepts page edits of up to 64 KiB, as for posts.

Evidence: [public community checkpoint](../../../../docs/BUILD_STATUS.md#public-community-checkpoint), [page rules and pinned posts checkpoint](../../../../docs/BUILD_STATUS.md#page-rules-and-pinned-posts-checkpoint).

Source chapters: 1, 2, 15.

Feature inventory: pages, page-onboarding, page-roles, page-membership, following, posts-drafts, publication-review, media-posts, comments-replies, reactions, shares, saved-posts, topics-hashtags, page-analytics, scheduled-publication.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
