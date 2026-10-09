"""Web lookups through TinyFish (DEC-058), as two read-only agent tools: web_search and read_web_page.

Only the words the model chose to search for, or one public link, leave the app. What comes back is untrusted outside
content: cleaned, cut short and handed to the model as data. Off until the owner's key is configured."""

import ipaddress
import json
import re
import unicodedata
from dataclasses import dataclass, replace
from datetime import datetime
from hashlib import sha256
from time import monotonic
from urllib.parse import parse_qs, urlsplit

import httpx

SEARCH_URL = "https://api.search.tinyfish.ai"
FETCH_URL = "https://api.fetch.tinyfish.ai"
DAILY_LOOKUPS = 20
RESULTS = 5
LONGEST_QUERY = 200
LONGEST_LINK = 300
LONGEST_TITLE = 120
LONGEST_EXTRACT = 300
LONGEST_PAGE = 24000
PAGE_CHUNK = 2600
PAGE_RESULT = 3600
PREVIEW_TEXT = 12000
LONGEST_BODY = 2_000_000
LONGEST_CALL = 12.0
READS = {"web_search": 8.0, "web_read": 10.0}
TOP_LEVEL = re.compile(r"[a-z]{2,63}|xn--[a-z0-9-]{1,59}")
HOST = re.compile(r"[a-z0-9.-]+")
LOCAL = (".local", ".localhost", ".internal", ".intranet", ".lan", ".home", ".corp", ".test", ".example", ".invalid", ".onion", ".arpa")
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
MARKDOWN_LINK = re.compile(r"\[([^\]]*)\]\((?:[^()\s]|\([^)\s]*\))*\)")
MARKUP = re.compile(r"(?m)^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+\.[ \t]+)|\*{1,3}|`+|_{2,}")
TRANSIENT_STATUS = frozenset({408, 409, 425, 429, 500, 502, 503, 504})
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
PLAY_REQUEST = re.compile(r"^\s*(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:play|watch|open|show)\b", re.I)
READING_OFFER = re.compile(r"(?:^|\n)\s*((?:would you like|do you want|shall I|should I|can I)\b[^?\n]{1,260}\?)", re.I)


def requested_video(message):
    if not PLAY_REQUEST.match(message):
        return None
    links = re.findall(r"https?://[^\s<>]+", message)
    if len(links) != 1:
        return None
    link = links[0].rstrip(".,!?;:)\"'")
    identifier = youtube_id(link)
    return (link, identifier) if identifier else None


def reading_offer_key(offer):
    text = re.sub(r"(\b(?:source|article|page))\s*\([^()\n]*\)", r"\1", offer, flags=re.I)
    text = re.sub(r"(\b(?:source|article|page))\s*[\u2013\u2014][^\u2013\u2014\n]{1,160}[\u2013\u2014]", r"\1 ", text, flags=re.I)
    text = " ".join(text.casefold().split())
    detail = re.search(r"\b(read|explain|summarize|summarise)\s+(?:the\s+)?(first|second|third|last|this|that)\s+(source|article|page)\s+(?:in more detail|more deeply)(?=[\s,?])", text)
    if detail and not re.search(r"\b(?:translate|translation|in (?:english|hindi|telugu|spanish|french))\b", text):
        return ":".join(detail.groups())
    return text


def accepted_reading_offers(message, previous):
    confirmation = " ".join(re.sub(r"[^\w\s]", " ", message.casefold()).split())
    if confirmation not in {"yes", "yes please", "yes do it", "please do", "do it", "go ahead", "please continue"}:
        return set()
    return {reading_offer_key(match.group(1)) for match in READING_OFFER.finditer(previous)
            if re.search(r"\b(?:read|explain|summarize|summarise)\b", match.group(1), re.I)
            and re.search(r"\b(?:source|article|page|details?)\b", match.group(1), re.I)}


def completed_reading_answer(message, answer, previous):
    earlier = accepted_reading_offers(message, previous)
    for match in reversed(list(READING_OFFER.finditer(answer))):
        if reading_offer_key(match.group(1)) not in earlier:
            continue
        tail = answer[match.end():].strip()
        before = answer[:match.start()].rstrip()
        if len(before) >= 40 and (not tail or (len(tail) < 300 and re.match(r"(?:if yes|if so|I can|I could|I['\u2019]ll)\b", tail, re.I))):
            return before
    return answer


