"""The LLM agent loop (DEC-059): the model decides, Python validates, the person approves every change."""

import json
from datetime import timedelta
from time import monotonic, sleep
from uuid import uuid4

import pytest
import httpx
from sqlalchemy import func, select

from app.modules.agents.llm import ModelError, ModelTurn
from app.modules.agents.models import AgentApproval, AgentMemory, AgentRun
from app.modules.agents.prompts import MAIN, RESEARCH
from app.modules.agents.schemas import CreateWebFetch, WebFetchPage
from app.modules.agents.web import FETCH_URL, LONGEST_PAGE, PAGE_CHUNK, PREVIEW_TEXT, SEARCH_URL, WebLookup, article_changes, completed_reading_answer, page_text, stored_web_text, youtube_id
from app.modules.community.models import PublicPage, PublicPost
from app.modules.planning.models import Task
from tests.agent_support import MAIN_AGENT, answer, approve, ask, call, fields, install, reject, say, script, solo
from tests.test_community import create_page, draft, publish
from tests.test_identity import account, auth
from tests.test_messaging import admit
from tests.test_spaces import create_space
from tests.test_tasks import create_task


def count(app, model, *conditions):
    with app.state.sessions() as database:
        return database.scalar(select(func.count()).select_from(model).where(*conditions))


def tool_results(messages):
    return [json.loads(message["content"]) for message in messages if message["role"] == "tool"]


@pytest.mark.parametrize("output_format", ["markdown", "html", "json"])
def test_fetch_preview_maps_results_by_url_and_forwards_only_documented_options(output_format):
    first, second = "https://news.example.org/first", "https://news.example.org/second"
    request_body = CreateWebFetch(urls=[first, second], format=output_format, ttl=None, links=True, image_links=True,
                                 include_selectors=["article"], exclude_selectors=["nav"])
    text = {"type": "document", "children": [{"type": "paragraph", "text": "Saved content"}]} if output_format == "json" else "<b>Saved content</b>"

    def endpoint(request):
        assert json.loads(request.content) == {"urls": [first, second], "format": output_format, "links": True,
                                              "image_links": True, "include_selectors": ["article"], "exclude_selectors": ["nav"], "per_url_timeout_ms": 8000}
        return httpx.Response(200, json={"results": [{"url": second, "title": "Second", "format": output_format, "text": text,
                                                       "links": [first, "javascript:alert(1)"], "image_links": ["https://images.example.org/image.png"],
                                                       "published_date": "2026-10-06", "unmatched_selectors": ["invented"]}],
                                       "errors": [{"url": first, "error": "selector_not_matched"}]})

    result = WebLookup("synthetic-key", transport=httpx.MockTransport(endpoint)).fetch_pages(request_body)
    pages = [WebFetchPage(**item) for item in result.details]
    assert [page.url for page in pages] == [first, second]
    assert pages[0].error == "selector_not_matched" and pages[0].text is None
    assert pages[1].error is None and pages[1].published_date == "2026-10-06"
    assert pages[1].links == [first] and pages[1].links_partial is True
    assert pages[1].image_links == ["https://images.example.org/image.png"] and pages[1].unmatched_selectors == []
    assert json.loads(pages[1].text) == text if output_format == "json" else pages[1].text == text


@pytest.mark.parametrize("changes", [
    {"urls": []}, {"urls": ["https://news.example.org/a"] * 2},
    {"urls": [f"https://news.example.org/{index}" for index in range(11)]},
    {"urls": ["http://127.0.0.1/private"]}, {"urls": ["https://user:secret@news.example.org/a"]},
    {"urls": ["https://news.example.org/a b"]}, {"urls": ["https://news.example.org/a\nb"]},
    {"format": "text"}, {"ttl": -1}, {"ttl": False}, {"include_selectors": ["article"] * 21},
    {"include_selectors": [" "]}, {"exclude_selectors": ["nav\u0000"]}, {"links": "true"},
])
def test_fetch_preview_rejects_unsafe_or_unsupported_options(changes):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        CreateWebFetch.model_validate({"urls": ["https://news.example.org/a"], **changes})


@pytest.mark.parametrize("output_format", ["markdown", "html", "json"])
def test_web_extraction_runs_as_an_agent_chat_tool_and_keeps_sources(client, app, output_format):
    person = account(client, app)
    links = ["https://news.example.org/first", "https://news.example.org/second"]
    requested = []
    options = {"format": output_format, "ttl": 3600, "links": True, "include_selectors": ["main"], "exclude_selectors": ["nav"]}

    def endpoint(request):
        body = json.loads(request.content)
        requested.append(body)
        assert body == {**options, "image_links": False, "urls": [links[len(requested) - 1]], "per_url_timeout_ms": 8000}
        text = {"type": "document", "children": [{"type": "paragraph", "text": "Service starts October 9."}]} if output_format == "json" else "Service starts October 9."
        return httpx.Response(200, json={"results": [{"url": body["urls"][0], "format": output_format, "text": text,
                                                       "title": "Transit report", "author": "Transit desk", "published_date": "2026-10-06",
                                                       "links": ["https://news.example.org/background"]}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=2, transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=links[0], options=options),
                                call("read_web_page", url=links[1], options=options),
                                say("Both reports give October 9 as the expected service start; independent confirmation is still missing.")))
    key = str(uuid4())
    message = "Read these links and compare their main content: " + " ".join(links)
    run = ask(client, person, None, message, key=key)
    assert run["status"] == "completed" and run["intent"] == "chat", run
    assert run["approval"] is None and count(app, AgentRun) == 1 and count(app, AgentMemory) == 0
    assert [item["tool_name"] for item in run["tool_calls"]] == ["web.read", "web.read"]
    assert {source["url"] for source in run["sources"] if source["read"]} == set(links)
    results = tool_results(model.calls[-1][0])
    assert all("Service starts October 9" in item["result"]["text"] for item in results)
    assert all(item["result"]["published_date"] == "2026-10-06" for item in results)
    assert all(item["result"]["cache_preference_seconds"] == 3600 for item in results)
    assert all(item["result"]["links"] == ["https://news.example.org/background"] for item in results)
    preview = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(person))
    assert preview.status_code == 200 and len(preview.json()["data"]["sources"]) == 2
    again = ask(client, person, None, message, key=key)
    assert again["id"] == run["id"] and len(requested) == 2 and len(model.calls) == 3


def test_web_extraction_selector_failure_is_reported_in_chat_without_silent_full_page_retry(client, app):
    person = account(client, app)
    requested = []
    link = "https://news.example.org/report"

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [], "errors": [{"url": link, "error": "selector_not_matched"}]})

    app.state.agents.web = WebLookup("synthetic-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=link, options={"include_selectors": ["article"]}),
                                say("That page has no matching article section, so I could not read the requested content.")))
    run = ask(client, person, None, "Read only the article on this page: " + link)
    assert run["status"] == "completed" and len(requested) == 1 and run["sources"] == []
    assert "selector_not_matched" in tool_results(model.calls[-1][0])[0]["error"]
    assert run["tool_calls"][0]["status"] == "failed"


