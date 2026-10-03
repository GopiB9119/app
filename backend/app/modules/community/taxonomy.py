"""The shared vocabulary (DEC-027): classifying pages, the interests a person chooses, and the pages suggested from them."""

import json
import re
from uuid import uuid4

from sqlalchemy import and_, delete, exists, func, or_, select

from app.errors import DomainError
from app.modules.community.models import (
    TAXONOMY_DIMENSIONS, AccountInterest, PageFollow, PageTerm, PostTerm, PublicPage, PublicPost, TaxonomyTerm, TaxonomyTermChange,
)
from app.modules.community.schemas import SuggestionReason, TermNames, TermView, clean_text

# Request and view field -> dimension. A page's main topic stays on the page itself; these are the rest.
PAGE_FIELDS = {
    "other_topics": "topic", "interests": "interest", "languages": "language", "places": "place",
    "community_types": "community_type", "audiences": "audience", "activities": "activity", "content_kinds": "content_kind",
}
PERSON_FIELDS = {"topics": "topic", "interests": "interest", "languages": "language", "places": "place"}
# What a single post may carry (DEC-036).
POST_FIELDS = {"topics": "topic", "interests": "interest"}
RANKING = "interests-1"
MOST_SCORED = 500
# interests-1: points for each match. "related" is an interest under a chosen topic, or a topic above a chosen interest.
POINTS = {"interest": 4, "topic": 3, "related": 2, "place": 2, "language": 1}
REASON_ORDER = ("interest", "topic", "place", "language")


def unavailable(field, codes):
    return DomainError(
        422, "TERM_UNAVAILABLE", "Choose from the current list of terms.", {"field": field, "codes": ",".join(codes)},
    )


class Vocabulary:
    """Every term, read in one query (a few hundred rows)."""

    def __init__(self, terms):
        self.terms = {(term.dimension, term.code): term for term in terms}

    @classmethod
    def load(cls, database):
        return cls(database.scalars(select(TaxonomyTerm)).all())

    def check(self, field, dimension, codes, kept=()):
        """Each code must be a current term. A retired one may stay where it already is, but nobody chooses it again."""
        wrong = [
            code for code in codes
            if (term := self.terms.get((dimension, code))) is None or (term.status != "active" and code not in kept)
        ]
        if wrong:
            raise unavailable(field, wrong)

    def parent(self, dimension, code):
        term = self.terms.get((dimension, code))
        return term.parent_code if term else None

    def places_around(self, codes):
        """Place code -> the given places it equals, lies inside or contains."""
        around = {}
        for code in codes:
            chosen = self.terms.get(("place", code))
            if chosen is None:
                continue
            for term in self.terms.values():
                if term.dimension == "place" and (
                    term.path == chosen.path or term.path.startswith(chosen.path + "/") or chosen.path.startswith(term.path + "/")
                ):
                    around.setdefault(term.code, []).append(code)
        return around


def term_views(database):
    order = {dimension: index for index, dimension in enumerate(TAXONOMY_DIMENSIONS)}
    terms = sorted(database.scalars(select(TaxonomyTerm)).all(), key=lambda term: (order[term.dimension], term.sort_order, term.code))
    return [
        TermView(
            dimension=term.dimension, code=term.code, parent=term.parent_code, sensitive=term.sensitive, status=term.status,
            names=TermNames(en=term.label_en, te=term.label_te, hi=term.label_hi),
        )
        for term in terms
    ]


def classifications(database, page_ids):
    """Page id -> {field: codes in the owner's order}, with an empty list for each part a page does not use."""
    found = {page_id: {field: [] for field in PAGE_FIELDS} for page_id in page_ids}
    if found:
        field_of = {dimension: field for field, dimension in PAGE_FIELDS.items()}
        rows = database.execute(
            select(PageTerm.page_id, PageTerm.dimension, PageTerm.code)
            .where(PageTerm.page_id.in_(list(found)))
            .order_by(PageTerm.position, PageTerm.code)
        ).all()
        for page_id, dimension, code in rows:
            found[page_id][field_of[dimension]].append(code)
    return found


