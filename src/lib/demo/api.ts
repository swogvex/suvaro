/**
 * The demo's in-memory API, loaded on demand (`client.ts`): reads the page's sample state and answers every
 * `/api/*` call held by the inline queue (`queue.ts`) with `handleDemoRequest`. Kept out of the first load:
 * nothing needs it until an island asks the API for something.
 */
import { handleDemoRequest, type DemoState } from './store';

type Pending = [URL, RequestInit | undefined, (response: Response) => void, (error: unknown) => void];

declare global {
  interface Window {
    __demoFetch?: (url: URL, init?: RequestInit) => Promise<Response>;
  }
}

export function startApi(): void {
  const source = document.getElementById('demo-state');
  if (!source?.textContent || window.__demoFetch) return;
  const state = JSON.parse(source.textContent) as DemoState;

  const answer = async (url: URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        return new Response(JSON.stringify({ error: 'INVALID_JSON' }), { status: 400 });
      }
    }
    // Answer on a later tick, like the network: islands expect their optimistic update to paint first.
    await new Promise((done) => setTimeout(done, 0));
    return handleDemoRequest(state, url, method, body);
  };

  window.__demoFetch = answer;
  for (const [url, init, resolve, reject] of (window.__demoQueue?.splice(0) ?? []) as Pending[]) {
    answer(url, init).then(resolve, reject);
  }
}
