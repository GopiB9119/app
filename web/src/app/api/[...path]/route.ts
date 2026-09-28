import { randomBytes, randomUUID } from "node:crypto";
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
const allowed = new Set([
  "POST auth/register", "POST auth/verify-email", "POST auth/login", "POST auth/recover",
  "POST auth/reset-password", "POST auth/logout", "GET me", "PATCH me/profile",
  "GET me/sessions", "POST me/sessions/revoke-others", "GET me/security-events", "GET timezones",
  "POST spaces", "GET spaces", "GET invitations",
  "POST tasks", "GET tasks", "GET tasks/assignees", "GET calendar",
  "POST reminders/preview", "POST reminders", "GET reminders", "GET notifications",
  "POST reminder-requests/preview", "POST reminder-requests", "GET reminder-requests",
  "GET me/notification-preferences", "PATCH me/notification-preferences",
]);

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, details: {} }, request_id: randomUUID() }, { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
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
  const spaceMembers = request.method === "GET" && /^spaces\/[a-f0-9-]{36}\/members$/.test(route);
  const removeMember = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/members\/[a-f0-9-]{36}\/remove$/.test(route);
  const leaveSpace = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/leave$/.test(route);
  const ownershipList = request.method === "GET" && /^spaces\/[a-f0-9-]{36}\/ownership-transfers$/.test(route);
  const ownershipOffer = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/ownership-transfers$/.test(route);
  const ownershipResponse = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/ownership-transfers\/[a-f0-9-]{36}\/(accept|decline|cancel)$/.test(route);
  const spaceInvitations = ["GET", "POST"].includes(request.method) && /^spaces\/[a-f0-9-]{36}\/invitations$/.test(route);
  const revokeInvitation = request.method === "POST" && /^spaces\/[a-f0-9-]{36}\/invitations\/[a-f0-9-]{36}\/revoke$/.test(route);
  const respondInvitation = request.method === "POST" && /^invitations\/[a-f0-9-]{36}\/(accept|decline)$/.test(route);
  const taskResource = ["GET", "PATCH"].includes(request.method) && /^tasks\/[a-f0-9-]{36}$/.test(route);
  const taskStatus = request.method === "POST" && /^tasks\/[a-f0-9-]{36}\/status$/.test(route);
  const reminderCancel = request.method === "POST" && /^reminders\/[a-f0-9-]{36}\/cancel$/.test(route);
  const requestReview = request.method === "GET" && /^reminder-requests\/[a-f0-9-]{36}\/review$/.test(route);
  const requestResponse = request.method === "POST" && /^reminder-requests\/[a-f0-9-]{36}\/(accept|decline|cancel)$/.test(route);
  const notificationAction = request.method === "POST" && /^notifications\/[a-f0-9-]{36}\/(read|acknowledge)$/.test(route);
  if (!allowed.has(`${request.method} ${route}`) && !sessionDelete && !spaceRead && !spaceMembers && !removeMember && !leaveSpace && !ownershipList && !ownershipOffer && !ownershipResponse && !spaceInvitations && !revokeInvitation && !respondInvitation && !taskResource && !taskStatus && !reminderCancel && !requestReview && !requestResponse && !notificationAction) return failure(404, "NOT_FOUND", "Endpoint not found.");
  if ((spaceMembers || removeMember || leaveSpace) && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Membership commands do not accept query parameters.");
  if ((ownershipOffer || ownershipResponse) && request.nextUrl.search) return failure(400, "INVALID_REQUEST", "Ownership commands do not accept query parameters.");
  if (Number(request.headers.get("content-length") ?? 0) > 16384) return failure(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  const sessionToken = request.cookies.get(sessionName)?.value;
  if (!publicPaths.has(route) && !sessionToken) return failure(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  try {
    if (!publicPaths.has(route) && route !== "me") {
      const expected = request.headers.get("x-account-id");
      if (!expected) return failure(409, "ACCOUNT_CHANGED", "Reload this page before continuing.");
      const current = await fetch(`${backend}/v1/me`, { headers: { Authorization: `Bearer ${sessionToken}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      const currentBody = await current.json();
      if (!current.ok) {
        const rejected = NextResponse.json(currentBody, { status: current.status });
        if (current.status === 401) rejected.cookies.delete(sessionName);
        return rejected;
      }
      if (currentBody.data.id !== expected) return failure(409, "ACCOUNT_CHANGED", "The signed-in account changed. Reload before continuing.");
    }
    let body: Record<string, unknown> | undefined;
    if (mutating) {
      if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(415, "VALIDATION_ERROR", "A JSON request is required.");
      const text = await request.text();
      if (Buffer.byteLength(text) > 16384) return failure(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
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
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionToken && !publicPaths.has(route)) headers.Authorization = `Bearer ${sessionToken}`;
    for (const name of ["Idempotency-Key", "If-Match"]) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    const upstreamUrl = new URL(`/v1/${route}`, backend);
    if ((route === "spaces" || route === "invitations" || spaceInvitations || ownershipList || route === "calendar" || route === "tasks" || route === "tasks/assignees" || taskResource || route === "reminders" || route === "reminder-requests" || requestReview || route === "notifications" || route === "me/notification-preferences") && request.method === "GET") {
      const parameters = route === "tasks" ? ["space_id", "status", "limit", "cursor"]
        : route === "calendar" ? ["space_id", "start_date", "end_date", "timezone", "limit", "cursor"]
        : route === "tasks/assignees" ? ["space_id", "task_id"]
        : route === "reminders" ? ["task_id", "limit", "cursor"]
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

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };