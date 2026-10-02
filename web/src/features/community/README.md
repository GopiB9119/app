# community

Built, under **Discover** in the main navigation ([DEC-014](../../../../docs/DECISIONS.md#accepted-decisions)): the Feed (`/app/home`, with Following, Latest and Saved), Pages and posts (`/app/discover`, searching pages or posts) and your pages and drafts (`/app/pages`); your blocked list (`/app/safety`), under Profile; and public page and post views that work signed out (`/pages/<handle>`, `/posts/<id>`). The web proxy forwards public reads without a session when you are signed out. Report and block are available on pages, posts and comments.

A page shows its rules and up to 3 pinned posts above its date-ordered posts (T83, [DEC-025](../../../../docs/DECISIONS.md#accepted-decisions), provisional). A pinned post shows once, in the Pinned section, marked Pinned. The owner writes the rules in Edit page and pins or unpins a published post with Pin to top or Unpin. The proxy accepts page edits of up to 64 KiB, as for posts.

Moderators, handing a page over, and archive, delete and restore (T84, T85; `page-management.tsx` and `page-roles.tsx`):

- On their page, the owner sees **Moderators**: who moderates and who is invited (until when), an invitation form taking the other person's full account ID (they find it on their Spaces screen), Withdraw invitation, Remove, and Hand over the page for a current moderator, then the waiting offer with Cancel the offer. Withdraw, Remove and Hand over first ask, naming the person and the page. An invitation or offer whose answer was lost keeps its key, and Retry sends it once more.
- **Archive or delete**: Archive page asks first, then the page says to everyone that it is archived and read only; composing, editing, pinning and following are no longer offered (unfollow still is) and Restore page brings it back. Delete page needs the page's exact name typed; the owner then sees only when the page will be erased and Restore page, and nobody else sees it.
- Under Your pages, **Pages you help moderate** lists pages offered to you (Take over asks first), invitations (Accept asks first, Decline does not) and the pages you moderate (Step down asks first). Taking over adds the page to Pages you own.
- Someone who moderates a page sees "You moderate this page" and Pin to top or Unpin on its published posts, and removes comments where the post says they can; owner-only controls stay hidden, and public views never say who moderates.

Evidence: [public community checkpoint](../../../../docs/BUILD_STATUS.md#public-community-checkpoint), [page rules and pinned posts checkpoint](../../../../docs/BUILD_STATUS.md#page-rules-and-pinned-posts-checkpoint), [page moderators, handover and lifecycle checkpoint](../../../../docs/BUILD_STATUS.md#page-moderators-handover-and-lifecycle-checkpoint).

Source chapters: 1, 2, 15.

Feature inventory: pages, page-onboarding, page-roles, page-membership, following, posts-drafts, publication-review, media-posts, comments-replies, reactions, shares, saved-posts, topics-hashtags, page-analytics, scheduled-publication.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
