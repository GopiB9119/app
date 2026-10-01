# community

Built: the **Community** screen, opened from the account screen. It has Home (Following, Latest, Saved), Discover (search pages or posts), your pages with drafts, publishing and editing, post details with comments, and likes, saves, follows, reports and blocks.

Response limits (fixed [T06](../../../../../../../../../../docs/TASKS.md#defects-that-break-approved-requirements)): GET lists of posts or comments accept up to 512 KiB, a page's drafts up to 1.5 MiB and the block list up to 256 KiB; single pages, posts, page searches and all writes keep the 64 KiB limit. The sizes come from the stored maxima (names 80, post text 5,000, titles 120 and comments 2,000 characters, at up to 4 bytes each). Evidence: [public community checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#public-community-checkpoint) and [response limits checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#android-community-response-limits-checkpoint) (`CommunityTest`, 12 JVM tests). Post search: [post search checkpoint](../../../../../../../../../../docs/BUILD_STATUS.md#public-post-search-checkpoint) (2 more JVM tests, and `CommunityScreenTest` with 3 device tests of Discover on an emulator). Other community screens are not yet tested on a device.

Source chapters: 1, 2, 15.

Feature inventory: pages, page-onboarding, page-roles, page-membership, following, posts-drafts, publication-review, media-posts, comments-replies, reactions, shares, saved-posts, topics-hashtags, page-analytics, scheduled-publication.

See the [complete feature catalog](../../../../../../../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
