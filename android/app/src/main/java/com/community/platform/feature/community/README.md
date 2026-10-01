# community

Built: the **Community** screen, opened with **Discover** in the bottom bar or from Home ([DEC-014](../../../../../../../../../../docs/DECISIONS.md#accepted-decisions)). It has Feed (Following, Latest, Saved), Pages and posts (search pages or posts), your pages with drafts, publishing and editing, post details with comments, and likes, saves, follows, reports and blocks. The blocked list opens from Profile (**Blocked** on the account screen), without the Feed, Pages and posts and Your pages chips.

Response limits (fixed [T06](../../../../../../../../../../docs/TASKS.md#defects-that-break-approved-requirements)): GET lists of posts or comments accept up to 512 KiB, a page's drafts up to 1.5 MiB and the block list up to 256 KiB; single pages, posts, page searches and all writes keep the 64 KiB limit. The sizes come from the stored maxima (names 80, post text 5,000, titles 120 and comments 2,000 characters, at up to 4 bytes each). Evidence: [public community checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#public-community-checkpoint) and [response limits checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#android-community-response-limits-checkpoint) (`CommunityTest`, 12 JVM tests). Post search: [post search checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#public-post-search-checkpoint) (2 more JVM tests, and `CommunityScreenTest` with 3 device tests of Discover on an emulator). Other community screens are not yet tested on a device.

Source chapters: 1, 2, 15.

Feature inventory: pages, page-onboarding, page-roles, page-membership, following, posts-drafts, publication-review, media-posts, comments-replies, reactions, shares, saved-posts, topics-hashtags, page-analytics, scheduled-publication.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.

## Post Editing Keeps The Opened Version (T77)

Editing a post keeps the post as it was when Edit was chosen. Save sends only the fields that differ from it, with the ETag captured then, so a refresh or a reload another command causes never turns an old text into an overwrite. An unchanged post sends nothing. A conflict (412) says "This post changed since you opened it. Reload to review the current version." and keeps the text open; the post shows as saved only after the server confirms it ([T77](../../../../../../../../../../docs/TASKS.md#defects-that-break-approved-requirements)).

## Followed Pages And Page Editing (T72, T73)

Your pages now includes a separately tracked followed list with loading, successful-empty and failure states, Retry, duplicate-free Load more and server-confirmed Unfollow (the list then reloads from the server). A followed-list failure does not hide owned pages. If your own pages fail to load, the followed list is not asked for: both sections show the failure with Retry, and neither says it is empty. Account changes and navigation discard late list answers.

Owners can edit a page's name, topic and description inline. Save sends only changed string fields with the ETag captured when the editor opened; refreshing never replaces that review. A conflict (412) says the page changed since the editor opened; a lost answer shows the app's usual "No connection. Nothing new is confirmed."; both keep the text open, and closing a failed editor reloads the current page. Creation and editing count Unicode code points, and raw input caps keep emoji whole. New labels and messages are English resources until translated.

Following requests keep `limit=20` and the existing 64 KiB response limit; IdentityModule is unchanged. Names and descriptions take at most `20 * (80 + 500) * 4 = 46,400` UTF-8 bytes. With other fields, about 2.7 KB per page gives about 55 KB for twenty pages; even a cursor of up to 2 KiB stays below 65,536 bytes. A wire test decodes twenty maximum-length emoji pages through that unchanged limit. `CommunityScreenTest` covers the list states and actions and the editor at 320 dp with 200% text; all 6 of its tests passed on the API 36 emulator on 2026-10-01.

## Page Rules And Pinned Posts (T83)

A page shows its rules under the header, and its pinned posts, latest pin first, in a Pinned section above the date-ordered posts; a pinned post shows once and is marked Pinned. The owner writes the rules in Edit page (up to 2,000 characters, counted as the server counts them, saved against the version the editor opened with; an empty text removes them) and pins or unpins a published post with Pin to top or Unpin. A pin shows only after the server confirms it, and the page then reloads so the pinned list is the server's; a refusal (such as a fourth pin) or a lost answer changes nothing on screen ([T83](../../../../../../../../../../docs/TASKS.md#community-management), [DEC-025](../../../../../../../../../../docs/DECISIONS.md#accepted-decisions), provisional).

Response limits: the pinned list (at most 3 posts) joins the post lists at 512 KiB. **Changed since T72:** found pages (`/v1/discover/pages`) and followed pages (`/v1/me/following`) now also accept 512 KiB, because twenty pages with 2,000 characters of rules each can exceed 64 KiB (in Hindi or Telugu as well as emoji); your own pages, at most 5, still fit 64 KiB. The new labels are English until T70 translates them.