def classify(database, vocabulary, page, requested, current):
    """Replaces each part of the classification that `requested` names, and returns whether anything changed."""
    changed = False
    for field, codes in requested.items():
        dimension = PAGE_FIELDS[field]
        if field == "other_topics":
            codes = [code for code in codes if code != page.topic]
        vocabulary.check(field, dimension, codes, kept=current[field])
        if codes == current[field]:
            continue
        database.execute(delete(PageTerm).where(PageTerm.page_id == page.id, PageTerm.dimension == dimension))
        database.add_all([
            PageTerm(page_id=page.id, dimension=dimension, code=code, position=position) for position, code in enumerate(codes)
        ])
        changed = True
    return changed


def canonical(requested):
    return ";".join(f"{field}={','.join(requested[field])}" for field in PAGE_FIELDS if field in requested)


def post_terms_of(database, post_ids):
    """Post id -> {"topics": codes, "interests": codes} in the owner's order, empty lists for a post without its own."""
    found = {post_id: {field: [] for field in POST_FIELDS} for post_id in post_ids}
    if found:
        field_of = {dimension: field for field, dimension in POST_FIELDS.items()}
        rows = database.execute(
            select(PostTerm.post_id, PostTerm.dimension, PostTerm.code)
            .where(PostTerm.post_id.in_(list(found)))
            .order_by(PostTerm.position, PostTerm.code)
        ).all()
        for post_id, dimension, code in rows:
            found[post_id][field_of[dimension]].append(code)
    return found


def tag_post(database, vocabulary, post_id, requested, current):
    """Replaces the topics or interests that `requested` names, and returns whether anything changed."""
    changed = False
    for field, codes in requested.items():
        dimension = POST_FIELDS[field]
        vocabulary.check(field, dimension, codes, kept=current[field])
        if codes == current[field]:
            continue
        database.execute(delete(PostTerm).where(PostTerm.post_id == post_id, PostTerm.dimension == dimension))
        database.add_all([
            PostTerm(post_id=post_id, dimension=dimension, code=code, position=position) for position, code in enumerate(codes)
        ])
        changed = True
    return changed


def near(word, target, limit):
    """Whether two words are at most `limit` single-letter changes apart."""
    if abs(len(word) - len(target)) > limit:
        return False
    previous = list(range(len(target) + 1))
    for row, letter in enumerate(word, 1):
        current = [row]
        for column, other in enumerate(target, 1):
            current.append(min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (letter != other)))
        if min(current) > limit:
            return False
        previous = current
    return previous[-1] <= limit


def searched_terms(vocabulary, query):
    """(dimension, code) of every term whose English, Telugu or Hindi name contains the words searched. Only when no name
    does, the terms whose name or one of its words is one or two letters from them, so a correct word never also brings
    its look-alikes (DEC-035). A place also brings the places inside it."""
    text = " ".join(query.casefold().split())
    if len(text) < 3:
        return set()
    limit = 0 if len(text) < 5 else 1 if len(text) < 8 else 2
    names = [
        ((term.dimension, term.code), name.casefold())
        for term in vocabulary.terms.values() for name in (term.label_en, term.label_te, term.label_hi) if name
    ]
    found = {key for key, name in names if text in name}
    if not found and limit:
        found = {
            key for key, name in names
            if near(text, name, limit) or any(near(text, word, limit) for word in name.replace(",", " ").split())
        }
    paths = [vocabulary.terms[key].path for key in found if key[0] == "place"]
    found |= {
        (term.dimension, term.code) for term in vocabulary.terms.values()
        if term.dimension == "place" and any(term.path.startswith(path + "/") for path in paths)
    }
    return found