def youtube_id(link):
    if public_link(link) is None:
        return None
    address = urlsplit(link)
    host = (address.hostname or "").lower()
    parts = address.path.strip("/").split("/")
    value = None
    if host == "youtu.be" and len(parts) == 1:
        value = parts[0]
    elif host in ("youtube.com", "www.youtube.com", "m.youtube.com"):
        if address.path == "/watch":
            values = parse_qs(address.query).get("v", [])
            value = values[0] if len(values) == 1 else None
        elif len(parts) == 2 and parts[0] in ("shorts", "embed"):
            value = parts[1]
    return value if value is not None and VIDEO_ID.fullmatch(value) else None


def web_source(title, link, read=False, retrieved_at=None):
    timestamp = None
    if isinstance(retrieved_at, str) and len(retrieved_at) <= 64:
        try:
            parsed = datetime.fromisoformat(retrieved_at)
            if parsed.utcoffset() is not None:
                timestamp = parsed.isoformat()
        except ValueError:
            pass
    return {"title": clean(title, LONGEST_TITLE) or host_of(link), "url": link, "read": read,
            "video_id": youtube_id(link), "retrieved_at": timestamp}


def stored_sources(state):
    state = state or {}
    sources = {}
    stored = state.get("web_sources")
    if isinstance(stored, list):
        for item in stored:
            link = public_link(item.get("url")) if isinstance(item, dict) else None
            if link:
                sources[link] = web_source(item.get("title"), link, item.get("read") is True, item.get("retrieved_at"))
        return list(sources.values())[-8:]
    calls = {}
    for message in state.get("messages", []):
        if message.get("role") == "assistant":
            for call in message.get("tool_calls") or []:
                name = call.get("function", {}).get("name")
                if name in ("web_search", "read_web_page"):
                    calls[call.get("id")] = name
        elif message.get("role") == "tool" and message.get("tool_call_id") in calls:
            try:
                result = json.loads(message.get("content", "")).get("result")
            except (ValueError, TypeError, AttributeError):
                continue
            if not isinstance(result, dict):
                continue
            if calls[message["tool_call_id"]] == "web_search":
                for title, _extract, link in search_results(result):
                    sources.setdefault(link, web_source(title, link))
            else:
                link = public_link(result.get("url"))
                if link:
                    text = result.get("text")
                    sources[link] = web_source(result.get("title"), link, isinstance(text, str) and bool(text.strip()), result.get("retrieved_at"))
    return list(sources.values())[-8:]


def stored_web_text(state):
    sources = {source["url"]: source for source in stored_sources(state) if source["read"] and not source["video_id"]}
    calls, excerpts = {}, {}
    for message in (state or {}).get("messages", []):
        if message.get("role") == "assistant":
            for call in message.get("tool_calls") or []:
                function = call.get("function", {})
                if function.get("name") != "read_web_page":
                    continue
                try:
                    arguments = json.loads(function.get("arguments", "{}"))
                except (ValueError, TypeError):
                    continue
                link = public_link(arguments.get("url")) if isinstance(arguments, dict) else None
                if link in sources:
                    calls[call.get("id")] = link
        elif message.get("role") == "tool" and message.get("tool_call_id") in calls:
            try:
                result = json.loads(message.get("content", "")).get("result")
            except (ValueError, TypeError, AttributeError):
                continue
            link = calls[message["tool_call_id"]]
            if not isinstance(result, dict) or result.get("url") != link:
                continue
            text = result.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            offset = result.get("offset")
            offset = offset if type(offset) is int and 0 <= offset <= LONGEST_PAGE else None
            complete = (offset == 0 and result.get("next_offset") is None and result.get("content_limited") is False
                        and result.get("available_characters") == len(text) and len(text) <= PAGE_CHUNK
                        and result.get("content_version") == sha256(text.encode("utf-8")).hexdigest())
            excerpts[link] = {"source": sources[link], "text": text[:PAGE_CHUNK], "offset": offset, "partial": not complete}
    return [excerpts[link] for link in sources if link in excerpts]


