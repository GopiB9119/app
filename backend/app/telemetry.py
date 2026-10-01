import json
import re
import secrets
from datetime import datetime, timezone
from threading import Lock

TRACEPARENT = re.compile(r"00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}")
METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)


def trace_context(header):
    """Continue a valid W3C trace, or start a new one: returns (trace_id, parent_span_id or None)."""
    match = TRACEPARENT.fullmatch(header or "")
    if match and match[1].strip("0") and match[2].strip("0"):
        return match[1], match[2]
    return secrets.token_hex(16), None


def method_name(method):
    return method if method in METHODS else "OTHER"


def emit(event, **fields):
    record = {"time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"), "event": event, **fields}
    print(json.dumps({name: value for name, value in record.items() if value is not None}), flush=True)


def label(value):
    return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


class Metrics:
    """Request counts and durations in the Prometheus text format, labelled by route template only."""

    def __init__(self):
        self.lock = Lock()
        self.counts = {}
        self.durations = {}

    def observe(self, method, route, status, seconds):
        with self.lock:
            key = (method, route, status)
            self.counts[key] = self.counts.get(key, 0) + 1
            series = self.durations.setdefault((method, route), [0] * len(BUCKETS) + [0.0, 0])
            for index, bound in enumerate(BUCKETS):
                if seconds <= bound:
                    series[index] += 1
            series[-2] += seconds
            series[-1] += 1

    def render(self):
        with self.lock:
            counts = sorted(self.counts.items())
            durations = sorted((key, list(series)) for key, series in self.durations.items())
        lines = [
            "# HELP community_http_requests_total HTTP requests by method, route template and status.",
            "# TYPE community_http_requests_total counter",
        ]
        for (method, route, status), count in counts:
            lines.append(f'community_http_requests_total{{method="{label(method)}",route="{label(route)}",status="{status}"}} {count}')
        lines += [
            "# HELP community_http_request_duration_seconds Time to answer HTTP requests by method and route template.",
            "# TYPE community_http_request_duration_seconds histogram",
        ]
        for (method, route), series in durations:
            labels = f'method="{label(method)}",route="{label(route)}"'
            for bound, count in zip(BUCKETS, series):
                lines.append(f'community_http_request_duration_seconds_bucket{{{labels},le="{bound}"}} {count}')
            lines.append(f'community_http_request_duration_seconds_bucket{{{labels},le="+Inf"}} {series[-1]}')
            lines.append(f"community_http_request_duration_seconds_sum{{{labels}}} {series[-2]}")
            lines.append(f"community_http_request_duration_seconds_count{{{labels}}} {series[-1]}")
        return "\n".join(lines) + "\n"