def test_web_extraction_respects_the_chat_quota_without_a_separate_fetch_endpoint(client, app):
    person = account(client, app)
    requested = []
    link = "https://news.example.org/report"

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"url": link, "title": "Fetched page", "text": "Saved public page text."}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1, transport=httpx.MockTransport(endpoint))
    install(app, script(call("read_web_page", url=link, options={}), say("Here is the report's information.")))
    first = ask(client, person, None, "Read this page: " + link)
    assert first["status"] == "completed"
    model = install(app, script(call("read_web_page", url=link, options={}), say("The daily web limit has been reached.")))
    exhausted = ask(client, person, None, "Read that report again")
    assert exhausted["status"] == "completed" and len(requested) == 1
    assert "limit" in tool_results(model.calls[-1][0])[0]["error"]
    assert exhausted["tool_calls"][0]["error_code"] == "web_limit"
    assert client.post("/v1/agent-web-fetches", headers={**auth(person), "Idempotency-Key": str(uuid4())}, json={"urls": [link]}).status_code == 404
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, first["id"])
        assert recorded.state["web_reserved"] == 0


def test_web_extraction_queued_chat_cancel_never_fetches(client, app, monkeypatch):
    person = account(client, app)
    model = install(app, script(call("read_web_page", url="https://news.example.org/report", options={})))
    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1)
    submit = app.state.agents.submit
    monkeypatch.setattr(app.state.agents, "submit", lambda run_id, token: None)
    first = ask(client, person, None, "Read this report: https://news.example.org/report")
    assert first["status"] == "queued"
    run_id = first["id"]
    cancelled = client.post(f"/v1/agent-runs/{run_id}/cancel", headers=auth(person), json={})
    assert cancelled.status_code == 200 and cancelled.json()["data"]["status"] == "cancelled"
    submit(run_id, auth(person)["Authorization"].removeprefix("Bearer "))
    assert model.calls == []
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, run_id)
        assert app.state.agents.web_usage(database, recorded.account_id) == 0


def test_web_extraction_running_chat_cancel_drops_late_content_without_refunding_attempts(client, app):
    person = account(client, app)
    link = "https://news.example.org/report"
    model = install(app, script(call("read_web_page", url=link, options={})))

    def endpoint(request):
        with app.state.sessions() as database:
            run_id = database.scalar(select(AgentRun.id).where(AgentRun.status == "running"))
        response = client.post(f"/v1/agent-runs/{run_id}/cancel", headers=auth(person), json={})
        assert response.status_code == 200
        return httpx.Response(200, json={"results": [{"url": link, "text": "Late text must be discarded."}]})

    app.state.agents.web = WebLookup("synthetic-key", daily_limit=1, transport=httpx.MockTransport(endpoint))
    result = ask(client, person, None, "Read this report: " + link)
    assert result["status"] == "cancelled" and result["sources"] == [] and len(model.calls) == 1
    with app.state.sessions() as database:
        run = database.get(AgentRun, result["id"])
        assert app.state.agents.web_usage(database, run.account_id) == 1
        assert "Late text" not in json.dumps(run.state)


@pytest.mark.parametrize("output_format", ["markdown", "html", "json"])
def test_fetch_preview_bounds_content_and_never_truncates_json_into_invalid_text(output_format):
    link = "https://news.example.org/report"
    text = {"text": "x" * (PREVIEW_TEXT + 1)} if output_format == "json" else "x" * (PREVIEW_TEXT + 1)
    lookup = WebLookup("synthetic-key", transport=httpx.MockTransport(lambda request: httpx.Response(200, json={
        "results": [{"url": link, "format": output_format, "text": text,
                     "links": [f"https://news.example.org/{index}" for index in range(40)]}],
    })))
    page = WebFetchPage(**lookup.fetch_pages(CreateWebFetch(urls=[link], format=output_format, links=True)).details[0])
    if output_format == "json":
        assert page.error == "content_too_large" and page.text is None
    else:
        assert len(page.text) == PREVIEW_TEXT and page.partial is True
        assert len(page.links) == 25 and page.links_partial is True


def test_web_search_reads_sources_before_answering_and_counts_every_fetch(client, app):
    person = account(client, app)
    requested = []
    sources = [
        {"title": "Everyday cooking", "snippet": "Short search snippet.", "url": "https://cooking.example.org/everyday"},
        {"title": "Balanced meals", "snippet": "Another snippet.", "url": "https://cooking.example.org/balanced"},
    ]

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            assert str(request.url).startswith(SEARCH_URL)
            return httpx.Response(200, json={"results": sources})
        assert str(request.url) == FETCH_URL
        link = json.loads(request.content)["urls"][0]
        return httpx.Response(200, json={"results": [{"title": "Read cooking article", "text": f"Full article for {link}: combine vegetables, beans and whole grains."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", daily_limit=3, transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("web_search", query="healthy cooking"), say("Combine vegetables, beans and whole grains.")))
    run = ask(client, person, None, "Find useful healthy cooking information")
    assert run["status"] == "completed", run
    assert len(requested) == 3, "A search must read up to two sources before the model answers"
    assert [item["tool_name"] for item in run["tool_calls"]] == ["web.search", "web.read", "web.read"]
    observed = json.dumps(tool_results(model.calls[-1][0]))
    assert "Full article" in observed and "combine vegetables" in observed
    assert all(source["read"] for source in run["sources"])
    assert {source["url"] for source in run["sources"]} == {item["url"] for item in sources}
    assert run["approval"] is None and count(app, Task) == 0 and count(app, AgentMemory) == 0
    install(app, script(call("web_search", query="another cooking search"), say("The lookup limit was reached.")))
    refused = ask(client, person, None, "Find more cooking information")
    assert refused["status"] == "completed" and len(requested) == 3
    assert any(item["error_code"] == "web_limit" for item in refused["tool_calls"])


@pytest.mark.parametrize("in_space", [False, True])
def test_web_source_preview_is_private_and_does_not_fetch_or_call_the_model(client, app, in_space):
    person = account(client, app)
    space_id = create_space(client, person).json()["data"]["id"] if in_space else None
    link = "https://news.example.org/correction"
    marker = "The correction changes the opening date from October 6 to October 9."
    original = "Transit report\n\n" + marker
    requested = []

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"title": "Transit correction", "text": original}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=link), say("The opening date was corrected.")))
    run = ask(client, person, space_id, "Read the transit correction")
    assert run["status"] == "completed"
    assert marker not in json.dumps(run)
    calls_before = len(model.calls)
    app.state.agents.web = None
    app.state.agents.model = None
    preview = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(person))
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["run_id"] == run["id"]
    assert body["sources"] == [{"source": run["sources"][0], "text": original, "offset": 0, "partial": False}]
    assert len(requested) == 1 and len(model.calls) == calls_before
    other = account(client, app, "other-source-viewer@example.test")
    refused = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(other))
    assert refused.status_code == 404 and marker not in refused.text
    assert client.get(f"/v1/agent-runs/{run['id']}/web-text").status_code == 401
    assert len(requested) == 1 and len(model.calls) == calls_before
    if in_space:
        with app.state.sessions.begin() as database:
            database.get(AgentRun, run["id"]).admission_id = str(uuid4())
        outdated = client.get(f"/v1/agent-runs/{run['id']}/web-text", headers=auth(person))
        assert outdated.status_code == 404 and marker not in outdated.text


