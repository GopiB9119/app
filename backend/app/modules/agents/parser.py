"""Deterministic request parser for the local family Agent.

No language model is configured for this build, so a request is turned into a typed proposal by
fixed rules. The runtime validates every proposal before it can read data or draft an action.
Only the requester's own words are parsed; stored content such as task titles is never read as
an instruction.
"""
import re
from dataclasses import asdict, dataclass, field
from datetime import date, time, timedelta

WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
MONTH_NAMES = (
    ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"),
    ("jul", "july"), ("aug", "august"), ("sep", "sept", "september"), ("oct", "october"),
    ("nov", "november"), ("dec", "december"),
)
MONTHS = {name: number for number, names in enumerate(MONTH_NAMES, start=1) for name in names}
MONTH = "|".join(sorted(MONTHS, key=len, reverse=True))
DAY = "|".join(WEEKDAYS)
LEAD = r"(?:(?:due|by|on|for)\s+)?"
POLITE = r"^(?:(?:hey|hi|ok|okay)\s+agent[,!.]?\s*)?(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?"
MERIDIEM = r"(a\.?m\.?|p\.?m\.?)"

DATE_RULES = (
    ("after_tomorrow", re.compile(rf"\b{LEAD}(?:the\s+)?day\s+after\s+tomorrow\b", re.I)),
    ("relative", re.compile(rf"\b{LEAD}(today|tonight|tomorrow)\b", re.I)),
    ("in_days", re.compile(r"\bin\s+(\d{1,3})\s+days?\b", re.I)),
    ("iso", re.compile(rf"\b{LEAD}(\d{{4}})-(\d{{2}})-(\d{{2}})\b", re.I)),
    ("day_month", re.compile(rf"\b{LEAD}(?:the\s+)?(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({MONTH})\b\.?(?:,?\s+(\d{{4}})\b)?", re.I)),
    ("month_day", re.compile(rf"\b{LEAD}({MONTH})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?:,?\s+(\d{{4}})\b)?", re.I)),
    ("weekday", re.compile(rf"\b{LEAD}(?:(this|next|coming)\s+)?({DAY})\b", re.I)),
)
TIME_RULES = (
    ("clock", re.compile(rf"\b(?:at\s+)?(\d{{1,2}}):(\d{{2}})(?:\s*{MERIDIEM})?(?![\w:])", re.I)),
    ("meridiem", re.compile(rf"\b(?:at\s+)?(\d{{1,2}})\s*{MERIDIEM}(?!\w)", re.I)),
    ("named", re.compile(r"\b(?:at\s+)?(noon|midday|midnight)\b", re.I)),
    ("hour", re.compile(r"\bat\s+(\d{1,2})(?![\w:])", re.I)),
)

