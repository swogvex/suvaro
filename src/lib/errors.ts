import { db } from './db';
import { errorLog } from './db/schema';

/**
 * Writes one row to the own error log (kept 14 days). Never pass personal data: no user id, email, IP,
 * amounts or free text typed by the user. Logging must never break the request, so failures are swallowed.
 */
export async function logError(route: string, code: string, message: string): Promise<void> {
  try {
    await db.insert(errorLog).values({
      at: Date.now(),
      route: route.slice(0, 200),
      code: code.slice(0, 80),
      message: message.slice(0, 500),
    });
  } catch {
    // The database itself is failing; there is nowhere better to write.
  }
}

/** Short, safe description of an unknown error (class name and message only, no stack). */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