@pytest.mark.parametrize("kind", ["assistant", "unpaired", "search", "mismatched", "trimmed", "oversized", "legacy"])
def test_web_source_preview_uses_only_matching_bounded_read_results(kind):
    link = "https://news.example.org/report"
    source = {"title": "Report", "url": link, "read": True, "video_id": None}
    reading = call("web_search", query="news") if kind == "search" else call("read_web_page", url=link)
    text = "Retained source text. " * (200 if kind == "oversized" else 1)
    messages = [reading.message()]
    result = {"result": {"url": "https://news.example.org/other" if kind == "mismatched" else link, "text": text}}
    if kind == "trimmed":
        result = {"partial": json.dumps(result)}
    if kind == "assistant":
        messages = [{"role": "assistant", "content": json.dumps(result)}]
    else:
        messages.append({"role": "tool", "tool_call_id": "unpaired" if kind == "unpaired" else reading.tool_calls[0].id,
                         "content": json.dumps(result)})
    state = {"web_sources": [source], "messages": messages}
    before = json.dumps(state)
    preview = stored_web_text(state)
    assert json.dumps(state) == before
    if kind in ("oversized", "legacy"):
        assert preview == [{"source": source, "text": text[:PAGE_CHUNK], "offset": None, "partial": True}]
    else:
        assert preview == []


@pytest.mark.parametrize("period", [{"recency_minutes": 1440}, {"after_date": "2026-09-01", "before_date": "2026-09-19"}])
def test_news_search_sends_real_filters_and_retains_publisher_and_date(client, app, period):
    person = account(client, app)
    link = "https://news.example.org/transit"
    requested = []

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            assert dict(request.url.params) == {"query": "transit updates", "domain_type": "news", "location": "IN", "language": "en",
                                                **{name: str(value) for name, value in period.items()}}
            return httpx.Response(200, json={"results": [
                {"title": "Transit update", "snippet": "An update.", "url": link, "date": "2026-09-18", "publisher": "Transit News"},
                {"title": "Undated report", "snippet": "No date was supplied.", "url": "https://news.example.org/undated"},
            ]})
        return httpx.Response(200, json={"results": [{"title": "Read report", "text": "The report discusses transit service changes."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("web_search", query="transit updates", domain_type="news", location="IN", language="en", **period),
                                say("One report is dated September 18; the other has no reported date.")))
    run = ask(client, person, None, "Find recent transit news for India")
    assert run["status"] == "completed", run
    search = tool_results(model.calls[-1][0])[0]["result"]
    assert search["results"][0]["publisher"] == "Transit News"
    assert search["results"][0]["published_date"] == "2026-09-18"
    assert search["results"][1]["published_date"] is None
    assert search["results"][1]["publisher"] is None
    assert search["filters"] == {"domain_type": "news", "location": "IN", "language": "en", **period}
    assert len(requested) == 3 and run["approval"] is None


@pytest.mark.parametrize("filters", [
    {"recency_minutes": 0}, {"recency_minutes": True}, {"recency_minutes": 5256001},
    {"recency_minutes": 60, "after_date": "2026-09-01"},
    {"after_date": "2026-09-19", "before_date": "2026-09-01"},
    {"after_date": "2026-02-30"}, {"domain_type": "unsupported"}, {"location": "India"},
])
def test_news_search_invalid_filters_make_no_provider_request(client, app, filters):
    person = account(client, app)

    def unexpected(request):
        raise AssertionError("Invalid search filters must not reach the provider")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(unexpected))
    model = install(app, script(call("web_search", query="news", **filters), say("The search options need correction.")))
    run = ask(client, person, None, "Search current news")
    assert run["status"] == "completed" and run["tool_calls"] == []
    assert "Invalid arguments" in tool_results(model.calls[-1][0])[0]["error"]


def test_parallel_web_searches_keep_every_tool_batch_together_for_the_model(client, app):
    person = account(client, app)
    requested = []

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            query = request.url.params["query"]
            return httpx.Response(200, json={"results": [{"title": query, "snippet": "Report.", "url": f"https://news.example.org/{query}"}]})
        return httpx.Response(200, json={"results": [{"title": "Transit report", "text": "Service starts on October 9; independent confirmation is unavailable."}]})

    def brain(messages, tools):
        if not tool_results(messages):
            return ModelTurn(content=None, tool_calls=(call("web_search", query="primary").tool_calls[0],
                                                      call("web_search", query="independent").tool_calls[0]))
        pending = set()
        for message in messages:
            if message["role"] == "tool":
                assert message["tool_call_id"] in pending
                pending.remove(message["tool_call_id"])
            else:
                assert not pending, "All results in a model tool batch must precede the next non-tool message"
                if message["role"] == "assistant":
                    pending.update(item["id"] for item in message.get("tool_calls") or [])
        assert not pending and len(tool_results(messages)) == 4
        return say("The two reports identify October 9 as the expected service start.")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, brain)
    run = ask(client, person, None, "Read primary and independent news sources")
    assert run["status"] == "completed", run
    assert len(requested) == 4 and len(run["tool_calls"]) == 4
    assert len(run["sources"]) == 2 and all(source["read"] for source in run["sources"])
    assert run["approval"] is None


