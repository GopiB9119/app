"""Repeating-reminder rules: a small, explicitly supported subset computed with dates and zoneinfo.

Supported: every N days (1-30), or chosen weekdays every N weeks (1-4, weeks start on Monday), at one local
clock time in a named zone, between a first and last local date. No rule strings are parsed. Anything wider
(monthly, yearly, several times a day) needs a maintained recurrence library first.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
LONGEST_SPAN = timedelta(days=365)
OCCURRENCE_WINDOW = timedelta(hours=24)


@dataclass(frozen=True)
class Rule:
    frequency: str
    repeat_every: int
    weekday_mask: int
    local_time: str
    timezone: str
    start_date: date
    end_date: date
    clock_change_policy: str

    @property
    def weekdays(self):
        return [name for index, name in enumerate(WEEKDAYS) if self.weekday_mask & (1 << index)]


@dataclass(frozen=True)
class Occurrence:
    local_date: date
    scheduled_at: datetime
    display_time: str
    utc_offset_minutes: int
    adjustment: str


def weekday_mask(names):
    mask = 0
    for name in names:
        mask |= 1 << WEEKDAYS.index(name)
    return mask


def matches(rule, day):
    if day < rule.start_date or day > rule.end_date:
        return False
    if rule.frequency == "daily":
        return (day - rule.start_date).days % rule.repeat_every == 0
    first_monday = rule.start_date - timedelta(days=rule.start_date.weekday())
    week = (day - first_monday).days // 7
    return week % rule.repeat_every == 0 and bool(rule.weekday_mask & (1 << day.weekday()))


def resolve(rule, day):
    """Map the rule's clock time on one date to an instant.

    A time the clock skips moves forward by the jump (shift_forward) or has no reminder that day (skip).
    A time the clock repeats reminds once, at its first occurrence. Returns (Occurrence or None, change).
    """
    zone = ZoneInfo(rule.timezone)
    hour, minute = (int(part) for part in rule.local_time.split(":"))
    wall = datetime.combine(day, time(hour, minute))
    first = wall.replace(tzinfo=zone, fold=0)
    instant = first.astimezone(timezone.utc)
    shown = instant.astimezone(zone)
    if shown.replace(tzinfo=None) != wall:
        if rule.clock_change_policy == "skip":
            return None, "skipped"
        change = "shifted_forward"
    else:
        later = wall.replace(tzinfo=zone, fold=1).astimezone(timezone.utc)
        change = "none" if later == instant else "repeated_time_first"
    offset = int(shown.utcoffset().total_seconds() // 60)
    return Occurrence(day, instant, shown.strftime("%H:%M"), offset, change), change


def dates(rule, first_day, last_day):
    day = max(first_day, rule.start_date)
    last = min(last_day, rule.end_date)
    while day <= last:
        if matches(rule, day):
            yield day
        day += timedelta(days=1)


def occurrences(rule, first_day, last_day):
    """Yield (day, Occurrence or None, change) for every rule date in the range, including skipped ones."""
    for day in dates(rule, first_day, last_day):
        occurrence, change = resolve(rule, day)
        yield day, occurrence, change


def following(rule, day):
    """The next occurrence strictly after a local date, or None when the series has no more dates."""
    for _day, occurrence, _change in occurrences(rule, day + timedelta(days=1), rule.end_date):
        if occurrence is not None:
            return occurrence
    return None


def window_end(rule, occurrence):
    """Delivery may be late by up to 24 hours, but never past the next occurrence of the same series."""
    later = following(rule, occurrence.local_date)
    limit = occurrence.scheduled_at + OCCURRENCE_WINDOW
    return limit if later is None else min(limit, later.scheduled_at)


def next_occurrence(rule, after_day, now, allow_late=False):
    """First occurrence after a local date that is still in the future, or still inside its window if late is allowed."""
    for _day, occurrence, _change in occurrences(rule, after_day + timedelta(days=1), rule.end_date):
        if occurrence is None:
            continue
        if occurrence.scheduled_at > now or (allow_late and window_end(rule, occurrence) > now):
            return occurrence
    return None


def today(zone_name, now):
    return now.astimezone(ZoneInfo(zone_name)).date()
