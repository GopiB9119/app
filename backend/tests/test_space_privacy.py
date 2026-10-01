import re
from uuid import uuid4

import pytest

from tests.test_identity import account, auth
from tests.test_messaging import roster_entry
from tests.test_security_sweep import counts
from tests.test_space_directory import ask, group, set_visibility
from tests.test_spaces import create_space, invite_account, ownership_fixture

SPACE = "space-under-test"
MISSING = (404, {"error": {"code": "NOT_FOUND", "message": "Space not found.", "details": {}}})


def example(schema, components):
    """A value that passes the schema, so a call gets past validation to the code that decides who may see the Space."""
    if "$ref" in schema:
        return example(components[schema["$ref"].rsplit("/", 1)[-1]], components)
    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema:
            options = [option for option in schema[key] if option.get("type") != "null"]
            return example(options[0], components) if options else None
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    kind = schema.get("type")
    if kind == "object":
        required = set(schema.get("required", []))
        return {name: SPACE if name == "space_id" else example(value, components)
                for name, value in schema.get("properties", {}).items() if name in required or name == "space_id"}
    if kind == "array":
        return [example(schema.get("items", {}), components) for _ in range(schema.get("minItems", 0))]
    if kind == "string":
        formats = {"uuid": str(uuid4()), "date-time": "2026-10-02T10:00:00Z", "date": "2026-10-02", "email": "someone@example.test"}
        return formats.get(schema.get("format"), "x" * max(1, schema.get("minLength", 1)))
    if kind in {"integer", "number"}:
        return max(schema.get("minimum", 1), 1)
    if kind == "boolean":
        return True
    return None


def space_operations(app):
    """Every signed-in operation that names a Space in its path, its query or its body."""
    schema = app.openapi()
    components = schema["components"]["schemas"]
    found = []
    for path, item in schema["paths"].items():
        for method, operation in item.items():
            if method not in {"get", "post", "put", "patch", "delete"} or not operation.get("security"):
                continue
            query = {parameter["name"]: SPACE if parameter["name"] == "space_id" else example(parameter.get("schema", {}), components)
                     for parameter in operation.get("parameters", [])
                     if parameter["in"] == "query" and (parameter.get("required") or parameter["name"] == "space_id")}
            content = operation.get("requestBody", {}).get("content", {}).get("application/json")
            body = example(content["schema"], components) if content else None
            if "{space_id}" in path or "space_id" in query or (isinstance(body, dict) and body.get("space_id") == SPACE):
                found.append({"method": method.upper(), "path": path, "query": query, "body": body})
    return found


def substitute(value, space_id):
    if value == SPACE:
        return space_id
    if isinstance(value, dict):
        return {name: substitute(item, space_id) for name, item in value.items()}
    if isinstance(value, list):
        return [substitute(item, space_id) for item in value]
    return value


def answer(response):
    try:
        body = response.json()
    except ValueError:
        return response.status_code, response.text
    if isinstance(body, dict):
        body.pop("request_id", None)
    return response.status_code, body


def compare_with_missing(client, app, person, space_id, known=None):
    """Calls each operation with the real Space and with an unused ID, keeping everything else the same.

    `known` holds IDs the person really knows (an invitation they received, their own join request, an ownership offer
    made to them), so those paths are compared on real objects too. Returns (operations, answered past validation,
    differences)."""
    checked, reached, differences = 0, 0, []
    for operation in space_operations(app):
        others = {name: (known or {}).get(name, str(uuid4())) for name in re.findall(r"{(\w+)}", operation["path"]) if name != "space_id"}
        answers = []
        for target in (space_id, str(uuid4())):
            path = operation["path"].replace("{space_id}", target)
            for name, value in others.items():
                path = path.replace(f"{{{name}}}", value)
            headers = {**auth(person), "Idempotency-Key": str(uuid4()), "If-Match": '"stale"'}
            response = client.request(operation["method"], path, headers=headers,
                                      params=substitute(operation["query"], target) or None, json=substitute(operation["body"], target))
            answers.append(answer(response))
        checked += 1
        reached += answers[0][0] != 422
        if answers[0] != answers[1]:
            differences.append((operation["method"], operation["path"], *answers))
    return checked, reached, differences


@pytest.mark.parametrize("space_type", ["family", "couple", "solo", "group"])
def test_a_private_space_answers_an_outsider_exactly_like_a_missing_one(client, app, space_type):
    owner = account(client, app)
    outsider = account(client, app, "outsider@example.test")
    known = {}
    if space_type == "group":
        # The outsider asked to join while the group was public; it is private now, and they are still outside it.
        space_id = group(client, owner).json()["data"]["id"]
        asked = ask(client, outsider, space_id)
        assert asked.status_code == 201, asked.text
        known["request_id"] = asked.json()["data"]["id"]
        assert set_visibility(client, owner, space_id, "private").status_code == 200
    else:
        created = create_space(client, owner, space_type=space_type)
        assert created.status_code == 201, created.text
        space_id = created.json()["data"]["id"]
    if space_type != "solo":
        invited = invite_account(client, owner, space_id, outsider["user"]["id"])
        assert invited.status_code == 201, invited.text
        known["invitation_id"] = invited.json()["data"]["id"]
    before = counts(app)
    checked, reached, differences = compare_with_missing(client, app, outsider, space_id, known)
    assert differences == []
    assert checked >= 30 and reached >= 20, (checked, reached)
    assert counts(app) == before


def test_a_former_member_learns_nothing_except_the_repeat_of_their_own_leave(client, app):
    owner, member, space_id, _invitation, transfer, _headers, _body = ownership_fixture(client, app)
    mine = roster_entry(client, member, space_id, member["user"]["id"])
    leave = {**auth(member), "Idempotency-Key": str(uuid4()), "If-Match": mine["etag"]}
    left = client.post(f"/v1/spaces/{space_id}/leave", headers=leave, json={})
    assert left.status_code == 200, left.text
    # The exact repeat of the confirmed leave still reports it. Their own key keeps the earlier answers for a changed or
    # missing review (test_membership_departure_retries_return_only_an_attributed_minimal_receipt); a new key does not.
    assert client.post(f"/v1/spaces/{space_id}/leave", headers=leave, json={}).json()["data"] == left.json()["data"]
    unreviewed = {name: value for name, value in leave.items() if name != "If-Match"}
    assert client.post(f"/v1/spaces/{space_id}/leave", headers={**leave, "If-Match": '"changed"'}, json={}).status_code == 409
    assert client.post(f"/v1/spaces/{space_id}/leave", headers=unreviewed, json={}).status_code == 428
    for headers in ({**leave, "Idempotency-Key": str(uuid4())}, {**unreviewed, "Idempotency-Key": str(uuid4())}):
        assert answer(client.post(f"/v1/spaces/{space_id}/leave", headers=headers, json={})) == MISSING
    before = counts(app)
    known = {"transfer_id": transfer["id"], "account_id": owner["user"]["id"]}
    checked, reached, differences = compare_with_missing(client, app, member, space_id, known)
    assert differences == []
    assert checked >= 30 and reached >= 20, (checked, reached)
    assert counts(app) == before