@pytest.mark.parametrize("changed", [False, True])
def test_news_article_sections_are_complete_or_report_a_changed_version(client, app, changed):
    person = account(client, app)
    link = "https://news.example.org/transit-update"
    article = "# Transit update\n\n" + ('The report says "testing continues", not "service started".\n' * 95) + "\nCorrection: service starts on October 9, not October 6."
    requested, sections = [], []

    def endpoint(request):
        payload = json.loads(request.content)
        assert payload == {"urls": [link], "format": "markdown", "ttl": 0}
        requested.append(request)
        text = article + "\nA new update." if changed and len(requested) > 1 else article
        return httpx.Response(200, json={"results": [{"title": "Transit update", "text": text}]})

    def brain(messages, tools):
        results = tool_results(messages)
        if not results:
            return call("read_web_page", url=link)
        result = results[-1]
        if "error" in result:
            assert changed and "changed" in result["error"]
            return say("The article changed during reading; its sections cannot be combined.")
        result = result["result"]
        assert "retrieved_at" in result and "publication time" in result["note"]
        assert result["content_limited"] is False
        assert result["offset"] == sum(len(section) for section in sections)
        assert len(messages[-1]["content"]) <= 4000
        sections.append(result["text"])
        if result["next_offset"] is not None:
            return call("read_web_page", url=link, offset=result["next_offset"], content_version=result["content_version"])
        assert "".join(sections) == page_text(article)
        return say("The correction says service starts on October 9, not October 6.")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, brain)
    run = ask(client, person, None, "Read the complete transit news report and include the correction")
    assert run["status"] == "completed", run
    assert len(requested) > 1
    assert "\n\n" in sections[0]
    assert ("changed" in run["answer"]) is changed
    assert run["approval"] is None and count(app, Task) == 0 and count(app, AgentMemory) == 0


@pytest.mark.parametrize("single_line", [False, True])
def test_news_article_limit_and_invalid_continuation_are_explicit(client, app, single_line):
    person = account(client, app)
    link = "https://news.example.org/long-report"
    requested = []

    def endpoint(request):
        requested.append(request)
        text = "Opening. " + "word " * LONGEST_PAGE if single_line else "Paragraph.\n\n" * LONGEST_PAGE
        return httpx.Response(200, json={"results": [{"title": "Long report", "text": text}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("read_web_page", url=link, offset=100), call("read_web_page", url=link), say("Only part of this report was available within the reading limit.")))
    run = ask(client, person, None, "Read this long news report")
    results = tool_results(model.calls[-1][0])
    assert "content_version" in results[0]["error"]
    assert results[1]["result"]["content_limited"] is True
    assert results[1]["result"]["available_characters"] == LONGEST_PAGE
    assert results[1]["result"]["next_offset"] is not None
    assert len(requested) == 1 and run["status"] == "completed"


def test_article_changes_ignore_layout_noise_but_keep_corrections():
    first = "Transit update\n\nService starts October 6.\nStatus: testing."
    reordered = "Status:  testing.\nTransit update\nService starts October 6.\nTransit update"
    assert article_changes(first, reordered)["status"] == "unchanged"
    changed = article_changes(first, first.replace("October 6", "October 9"))
    assert changed["status"] == "changed"
    assert changed["added"] == ["Service starts October 9."]
    assert changed["removed"] == ["Service starts October 6."]


@pytest.mark.parametrize("other_account", [False, True])
def test_news_comparison_uses_only_the_same_persons_complete_read(client, app, other_account):
    person = account(client, app)
    link = "https://news.example.org/transit-update"
    current = ["Transit update\n\nService starts October 6."]
    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"results": [{"title": "Transit update", "text": current[0]}]})))
    install(app, script(call("read_web_page", url=link), say("Service starts October 6.")))
    first = ask(client, person, None, "Read the transit report")
    assert first["status"] == "completed"
    current[0] = "Transit update\n\nService starts October 9."
    reader = account(client, app, "different-news-reader@example.test") if other_account else person
    model = install(app, script(call("read_web_page", url=link, compare_previous=True), say("The comparison is available above.")))
    run = ask(client, reader, None, "What changed in the transit report since I last read it?")
    assert run["status"] == "completed", run
    changes = tool_results(model.calls[-1][0])[-1]["result"]["changes"]
    assert changes["status"] == ("unavailable" if other_account else "changed")
    if other_account:
        assert "October 6" not in json.dumps(changes)
    else:
        assert changes["added"] == ["Service starts October 9."]
        assert changes["removed"] == ["Service starts October 6."]
        assert changes["compared_with"] == first["finished_at"].replace("Z", "+00:00")
    assert run["approval"] is None and count(app, AgentMemory) == 0


def test_web_followup_keeps_source_references_outside_the_short_answer(client, app):
    person = account(client, app)
    link = "https://cooking.example.org/the-selected-article"

    def endpoint(request):
        if request.method == "GET":
            return httpx.Response(200, json={"results": [{"title": "Selected cooking guide", "snippet": "Cooking guide.", "url": link}]})
        return httpx.Response(200, json={"results": [{"title": "Selected cooking guide", "text": "A source about ordinary cooking habits."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    offered = "Would you like me to explain the first source in more detail?"
    install(app, script(call("web_search", query="cooking guide"), say("A useful cooking summary. " * 35 + offered)))
    previous = ask(client, person, None, "Find a useful cooking guide")
    assert previous["status"] == "completed"
    with app.state.sessions.begin() as database:
        saved = database.get(AgentRun, previous["id"])
        saved.state = {name: value for name, value in saved.state.items() if name != "web_sources"}
    recovered = client.get(f"/v1/agent-runs/{previous['id']}", headers=auth(person)).json()["data"]
    assert recovered["sources"][0]["url"] == link
    model = install(app, script(say("I can continue from the selected guide.")))
    followup = ask(client, person, None, "yes do it")
    assert followup["status"] == "completed"
    history = model.calls[0][0]
    assert link in json.dumps(history), "Follow-up context must retain actual sources even when the earlier answer is shortened"
    assert offered in json.dumps(history), "A short confirmation needs the previous question, not just the beginning of its answer"
    assert all(link not in str(message["content"]) for message in history if message["role"] == "system")


@pytest.mark.parametrize("closing, repeated", [
    ("Would you like me to explain the first source (the guide) in more detail, with a concrete action plan?", True),
    ("Would you like me to explain the second source in more detail?", False),
    ("Would you like me to summarize the first source in more detail?", False),
    ("Would you like me to explain the first source in more detail in Telugu?", False),
])
def test_reading_offer_paraphrases_keep_the_same_action_and_source_boundary(closing, repeated):
    previous = "Would you like me to explain the first source\u2014the detailed guide\u2014more deeply, with practical examples and a quick action plan?"
    summary = "The guide recommends preparing vegetables ahead and choosing whole grains for everyday meals."
    answer = summary + "\n\n" + closing
    assert completed_reading_answer("yes do it", answer, previous) == (summary if repeated else answer)
    assert completed_reading_answer("Tell me something else", answer, previous) == answer


@pytest.mark.parametrize("repeated", [True, False])
@pytest.mark.parametrize("titled", [True, False])
def test_completed_web_followup_does_not_repeat_an_accepted_reading_offer(client, app, repeated, titled):
    person = account(client, app)
    link = "https://cooking.example.org/guide"
    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"results": [{"title": "Cooking guide", "text": "Combine vegetables and whole grains for everyday meals."}]}),
    ))
    title = " (Cooking guide from Example)" if titled else ""
    offered = f"Would you like me to explain the first source{title} in more detail?"
    install(app, script(call("read_web_page", url=link), say("The guide discusses everyday meals.\n\n" + offered)))
    first = ask(client, person, None, "Read this cooking guide and offer to explain it")
    assert first["answer"].endswith(offered)
    summary = "The guide recommends combining vegetables and whole grains, and preparing ingredients ahead for simple meals."
    title = " (Cooking guide)" if titled else ""
    closing = (f"Would you like me to explain the first source{title} in more detail? If yes, I can explain its practical steps."
               if repeated else "Which ingredients do you have available?")
    install(app, script(call("read_web_page", url=link), say(summary + "\n\n" + closing)))
    followup = ask(client, person, None, "yes do it")
    assert followup["status"] == "completed" and followup["approval"] is None
    assert followup["answer"] == (summary if repeated else summary + "\n\n" + closing)
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, followup["id"])
        assert recorded.state["messages"][-1]["content"] == followup["answer"]


