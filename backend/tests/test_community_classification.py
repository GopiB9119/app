"""DEC-027 (T126, T127): the shared vocabulary, page classification, chosen interests and suggested pages."""

from collections import Counter
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.modules.community.models import AccountInterest, CommunityAuditEvent, PageTerm, PublicPage
from tests.test_account_deletion import request_deletion
from tests.test_community import advance, create_page
from tests.test_exports import download, ready_export
from tests.test_identity import account, auth
from tests.test_page_lifecycle import archive, delete

COUNTS = {
    "topic": 20, "interest": 79, "language": 31, "place": 110, "community_type": 9, "audience": 8, "activity": 7,
    "content_kind": 7,
}
LEGACY_TOPICS = {"community", "education", "health", "local", "family", "events", "hobbies", "support", "news", "other"}
SENSITIVE = {
    ("topic", "health"), ("topic", "support"), ("interest", "nutrition"), ("interest", "mental-health"),
    ("interest", "caregiving"), ("interest", "elder-care"), ("interest", "peer-support"), ("community_type", "support-group"),
    ("audience", "caregivers"), ("activity", "support"),
}
EMPTY = {
    "other_topics": [], "interests": [], "languages": [], "places": [], "community_types": [], "audiences": [],
    "activities": [], "content_kinds": [],
}
GARDEN = {
    "other_topics": ["environment", "food"], "interests": ["composting", "gardening"], "languages": ["te", "en"],
    "places": ["in-telangana-hyderabad"], "community_types": ["hobby"], "audiences": ["beginners"],
    "activities": ["learning", "sharing-tips"], "content_kinds": ["tutorials"],
}


