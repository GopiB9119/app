# community

Built, under **Discover** in the main navigation ([DEC-014](../../../../docs/DECISIONS.md#accepted-decisions)): the Feed (`/app/home`, with Following, Latest and Saved), Pages and posts (`/app/discover`, searching pages or posts) and your pages and drafts (`/app/pages`); your blocked list (`/app/safety`), under Profile; and public page and post views that work signed out (`/pages/<handle>`, `/posts/<id>`). The web proxy forwards public reads without a session when you are signed out. Report and block are available on pages, posts and comments.

A page shows its rules and up to 3 pinned posts above its date-ordered posts (T83, [DEC-025](../../../../docs/DECISIONS.md#accepted-decisions), provisional). A pinned post shows once, in the Pinned section, marked Pinned. The owner writes the rules in Edit page and pins or unpins a published post with Pin to top or Unpin. The proxy accepts page edits of up to 64 KiB, as for posts.

Moderators, handing a page over, and archive, delete and restore (T84, T85; `page-management.tsx` and `page-roles.tsx`):

- On their page, the owner sees **Moderators**: who moderates and who is invited (until when), an invitation form taking the other person's full account ID (they find it on their Spaces screen), Withdraw invitation, Remove, and Hand over the page for a current moderator, then the waiting offer with Cancel the offer. Withdraw, Remove and Hand over first ask, naming the person and the page. An invitation or offer whose answer was lost keeps its key, and Retry sends it once more.
- **Archive or delete**: Archive page asks first, then the page says to everyone that it is archived and read only; composing, editing, pinning and following are no longer offered (unfollow still is) and Restore page brings it back. Delete page needs the page's exact name typed; the owner then sees only when the page will be erased and Restore page, and nobody else sees it.
- Under Your pages, **Pages you help moderate** lists pages offered to you (Take over asks first), invitations (Accept asks first, Decline does not) and the pages you moderate (Step down asks first). Taking over adds the page to Pages you own.
- Someone who moderates a page sees "You moderate this page" and Pin to top or Unpin on its published posts, and removes comments where the post says they can; owner-only controls stay hidden, and public views never say who moderates.

## Classification And Interests (T126/T127)

The shared vocabulary comes from `GET /v1/taxonomy`, cached in memory for five minutes. Topic codes are validated by format, not a fixed enum. Names follow the display language with English fallback; a retired selected term stays visible and removable but cannot be selected again. A refused choice refreshes the vocabulary without discarding the draft.

- Page creation chooses its main topic from the vocabulary and optionally sets classification. An active page's owner edits classification with searchable checkbox pickers and selection counts. Public page profiles show chips for all eight classification lists. Changes use the reviewed page version and send only changed lists; `[]` clears a list, while an omitted list is preserved.
- Discover has collapsible interest, language, place, community-type, audience, activity and content-kind filters alongside topic. Topic matches include secondary topics; containing-place matching remains the server's responsibility. Post search keeps its existing parameters.
- Signed-in Discover shows `GET /v1/me/suggested-pages` with the returned matching choices, follow controls and a link to choose interests. Signed-out Discover makes no interests or suggestions request. Home is unchanged.
- Private interests are at `/app/settings/interests`, linked from account settings. `GET /v1/me/interests` supplies the reviewed version; `PUT` sends all four lists with `If-Match`. A stale or unconfirmed save retains the draft and requires explicit reload, confirming before replacing edits. A `TERM_UNAVAILABLE` refusal names the affected choices. No private choices are persisted in browser storage or used by the web client to infer interests.

The BFF allows only the specified methods and query parameters, keeping same-origin writes, account binding and no-store responses. The shared error parser already preserves string-valued `field` and `codes`; regression tests cover those details and 412/428 failures. The former `gossip` rejection test now rejects `Gossip!`: availability belongs to the server, while malformed codes still fail client validation.

English, Telugu and Hindi strings have matching keys and placeholders; Telugu and Hindi remain machine drafts. Focused verification on 2026-10-02 passed 24 client/BFF tests, 48 community and translated component tests, and 13 dictionary checks, including 320 px with measured doubled text. Full web TypeScript checking is blocked by 52 existing missing `agent.*` translation keys in the separate Agent screen, with no diagnostics in this slice. Browser component tests use synthetic intercepted APIs; they are not authenticated live-backend journey evidence. Task/status records in `docs/` are intentionally not edited by this web-only session.

The required combined run, `node --test --test-concurrency=1 --test-reporter=tap tests/community-client.test.mjs tests/i18n-client.test.mjs tests/unit/community-ui.test.mjs tests/unit/i18n-*.test.mjs`, finished with **143 passed, 10 failed, zero skipped** (153 total). The failures are in untouched suites: five Agent renders in `i18n-account-ui.test.mjs`, two ambiguous task due-date selectors and three task/checklist/calendar heading-scale assertions in `i18n-tasks-ui.test.mjs`. The scoped 85 client, dictionary and community component checks passed in that run. Reports are `.local/t126-web-final-tests.txt` and `.local/t126-web-types.txt`; the latter ran `node node_modules/typescript/bin/tsc --noEmit --pretty false` from `web/` and exited 2. No assertions were weakened to mask these failures.

The local preview is at `http://127.0.0.1:3000`. Both `/app/settings/interests` and `/app/discover` returned 200; `/api/taxonomy` returned 503, so live vocabulary and authenticated saving remain unverified. No backend service was restarted or migrated.

Evidence: [public community checkpoint](../../../../docs/BUILD_STATUS.md#public-community-checkpoint), [page rules and pinned posts checkpoint](../../../../docs/BUILD_STATUS.md#page-rules-and-pinned-posts-checkpoint), [page moderators, handover and lifecycle checkpoint](../../../../docs/BUILD_STATUS.md#page-moderators-handover-and-lifecycle-checkpoint).

Source chapters: 1, 2, 15.

Feature inventory: pages, page-onboarding, page-roles, page-membership, following, posts-drafts, publication-review, media-posts, comments-replies, reactions, shares, saved-posts, topics-hashtags, page-analytics, scheduled-publication.

See the [complete feature catalog](../../../../packages/feature-catalog/features.json). Future implementation files belong here as each feature is built.