@pytest.mark.parametrize("followup, offer, constrained", [
    ("yes do it", "Would you like me to explain the first source in more detail?", True),
    ("Search for another guide", "Would you like me to explain the first source in more detail?", False),
    ("yes do it", "Would you like me to find other sources?", False),
])
def test_accepted_reading_offer_reuses_existing_sources_without_a_new_search(client, app, followup, offer, constrained):
    person = account(client, app)
    link = "https://cooking.example.org/guide"
    requested = []

    def endpoint(request):
        requested.append(request)
        if request.method == "GET":
            assert not constrained, "An accepted reading offer must not trigger a fresh search"
            return httpx.Response(200, json={"results": []})
        if constrained:
            assert json.loads(request.content)["urls"] == [link]
        return httpx.Response(200, json={"results": [{"title": "Cooking guide", "text": "Prepare vegetables and whole grains."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, script(call("read_web_page", url=link), say("Here is the guide.\n\n" + offer)))
    ask(client, person, None, "Find a cooking guide")
    requested.clear()
    model = install(app, script(
        call("web_search", query="a different guide"),
        call("read_web_page", url="https://cooking.example.org/different"),
        call("read_web_page", url=link),
        say("The guide recommends preparing vegetables and whole grains for meals."),
    ))
    run = ask(client, person, None, followup)
    assert run["status"] == "completed", run
    assert ("web_search" in model.calls[0][1]) is not constrained
    results = tool_results(model.calls[-1][0])
    assert ("error" in results[0]) is constrained
    assert ("error" in results[1]) is constrained
    assert len(requested) == (1 if constrained else 3)
    assert run["approval"] is None


def test_an_explicit_video_request_cannot_search_for_or_replace_it_with_another_video(client, app):
    person = account(client, app)
    target = "https://www.youtube.com/watch?v=pKtweGSC2FU"

    def unexpected(request):
        raise AssertionError("An exact video link needs no search or network fetch")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(unexpected))
    model = install(app, script(
        call("web_search", query="a completely different music video"),
        call("read_web_page", url="https://youtu.be/abcdefghijk"),
        call("read_web_page", url=target),
        say("Use Play to watch the selected video."),
    ))
    run = ask(client, person, None, f"Play this video: {target}")
    assert run["status"] == "completed", run
    assert "web_search" not in model.calls[0][1]
    assert [source["video_id"] for source in run["sources"]] == ["pKtweGSC2FU"]
    results = tool_results(model.calls[-1][0])
    assert "selected video" in results[0]["error"].lower()
    assert "selected video" in results[1]["error"].lower()
    assert results[2]["result"]["video_id"] == "pKtweGSC2FU"


@pytest.mark.parametrize("status", [200, 403])
def test_unreadable_web_pages_stay_unread_and_return_an_honest_tool_result(client, app, status):
    person = account(client, app)
    link = "https://cooking.example.org/unavailable"

    def endpoint(request):
        if request.method == "GET":
            return httpx.Response(200, json={"results": [{"title": "Unavailable guide", "snippet": "Only a snippet.", "url": link}]})
        return httpx.Response(status, json={"results": []})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    model = install(app, script(call("web_search", query="cooking guide"), say("The article could not be read.")))
    run = ask(client, person, None, "Summarize a cooking guide")
    assert run["status"] == "completed", run
    assert len(run["sources"]) == 1 and run["sources"][0]["read"] is False
    last_result = tool_results(model.calls[-1][0])[-1]
    assert last_result.get("error") if status == 403 else last_result["result"]["text"] is None
    other = account(client, app, "other-web-reader@example.test")
    other_model = install(app, script(say("No earlier source is available here.")))
    ask(client, other, None, "yes read it")
    assert link not in json.dumps(other_model.calls[0][0])


@pytest.mark.parametrize("link, expected", [
    ("https://www.youtube.com/watch?v=pKtweGSC2FU", "pKtweGSC2FU"),
    ("https://youtu.be/pKtweGSC2FU", "pKtweGSC2FU"),
    ("https://www.youtube.com/shorts/pKtweGSC2FU", "pKtweGSC2FU"),
    ("https://youtube.com.attacker.example/watch?v=pKtweGSC2FU", None),
    ("https://user:secret@www.youtube.com/watch?v=pKtweGSC2FU", None),
    ("https://www.youtube.com/watch?v=bad", None),
    ("https://www.youtube.com/watch?v=pKtweGSC2FU&v=another0000", None),
    ("javascript:alert(1)", None),
])
def test_video_references_use_only_exact_supported_youtube_addresses(link, expected):
    assert youtube_id(link) == expected


def test_video_results_are_playable_references_not_claimed_video_transcripts(client, app):
    person = account(client, app)
    requested = []

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"title": "A cooking video", "snippet": "Video search description only.",
                                                       "url": "https://www.youtube.com/watch?v=pKtweGSC2FU"}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    install(app, script(call("web_search", query="cooking videos site:youtube.com"), say("Here is a cooking video.")))
    run = ask(client, person, None, "Play a cooking video")
    assert len(requested) == 1 and run["sources"][0]["video_id"] == "pKtweGSC2FU"
    assert run["sources"][0]["read"] is False and run["approval"] is None


def test_direct_video_link_does_not_require_scraping_or_claim_a_transcript(client, app):
    person = account(client, app)

    def blocked(request):
        raise AssertionError("A supported video reference needs no server-side page fetch")

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(blocked))
    model = install(app, script(call("read_web_page", url="https://youtu.be/pKtweGSC2FU"), say("The video is ready to play.")))
    run = ask(client, person, None, "Play this YouTube video")
    assert run["status"] == "completed", run
    assert run["sources"][0]["video_id"] == "pKtweGSC2FU" and run["sources"][0]["read"] is False
    assert "no video transcript was read" in tool_results(model.calls[-1][0])[-1]["result"]["note"]


