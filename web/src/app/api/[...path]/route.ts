import { randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const backend = process.env.COMMUNITY_API_URL ?? "http://127.0.0.1:8000";
const sessionName = "cp_session";
const contextName = "cp_signup_context";
const origins = (process.env.COMMUNITY_WEB_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(",");
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.COMMUNITY_SECURE_COOKIES === "true",
  path: "/",
};
const publicPaths = new Set(["auth/register", "auth/verify-email", "auth/login", "auth/recover", "auth/reset-password", "timezones"]);
const signInPaths = new Set(["auth/register", "auth/verify-email", "auth/login", "auth/recover", "auth/reset-password"]);
const proxyKey = process.env.COMMUNITY_PROXY_KEY;
const trustedHops = Number(process.env.COMMUNITY_TRUSTED_PROXY_HOPS ?? "0");
const allowed = new Set([
  "POST auth/register", "POST auth/verify-email", "POST auth/login", "POST auth/recover",
  "POST auth/reset-password", "POST auth/logout", "GET me", "PATCH me/profile",
  "GET me/sessions", "POST me/sessions/revoke-others", "GET me/security-events", "GET timezones",
  "GET live",
  "POST spaces", "GET spaces", "GET invitations",
  "POST tasks", "GET tasks", "GET tasks/assignees", "GET calendar",
  "POST reminders/preview", "POST reminders", "GET reminders", "GET notifications",
  "POST reminder-requests/preview", "POST reminder-requests", "GET reminder-requests",
  "POST reminder-series/preview", "POST reminder-series", "GET reminder-series",
  "GET me/notification-preferences", "PATCH me/notification-preferences",
]);
const uuidPart = "[a-f0-9-]{36}";
const communityWrite = new RegExp(`^(POST pages|PATCH pages/${uuidPart}|POST pages/${uuidPart}/(follow|unfollow|posts)|PATCH posts/${uuidPart}|POST posts/${uuidPart}/(publish|delete|like|unlike|save|unsave|comments)|POST comments/${uuidPart}/delete|POST reports|POST blocks|POST blocks/${uuidPart}/remove)$`);
const communityRead = new RegExp(`^GET (me/pages|me/following|me/saved-posts|me/blocks|feed|pages/${uuidPart}/drafts)$`);
// Public pages and posts can be read signed out; a bound session adds the viewer's own follow/like/save/block state.
const publicRead = new RegExp(`^GET (pages/[A-Za-z0-9-]{3,36}|pages/[A-Za-z0-9-]{3,36}/posts|posts/${uuidPart}|posts/${uuidPart}/comments|discover/pages|discover/posts)$`);

function communityParameters(route: string) {
  if (route === "discover/pages") return ["q", "topic", "limit", "cursor"];
  if (route === "discover/posts") return ["q", "limit", "cursor"];
  return /^(me\/following|me\/saved-posts|feed|pages\/[^/]+\/posts|posts\/[^/]+\/comments)$/.test(route) ? ["limit", "cursor"] : [];
}

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, details: {} }, request_id: randomUUID() }, { status, headers: { "Cache-Control": "no-store" } });
}

// Next.js keeps an X-Forwarded-For sent by the browser, so only the entry added by the outermost trusted proxy counts.
function browserAddress(request: NextRequest) {
  if (!proxyKey || !Number.isInteger(trustedHops) || trustedHops < 1) return null;
  const chain = (request.headers.get("x-forwarded-for") ?? "").split(",").map(part => part.trim()).filter(Boolean);
  const address = chain[chain.length - trustedHops];
  return address && isIP(address) ? address : null;
}