HEALTH = re.compile(
    r"\b(?:medicines?|medications?|meds|dos(?:e|es|age|ing)|tablets?|pills?|prescri\w*|diagnos\w*|"
    r"symptoms?|insulin|blood\s+(?:pressure|sugar)|\d+\s*mg)\b", re.I,
)
SENSITIVE_NOTE = re.compile(
    r"\b(?:passwords?|passcodes?|pins?|otp|bank|account\s+numbers?|card\s+numbers?|cvv|aadhaar|ssn|"
    r"social\s+security|salary|debt|loan)\b", re.I,
)
REFUSALS = (
    ("external_contact", re.compile(POLITE + r"(?:call|phone|ring|text|sms|whatsapp|e-?mail|message|"
                                    r"send\s+(?:an?\s+)?(?:message|text|sms|e-?mail|whatsapp)s?)\b", re.I)),
    ("other_people", re.compile(POLITE + r"(?:(?:remind|notify|tell|alert|ping)\s+(?!me\b|myself\b)\w+|"
                                r"send\s+(?:an?\s+)?(?:reminder|notification)s?\b)", re.I)),
    ("financial", re.compile(POLITE + r"(?:pay|transfer|send\s+money|buy|purchase|order|book|donate|shop\s+for)\b", re.I)),
    ("membership", re.compile(POLITE + r"(?:remove|kick|ban|invite|promote|demote|make\s+\S+(?:\s+\S+)?\s+"
                              r"(?:an?\s+|the\s+)?(?:owner|admin|member))\b|\btransfer\s+(?:the\s+)?ownership\b", re.I)),
    ("deletion", re.compile(POLITE + r"(?:delete|erase|wipe|destroy)\b", re.I)),
)
FORGET = re.compile(POLITE + r"(?:forget|stop\s+remembering)\b", re.I)
HELP = re.compile(POLITE + r"(?:help|what\s+can\s+you\s+(?:do|help\s+with)|how\s+do\s+(?:you|i)\s+(?:work|use\s+you))\b", re.I)
GREETINGS = {"", "hi", "hello", "hey", "help"}
MEMORY_LIST = re.compile(
    r"\bwhat\s+(?:do|did)\s+you\s+(?:remember|know\s+about\s+me)\b|"
    r"\b(?:show|list|view|see)\s+(?:me\s+)?(?:my\s+|your\s+|the\s+)?(?:saved\s+)?memor(?:y|ies)\b|"
    r"^(?:my\s+)?(?:saved\s+)?memor(?:y|ies)\??$", re.I,
)
REMEMBER = re.compile(POLITE + r"(?:remember|save|note\s+down|note|keep\s+in\s+mind)\s+(?:that\s+)?(?P<rest>.+)$", re.I)
PREFERENCES = (
    re.compile(r"^(?:my\s+)?(?:default\s+|usual\s+|preferred\s+|normal\s+)?reminder\s+time\s+(?:is|should\s+be|=|as)\s+(?P<time>.+)$", re.I),
    re.compile(r"^i\s+(?:prefer|like|want)\s+(?:my\s+)?reminders?\s+(?:at\s+)?(?P<time>.+)$", re.I),
    re.compile(r"^(?:to\s+)?remind\s+me\s+at\s+(?P<time>.+?)(?:\s+by\s+default)?$", re.I),
)
REMIND_ME = re.compile(POLITE + r"remind\s+me\b\s*(?P<rest>.*)$", re.I)
COMPLETE = (
    re.compile(POLITE + r"(?:mark|set)\s+(?P<ref>.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)[.!]?$", re.I),
    re.compile(POLITE + r"(?:complete|finish|close)\s+(?P<ref>.+?)[.!]?$", re.I),
    re.compile(r"^i(?:'ve|\s+have)?\s+(?:finished|completed|done)\s+(?P<ref>.+?)[.!]?$", re.I),
)
CREATE = (
    re.compile(POLITE + r"(?:add|create|make|new|put|set\s+up)(?:\s+(?:a|an|new|another|one\s+more))*\s+"
               r"(?:task|todo|to-do|to\s+do)s?\b\s*[:\-]?\s*(?P<rest>.*)$", re.I),
    re.compile(POLITE + r"add\s+(?P<rest>.+?)\s+to\s+(?:the\s+|my\s+|our\s+)?(?:family\s+)?"
               r"(?:task\s+list|tasks|list|to-?do\s+list|todos?)[.!]?$", re.I),
)
ASSIGN = re.compile(r"\b(?:and\s+)?assign(?:ed)?(?:\s+it)?\s+to\s+(?P<name>[^\W\d_][\w'.-]*(?:\s+[^\W\d_][\w'.-]*)?)", re.I)
FOR_NAME = re.compile(r"\bfor\s+(?P<name>[^\W\d_][\w'.-]*(?:\s+[^\W\d_][\w'.-]*)?)", re.I)
LIST_TASKS = re.compile(
    r"\b(?:tasks?|to-?dos?|chores?)\b|\bwhat(?:'s|\s+is|\s+are)\s+(?:due|pending|left|open|overdue)\b|"
    r"\b(?:overdue|due\s+(?:today|tomorrow|this\s+week|soon))\b", re.I,
)
LEADING_FILLER = re.compile(r"^(?:(?:to|that|called|named|about|of|for|the|a|an)\s+)+", re.I)
TITLE_FILLER = re.compile(r"^(?:(?:to|that|called|named)\s+)+", re.I)
TRAILING_TASK = re.compile(r"\s+(?:task|todo|to-do)$", re.I)
STOP_WORDS = {"a", "an", "the", "my", "our", "task", "todo", "to", "about", "for", "of", "please"}


@dataclass
class Intent:
    kind: str
    category: str | None = None
    title: str | None = None
    task_ref: str | None = None
    due_date: str | None = None
    local_date: str | None = None
    local_time: str | None = None
    assignee_id: str | None = None
    assignee_query: str | None = None
    assignee_ambiguous: bool = False
    filters: dict = field(default_factory=dict)
    memory_kind: str | None = None
    memory_key: str | None = None
    memory_value: str | None = None
    problem: str | None = None

    def to_state(self):
        return asdict(self)

    @classmethod
    def from_state(cls, value):
        return cls(**value)