def test_research_helper_keeps_its_web_sources_for_the_final_answer(client, app):
    person = account(client, app)
    link = "https://cooking.example.org/research"
    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"results": [{"title": "Read cooking guide", "text": "Use varied ordinary ingredients."}]}),
    ))
    install(app, script(call("research", task="Read a cooking guide"), call("read_web_page", url=link),
                        say("The guide recommends varied ingredients."), say("Use varied ingredients for everyday meals.")))
    run = ask(client, person, None, "Research simple cooking habits")
    assert run["status"] == "completed", run
    assert run["sources"] == [{"title": "Read cooking guide", "url": link, "read": True, "video_id": None}]


def test_the_model_reads_with_a_tool_and_answers_from_the_result(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Water the plants", due_date="2026-09-20")
    model = install(app, script(call("list_tasks", status="open"), say("You have one open task: Water the plants.")))
    run = ask(client, person, space_id, "what do I need to do?")
    assert (run["status"], run["outcome"], run["answer"]) == ("completed", "answered", "You have one open task: Water the plants.")
    assert [(item["tool_name"], item["effect"], item["status"]) for item in run["tool_calls"]] == [("family.tasks.list", "read", "succeeded")]
    assert [item["kind"] for item in run["evidence"]] == ["task"]
    first, second = model.calls
    assert first[0][0] == {"role": "system", "content": MAIN} and "create_task" in first[1]
    assert "Today is 2026-09-19" in first[0][1]["content"]
    # The tool's result reached the model as tool data, not as instructions.
    [result] = tool_results(second[0])
    assert result["result"]["tasks"][0]["title"] == "Water the plants"


def test_a_change_waits_for_approval_then_runs_once_and_the_model_reports_it(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("create_task", title="Buy milk", due_date="2026-09-20", priority="high"), say("Added Buy milk for tomorrow.")))
    run = ask(client, person, space_id, "add buy milk for tomorrow, it's important")
    assert run["status"] == "waiting_for_approval" and count(app, Task) == 0
    reviewed = fields(run)
    assert reviewed.pop("Space")
    assert reviewed == {"Title": "Buy milk", "Notes": "None", "Due date": "Sun 20 Sep 2026", "Assigned to": "Nobody", "Priority": "High"}
    key = "7c1a6f9e-0f43-4d0e-9b1f-6f0a8a2a1111"
    done = approve(client, person, run, key=key)
    assert done.status_code == 200, done.text
    finished = done.json()["data"]
    assert (finished["status"], finished["outcome"], finished["answer"]) == ("completed", "action_completed", "Added Buy milk for tomorrow.")
    assert finished["approval"]["status"] == "approved" and count(app, Task) == 1
    # The same decision again returns the same result and changes nothing more.
    assert approve(client, person, run, key=key).status_code == 200 and count(app, Task) == 1
    assert approve(client, person, run).status_code == 409


def test_a_rejected_change_is_told_to_the_model_and_nothing_changes(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("create_task", title="Paint the fence"), say("Okay, I left it.")))
    run = ask(client, person, space_id, "add a task to paint the fence")
    rejected = reject(client, person, run).json()["data"]
    assert (rejected["status"], rejected["answer"], rejected["approval"]["status"]) == ("completed", "Okay, I left it.", "rejected")
    assert "rejected" in tool_results(model.calls[-1][0])[-1] and count(app, Task) == 0


def test_several_changes_in_one_request_each_need_their_own_approval(client, app):
    person, space_id = solo(client, app)
    install(app, script(
        call("write_todos", todos=[{"content": "Add milk", "status": "in_progress"}, {"content": "Add bread", "status": "pending"}]),
        call("create_task", title="Milk"), call("create_task", title="Bread"), say("Both added."),
    ))
    run = ask(client, person, space_id, "add milk and bread")
    assert [item["content"] for item in run["todos"]] == ["Add milk", "Add bread"] and len(run["plan"]) == 2
    second = approve(client, person, run).json()["data"]
    assert second["status"] == "waiting_for_approval" and fields(second)["Title"] == "Bread"
    done = approve(client, person, second).json()["data"]
    assert done["status"] == "completed" and count(app, Task) == 2 and count(app, AgentApproval) == 2


@pytest.mark.parametrize("length", [2001, 5000])
def test_full_post_text_is_reviewed_before_draft_and_publication(client, app, length):
    person, space_id = solo(client, app)
    created = create_page(client, person)
    assert created.status_code == 201, created.text
    page = created.json()["data"]
    ending = " These final words must also be reviewed."
    text = ("Make time for a gentle walk and regular rest. " * 130)[:length - len(ending)] + ending
    assert len(text) == length
    install(app, script(call("create_post", page=page["handle"], title="Everyday wellness", text=text), say("Draft saved.")))
    proposed = ask(client, person, MAIN_AGENT, "Draft a wellness post on my page")
    assert proposed["status"] == "waiting_for_approval", proposed
    assert fields(proposed)["Text"] == text
    assert count(app, PublicPost) == 0
    saved = approve(client, person, proposed)
    assert saved.status_code == 200, saved.text
    result = saved.json()["data"]
    post_id = result["approval"]["result_ref"]
    post = client.get(f"/v1/posts/{post_id}", headers=auth(person)).json()["data"]
    assert (post["body"], post["status"]) == (text, "draft")
    assert client.get(f"/v1/posts/{post_id}").status_code == 404

    install(app, script(call("publish_post", post_id=post_id), say("Post published.")))
    publication = ask(client, person, MAIN_AGENT, f"Publish post {post_id}")
    assert publication["status"] == "waiting_for_approval", publication
    assert fields(publication)["Text"] == text
    assert client.get(f"/v1/posts/{post_id}").status_code == 404
    key = str(uuid4())
    published = approve(client, person, publication, key=key)
    assert published.status_code == 200, published.text
    assert published.json()["data"]["outcome"] == "action_completed"
    assert approve(client, person, publication, key=key).status_code == 200
    assert count(app, PublicPost) == 1
    assert client.get(f"/v1/posts/{post_id}").json()["data"]["body"] == text


