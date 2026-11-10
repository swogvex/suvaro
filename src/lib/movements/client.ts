/**
 * Browser side of movements: optimistic writes, undo and the events islands use to stay in sync.
 *
 * Every write updates the screen first (a `suvaro:movement` event every island listens to), then calls the
 * API; on failure the change is rolled back and an error toast explains it. Deletes wait for the 5-second
 * Undo before reaching the server (committed when the toast goes away, even when the page is left).
 */
import { showToast } from '../toast';
import type { Movement } from './model';

export const MOVEMENT_EVENT = 'suvaro:movement';
export const EDITOR_EVENT = 'suvaro:editor';
export const SEARCH_EVENT = 'suvaro:search';

export type MovementChange = { kind: 'upsert'; movement: Movement } | { kind: 'remove'; id: string };

/** What the editor opens with: an existing movement (edit) or defaults for a new one. */
export interface EditorRequest {
  movement?: Movement;
  date?: string;
  /** Type for a new movement (default expense). */
  type?: Movement['type'];
}

export function emitChange(change: MovementChange): void {
  window.dispatchEvent(new CustomEvent<MovementChange>(MOVEMENT_EVENT, { detail: change }));
}

export function onChange(handler: (change: MovementChange) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<MovementChange>).detail);
  window.addEventListener(MOVEMENT_EVENT, listener);
  return () => window.removeEventListener(MOVEMENT_EVENT, listener);
}

/**
 * Opens the editor or the search dialog. Their islands may still be hydrating: the request waits on
 * `window` until the island calls `listenFor` and picks it up.
 */
type Pending = { [EDITOR_EVENT]?: EditorRequest; [SEARCH_EVENT]?: object };
const pendingKey = '__suvaroPending';

function pending(): Pending {
  const holder = window as unknown as Record<string, Pending>;
  holder[pendingKey] ??= {};
  return holder[pendingKey];
}

function request<K extends keyof Pending>(name: K, detail: NonNullable<Pending[K]>): void {
  const event = new CustomEvent(name, { detail, cancelable: true });
  // A mounted island cancels the event to say "handled".
  if (window.dispatchEvent(event)) pending()[name] = detail;
}

export function openEditor(detail: EditorRequest = {}): void {
  request(EDITOR_EVENT, detail);
}

export function openSearch(): void {
  request(SEARCH_EVENT, {});
}

export function listenFor<K extends keyof Pending>(
  name: K,
  handler: (detail: NonNullable<Pending[K]>) => void,
): () => void {
  const listener = (event: Event) => {
    event.preventDefault();
    handler((event as CustomEvent<NonNullable<Pending[K]>>).detail);
  };
  window.addEventListener(name, listener);
  const waiting = pending()[name];
  if (waiting) {
    delete pending()[name];
    handler(waiting as NonNullable<Pending[K]>);
  }
  return () => window.removeEventListener(name, listener);
}

/** Error code from a failed API call (`LIMIT_REACHED`, `SERVER_ERROR`, `NETWORK`…). */
export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function call(method: string, path: string, body?: unknown, keepalive = false): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      keepalive,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('NETWORK');
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(data?.error ?? `HTTP_${response.status}`);
  }
  return response;
}

function body(movement: Movement) {
  return {
    type: movement.type,
    amountCents: movement.amountCents,
    categoryId: movement.categoryId,
    date: movement.date,
    note: movement.note,
  };
}

const apiPath = (id: string) => `/api/movements/${id}`;

export interface WriteMessages {
  /** Toast after the write, e.g. "Saved: −23.85 € in Food". */
  done: string;
  /** Toast when the server refuses; the change has been undone. */
  failed: (error: ApiError) => string;
}

/** Creates a movement optimistically. Undo deletes it again. */
export function createMovement(movement: Movement, repeat: boolean, messages: WriteMessages): Promise<void> {
  emitChange({ kind: 'upsert', movement });
  let undone = false;
  const saved = call('POST', '/api/movements', { id: movement.id, ...body(movement), repeat });

  showToast(messages.done, {
    undo: () => {
      undone = true;
      emitChange({ kind: 'remove', id: movement.id });
      // Delete only once the create has landed (it may still be on its way).
      saved.then(
        () =>
          call('DELETE', apiPath(movement.id)).catch((error: ApiError) => restore(movement, error, messages)),
        () => undefined,
      );
    },
  });

  return saved.then(
    () => undefined,
    (error: ApiError) => {
      if (undone) return;
      emitChange({ kind: 'remove', id: movement.id });
      showToast(messages.failed(error));
    },
  );
}

function restore(movement: Movement, error: ApiError, messages: WriteMessages) {
  emitChange({ kind: 'upsert', movement });
  showToast(messages.failed(error));
}

/** Saves an edit optimistically. Undo writes the previous values back. */
export function updateMovement(before: Movement, after: Movement, messages: WriteMessages): Promise<void> {
  emitChange({ kind: 'upsert', movement: after });
  const saved = call('PATCH', apiPath(after.id), body(after));

  showToast(messages.done, {
    undo: () => {
      emitChange({ kind: 'upsert', movement: before });
      saved.then(
        () =>
          call('PATCH', apiPath(before.id), body(before)).catch((error: ApiError) =>
            restore(after, error, messages),
          ),
        () => undefined,
      );
    },
  });

  return saved.then(
    () => undefined,
    (error: ApiError) => restore(before, error, messages),
  );
}

/** Removes a movement from the screen at once; the server delete waits for the toast to end without Undo. */
export function deleteMovement(movement: Movement, messages: WriteMessages): void {
  emitChange({ kind: 'remove', id: movement.id });
  showToast(messages.done, {
    undo: () => emitChange({ kind: 'upsert', movement }),
    onDismiss: () => {
      // keepalive: the request survives the page being left right after the toast ends.
      call('DELETE', apiPath(movement.id), undefined, true).catch((error: ApiError) => {
        if (error.code !== 'NOT_FOUND') restore(movement, error, messages);
      });
    },
  });
}

export interface MonthResponse {
  month: string | null;
  items: Movement[];
  next: string | null;
  summary?: { count: number; netCents: number };
}

/** Reads one month (or, without `month`, the newest one plus the summary) for the given filter query. */
export async function fetchMonth(
  query: URLSearchParams,
  month?: string,
  signal?: AbortSignal,
): Promise<MonthResponse> {
  const params = new URLSearchParams(query);
  if (month) params.set('month', month);
  const response = await fetch(`/api/movements?${params}`, signal ? { signal } : {});
  if (!response.ok) throw new ApiError(`HTTP_${response.status}`);
  return (await response.json()) as MonthResponse;
}