def terms(client):
    response = client.get("/v1/taxonomy")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def page(client, owner, handle, topic, key=None, **classification):
    response = create_page(
        client, owner, handle=handle, name=handle.replace("-", " ").title(), topic=topic, classification=classification, key=key,
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def edit(client, owner, current, **body):
    return client.patch(f"/v1/pages/{current['id']}", headers={**auth(owner), "If-Match": current["etag"]}, json=body)


def handles(client, query):
    response = client.get(f"/v1/discover/pages?{query}")
    assert response.status_code == 200, (query, response.text)
    return sorted(item["handle"] for item in response.json()["data"])


def interests(client, person):
    response = client.get("/v1/me/interests", headers=auth(person))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def choose(client, person, etag=None, **lists):
    body = {"topics": [], "interests": [], "languages": [], "places": [], **lists}
    return client.put("/v1/me/interests", headers={**auth(person), **({"If-Match": etag} if etag else {})}, json=body)


def chosen(client, person, **lists):
    response = choose(client, person, interests(client, person)["etag"], **lists)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def suggestions(client, person, **params):
    response = client.get("/v1/me/suggested-pages", headers=auth(person), params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def set_status(app, dimension, code, status):
    with app.state.engine.begin() as connection:
        connection.execute(
            text("UPDATE taxonomy_terms SET status = :status WHERE dimension = :dimension AND code = :code"),
            {"status": status, "dimension": dimension, "code": code},
        )


def test_the_shared_vocabulary_is_public_complete_and_in_three_languages(client):
    listed = terms(client)
    assert Counter(term["dimension"] for term in listed) == COUNTS
    by_key = {(term["dimension"], term["code"]): term for term in listed}
    assert len(by_key) == len(listed)
    for term in listed:
        assert term["status"] == "active" and all(term["names"][language] for language in ("en", "te", "hi")), term
        if term["dimension"] == "interest":
            assert ("topic", term["parent"]) in by_key, term
        elif term["dimension"] == "place":
            assert term["parent"] is None or ("place", term["parent"]) in by_key, term
        else:
            assert term["parent"] is None, term
    topics = [term["code"] for term in listed if term["dimension"] == "topic"]
    assert topics[:3] == ["technology", "education", "business"] and LEGACY_TOPICS <= set(topics)
    # The owner's example: composting sits under environment and gardening.
    assert by_key[("interest", "composting")]["parent"] == "environment"
    assert by_key[("topic", "environment")]["names"]["en"] == "Environment and gardening"
    # India's 28 states and 8 union territories, each with its main cities inside it.
    assert sum(1 for term in listed if term["dimension"] == "place" and term["parent"] == "in") == 36
    assert by_key[("place", "in-telangana-hyderabad")]["parent"] == "in-telangana"
    places = [term["code"] for term in listed if term["dimension"] == "place"]
    assert places[:3] == ["in", "in-andhra-pradesh", "in-andhra-pradesh-visakhapatnam"]
    assert {key for key, term in by_key.items() if term["sensitive"]} == SENSITIVE


def test_the_owner_classifies_a_page_and_everyone_sees_it(client, app):
    owner = account(client, app)
    key = str(uuid4())
    created = page(client, owner, "compost-club", "environment", key=key, **GARDEN)
    # The main topic is not repeated among the other topics.
    expected = {**GARDEN, "other_topics": ["food"]}
    assert created["topic"] == "environment" and created["classification"] == expected
    assert page(client, owner, "compost-club", "environment", key=key, **GARDEN)["id"] == created["id"]
    changed = create_page(client, owner, handle="compost-club", name="Compost Club", topic="environment",
                          classification={**GARDEN, "languages": ["en"]}, key=key)
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert client.get("/v1/pages/compost-club").json()["data"]["classification"] == expected
    assert create_page(client, owner, handle="plain-page", name="Plain Page").json()["data"]["classification"] == EMPTY

    other = account(client, app, "other@example.test")
    assert edit(client, other, created, classification={"interests": []}).status_code == 403
    path = f"/v1/pages/{created['id']}"
    assert client.patch(path, headers=auth(owner), json={"classification": {"interests": []}}).status_code == 428
    updated = edit(client, owner, created, classification={"interests": ["soil-health", "composting"], "places": []})
    assert updated.status_code == 200, updated.text
    after = updated.json()["data"]
    assert after["classification"] == {**expected, "interests": ["soil-health", "composting"], "places": []}
    assert after["etag"] != created["etag"]
    stale = edit(client, owner, created, classification={"interests": []})
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "CONTENT_CHANGED"
    # Choosing an other topic as the main one takes it out of the other topics.
    moved = edit(client, owner, after, topic="food")
    assert moved.status_code == 200, moved.text
    assert (moved.json()["data"]["topic"], moved.json()["data"]["classification"]["other_topics"]) == ("food", [])
    # Sending what is already there changes nothing, so the reviewed version stays.
    same = edit(client, owner, moved.json()["data"], classification={"languages": ["te", "en"]})
    assert same.status_code == 200 and same.json()["data"]["etag"] == moved.json()["data"]["etag"]
    with app.state.sessions() as database:
        updates = select(func.count()).select_from(CommunityAuditEvent).where(CommunityAuditEvent.action == "public.page_updated")
        assert database.scalar(updates) == 2


def test_classification_takes_only_current_terms_within_the_limits(client, app):
    owner = account(client, app)

    def attempt(**classification):
        return create_page(client, owner, handle="garden-help", name="Garden Help", topic="environment", classification=classification)

    unknown = attempt(interests=["composting", "moon-farming"])
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "TERM_UNAVAILABLE"
    assert unknown.json()["error"]["details"] == {"field": "interests", "codes": "moon-farming"}
    # A code of another kind is not accepted in its place.
    assert attempt(languages=["composting"]).json()["error"]["details"] == {"field": "languages", "codes": "composting"}
    eleven = [term["code"] for term in terms(client) if term["dimension"] == "interest"][:11]
    for classification in (
        {"interests": ["gardening", "gardening"]}, {"interests": ["Gardening"]}, {"interests": None}, {"interests": eleven},
        {"other_topics": ["food", "travel", "news"]}, {"places": ["in", "us", "gb", "ae"]}, {"colours": ["green"]},
    ):
        assert attempt(**classification).status_code == 422, classification
    gossip = create_page(client, owner, handle="garden-help", name="Garden Help", topic="gossip")
    assert gossip.status_code == 422 and gossip.json()["error"]["code"] == "TERM_UNAVAILABLE"
    at_limit = create_page(client, owner, handle="long-topic", name="Long Topic", topic="a" * 20)
    assert at_limit.status_code == 422 and at_limit.json()["error"]["code"] == "TERM_UNAVAILABLE"
    long_topic = create_page(client, owner, handle="long-topic", name="Long Topic", topic="a" * 21)
    assert long_topic.status_code == 422 and long_topic.json()["error"]["code"] == "VALIDATION_ERROR"
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(PublicPage)) == 0
        assert database.scalar(select(func.count()).select_from(PageTerm)) == 0

    # Like other edits, the classification of a read-only page stays as it is.
    plain = page(client, owner, "garden-help", "environment")
    read_only = archive(client, owner, plain, plain["etag"]).json()["data"]
    refused = edit(client, owner, read_only, classification={"interests": ["composting"]})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "PAGE_READ_ONLY"


def test_a_retired_term_stays_where_it_is_but_cannot_be_chosen_again(client, app):
    owner = account(client, app)
    club = page(client, owner, "compost-club", "environment", interests=["composting"])
    sam = account(client, app, "sam@example.test")
    mine = chosen(client, sam, interests=["composting"])
    try:
        set_status(app, "interest", "composting", "retired")
        assert {term["code"]: term["status"] for term in terms(client)}["composting"] == "retired"
        kept = edit(client, owner, club, classification={"interests": ["composting", "gardening"]})
        assert kept.status_code == 200, kept.text
        again = create_page(client, owner, handle="compost-two", name="Compost Two", topic="environment",
                            classification={"interests": ["composting"]})
        assert again.status_code == 422 and again.json()["error"]["code"] == "TERM_UNAVAILABLE"
        assert choose(client, sam, mine["etag"], interests=["composting", "gardening"]).status_code == 200
        kim = account(client, app, "kim@example.test")
        assert choose(client, kim, interests(client, kim)["etag"], interests=["composting"]).status_code == 422
        # Pages that have it are still found by it.
        assert handles(client, "interest=composting") == ["compost-club"]
    finally:
        set_status(app, "interest", "composting", "active")


def test_discover_finds_pages_by_any_part_of_their_classification(client, app):
    owner = account(client, app)
    page(client, owner, "compost-club", "environment", **GARDEN)
    page(client, owner, "bengaluru-bakers", "food", other_topics=["environment"], interests=["baking"], languages=["en", "kn"],
         places=["in-karnataka-bengaluru"])
    page(client, owner, "seattle-coders", "technology", places=["us"], languages=["en"])
    assert handles(client, "topic=environment") == ["bengaluru-bakers", "compost-club"]
    assert handles(client, "topic=food") == ["bengaluru-bakers", "compost-club"]
    assert handles(client, "interest=composting") == ["compost-club"]
    assert handles(client, "language=en") == ["bengaluru-bakers", "compost-club", "seattle-coders"]
    assert handles(client, "language=kn") == ["bengaluru-bakers"]
    # A country or state also finds the pages of the places inside it.
    assert handles(client, "place=in") == ["bengaluru-bakers", "compost-club"]
    assert handles(client, "place=in-telangana") == ["compost-club"]
    assert handles(client, "place=in-telangana-hyderabad") == ["compost-club"]
    assert handles(client, "place=us") == ["seattle-coders"]
    assert handles(client, "community_type=hobby&audience=beginners&activity=learning&content_kind=tutorials") == ["compost-club"]
    assert handles(client, "topic=environment&place=in-karnataka") == ["bengaluru-bakers"]
    assert handles(client, "q=bakers&topic=technology") == []
    for query in ("interest=moon-farming", "place=atlantis", "topic=gossip", "language=EN", "place=in/in-telangana", "audience="):
        assert client.get(f"/v1/discover/pages?{query}").status_code == 422, query
    first = client.get("/v1/discover/pages", params={"topic": "environment", "limit": 1}).json()
    cursor = first["pagination"]["next_cursor"]
    assert client.get("/v1/discover/pages", params={"topic": "environment", "limit": 1, "cursor": cursor}).status_code == 200
    # The filters are part of the list, so a cursor from one list cannot continue another.
    other = client.get("/v1/discover/pages", params={"topic": "food", "limit": 1, "cursor": cursor})
    assert other.status_code == 400 and other.json()["error"]["code"] == "CURSOR_INVALID"


def test_page_search_finds_pages_by_the_names_of_their_terms_even_with_a_typo(client, app):
    # T138 (DEC-035): nothing in this page's name, handle or description says composting, Hyderabad or Telangana.
    owner = account(client, app)
    page(client, owner, "garden-club", "environment", interests=["composting"], places=["in-telangana-hyderabad"])
    page(client, owner, "river-walkers", "hobbies")
    # "Cloud computing" is two letters from "composting": a word that matches a name exactly must not bring it.
    page(client, owner, "tech-meet", "technology", interests=["cloud"])

    def found(text):
        response = client.get("/v1/discover/pages", params={"q": text})
        assert response.status_code == 200, (text, response.text)
        return sorted(item["handle"] for item in response.json()["data"])

    assert found("composting") == ["garden-club"]
    assert found("Compostng") == ["garden-club"]
    assert found("Hydrabad") == ["garden-club"]
    # A state finds the pages of the cities inside it.
    assert found("telangana") == ["garden-club"]
    assert found("కంపోస్టింగ్") == ["garden-club"]
    assert found("कंपोस्टिंग") == ["garden-club"]
    # Every page carries the helper's description "Weekend walks by the river.": only one page's name says walkers.
    assert found("walkers") == ["river-walkers"]
    assert found("river") == ["garden-club", "river-walkers", "tech-meet"]
    assert found("cloud") == ["tech-meet"]
    for text in ("xyzzy", "compo stink garden party"):
        assert found(text) == [], text


def test_a_person_chooses_private_interests_with_the_reviewed_version(client, app):
    assert client.get("/v1/me/interests").status_code == 401
    alex = account(client, app)
    empty = interests(client, alex)
    assert {name: value for name, value in empty.items() if name != "etag"} == {"topics": [], "interests": [], "languages": [], "places": []}
    wanted = {"topics": ["environment"], "interests": ["composting", "soil-health"], "languages": ["te"], "places": ["in-telangana"]}
    assert choose(client, alex, **wanted).status_code == 428
    saved = choose(client, alex, empty["etag"], **wanted)
    assert saved.status_code == 200, saved.text
    data = saved.json()["data"]
    assert {name: data[name] for name in wanted} == wanted and data["etag"] != empty["etag"]
    assert interests(client, alex) == data
    # Sending the saved choice again succeeds even with the earlier version, so a retry is safe; a change needs the current one.
    assert choose(client, alex, empty["etag"], **wanted).json()["data"] == data
    stale = choose(client, alex, empty["etag"], topics=["food"])
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "CONTENT_CHANGED"
    unknown = choose(client, alex, data["etag"], interests=["moon-farming"])
    assert unknown.status_code == 422 and unknown.json()["error"]["details"] == {"field": "interests", "codes": "moon-farming"}
    assert choose(client, alex, data["etag"], places=["in-telangana"]).status_code == 200
    latest = interests(client, alex)
    whole = client.put("/v1/me/interests", headers={**auth(alex), "If-Match": latest["etag"]}, json={"topics": []})
    assert whole.status_code == 422
    for lists in ({"places": ["in", "in"]}, {"languages": ["te", "hi", "en", "ta", "kn", "ml"]}, {"topics": ["Food"]}):
        assert choose(client, alex, latest["etag"], **lists).status_code == 422, lists
    # Nobody else sees them.
    sam = account(client, app, "sam@example.test")
    assert {name: value for name, value in interests(client, sam).items() if name != "etag"} == {
        "topics": [], "interests": [], "languages": [], "places": [],
    }
    assert "interests" not in client.get("/v1/me", headers=auth(alex)).json()["data"]


def test_suggested_pages_follow_the_interests_rules_and_say_what_matched(client, app):
    assert client.get("/v1/me/suggested-pages").status_code == 401
    owner = account(client, app, "owner@example.test")
    second = account(client, app, "second@example.test")
    fan = account(client, app, "fan@example.test")
    alex = account(client, app)
    page(client, owner, "compost-club", "environment", interests=["composting"], languages=["te"], places=["in-telangana-hyderabad"])
    page(client, owner, "garden-friends", "environment", interests=["gardening"])
    page(client, owner, "cricket-fans", "sports", interests=["cricket"], places=["in"])
    page(client, owner, "telugu-movies", "entertainment", languages=["te"])
    followed = page(client, owner, "followed-greens", "environment")
    blocked = page(client, second, "blocked-greens", "environment")
    quiet = page(client, second, "quiet-greens", "environment")
    page(client, second, "hidden-greens", "environment")
    walkers = page(client, second, "green-walkers", "environment", interests=["gardening"])
    page(client, alex, "alex-greens", "environment")
    assert client.post(f"/v1/pages/{followed['id']}/follow", headers=auth(alex), json={}).status_code == 200
    assert client.post(f"/v1/pages/{walkers['id']}/follow", headers=auth(fan), json={}).status_code == 200
    assert client.post("/v1/blocks", headers=auth(alex), json={"target_type": "page", "target_id": blocked["id"]}).status_code == 201
    assert archive(client, second, quiet, quiet["etag"]).status_code == 200
    with app.state.engine.begin() as connection:
        connection.execute(text("UPDATE public_pages SET moderation_hidden_at = now() WHERE handle = 'hidden-greens'"))

    assert suggestions(client, alex) == {"ranking": "interests-1", "items": []}
    chosen(client, alex, topics=["environment"], interests=["composting", "cricket"], languages=["te"], places=["in-telangana"])
    found = suggestions(client, alex)
    assert found["ranking"] == "interests-1"

    def reason(dimension, code):
        return {"dimension": dimension, "code": code}

    # 4 + 3 + 2 + 1; 4 + 2 (sports is above cricket) + 2 (India contains Telangana); then 3 + 2 twice, the followed page first.
    assert [(item["page"]["handle"], item["reasons"]) for item in found["items"]] == [
        ("compost-club", [reason("interest", "composting"), reason("topic", "environment"), reason("place", "in-telangana"), reason("language", "te")]),
        ("cricket-fans", [reason("interest", "cricket"), reason("place", "in-telangana")]),
        ("green-walkers", [reason("topic", "environment")]),
        ("garden-friends", [reason("topic", "environment")]),
    ]
    first = found["items"][0]["page"]
    assert first["following"] is False and first["classification"]["interests"] == ["composting"]
    assert [item["page"]["handle"] for item in suggestions(client, alex, limit=1)["items"]] == ["compost-club"]
    assert client.get("/v1/me/suggested-pages?limit=21", headers=auth(alex)).status_code == 422
    # Someone else's choices give them their own suggestions.
    chosen(client, fan, interests=["cricket"])
    assert [item["page"]["handle"] for item in suggestions(client, fan)["items"]] == ["cricket-fans"]


def test_choices_and_classification_leave_with_the_account_and_come_with_its_data(client, app):
    alex = account(client, app)
    page(client, alex, "alex-greens", "health", interests=["composting"], places=["in-telangana"])
    chosen(client, alex, topics=["environment"], interests=["composting"], places=["in-telangana-hyderabad"])
    archived = download(client, alex, ready_export(client, app, alex, ["profile"])).json()["data"]
    assert [(item["dimension"], item["code"], item["name"]) for item in archived["profile"]["interests"]] == [
        ("topic", "environment", "Environment and gardening"), ("interest", "composting", "Composting"),
        ("place", "in-telangana-hyderabad", "Hyderabad"),
    ]
    assert request_deletion(client, alex).status_code == 202
    advance(app, days=7, minutes=1)
    assert app.state.account_deletion.purge_due() == {"purged": 1, "blocked": 0}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(AccountInterest)) == 0
        assert database.scalar(select(func.count()).select_from(PageTerm)) == 0
        assert database.scalar(select(PublicPage.topic)) == "other"