def test_public_change_and_approval_result_roll_back_together(client, app, monkeypatch):
    person, space_id = solo(client, app)
    install(app, script(call("create_page", handle="wellness-review", name="Everyday wellness", topic="health"), say("Page created.")))
    run = ask(client, person, MAIN_AGENT, "Create a wellness page")
    assert run["status"] == "waiting_for_approval", run
    original = app.state.agents.record_call

    def fail_record(*arguments, **named):
        if len(arguments) > 3 and arguments[3] == "write":
            raise RuntimeError("Synthetic failure recording the public action result")
        return original(*arguments, **named)

    key = str(uuid4())
    with monkeypatch.context() as patch:
        patch.setattr(app.state.agents, "record_call", fail_record)
        failed = approve(client, person, run, key=key)
    assert failed.status_code == 500, failed.text
    assert count(app, PublicPage) == 0
    pending = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(person)).json()["data"]
    assert pending["approval"]["status"] == "pending"
    assert pending["approval"]["etag"] == run["approval"]["etag"]
    recovered = approve(client, person, run, key=key)
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["data"]["outcome"] == "action_completed"
    assert approve(client, person, run, key=key).status_code == 200
    assert count(app, PublicPage) == 1


@pytest.mark.parametrize("published_first", [False, True])
def test_publication_never_accepts_changed_content_from_an_old_review(client, app, published_first):
    person, space_id = solo(client, app)
    page = create_page(client, person).json()["data"]
    created = draft(client, person, page["id"]).json()["data"]
    install(app, script(call("publish_post", post_id=created["id"]), say("Publication result received.")))
    run = ask(client, person, MAIN_AGENT, "Publish the selected post")
    assert run["status"] == "waiting_for_approval", run
    current = publish(client, person, created) if published_first else created
    changed = client.patch(f"/v1/posts/{created['id']}", headers={**auth(person), "If-Match": current["etag"]},
                           json={"body": "Different text that was not in the Agent review."})
    assert changed.status_code == 200, changed.text
    result = approve(client, person, run)
    assert result.status_code == 200, result.text
    answered_run = result.json()["data"]
    assert answered_run["approval"]["status"] == "cancelled", answered_run
    assert answered_run["approval"]["reason"] == "CONTENT_CHANGED"
    assert not any(item["effect"] == "write" and item["status"] == "succeeded" for item in answered_run["tool_calls"])
    actual = client.get(f"/v1/posts/{created['id']}", headers=auth(person)).json()["data"]
    assert actual["body"] == "Different text that was not in the Agent review."
    assert actual["status"] == ("published" if published_first else "draft")


def test_requested_publication_review_follows_the_approved_draft_without_model_guessing(client, app):
    person, space_id = solo(client, app)
    page = create_page(client, person).json()["data"]
    content = "Build ordinary habits with regular rest, balanced meals and comfortable daily movement."
    model = install(app, script(
        call("create_post", page=page["id"], title="Everyday wellness", text=content, review_publication=True),
        say("Your reviewed post is published."),
    ))
    proposed = ask(client, person, MAIN_AGENT, "Create the post and publish it after separate review")
    assert proposed["status"] == "waiting_for_approval", proposed
    assert fields(proposed)["Next step"] == "Request a separate approval to publish this exact draft"
    assert count(app, PublicPost) == 0
    draft_key = str(uuid4())
    next_review = approve(client, person, proposed, key=draft_key).json()["data"]
    assert next_review["status"] == "waiting_for_approval", next_review
    assert next_review["id"] == proposed["id"]
    assert next_review["approval"]["tool_name"] == "community.posts.publish"
    assert next_review["approval"]["id"] != proposed["approval"]["id"]
    assert fields(next_review)["Text"] == content
    assert len(model.calls) == 1, "Opening the requested review must not depend on another model decision"
    with app.state.sessions() as database:
        post = database.scalar(select(PublicPost))
        post_id = post.id
        assert (post.body, post.status) == (content, "draft")
    assert client.get(f"/v1/posts/{post_id}").status_code == 404
    assert approve(client, person, proposed, key=draft_key).json()["data"]["approval"]["id"] == next_review["approval"]["id"]
    publication_key = str(uuid4())
    published = approve(client, person, next_review, key=publication_key).json()["data"]
    assert published["status"] == "completed" and published["outcome"] == "action_completed"
    assert len(model.calls) == 2 and count(app, PublicPost) == 1
    assert approve(client, person, next_review, key=publication_key).status_code == 200
    assert client.get(f"/v1/posts/{post_id}").json()["data"]["body"] == content


def test_a_question_waits_for_the_answer_and_the_loop_continues(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("ask_user", question="What should I call it?"), call("create_task", title="Dentist"), say("Proposed.")))
    run = ask(client, person, space_id, "add a task")
    assert run["status"] == "waiting_for_user" and run["question"]["text"] == "What should I call it?"
    resumed = answer(client, person, run, "Dentist")
    assert resumed["status"] == "waiting_for_approval" and fields(resumed)["Title"] == "Dentist"
    # The same answer again is no new answer.
    assert answer(client, person, run, "Dentist")["id"] == run["id"]


def test_the_research_helper_has_its_own_context_and_read_only_tools(client, app):
    person, space_id = solo(client, app)
    create_task(client, person, space_id, title="Plan the picnic")
    model = install(app, script(
        call("research", task="Find tasks about the picnic"),
        call("list_tasks"), say("One task: Plan the picnic."),
        say("Your picnic task is ready to go."),
    ))
    run = ask(client, person, space_id, "how is the picnic going?")
    assert run["answer"] == "Your picnic task is ready to go."
    helper = model.calls[1]
    assert helper[0][0]["content"] == RESEARCH and helper[0][2] == {"role": "user", "content": "Find tasks about the picnic"}
    assert "create_task" not in helper[1] and "research" not in helper[1] and "list_tasks" in helper[1]
    assert [item["summary"] for item in run["tool_calls"]][:2] == ["Helper: Read 1 tasks.", "Research: Find tasks about the picnic"]


def test_unknown_tools_and_bad_arguments_go_back_to_the_model(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("delete_everything"), call("create_task", title=""), say("Sorry.")))
    run = ask(client, person, space_id, "do something")
    assert run["answer"] == "Sorry." and count(app, Task) == 0 and count(app, AgentApproval) == 0
    errors = [item["error"] for item in tool_results(model.calls[-1][0])]
    assert "no tool called" in errors[0] and errors[1].startswith("Invalid arguments")


def test_a_task_from_another_space_is_not_reachable(client, app):
    person, space_id = solo(client, app)
    other = create_space(client, person, "Other").json()["data"]["id"]
    elsewhere = create_task(client, person, other, title="Elsewhere").json()["data"]["id"]
    model = install(app, script(call("complete_task", task_id=elsewhere), say("Can't.")))
    run = ask(client, person, space_id, "finish it")
    assert run["status"] == "completed" and count(app, AgentApproval) == 0
    assert tool_results(model.calls[-1][0])[0]["error"] == "That task isn't in this Space."


