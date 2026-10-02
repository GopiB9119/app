# safety

Moderation of public content ([DEC-024](../../../../docs/DECISIONS.md#accepted-decisions), T69). Source chapters: 1, 11, 16, 18; [feature catalog](../../../../packages/feature-catalog/features.json). Reports and blocks themselves live in the community module.

- **Who moderates:** platform moderators in `platform_moderators`, named only by an operator: `python3 -m app.cli moderators add <email>|remove <email>|list`. No API grants the role. `GET /v1/me/moderator` says whether the signed-in person is one.
- **Queue:** `GET /v1/moderation/queue` lists reported public pages, posts and comments, oldest first, grouped per item with report counts per reason; reporters are never named. Private Spaces are never reported or shown. Content on a deleted page shows only as unavailable, without the page's name, here and in appeals (T115).
- **Decisions:** `POST /v1/moderation/decisions` (`Idempotency-Key`) records "hide" or "no_action" with a report reason and a note only moderators see, and closes the item's open reports. Nobody decides on content they wrote or on a page they own (`CONFLICT_OF_INTEREST`). Hidden content leaves every public list, page, search and feed; its author still sees it, marked with the reason, and nobody else does, not even the owner of the page it is on (T109). Content on an archived page can be hidden too, as it is still public, and handing a page over unpins a hidden post the new owner did not write. Nothing is deleted or edited.
- **Appeals:** the author sees decisions in `GET /v1/me/moderation-notices` and may appeal a hiding decision once (`POST /v1/moderation/decisions/{id}/appeal`); a different moderator keeps it or restores the content (`GET /v1/moderation/appeals`, `POST /v1/moderation/appeals/{id}/resolve`). Reporters see in `GET /v1/me/reports` whether their report was reviewed and whether action was taken, never who decided.
- Every decision, appeal and resolution writes its audit and outbox records in the same transaction ([migration 0028](../../../migrations/versions/0028_moderation.py)).

Tests: `backend/tests/test_moderation.py`. Not built: restrictions on people, automatic detection, versioned policies, evidence copies, legal requests and moderation of private content.