def tidy(text):
    return re.sub(r"\s+", " ", text).strip(" \t,;:.!?-\"'")


def resolve_date(kind, match, today):
    try:
        if kind == "after_tomorrow":
            return today + timedelta(days=2)
        if kind == "relative":
            return today + timedelta(days=1) if match.group(1).lower() == "tomorrow" else today
        if kind == "in_days":
            days = int(match.group(1))
            return today + timedelta(days=days) if 0 < days <= 366 else None
        if kind == "iso":
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if kind in ("day_month", "month_day"):
            day, month = (match.group(1), match.group(2)) if kind == "day_month" else (match.group(2), match.group(1))
            number = MONTHS[month.lower().rstrip(".")]
            if match.group(3):
                return date(int(match.group(3)), number, int(day))
            candidate = date(today.year, number, int(day))
            return candidate if candidate >= today else date(today.year + 1, number, int(day))
        if kind == "weekday":
            delta = (WEEKDAYS.index(match.group(2).lower()) - today.weekday()) % 7
            if delta == 0 and (match.group(1) or "").lower() != "this":
                delta = 7
            return today + timedelta(days=delta)
    except ValueError:
        return None
    return None


def resolve_time(kind, match):
    if kind == "named":
        return time(0, 0) if match.group(1).lower() == "midnight" else time(12, 0)
    hour = int(match.group(1))
    minute = int(match.group(2)) if kind == "clock" else 0
    meridiem = match.group(3) if kind == "clock" else match.group(2) if kind == "meridiem" else None
    if meridiem:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if meridiem.lower().startswith("p") else 0)
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def extract(text, rules, resolver):
    found = None
    for kind, pattern in rules:
        match = pattern.search(text)
        if match and (found is None or match.start() < found[1].start()):
            found = (kind, match)
    if found is None:
        return None, text, False
    kind, match = found
    return resolver(kind, match), text[:match.start()] + " " + text[match.end():], True


def extract_date(text, today):
    return extract(text, DATE_RULES, lambda kind, match: resolve_date(kind, match, today))


def extract_time(text):
    return extract(text, TIME_RULES, resolve_time)


def match_members(name, members):
    key = name.casefold().strip(" .,'")
    exact = [member for member in members if member[1].casefold() == key]
    if exact:
        return exact
    return [member for member in members if member[1].casefold().split()[:1] == [key]]


def member_phrase(match, members, self_id):
    words = match.group("name").split()
    for count in range(len(words), 0, -1):
        candidate = " ".join(words[:count])
        if candidate.casefold() in ("me", "myself"):
            return [(self_id, "me")], match.start("name") + len(candidate)
        found = match_members(candidate, members)
        if found:
            return found, match.start("name") + len(candidate)
    return [], None


def task_reference(text):
    text = tidy(text)
    text = LEADING_FILLER.sub("", text)
    text = TRAILING_TASK.sub("", text)
    return tidy(text)


def words(text):
    return {word for word in re.findall(r"[^\W_]+", text.casefold()) if word not in STOP_WORDS}


def match_tasks(reference, tasks):
    key = " ".join(sorted(words(reference)))
    if not key:
        return []
    exact = [task for task in tasks if " ".join(sorted(words(task.title))) == key]
    if exact:
        return exact
    wanted = words(reference)
    scored = []
    for task in tasks:
        title = words(task.title)
        if not title:
            continue
        score = len(wanted & title) / len(wanted | title)
        if reference.casefold() in task.title.casefold() or task.title.casefold() in reference.casefold():
            score = max(score, 0.75)
        if score >= 0.5:
            scored.append((score, task))
    if not scored:
        return []
    best = max(score for score, _task in scored)
    return [task for score, task in scored if score == best]


def parse_time_answer(text, today):
    local_time, rest, matched = extract_time(text)
    if not matched:
        bare = re.fullmatch(r"\s*(\d{1,2})\s*", text)
        if bare and int(bare.group(1)) <= 23:
            local_time, rest, matched = time(int(bare.group(1)), 0), "", True
    local_date, _rest, date_matched = extract_date(rest, today)
    return local_time, local_date, matched, date_matched


