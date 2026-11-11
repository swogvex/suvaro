/**
 * Browser side of the demo: reads the page's sample state, answers every `/api/*` call from memory
 * (`handleDemoRequest`) and keeps links inside the demo (`/app/stats` → `/demo/stats`, `/es/demo/stats`).
 * The inline queue (`queue.ts`) has already replaced `fetch`; this module plugs the answers in.
 */
import { handleDemoRequest, type DemoState } from './store';

type Pending = [URL, RequestInit | undefined, (response: Response) => void, (error: unknown) => void];

declare global {
  interface Window {
    __demoFetch?: (url: URL, init?: RequestInit) => Promise<Response>;
    __demoQueue?: Pending[];
  }
}

/** `/app…` → the same place in the demo; anything else unchanged. */
export function demoHref(href: string, prefix: string): string {
  return href === '/app' || href.startsWith('/app/') || href.startsWith('/app?')
    ? `${prefix}${href.slice(4)}`
    : href;
}

function rewriteLinks(root: ParentNode, prefix: string): void {
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href^="/app"]')) {
    link.setAttribute('href', demoHref(link.getAttribute('href') ?? '', prefix));
  }
}

export function startDemo(prefix: string): void {
  const source = document.getElementById('demo-state');
  if (!source?.textContent) return;
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
  for (const [url, init, resolve, reject] of window.__demoQueue?.splice(0) ?? []) {
    answer(url, init).then(resolve, reject);
  }

  rewriteLinks(document, prefix);
  new MutationObserver((changes) => {
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (node instanceof Element) {
          if (node.matches('a[href^="/app"]')) rewriteLinks(node.parentElement ?? document, prefix);
          else rewriteLinks(node, prefix);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  // A link whose href changed after the last rewrite (a Svelte update) is caught on click.
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      const href = link?.getAttribute('href');
      if (link && href?.startsWith('/app')) link.setAttribute('href', demoHref(href, prefix));
    },
    true,
  );
}