// Reads a request body only up to its limit and within a deadline, so a body without Content-Length cannot hold memory
// or the connection without bound.
async function readBody(request: NextRequest, limit: number, milliseconds: number): Promise<{ text: string } | { refused: 408 | 413 }> {
  const reader = request.body?.getReader();
  if (!reader) return { text: "" };
  const deadline = AbortSignal.timeout(milliseconds);
  const stop = () => { void reader.cancel().catch(() => undefined); };
  deadline.addEventListener("abort", stop, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (deadline.aborted) return { refused: 408 };
      if (done) return { text: Buffer.concat(chunks).toString("utf8") };
      size += value.byteLength;
      if (size > limit) { stop(); return { refused: 413 }; }
      chunks.push(value);
    }
  } finally {
    deadline.removeEventListener("abort", stop);
  }
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }, traceparent: string) {
  const route = (await context.params).path.join("/");
  const mutating = !["GET", "HEAD"].includes(request.method);
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || (mutating && !origins.includes(request.headers.get("origin") ?? ""))) {
    return failure(403, "ACCESS_DENIED", "This request did not originate from this application.");
  }
  if (route === "auth/bootstrap" && request.method === "GET") {
    const response = NextResponse.json({ data: { status: "ok" }, request_id: randomUUID() }, { headers: { "Cache-Control": "no-store" } });
    if (!request.cookies.get(contextName)) response.cookies.set(contextName, randomBytes(32).toString("base64url"), { ...cookieOptions, maxAge: 900 });
    return response;
  }
  const sessionDelete = request.method === "DELETE" && /^me\/sessions\/[a-f0-9-]{36}$/.test(route);
  const spaceRead = request.method === "GET" && /^spaces\/[a-f0-9-]{36}$/.test(route);
  const spaceSettings = ["GET", "PATCH"].includes(request.method) && /^spaces\/[a-f0-9-]{36}\/settings$/.test(route);
  const spaceMembers = request.method === "GET" && /^spaces\/[a-f0-9-]{36}\/members$/.test(route);
  const removeMember = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/members\/[a-f0-9-]{36}\/(remove|role)$/.test(route);
  const leaveSpace = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/leave$/.test(route);
  const ownershipList = request.method === "GET" && /^spaces\/[a-f0-9-]{36}\/ownership-transfers$/.test(route);
  const ownershipOffer = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/ownership-transfers$/.test(route);
  const ownershipResponse = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/ownership-transfers\/[a-f0-9-]{36}\/(accept|decline|cancel)$/.test(route);
  const spaceInvitations = ["GET", "POST"].includes(request.method) && /^spaces\/[a-f0-9-]{36}\/invitations$/.test(route);
  const revokeInvitation = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/invitations\/[a-f0-9-]{36}\/revoke$/.test(route);
  const respondInvitation = request.method === "POST" && /^invitations\/[a-f0-9-]{36}\/(accept|decline)$/.test(route);
  const taskResource = ["GET", "PATCH"].includes(request.method) && /^tasks\/[a-f0-9-]{36}$/.test(route);
  const taskStatus = request.method === "POST" && /^tasks\/[a-f0-9-]{36}\/status$/.test(route);
  const taskChecklist = ["GET", "POST"].includes(request.method) && /^tasks\/[a-f0-9-]{36}\/checklist$/.test(route);
  const reminderCancel = request.method === "POST" && /^reminders\/[a-f0-9-]{36}\/cancel$/.test(route);
  const requestReview = request.method === "GET" && /^reminder-requests\/[a-f0-9-]{36}\/review$/.test(route);
  const requestResponse = request.method === "POST" && /^reminder-requests\/[a-f0-9-]{36}\/(accept|decline|cancel)$/.test(route);
  const notificationAction = request.method === "POST" && /^notifications\/[a-f0-9-]{36}\/(read|acknowledge|snooze)$/.test(route);
  const reminderSeries = new RegExp(`^GET reminder-series/${uuidPart}$|^POST reminder-series/${uuidPart}/(pause|resume|skip|cancel|move|replace)$`).test(`${request.method} ${route}`);
  const alerts = new RegExp(`^GET me/alerts$|^POST me/alerts/dismiss$|^(GET|PATCH) me/quiet-hours$|^GET me/care-alerts$|^(GET|POST) events/${uuidPart}/alert$|^POST care/instructions/${uuidPart}/alerts$|^(GET|POST) reminder-backups$|^GET reminder-backups/contacts$|^POST reminder-backups/${uuidPart}/(accept|decline|cancel)$`).test(`${request.method} ${route}`);
  const messaging = /^(POST spaces\/[a-f0-9-]{36}\/conversations|GET conversations|GET conversations\/[a-f0-9-]{36}(\/messages)?|POST conversations\/[a-f0-9-]{36}\/(messages|read)|POST conversations\/[a-f0-9-]{36}\/messages\/[a-f0-9-]{36}\/delete)$/.test(`${request.method} ${route}`);
  const community = communityWrite.test(`${request.method} ${route}`) || communityRead.test(`${request.method} ${route}`);
  const events = /^((GET|POST) spaces\/[a-f0-9-]{36}\/events|(GET|PATCH) events\/[a-f0-9-]{36}|POST events\/[a-f0-9-]{36}\/(cancel|attendance))$/.test(`${request.method} ${route}`);
  const care = new RegExp(`^(GET|POST) care/instructions$|^GET care/instructions/${uuidPart}$|^POST care/instructions/${uuidPart}/(stop|reports)$|^GET care/day$`).test(`${request.method} ${route}`);
  const publicCommunity = publicRead.test(`${request.method} ${route}`);
  const groupSearch = request.method === "GET" && route === "discover/spaces";
  const groups = groupSearch || new RegExp(`^GET discover/spaces/${uuidPart}$|^POST spaces/${uuidPart}/visibility$|^(GET|POST) spaces/${uuidPart}/join-requests$|^POST spaces/${uuidPart}/join-requests/${uuidPart}/(approve|decline)$|^POST space-join-requests/${uuidPart}/cancel$|^GET me/space-join-requests$`).test(`${request.method} ${route}`);
  const agents = new RegExp(`^(GET|POST) agent-runs$|^GET agent-runs/${uuidPart}$|^POST agent-runs/${uuidPart}/(resume|cancel)$|^POST agent-approvals/${uuidPart}/(approve|reject)$|^GET agent-memories$|^DELETE agent-memories/${uuidPart}$|^GET agent-tools$`).test(`${request.method} ${route}`);
  const documentAdd = request.method === "POST" && new RegExp(`^spaces/${uuidPart}/documents$`).test(route);
  const documentCommand = documentAdd || (request.method === "POST" && new RegExp(`^documents/${uuidPart}/delete$`).test(route));
  const documentRead = request.method === "GET" && new RegExp(`^spaces/${uuidPart}/documents$|^documents/${uuidPart}$|^search$`).test(route);
  const documents = documentCommand || documentRead;
  if (!allowed.has(`${request.method} ${route}`) && !messaging && !community && !events && !care && !publicCommunity && !groups && !agents && !documents && !sessionDelete && !spaceRead && !spaceSettings && !spaceMembers && !removeMember && !leaveSpace && !ownershipList && !ownershipOffer && !ownershipResponse && !spaceInvitations && !revokeInvitation && !respondInvitation && !taskResource && !taskStatus && !taskChecklist && !reminderCancel && !requestReview && !requestResponse && !notificationAction && !reminderSeries && !alerts) return failure(404, "NOT_FOUND", "Endpoint not found.");
  if (route === "live" && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Live updates do not accept query parameters.");
  if (agents && request.method !== "GET" && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Agent commands do not accept query parameters.");
  if (documentCommand && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Document commands do not accept query parameters.");
  if (alerts && request.method !== "GET" && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Alert commands do not accept query parameters.");
  if (groups && !groupSearch && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Group commands do not accept query parameters.");
  if ((reminderSeries || (notificationAction && route.endsWith("/snooze"))) && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Reminder commands do not accept query parameters.");
  if (community && request.method !== "GET" && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Community commands do not accept query parameters.");
  if (events && request.method !== "GET" && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Event commands do not accept query parameters.");
  if (care && request.method !== "GET" && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Care commands do not accept query parameters.");
  if (taskChecklist && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Checklist commands do not accept query parameters.");
  if (messaging && request.method === "POST" && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Message commands do not accept query parameters.");
  if (spaceSettings && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Space settings do not accept query parameters.");
  if ((spaceMembers || removeMember || leaveSpace) && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Membership commands do not accept query parameters.");
  if ((ownershipOffer || ownershipResponse) && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Ownership commands do not accept query parameters.");
  // Only adding a document may carry a large body: 512 KB of text can grow when JSON escapes it. A post's 5,000
  // characters and title fit in 64 KiB even when every character is escaped (up to 12 bytes each).
  const postWrite = (request.method === "POST" && /^pages\/[^/]+\/posts$/.test(route)) || (request.method === "PATCH" && new RegExp(`^posts/${uuidPart}$`).test(route));
  const bodyLimit = documentAdd ? 2200000 : postWrite ? 65536 : 16384;
  if (Number(request.headers.get("content-length") ?? 0) > bodyLimit) return failure(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  const sessionToken = request.cookies.get(sessionName)?.value;
  const anonymous = publicCommunity && (!sessionToken || !request.headers.get("x-account-id"));
  if (!publicPaths.has(route) && !anonymous && !sessionToken) return failure(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  try {
    if (!publicPaths.has(route) && route !== "me" && !anonymous) {
      const expected = request.headers.get("x-account-id");
      if (!expected) return failure(409, "ACCOUNT_CHANGED", "Reload this page before continuing.");
      const current = await fetch(`${backend}/v1/me`, { headers: { Authorization: `Bearer ${sessionToken}`, traceparent }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      const currentBody = await current.json();
      if (!current.ok) {
        const rejected = NextResponse.json(currentBody, { status: current.status });
        if (current.status === 401) rejected.cookies.delete(sessionName);
        return rejected;
      }
      if (currentBody.data.id !== expected) return failure(409, "ACCOUNT_CHANGED", "The signed-in account changed. Reload before continuing.");
    }
    if (route === "live") {
      const upstream = await fetch(`${backend}/v1/live`, {
        headers: { Authorization: `Bearer ${sessionToken}`, Accept: "text/event-stream", traceparent },
        cache: "no-store", redirect: "error", signal: request.signal,
      });
      if (upstream.ok) return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
      const response = NextResponse.json(await upstream.json(), { status: upstream.status, headers: { "Cache-Control": "no-store" } });
      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) response.headers.set("Retry-After", retryAfter);
      if (upstream.status === 401) response.cookies.delete(sessionName);
      return response;
    }
    let body: Record<string, unknown> | undefined;
    if (mutating) {
      if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(415, "VALIDATION_ERROR", "A JSON request is required.");
      const read = await readBody(request, bodyLimit, documentAdd ? 60000 : 15000);
      if ("refused" in read) {
        return read.refused === 413 ? failure(413, "PAYLOAD_TOO_LARGE", "Request is too large.") : failure(408, "REQUEST_TIMEOUT", "The request took too long to arrive.");
      }
      const text = read.text;
      try { body = JSON.parse(text); } catch { return failure(422, "VALIDATION_ERROR", "Request is not valid JSON."); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return failure(422, "VALIDATION_ERROR", "Request must be an object.");
      if (["auth/register", "auth/recover", "auth/verify-email", "auth/reset-password"].includes(route)) {
        const initiatingContext = request.cookies.get(contextName)?.value;
        if (!initiatingContext) return failure(400, "CHALLENGE_INVALID", "Start a new verification request.");
        body.context_secret = initiatingContext;
      }
      if (["auth/login", "auth/verify-email"].includes(route)) {
        body.platform = "web";
        body.device_name = "Web browser";
      }
    }
    const headers: Record<string, string> = { "Content-Type": "application/json", traceparent };
    if (sessionToken && !publicPaths.has(route) && !anonymous) headers.Authorization = `Bearer ${sessionToken}`;
    for (const name of ["Idempotency-Key", "If-Match"]) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    const address = signInPaths.has(route) ? browserAddress(request) : null;
    if (address && proxyKey) {
      headers["X-Community-Client-Address"] = address;
      headers["X-Community-Proxy-Key"] = proxyKey;
    }
    const upstreamUrl = new URL(`/v1/${route}`, backend);
    if ((community || publicCommunity) && request.method === "GET") {
      const parameters = communityParameters(route);
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!parameters.includes(name) || upstreamUrl.searchParams.has(name)) return failure(400, "INVALID_REQUEST", "Invalid list parameters.");
        upstreamUrl.searchParams.set(name, value);
      }
    }
    if (care && request.method === "GET") {
      const parameters = route === "care/day" ? ["date"] : route === "care/instructions" ? ["status"] : [];
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!parameters.includes(name) || upstreamUrl.searchParams.has(name)) return failure(400, "INVALID_REQUEST", "Invalid care parameters.");
        upstreamUrl.searchParams.set(name, value);
      }
    }
    if (documentRead) {
      const parameters = route === "search" ? ["q", "space_id"] : route.endsWith("/documents") ? ["limit", "cursor"] : [];
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!parameters.includes(name) || upstreamUrl.searchParams.has(name)) return failure(400, "INVALID_REQUEST", "Invalid document parameters.");
        upstreamUrl.searchParams.set(name, value);
      }
    }
    if (groupSearch) {
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!["q", "limit", "cursor"].includes(name) || upstreamUrl.searchParams.has(name)) return failure(400, "INVALID_REQUEST", "Invalid search parameters.");
        upstreamUrl.searchParams.set(name, value);
      }
    }
    if (alerts && request.method === "GET") {
      const parameters = route === "reminder-backups" ? ["role", "task_id", "limit", "cursor"] : route === "reminder-backups/contacts" ? ["task_id"] : [];
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!parameters.includes(name) || upstreamUrl.searchParams.has(name)) return failure(400, "INVALID_REQUEST", "Invalid alert parameters.");
        upstreamUrl.searchParams.set(name, value);
      }
    }
    if (agents && request.method === "GET") {
      const parameters = route === "agent-runs" ? ["space_id", "limit", "cursor"] : [];
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!parameters.includes(name) || upstreamUrl.searchParams.has(name)) return failure(400, "INVALID_REQUEST", "Invalid agent parameters.");
        upstreamUrl.searchParams.set(name, value);
      }
    }
    if ((messaging || events) && request.method === "GET") {
      const parameters = route === "conversations" ? ["space_id", "limit", "cursor"] : route.endsWith("/messages") ? ["limit", "before", "after"] : route.endsWith("/events") ? ["when", "limit", "cursor"] : [];
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!parameters.includes(name) || upstreamUrl.searchParams.has(name)) return failure(400, "INVALID_REQUEST", "Invalid list parameters.");
        upstreamUrl.searchParams.set(name, value);
      }
    }
    if ((route === "spaces" || route === "invitations" || spaceInvitations || ownershipList || route === "calendar" || route === "tasks" || route === "tasks/assignees" || taskResource || route === "reminders" || route === "reminder-series" || route === "reminder-requests" || requestReview || route === "notifications" || route === "me/notification-preferences") && request.method === "GET") {
      const parameters = route === "tasks" ? ["space_id", "status", "limit", "cursor"]
        : route === "calendar" ? ["space_id", "start_date", "end_date", "timezone", "limit", "cursor"]
        : route === "tasks/assignees" ? ["space_id", "task_id"]
        : route === "reminders" || route === "reminder-series" ? ["task_id", "limit", "cursor"]
        : route === "reminder-requests" ? ["direction", "limit", "cursor"]
        : taskResource || requestReview || route === "me/notification-preferences" ? [] : ["limit", "cursor"];
      for (const [name, value] of request.nextUrl.searchParams) {
        if (!parameters.includes(name) || upstreamUrl.searchParams.has(name)) {
          return failure(400, "INVALID_REQUEST", "Invalid list parameters.");
        }
        upstreamUrl.searchParams.set(name, value);
      }
    }
    const upstream = await fetch(upstreamUrl, {
      method: request.method, headers, body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", signal: AbortSignal.timeout(15000), redirect: "error",
    });
    const payload = await upstream.json();
    let newToken: string | undefined;
    let expires: Date | undefined;
    if (upstream.ok && ["auth/login", "auth/verify-email"].includes(route)) {
      newToken = payload.data.session_token;
      expires = new Date(payload.data.expires_at);
      delete payload.data.session_token;
    }
    const response = NextResponse.json(payload, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    const etag = upstream.headers.get("etag");
    if (etag) response.headers.set("ETag", etag);
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) response.headers.set("Retry-After", retryAfter);
    if (newToken && expires) {
      response.cookies.set(sessionName, newToken, { ...cookieOptions, expires });
      response.cookies.delete(contextName);
    }
    if ((route === "auth/logout" && upstream.ok) || (!publicPaths.has(route) && upstream.status === 401)) response.cookies.delete(sessionName);
    if (route === "auth/reset-password" && upstream.ok) {
      response.cookies.delete(sessionName);
      response.cookies.delete(contextName);
    }
    return response;
  } catch {
    return failure(503, "SERVICE_UNAVAILABLE", "The service is unavailable. Your changes are not confirmed.");
  }
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const started = Date.now();
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const response = await forward(request, context, `00-${traceId}-${spanId}-01`);
  // Random IDs and the outcome only: paths, queries, headers and bodies can carry private data.
  console.log(JSON.stringify({ time: new Date().toISOString(), event: "bff_request", trace_id: traceId, span_id: spanId, method: request.method, status: response.status, duration_ms: Date.now() - started }));
  return response;
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };