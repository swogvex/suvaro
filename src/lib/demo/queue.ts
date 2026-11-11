/**
 * Inline script for demo pages (in <head>, before any island): routes the page's own `/api/*` requests to
 * the in-memory demo API (`window.__demoFetch`, set by `./api.ts`) and holds the ones made before it is
 * ready. Nothing under `/api/` ever reaches the network on a demo page. Allowed by its CSP hash
 * (`demo-csp.ts`, astro.config.mjs). Keep it tiny and dependency-free.
 */
export const demoQueueScript = `(()=>{const w=window,f=w.fetch.bind(w),q=[];w.__demoQueue=q;w.fetch=(i,o)=>{const u=new URL(typeof i==='string'?i:i instanceof URL?i.href:i.url,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/api/'))return w.__demoFetch?w.__demoFetch(u,o):new Promise((r,j)=>{q.push([u,o,r,j]);w.__demoLoad&&w.__demoLoad()});return f(i,o)}})()`;