def test_an_erased_page_loses_its_classification(client, app):
    owner = account(client, app)
    club = page(client, owner, "compost-club", "support", interests=["composting"], languages=["te"])
    assert delete(client, owner, club, etag=club["etag"]).status_code == 200
    assert app.state.page_lifecycle.purge_due() == {"purged": 0}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(PageTerm)) == 2
        assert database.get(PublicPage, club["id"]).topic == "support"
    advance(app, days=7, minutes=1)
    expired = create_page(client, owner, handle="expired-session", name="Expired Session", topic="support")
    assert expired.status_code == 401 and expired.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    assert app.state.page_lifecycle.purge_due() == {"purged": 1}
    with app.state.sessions() as database:
        assert database.scalar(select(func.count()).select_from(PageTerm)) == 0
        # A support or health topic would say something about the owner, so the erased page keeps none.
        assert database.get(PublicPage, club["id"]).topic == "other"


def test_openapi_declares_the_vocabulary_public_and_choices_private(client):
    schema = client.get("/openapi.json").json()
    assert "security" not in schema["paths"]["/v1/taxonomy"]["get"]
    for method, path in (("get", "/v1/me/interests"), ("put", "/v1/me/interests"), ("get", "/v1/me/suggested-pages")):
        assert schema["paths"][path][method]["security"] == [{"AccountSession": []}], path
    assert "classification" in schema["components"]["schemas"]["PageView"]["required"]
    discover = {parameter["name"] for parameter in schema["paths"]["/v1/discover/pages"]["get"]["parameters"]}
    assert {"topic", "interest", "language", "place", "community_type", "audience", "activity", "content_kind"} <= discover


def test_the_migration_refuses_a_downgrade_that_would_lose_classification(client, app):
    owner = account(client, app)
    legacy = create_page(client, owner).json()["data"]
    config = Config("alembic.ini")
    try:
        command.downgrade(config, "0031")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT topic FROM public_pages")) == "hobbies"
    finally:
        command.upgrade(config, "head")
    assert client.get(f"/v1/pages/{legacy['id']}").json()["data"] == {**legacy, "etag": None, "can_manage": False}

    def refused():
        with pytest.raises(RuntimeError, match="0032"):
            command.downgrade(config, "0031")
        with app.state.engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == ScriptDirectory.from_config(config).get_current_head()

    # A main topic added by 0032, a page's classification and a person's choices each have nowhere to go before it.
    tech = page(client, owner, "tech-talk", "technology")
    refused()
    tech = edit(client, owner, tech, topic="hobbies").json()["data"]
    tech = edit(client, owner, tech, classification={"languages": ["te"]}).json()["data"]
    refused()
    assert edit(client, owner, tech, classification={"languages": []}).status_code == 200
    chosen(client, owner, languages=["te"])
    refused()
    from tests.test_migrations import test_migrated_schema_matches_models

    test_migrated_schema_matches_models(app)