def stored_article(state, link):
    calls, parts, version, complete = set(), [], None, None
    for message in (state or {}).get("messages", []):
        if message.get("role") == "assistant":
            calls.update(call.get("id") for call in message.get("tool_calls") or []
                         if call.get("function", {}).get("name") == "read_web_page")
        elif message.get("role") == "tool" and message.get("tool_call_id") in calls:
            try:
                result = json.loads(message.get("content", "")).get("result")
            except (ValueError, TypeError, AttributeError):
                continue
            if not isinstance(result, dict) or result.get("url") != link or result.get("content_limited") is not False:
                continue
            text, offset = result.get("text"), result.get("offset")
            if not isinstance(text, str) or not text or type(offset) is not int:
                continue
            if offset == 0:
                parts, version = [], result.get("content_version")
            if not version or result.get("content_version") != version or offset != sum(map(len, parts)):
                continue
            if offset + len(text) > LONGEST_PAGE:
                continue
            next_offset = result.get("next_offset")
            if next_offset is not None and next_offset != offset + len(text):
                continue
            parts.append(text)
            if next_offset is None:
                joined = "".join(parts)
                if len(joined) == result.get("available_characters") and sha256(joined.encode("utf-8")).hexdigest() == version:
                    complete = joined
    return complete


def article_changes(previous, current):
    before = dict.fromkeys(" ".join(line.split()) for line in previous.splitlines() if line.strip())
    after = dict.fromkeys(" ".join(line.split()) for line in current.splitlines() if line.strip())
    added = [line for line in after if line not in before]
    removed = [line for line in before if line not in after]
    return {"status": "changed" if added or removed else "unchanged", "added": [cut(line, 160) for line in added[:3]],
            "removed": [cut(line, 160) for line in removed[:3]], "added_count": len(added), "removed_count": len(removed),
            "note": "Text differences only, not verified events. Whitespace, repeated identical lines and line reordering are ignored. No recurring watch was created."}


class TooLarge(Exception):
    pass


class TooSlow(Exception):
    pass


@dataclass(frozen=True)
class WebAsk:
    kind: str
    query: str | None = None
    link: str | None = None
    domain_type: str = "web"
    recency_minutes: int | None = None
    after_date: str | None = None
    before_date: str | None = None
    location: str | None = None
    language: str | None = None


@dataclass(frozen=True)
class Lookup:
    outcome: str
    failure: str | None = None
    seconds: float = 0.0
    results: tuple = ()
    page: tuple | None = None
    error_code: str | None = None
    details: tuple = ()
    payload: object = None


def short(value, limit=40):
    return value[:limit] if isinstance(value, str) and value else None


def public_link(text):
    """An http or https address on a public host name, or None: local, private, numeric and credentialed addresses never
    go out, so a link can't point TinyFish at this computer or a home network."""
    if not isinstance(text, str) or not text.isascii() or len(text) > LONGEST_LINK or re.search(r"[\x00-\x20\x7f]", text):
        return None
    try:
        address = urlsplit(text)
        port = address.port
    except ValueError:
        return None
    host = (address.hostname or "").rstrip(".").lower()
    if address.scheme.lower() not in ("http", "https") or address.username is not None or address.password is not None:
        return None
    if port not in (None, 80, 443) or not HOST.fullmatch(host) or host.endswith(LOCAL) or "." not in host:
        return None
    try:
        ipaddress.ip_address(host)
        return None
    except ValueError:
        pass
    return text if TOP_LEVEL.fullmatch(host.rsplit(".", 1)[1]) else None


def cut(text, limit):
    if len(text) <= limit:
        return text
    end = max(text.rfind(mark, 0, limit) for mark in (". ", "! ", "? "))
    if end >= limit // 2:
        return text[:end + 1]
    space = text.rfind(" ", 0, limit - 1)
    return text[:space if space >= limit // 2 else limit - 1].rstrip() + "\u2026"


def clean(value, limit):
    """Plain text of at most `limit` characters: markdown, images, control and direction characters removed."""
    if not isinstance(value, str):
        return ""
    text = MARKUP.sub(" ", MARKDOWN_LINK.sub(r"\1", IMAGE.sub(" ", value)))
    text = "".join(" " if unicodedata.category(character).startswith("C") else character for character in text)
    return cut(" ".join(text.split()), limit)


def page_text(value):
    if not isinstance(value, str):
        return ""
    text = "\n".join(clean(line, len(line) + 1) for line in value.splitlines()).strip()
    return re.sub(r"\n{3,}", "\n\n", text)[:LONGEST_PAGE + 1]


def host_of(link):
    return urlsplit(link).hostname or link


def search_results(payload):
    items = payload.get("results") if isinstance(payload, dict) else None
    results = []
    for item in items if isinstance(items, list) else []:
        link = public_link(item.get("url")) if isinstance(item, dict) else None
        if link is None or any(link == seen for *_rest, seen in results):
            continue
        results.append((clean(item.get("title"), LONGEST_TITLE) or host_of(link), clean(item.get("snippet"), LONGEST_EXTRACT), link))
        if len(results) == RESULTS:
            break
    return tuple(results)


def search_details(payload, results):
    allowed = {link for _title, _snippet, link in results}
    details = {}
    items = payload.get("results") if isinstance(payload, dict) else None
    for item in items if isinstance(items, list) else []:
        link = item.get("url") if isinstance(item, dict) else None
        if isinstance(link, str) and link in allowed and link not in details:
            details[link] = {"url": link, "publisher": clean(item.get("publisher"), 80) or None,
                             "published_date": clean(item.get("date"), 40) or None}
    return tuple(details.values())


def page_result(payload, link):
    """(outcome, failure, page) from a Fetch answer for the one link that was sent."""
    errors = payload.get("errors") if isinstance(payload, dict) else None
    if isinstance(errors, list) and errors:
        first = errors[0] if isinstance(errors[0], dict) else {}
        return "failed", "fetch_" + (short(first.get("error"), 32) or "error"), None
    items = payload.get("results") if isinstance(payload, dict) else None
    item = items[0] if isinstance(items, list) and items and isinstance(items[0], dict) else {}
    text = page_text(item.get("text"))
    if not text:
        return "nothing", None, None
    return "found", None, (clean(item.get("title"), LONGEST_TITLE) or host_of(link), text, link)


def fetch_pages(payload, ask):
    results, errors = {}, {}
    allowed = set(ask.urls)
    for section, target in (("results", results), ("errors", errors)):
        items = payload.get(section) if isinstance(payload, dict) else None
        for item in items if isinstance(items, list) else []:
            link = item.get("url") if isinstance(item, dict) else None
            if isinstance(link, str) and link in allowed:
                if link in target:
                    errors[link] = {"error": "ambiguous_result"}
                else:
                    target[link] = item
    pages = []
    for link in ask.urls:
        page = {"url": link, "format": ask.format}
        item = results.get(link)
        if link in errors:
            code = errors[link].get("error")
            page["error"] = code[:48] if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,48}", code) else "fetch_failed"
        elif item is None:
            page["error"] = "missing_result"
        elif item.get("format", ask.format) != ask.format:
            page["error"] = "unexpected_format"
        elif item.get("final_url") is not None and public_link(item.get("final_url")) is None:
            page["error"] = "invalid_redirect_url"
        else:
            text = item.get("text")
            if ask.format == "json":
                if not isinstance(text, (dict, list)):
                    page["error"] = "invalid_json_content"
                else:
                    try:
                        text = json.dumps(text, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
                    except (ValueError, TypeError, RecursionError):
                        page["error"] = "invalid_json_content"
                    if isinstance(text, str) and len(text) > PREVIEW_TEXT:
                        page["error"] = "content_too_large"
            if "error" not in page:
                if not isinstance(text, str) or not text.strip():
                    page["error"] = "empty_content"
                else:
                    text = "".join(character for character in text if character in "\n\t" or not unicodedata.category(character).startswith("C"))
                    page.update(text=text[:PREVIEW_TEXT], partial=len(text) > PREVIEW_TEXT,
                                final_url=item.get("final_url") or link)
                    for name, limit in (("title", 120), ("description", 600), ("language", 20), ("author", 120), ("published_date", 80)):
                        page[name] = clean(item.get(name), limit) or None
                    for name in ("links", "image_links"):
                        values = item.get(name) if getattr(ask, name) else []
                        values = values if isinstance(values, list) else []
                        kept = list(dict.fromkeys(value for value in values if public_link(value) is not None))[:25]
                        page[name] = kept
                        page[f"{name}_partial"] = len(kept) < len(values)
                    missed = item.get("unmatched_selectors")
                    page["unmatched_selectors"] = [value for value in missed if value in ask.include_selectors][:20] if isinstance(missed, list) else []
        pages.append(page)
    return tuple(pages)


def code_of(body):
    try:
        error = json.loads(body).get("error")
    except (ValueError, AttributeError):
        return None
    return short(error.get("code") if isinstance(error, dict) else error)


class WebLookup:
    """The owner's TinyFish account: one Search or one Fetch call per tool call, no retry."""

    def __init__(self, key, daily_limit=DAILY_LOOKUPS, transport=None):
        if not key:
            raise ValueError("Web lookups need the owner's TinyFish key.")
        if not 1 <= daily_limit <= 100:
            raise ValueError("Web lookups allow 1 to 100 lookups for each person a day.")
        self.key, self.daily_limit, self.transport = key, daily_limit, transport
        self.search_url, self.fetch_url = SEARCH_URL, FETCH_URL

    @classmethod
    def from_settings(cls, settings):
        key = settings.agent_web_key.get_secret_value()
        return cls(key, settings.agent_web_daily_limit) if key else None

    def result(self, outcome, started, **values):
        return Lookup(outcome, seconds=round(monotonic() - started, 3), **values)

    def look(self, ask, seconds=LONGEST_CALL):
        headers = {"X-API-Key": self.key, "Accept": "application/json"}
        if ask.kind == "web_search":
            parameters = {"query": ask.query, "domain_type": ask.domain_type}
            parameters.update({name: getattr(ask, name) for name in ("recency_minutes", "after_date", "before_date", "location", "language")
                               if getattr(ask, name) is not None})
            request = {"method": "GET", "url": self.search_url, "params": parameters, "headers": headers}
        else:
            request = {"method": "POST", "url": self.fetch_url, "json": {"urls": [ask.link], "format": "markdown", "ttl": 0}, "headers": headers}
        response = self.request_json(request, ask.kind, seconds)
        if response.failure:
            return response
        if ask.kind == "web_search":
            results = search_results(response.payload)
            return replace(response, outcome="found" if results else "nothing", results=results,
                           details=search_details(response.payload, results), payload=None)
        outcome, failure, page = page_result(response.payload, ask.link)
        return replace(response, outcome=outcome, failure=failure, page=page, payload=None)

    def fetch_pages(self, ask):
        body = ask.model_dump(exclude_none=True)
        for name in ("include_selectors", "exclude_selectors"):
            if not body.get(name):
                body.pop(name, None)
        body["per_url_timeout_ms"] = 8000
        response = self.request_json({"method": "POST", "url": self.fetch_url, "json": body,
                                      "headers": {"X-API-Key": self.key, "Accept": "application/json"}}, "web_read", LONGEST_CALL)
        if response.failure:
            return response
        return replace(response, outcome="found", details=fetch_pages(response.payload, ask), payload=None)

    def request_json(self, request, kind, seconds):
        started = monotonic()
        limits = httpx.Timeout(connect=3.0, write=2.0, pool=2.0, read=max(1.0, min(READS[kind], seconds - 2.0)))
        try:
            with httpx.Client(timeout=limits, transport=self.transport, follow_redirects=False) as client:
                with client.stream(**request) as response:
                    status, body = response.status_code, self.read(response, started, seconds)
        except TooLarge:
            return self.result("failed", started, failure="too_large")
        except TooSlow:
            return self.result("failed", started, failure="timeout")
        except httpx.HTTPError as error:
            return self.result("failed", started, failure="timeout" if isinstance(error, httpx.TimeoutException) else "connection")
        if status != 200:
            kind = "busy" if status in TRANSIENT_STATUS else "refused"
            return self.result("failed", started, failure=f"{kind}_http_{status}", error_code=code_of(body))
        try:
            payload = json.loads(body)
        except (ValueError, RecursionError):
            return self.result("failed", started, failure="unreadable_answer")
        return self.result("received", started, payload=payload)

    @staticmethod
    def read(response, started, seconds):
        chunks, size = [], 0
        for chunk in response.iter_bytes():
            size += len(chunk)
            if size > LONGEST_BODY:
                raise TooLarge
            if monotonic() - started > seconds:
                raise TooSlow
            chunks.append(chunk)
        return b"".join(chunks)
