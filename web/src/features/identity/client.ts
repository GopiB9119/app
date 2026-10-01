import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(), email: z.string(), display_name: z.string(), timezone: z.string(),
  email_verified: z.boolean(), version: z.number().int().positive(),
});
export const sessionSchema = z.object({
  id: z.string().uuid(), device_name: z.string(), platform: z.enum(["web", "android"]),
  created_at: z.string(), expires_at: z.string(), current: z.boolean(),
});
export const eventSchema = z.object({ id: z.string().uuid(), action: z.string(), created_at: z.string() });
export const challengeSchema = z.object({ challenge_id: z.string().uuid(), expires_at: z.string(), delivery_status: z.string() });
export const authSchema = z.object({ session_id: z.string().uuid(), expires_at: z.string(), user: userSchema });
export const doneSchema = z.object({ status: z.literal("ok") });
const paginationSchema = z.object({
  next_cursor: z.string().min(1).max(2048).nullable(),
  has_more: z.boolean(),
}).refine(value => value.has_more === (value.next_cursor !== null));
export type Account = z.infer<typeof userSchema>;
export type DeviceSession = z.infer<typeof sessionSchema>;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, string> = {}) { super(message); }
}

export async function api<Schema extends z.ZodTypeAny>(
  path: string, schema: Schema,
  options: { method?: string; body?: unknown; accountId?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<{ data: z.infer<Schema>; etag: string | null; pagination?: z.infer<typeof paginationSchema>; unreadCount?: number }> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: options.method ?? "GET", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(options.accountId ? { "X-Account-ID": options.accountId } : {}), ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "OFFLINE", "No connection. Your changes are not confirmed.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const details = result?.error?.details;
    const prototype = details && typeof details === "object" ? Object.getPrototypeOf(details) : null;
    throw new ApiError(response.status, result?.error?.code ?? "SERVICE_UNAVAILABLE", result?.error?.message ?? "The service is unavailable.",
      details && typeof details === "object" && !Array.isArray(details) && (prototype === null || Object.getPrototypeOf(prototype) === null) && Object.values(details).every(value => typeof value === "string") ? details : {});
  }
  const parsed = schema.safeParse(result?.data);
  if (!parsed.success) throw new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected response.");
  const pagination = paginationSchema.optional().safeParse(result?.pagination);
  if (!pagination.success) throw new ApiError(502, "INVALID_RESPONSE", "The service returned invalid pagination.");
  const unread = z.number().int().nonnegative().optional().safeParse(result?.unread_count);
  if (!unread.success) throw new ApiError(502, "INVALID_RESPONSE", "The service returned an invalid unread count.");
  return { data: parsed.data, etag: response.headers.get("etag"), pagination: pagination.data, unreadCount: unread.data };
}