def filtered(database, statement, filters):
    """Narrows a page query to every filter given (dimension -> code). A topic is any of a page's topics; a place also
    finds the pages of the places inside it. An unknown code is refused, so a mistyped filter never looks like no results."""
    for dimension, code in filters.items():
        term = database.get(TaxonomyTerm, (dimension, code))
        if term is None:
            raise unavailable(dimension, [code])
        if dimension == "place":
            inside = select(TaxonomyTerm.code).where(
                TaxonomyTerm.dimension == "place", or_(TaxonomyTerm.path == term.path, TaxonomyTerm.path.startswith(term.path + "/")),
            )
            codes = PageTerm.code.in_(inside)
        else:
            codes = PageTerm.code == code
        tagged = exists().where(PageTerm.page_id == PublicPage.id, PageTerm.dimension == dimension, codes)
        statement = statement.where(or_(PublicPage.topic == code, tagged) if dimension == "topic" else tagged)
    return statement


def interests_of(database, account_id):
    chosen = {field: [] for field in PERSON_FIELDS}
    field_of = {dimension: field for field, dimension in PERSON_FIELDS.items()}
    rows = database.execute(
        select(AccountInterest.dimension, AccountInterest.code)
        .where(AccountInterest.account_id == account_id)
        .order_by(AccountInterest.position, AccountInterest.code)
    ).all()
    for dimension, code in rows:
        chosen[field_of[dimension]].append(code)
    return chosen


def save_interests(database, vocabulary, account_id, current, wanted, now):
    for field, dimension in PERSON_FIELDS.items():
        vocabulary.check(field, dimension, wanted[field], kept=current[field])
    since = {
        (dimension, code): chosen_at
        for dimension, code, chosen_at in database.execute(
            select(AccountInterest.dimension, AccountInterest.code, AccountInterest.chosen_at).where(AccountInterest.account_id == account_id)
        ).all()
    }
    database.execute(delete(AccountInterest).where(AccountInterest.account_id == account_id))
    database.add_all([
        AccountInterest(
            account_id=account_id, dimension=dimension, code=code, position=position,
            chosen_at=since.get((dimension, code), now),
        )
        for field, dimension in PERSON_FIELDS.items()
        for position, code in enumerate(wanted[field])
    ])


class Matcher:
    """One person's choices, prepared once to find and score pages by the interests-1 rules."""

    def __init__(self, vocabulary, chosen):
        self.vocabulary = vocabulary
        self.topics, self.interests = set(chosen["topics"]), set(chosen["interests"])
        self.languages = set(chosen["languages"])
        # A topic above a chosen interest -> those interests; and the interests under a chosen topic.
        self.above = {}
        for code in chosen["interests"]:
            self.above.setdefault(vocabulary.parent("interest", code), []).append(code)
        self.under = {
            term.code for term in vocabulary.terms.values() if term.dimension == "interest" and term.parent_code in self.topics
        }
        self.around = vocabulary.places_around(chosen["places"])
        self.positions = {
            (dimension, code): position for field, dimension in PERSON_FIELDS.items() for position, code in enumerate(chosen[field])
        }

    def candidates(self, database, viewer, blocked, avoid=None):
        """Active pages matching a chosen topic, interest or place, most followed first, at most MOST_SCORED of them.
        `blocked` holds page ids to leave out and `avoid` a condition no candidate may meet."""
        topics = self.topics | set(self.above)
        interests = self.interests | self.under

        def tagged(dimension, codes):
            return exists().where(PageTerm.page_id == PublicPage.id, PageTerm.dimension == dimension, PageTerm.code.in_(codes))

        matches = []
        if topics:
            matches += [PublicPage.topic.in_(topics), tagged("topic", topics)]
        if interests:
            matches.append(tagged("interest", interests))
        if self.around:
            matches.append(tagged("place", set(self.around)))
        if not matches:
            return []
        statement = select(PublicPage).where(
            PublicPage.status == "active", PublicPage.moderation_hidden_at.is_(None), PublicPage.moderation_limited_at.is_(None),
            PublicPage.owner_id != viewer.id,
            PublicPage.id.notin_(select(PageFollow.page_id).where(PageFollow.account_id == viewer.id)), or_(*matches),
        )
        if blocked:
            statement = statement.where(PublicPage.id.notin_(blocked))
        if avoid is not None:
            statement = statement.where(~avoid)
        return database.scalars(statement.order_by(PublicPage.follower_count.desc(), PublicPage.id.desc()).limit(MOST_SCORED)).all()

    def score(self, page, fields):
        """Points for one page and the person's own choices it matched; 0 when it matched only a language."""
        points, reasons = 0, set()
        for code in fields["interests"]:
            if code in self.interests:
                points += POINTS["interest"]
                reasons.add(("interest", code))
            elif (parent := self.vocabulary.parent("interest", code)) in self.topics:
                points += POINTS["related"]
                reasons.add(("topic", parent))
        for code in [page.topic, *fields["other_topics"]]:
            if code in self.topics:
                points += POINTS["topic"]
                reasons.add(("topic", code))
            elif code in self.above:
                points += POINTS["related"]
                reasons.update(("interest", interest) for interest in self.above[code])
        for code in fields["places"]:
            if code in self.around:
                points += POINTS["place"]
                reasons.update(("place", place) for place in self.around[code])
        if not points:
            return 0, []
        for code in fields["languages"]:
            if code in self.languages:
                points += POINTS["language"]
                reasons.add(("language", code))
        ordered = sorted(reasons, key=lambda reason: (REASON_ORDER.index(reason[0]), self.positions[reason]))
        return points, [SuggestionReason(dimension=dimension, code=code) for dimension, code in ordered]

    # Posts from your interests (DEC-036): a filter on subjects only, newest first, with no points.

    def page_match(self):
        """The condition for a page about a chosen topic or interest: its main topic, other topics or interests, an
        interest under a chosen topic included. None when the person chose no topic and no interest."""
        topics, interests = self.topics, self.interests | self.under
        if not topics and not interests:
            return None

        def page(dimension, codes):
            return exists().where(PageTerm.page_id == PublicPage.id, PageTerm.dimension == dimension, PageTerm.code.in_(codes))

        found = []
        if topics:
            found += [PublicPage.topic.in_(topics), page("topic", topics)]
        if interests:
            found.append(page("interest", interests))
        return or_(*found)

    def post_match(self):
        """The condition for a post about a chosen topic or interest: its own topics and interests, or, when it has
        none, its page's (page_match). An interest under a chosen topic counts; the topic above a chosen interest does
        not, so choosing composting does not bring every gardening post. None when the person chose no topic and no
        interest."""
        inherited = self.page_match()
        if inherited is None:
            return None
        topics, interests = self.topics, self.interests | self.under

        def own(dimension, codes):
            return exists().where(PostTerm.post_id == PublicPost.id, PostTerm.dimension == dimension, PostTerm.code.in_(codes))

        tagged = ([own("topic", topics)] if topics else []) + ([own("interest", interests)] if interests else [])
        untagged = ~exists().where(PostTerm.post_id == PublicPost.id)
        return or_(*tagged, and_(untagged, inherited))

    def post_reasons(self, subjects):
        """The person's own topics and interests that {"topics", "interests"} matched, as post_match counts them."""
        reasons = set()
        for code in subjects["interests"]:
            if code in self.interests:
                reasons.add(("interest", code))
            elif (parent := self.vocabulary.parent("interest", code)) in self.topics:
                reasons.add(("topic", parent))
        reasons.update(("topic", code) for code in subjects["topics"] if code in self.topics)
        ordered = sorted(reasons, key=lambda reason: (REASON_ORDER.index(reason[0]), self.positions[reason]))
        return [SuggestionReason(dimension=dimension, code=code) for dimension, code in ordered]


# Vocabulary administration (T128): the platform's operators add, name, retire and restore terms; nothing else does.

