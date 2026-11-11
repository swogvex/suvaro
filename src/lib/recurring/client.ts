/**
 * Browser side of Recurring: thin calls to the API. The island updates its own state first (optimistic),
 * calls these, and rolls back with an error toast when one fails (`ApiError`).
 */
import { ApiError, call } from '../movements/client';
import type { Movement } from '../movements/model';
import type { Recurring, RecurringData, RecurringFields } from './model';

export { ApiError };

const fields = (item: RecurringFields): RecurringFields => ({
  type: item.type,
  amountCents: item.amountCents,
  categoryId: item.categoryId,
  note: item.note,
  frequency: item.frequency,
  intervalDays: item.intervalDays,
  anchorDate: item.anchorDate,
  endDate: item.endDate,
  mode: item.mode,
});

async function read<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function createRecurring(id: string, item: RecurringFields): Promise<Recurring> {
  return (await read<{ recurring: Recurring }>(await call('POST', '/api/recurring', { id, ...fields(item) })))
    .recurring;
}

export async function updateRecurring(id: string, item: RecurringFields): Promise<Recurring> {
  return (await read<{ recurring: Recurring }>(await call('PATCH', `/api/recurring/${id}`, fields(item))))
    .recurring;
}

/** keepalive: sent when the Undo toast ends, possibly while the page is being left. */
export async function deleteRecurring(id: string): Promise<void> {
  await call('DELETE', `/api/recurring/${id}`, undefined, true);
}

export interface ConfirmResponse {
  movement: Movement;
  alert: string | null;
}

export async function confirmPending(id: string): Promise<ConfirmResponse> {
  return read(await call('POST', `/api/recurring-pending/${id}`));
}

export async function skipPending(id: string): Promise<void> {
  await call('DELETE', `/api/recurring-pending/${id}`);
}

export async function fetchRecurring(signal?: AbortSignal): Promise<RecurringData> {
  const response = await fetch('/api/recurring', signal ? { signal } : {});
  if (!response.ok) throw new ApiError(`HTTP_${response.status}`);
  return read(response);
}
