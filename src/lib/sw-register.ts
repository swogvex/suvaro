/**
 * Registers the service worker (src/pages/sw.js.ts) after the page has loaded. Inline, allowed by its hash
 * (src/lib/sw-csp.ts), so it adds no request: an extra module script made Lighthouse's simulated LCP wait for it.
 */
export const swRegisterScript = `'serviceWorker'in navigator&&addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))`;
