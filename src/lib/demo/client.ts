/**
 * Browser side of the demo, first load: keeps links inside the demo (`/app/stats` → `/demo/stats`,
 * `/es/demo/stats`) and loads the in-memory API (`api.ts`) when the page is idle or as soon as an island
 * calls `/api/*`, whichever comes first. The inline queue (`queue.ts`) holds those calls until then.
 */

declare global {
  interface Window {
    __demoQueue?: unknown[];
    __demoLoad?: () => void;
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
  let loading: Promise<void> | null = null;
  const load = () => {
    loading ??= import('./api').then(({ startApi }) => startApi());
  };
  window.__demoLoad = load;
  if (window.__demoQueue?.length) load();
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3_000 });
  else setTimeout(load, 1_000);

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