def remember(rest):
    rest = tidy(rest)
    for pattern in PREFERENCES:
        match = pattern.match(rest)
        if match:
            value, remainder, matched = extract_time(match.group("time"))
            if not matched or value is None or tidy(re.sub(r"\bby\s+default\b|\bplease\b", " ", remainder, flags=re.I)):
                return Intent("remember", memory_kind="preference", memory_key="reminder_time", problem="invalid_time")
            return Intent("remember", memory_kind="preference", memory_key="reminder_time", memory_value=value.strftime("%H:%M"))
    if not rest:
        return Intent("remember", memory_kind="note", problem="missing_note")
    if SENSITIVE_NOTE.search(rest):
        return Intent("refuse", category="sensitive_memory")
    if len(rest) > 200:
        return Intent("remember", memory_kind="note", problem="note_too_long")
    return Intent("remember", memory_kind="note", memory_value=rest[0].upper() + rest[1:])


def reminder(rest, today):
    rest = re.sub(r"^(?:about|to|of|that|for)\s+", "", rest.strip(), flags=re.I)
    local_time, rest, time_matched = extract_time(rest)
    local_date, rest, date_matched = extract_date(rest, today)
    intent = Intent("schedule_reminder", task_ref=task_reference(rest))
    if (time_matched and local_time is None) or (date_matched and local_date is None):
        intent.problem = "invalid_time"
    intent.local_time = local_time.strftime("%H:%M") if local_time else None
    intent.local_date = local_date.isoformat() if local_date else None
    if not intent.task_ref:
        intent.problem = intent.problem or "missing_task"
    return intent


def create_task(rest, today, members, self_id):
    text = " ".join(rest.split())
    intent = Intent("create_task")
    assignment = ASSIGN.search(text)
    if assignment:
        found, end = member_phrase(assignment, members, self_id)
        if len(found) == 1:
            intent.assignee_id = found[0][0]
            text = text[:assignment.start()] + " " + text[end:]
        else:
            intent.assignee_ambiguous = len(found) > 1
            intent.assignee_query = assignment.group("name").split()[0]
            end = end or assignment.start("name") + len(intent.assignee_query)
            text = text[:assignment.start()] + " " + text[end:]
    else:
        for candidate in FOR_NAME.finditer(text):
            found, end = member_phrase(candidate, members, self_id)
            if found:
                if len(found) == 1:
                    intent.assignee_id = found[0][0]
                else:
                    intent.assignee_ambiguous = True
                    intent.assignee_query = candidate.group("name").split()[0]
                text = text[:candidate.start()] + " " + text[end:]
                break
    due, text, date_matched = extract_date(text, today)
    if date_matched and due is None:
        intent.problem = "invalid_date"
    intent.due_date = due.isoformat() if due else None
    title = tidy(TITLE_FILLER.sub("", tidy(text)))
    if not title:
        intent.problem = intent.problem or "missing_title"
    elif len(title) > 200:
        intent.problem = intent.problem or "title_too_long"
    else:
        intent.title = title[0].upper() + title[1:]
    return intent


def task_filters(text):
    filters = {}
    if re.search(r"\b(?:my|mine|assigned\s+to\s+me|for\s+me|i\s+have)\b", text, re.I):
        filters["mine"] = True
    if re.search(r"\boverdue\b", text, re.I):
        filters["due"] = "overdue"
    elif re.search(r"\btoday\b|\btonight\b", text, re.I):
        filters["due"] = "today"
    elif re.search(r"\btomorrow\b", text, re.I):
        filters["due"] = "tomorrow"
    elif re.search(r"\bweek\b|\b7\s+days\b", text, re.I):
        filters["due"] = "week"
    if re.search(r"\b(?:completed|done|finished)\b", text, re.I):
        filters["status"] = "completed"
    return filters


def parse(message, today, members=(), self_id=None):
    text = " ".join(message.split())
    if HEALTH.search(text):
        return Intent("refuse", category="health")
    for category, pattern in REFUSALS:
        if pattern.search(text):
            return Intent("refuse", category=category)
    if FORGET.search(text):
        return Intent("forget")
    if HELP.search(text) or text.casefold().strip("!?. ") in GREETINGS:
        return Intent("help")
    if MEMORY_LIST.search(text):
        return Intent("list_memories")
    match = REMEMBER.search(text)
    if match:
        return remember(match.group("rest"))
    match = REMIND_ME.search(text)
    if match:
        return reminder(match.group("rest"), today)
    for pattern in CREATE:
        match = pattern.search(text)
        if match:
            return create_task(match.group("rest"), today, members, self_id)
    for pattern in COMPLETE:
        match = pattern.search(text)
        if match:
            reference = task_reference(match.group("ref"))
            return Intent("complete_task", task_ref=reference, problem=None if reference else "missing_task")
    if LIST_TASKS.search(text):
        return Intent("list_tasks", filters=task_filters(text))
    return Intent("unknown")