CODE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
NAME_LIMITS = {"en": 80, "te": 120, "hi": 120}
PARENT_KIND = {"interest": "topic", "place": "place"}


def refuse(message):
    raise SystemExit(message)


def names(en=None, te=None, hi=None):
    given = {"en": en, "te": te, "hi": hi}
    checked = {}
    for language, value in given.items():
        if value is None:
            continue
        try:
            checked[language] = clean_text(value, NAME_LIMITS[language], multiline=False)
        except ValueError as error:
            refuse(f"The {language} name: {error}")
    return checked


def record(database, term, action, details, now):
    database.add(TaxonomyTermChange(
        id=str(uuid4()), dimension=term.dimension, code=term.code, action=action,
        details=json.dumps(details, ensure_ascii=False, sort_keys=True), changed_by="operator", changed_at=now,
    ))


def add_term(database, dimension, code, now, en, te=None, hi=None, parent=None, sensitive=False):
    """Adds a term, or changes nothing when the same term is already there. Returns whether anything changed."""
    if not CODE.fullmatch(code) or len(code) > 64:
        refuse("Use lowercase letters and digits, with single hyphens between them, up to 64 characters.")
    if dimension == "topic" and len(code) > 20:
        refuse("A topic code has at most 20 characters, the size of a page's main topic.")
    given = names(en, te, hi)
    if "en" not in given:
        refuse("Give the English name.")
    above = None
    if parent is not None:
        if dimension not in PARENT_KIND:
            refuse(f"A {dimension} stands alone and has no parent.")
        above = database.get(TaxonomyTerm, (PARENT_KIND[dimension], parent))
        if above is None:
            refuse(f"No {PARENT_KIND[dimension]} has the code {parent}.")
    elif dimension == "interest":
        refuse("An interest sits under a topic: give --parent.")
    wanted = {
        "parent": parent, "sensitive": sensitive, "en": given["en"], "te": given.get("te"), "hi": given.get("hi"),
    }
    existing = database.get(TaxonomyTerm, (dimension, code), with_for_update=True)
    if existing is not None:
        current = {
            "parent": existing.parent_code, "sensitive": existing.sensitive, "en": existing.label_en,
            "te": existing.label_te, "hi": existing.label_hi,
        }
        if current != wanted:
            refuse(f"The {dimension} {code} already exists with other details; use name, retire or restore.")
        return False
    order = database.scalar(select(func.max(TaxonomyTerm.sort_order)).where(TaxonomyTerm.dimension == dimension))
    term = TaxonomyTerm(
        dimension=dimension, code=code, parent_dimension=PARENT_KIND[dimension] if above else None, parent_code=parent,
        path=f"{above.path}/{code}" if above else code, sort_order=(order if order is not None else -1) + 1,
        sensitive=sensitive, status="active", label_en=given["en"], label_te=given.get("te"), label_hi=given.get("hi"),
    )
    database.add(term)
    database.flush()
    record(database, term, "added", wanted, now)
    return True


def existing_term(database, dimension, code):
    term = database.get(TaxonomyTerm, (dimension, code), with_for_update=True)
    if term is None:
        refuse(f"No {dimension} has the code {code}.")
    return term


def name_term(database, dimension, code, now, en=None, te=None, hi=None):
    term = existing_term(database, dimension, code)
    given = names(en, te, hi)
    if not given:
        refuse("Give at least one of --en, --te and --hi.")
    changed = {language: value for language, value in given.items() if getattr(term, f"label_{language}") != value}
    for language, value in changed.items():
        setattr(term, f"label_{language}", value)
    if changed:
        record(database, term, "named", changed, now)
    return bool(changed)


def set_term_status(database, dimension, code, now, status):
    """A retired term stays on the pages and choices that have it, but nobody chooses it again."""
    term = existing_term(database, dimension, code)
    if term.status == status:
        return False
    term.status = status
    record(database, term, "retired" if status == "retired" else "restored", {"status": status}, now)
    return True