@pytest.mark.parametrize("ending", ["answer", "length", "tool"])
def test_news_length_recovery_is_bounded_and_cannot_replay_tools(client, app, ending):
    person = account(client, app)
    requested = []

    def endpoint(request):
        requested.append(request)
        return httpx.Response(200, json={"results": [{"title": "Transit report", "text": "The published correction changes the start date to October 9."}]})

    app.state.agents.web = WebLookup("synthetic-web-key", transport=httpx.MockTransport(endpoint))
    final = say("The report corrects the service start date to October 9. Independent confirmation is unavailable.") if ending == "answer" else ModelError("length") if ending == "length" else call("save_memory", content="This recovery must not save anything")
    model = install(app, script(call("read_web_page", url="https://news.example.org/transit"), ModelError("length"), final))
    run = ask(client, person, None, "Give the details from the transit report")
    assert len(model.calls) == 3 and model.calls[-1][1] == []
    assert "answer-only" in json.dumps(model.calls[-1][0])
    assert len(requested) == 1 and len(run["tool_calls"]) == 1
    assert run["approval"] is None and count(app, AgentMemory) == 0 and count(app, AgentApproval) == 0
    assert run["status"] == ("completed" if ending == "answer" else "failed")
    if ending != "answer":
        assert "within its limit" in run["answer"]
        assert run["stop_reason"] == ("model_length" if ending == "length" else "answer_recovery_tools")
    with app.state.sessions() as database:
        recorded = database.get(AgentRun, run["id"])
        assert recorded.state["answer_recovery"] is True
        assert recorded.state["usage"]["calls"] == 3


def test_initial_length_failure_does_not_claim_to_have_read_sources(client, app):
    person = account(client, app)
    model = install(app, script(ModelError("length")))
    run = ask(client, person, None, "Read the latest news")
    assert run["status"] == "failed" and run["stop_reason"] == "model_length"
    assert len(model.calls) == 1 and run["sources"] == []
    assert run["answer"].startswith("I couldn't finish the answer within its limit.")


def test_detailed_answer_is_not_silently_cut_at_four_thousand_characters(client, app):
    person = account(client, app)
    text = "A detailed explanation of the available source evidence.\n" * 85 + "Important limitation: the event date remains unconfirmed."
    assert 4000 < len(text) < 8000
    install(app, script(say(text)))
    run = ask(client, person, None, "Explain the available evidence in detail")
    assert run["answer"] == text
    with app.state.sessions() as database:
        assert database.get(AgentRun, run["id"]).state["messages"][-1]["content"] == text


def test_answer_display_limit_never_silently_discards_the_ending(client, app):
    person = account(client, app)
    install(app, script(say("Detailed source context. " * 500)))
    run = ask(client, person, None, "Give the full context")
    assert len(run["answer"]) <= 8000
    assert run["answer"].endswith("This answer was shortened to the display limit; some details are not shown.")
    with app.state.sessions() as database:
        assert database.get(AgentRun, run["id"]).state["messages"][-1]["content"] == run["answer"]


def test_model_failures_end_the_run_honestly(client, app):
    person, space_id = solo(client, app)
    install(app, script(ModelError("token_limit")))
    run = ask(client, person, space_id, "hello")
    assert (run["status"], run["stop_reason"]) == ("failed", "model_token_limit") and "token budget" in run["answer"]
    app.state.agents.model = None
    refused = client.post("/v1/agent-runs", headers={**auth(person), "Idempotency-Key": "5f0f0d3e-1d8b-4a55-9a11-2b9c1f0e2222"},
                          json={"space_id": space_id, "message": "hello"})
    assert (refused.status_code, refused.json()["error"]["code"]) == (503, "AGENT_MODEL_UNAVAILABLE")


def test_the_loop_stops_after_its_step_limit(client, app):
    person, space_id = solo(client, app)
    install(app, lambda messages, tools: call("list_tasks"))
    run = ask(client, person, space_id, "loop forever")
    assert (run["status"], run["stop_reason"]) == ("completed", "step_limit")


def test_earlier_requests_are_history_but_not_for_chat_requests(client, app):
    person, space_id = solo(client, app)
    model = install(app)
    ask(client, person, space_id, "hello there")
    ask(client, person, space_id, "and again")
    roles = [(message["role"], message["content"]) for message in model.calls[-1][0][2:]]
    assert roles[0] == ("user", "hello there") and roles[-1] == ("user", "and again")


def test_only_the_asker_sees_and_decides_their_run_and_waiting_runs_expire(client, app):
    owner, space_id = solo(client, app)
    member = account(client, app, "runtime-member@example.test")
    admit(client, owner, space_id, member)
    run = ask(client, owner, space_id, "add a task to sweep")
    assert client.get(f"/v1/agent-runs/{run['id']}", headers=auth(member)).status_code == 404
    assert approve(client, member, run).status_code == 404
    app.state.clock.now += timedelta(minutes=31)
    expired = client.get(f"/v1/agent-runs/{run['id']}", headers=auth(owner)).json()["data"]
    assert (expired["status"], expired["approval"]["status"]) == ("expired", "expired") and count(app, Task) == 0


def test_a_memory_is_saved_only_after_approval_and_secrets_are_refused(client, app):
    person, space_id = solo(client, app)
    model = install(app, script(call("save_memory", content="my card number is 4111 1111 1111 1111"), say("I won't keep that.")))
    ask(client, person, space_id, "remember my card")
    assert "not allowed" in tool_results(model.calls[-1][0])[0]["error"].lower() and count(app, AgentMemory) == 0
    install(app)
    run = ask(client, person, space_id, "remember that the plumber comes on Fridays")
    assert count(app, AgentMemory) == 0
    assert approve(client, person, run).json()["data"]["answer"] == "I'll remember that." and count(app, AgentMemory) == 1


def test_cancel_stops_a_waiting_run(client, app):
    person, space_id = solo(client, app)
    run = ask(client, person, space_id, "add a task to sweep")
    stopped = client.post(f"/v1/agent-runs/{run['id']}/cancel", headers=auth(person), json={}).json()["data"]
    assert (stopped["status"], stopped["approval"]["status"]) == ("cancelled", "cancelled")


def test_runs_work_in_the_background(client, app):
    person, space_id = solo(client, app)
    install(app, script(call("list_tasks"), say("Nothing to do.")))
    app.state.agents.background = True
    started = ask(client, person, space_id, "anything?")
    deadline = monotonic() + 20
    while True:
        run = client.get(f"/v1/agent-runs/{started['id']}", headers=auth(person)).json()["data"]
        if run["status"] == "completed" or monotonic() > deadline:
            break
        sleep(0.1)
    assert run["answer"] == "Nothing to do."
    with app.state.sessions() as database:
        assert database.get(AgentRun, started["id"]).lease_owner is None
