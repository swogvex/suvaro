/** Small helpers for the own JSON endpoints under `src/pages/api/`. */
import type { z } from 'zod';

/** Request bodies are tiny (one movement); anything larger is refused before parsing. */
const MAX_BODY_BYTES = 4_096;

export function json(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function apiError(status: number, error: string): Response {
  return json(status, { error });
}

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Reads a JSON body and validates it with `schema` (unknown keys rejected by strict schemas).
 * `maxBytes` raises the size limit for the few bodies that carry a list (all budget limits at once).
 */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = MAX_BODY_BYTES,
): Promise<BodyResult<T>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return { ok: false, response: apiError(415, 'UNSUPPORTED_MEDIA_TYPE') };
  }
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, response: apiError(413, 'TOO_LARGE') };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError(400, 'INVALID_JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: apiError(400, 'INVALID_INPUT') };
  return { ok: true, data: parsed.data };
}
