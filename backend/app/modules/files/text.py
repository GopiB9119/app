"""Validation and passage splitting for text documents (DEC-015). Pure functions, no database access."""

import hashlib
import re
from dataclasses import dataclass

from app.errors import DomainError

MAX_DOCUMENT_BYTES = 512 * 1024
EXTENSIONS = {".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown", ".csv": "text/csv"}
# Passages hold whole lines: a passage closes at a blank line once it reaches the target, and never exceeds the limit.
PASSAGE_TARGET = 800
PASSAGE_LIMIT = 1200
# C0 controls except tab and line feed, DEL, C1 controls, text-direction overrides and isolates, and lone surrogates.
FORBIDDEN = re.compile("[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\ud800-\udfff]")


@dataclass(frozen=True)
class Passage:
    start_line: int
    end_line: int
    start_offset: int
    end_offset: int
    text: str


@dataclass(frozen=True)
class DocumentText:
    text: str
    media_type: str
    size_bytes: int
    line_count: int
    sha256: str


def media_type_for(name: str) -> str:
    lowered = name.lower()
    for extension, media_type in EXTENSIONS.items():
        if lowered.endswith(extension) and len(lowered) > len(extension):
            return media_type
    raise DomainError(
        422, "UNSUPPORTED_DOCUMENT_TYPE",
        "Add a .txt, .md or .csv file. Other file types need a virus scanner, which is not available yet.",
    )


def prepare(name: str, content: str) -> DocumentText:
    media_type = media_type_for(name)
    # Line breaks are stored as LF; a leading byte order mark is not part of the text.
    text = content.replace("\r\n", "\n").replace("\r", "\n")
    if text.startswith("\ufeff"):
        text = text[1:]
    if FORBIDDEN.search(text):
        raise DomainError(422, "DOCUMENT_TEXT_INVALID", "This file contains control characters. Save it as plain UTF-8 text.")
    if not text.strip():
        raise DomainError(422, "DOCUMENT_EMPTY", "This file has no text.")
    encoded = text.encode("utf-8")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise DomainError(422, "DOCUMENT_TOO_LARGE", "A document can be at most 512 KB.")
    return DocumentText(
        text=text, media_type=media_type, size_bytes=len(encoded), line_count=len(lines_of(text)),
        sha256=hashlib.sha256(encoded).hexdigest(),
    )


def lines_of(text: str) -> list[str]:
    lines = text.split("\n")
    # A final line break ends the last line; it does not start another one.
    if len(lines) > 1 and lines[-1] == "":
        lines.pop()
    return lines


def pieces(line: str) -> list[tuple[int, int]]:
    """Cut a line longer than the passage limit, preferring the last space in the second half of each piece."""
    cuts, position = [], 0
    while position < len(line):
        end = min(position + PASSAGE_LIMIT, len(line))
        if end < len(line):
            space = line.rfind(" ", position + PASSAGE_LIMIT // 2, end)
            if space > position:
                end = space + 1
        cuts.append((position, end))
        position = end
    return cuts


def passages(text: str) -> list[Passage]:
    result: list[Passage] = []
    current: list[tuple[int, str, int]] = []
    size = 0

    def close():
        nonlocal current, size
        while current and not current[-1][1].strip():
            current.pop()
        if current:
            first_line, _text, first_offset = current[0]
            last_line, last_text, last_offset = current[-1]
            end = last_offset + len(last_text)
            result.append(Passage(first_line, last_line, first_offset, end, text[first_offset:end]))
        current, size = [], 0

    offset = 0
    for number, line in enumerate(lines_of(text), start=1):
        start = offset
        offset += len(line) + 1
        if len(line) > PASSAGE_LIMIT:
            close()
            for begin, end in pieces(line):
                if line[begin:end].strip():
                    result.append(Passage(number, number, start + begin, start + end, line[begin:end]))
            continue
        blank = not line.strip()
        if blank and not current:
            continue
        if blank and size >= PASSAGE_TARGET:
            close()
            continue
        if current and size + len(line) + 1 > PASSAGE_LIMIT:
            close()
            if blank:
                continue
        current.append((number, line, start))
        size += len(line) + 1
    close()
    return result
